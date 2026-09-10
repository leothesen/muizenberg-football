-- Read models the fantasy engine needs and the earlier views did not provide.
--
-- The gap that forced this: badges care about how many times somebody has *won* man
-- of the match, and the existing views only knew how many votes had been cast for
-- them. Six votes across six games is not the same story as six votes in one night,
-- and "motm_5" was quietly reading the wrong one.

-- Who won the vote on a given night. Ties are kept — two people can share it, which
-- is a nicer outcome than picking one by an arbitrary rule.
create view public.v_fixture_motm as
select t.fixture_id, t.player_id, t.votes
from (
  select
    v.fixture_id,
    v.player_id,
    v.votes,
    rank() over (partition by v.fixture_id order by v.votes desc) as position
  from public.v_fixture_motm_votes v
  join public.fixtures f on f.id = v.fixture_id and f.status = 'played'
) t
where t.position = 1;

grant select on public.v_fixture_motm to anon, authenticated;

-- Lifetime man-of-the-match wins, which is what the badge rules actually mean.
create view public.v_player_motm_awards as
select m.player_id, count(*)::int as motm_awards
from public.v_fixture_motm m
group by m.player_id;

grant select on public.v_player_motm_awards to anon, authenticated;

-- Rating history, safe for the public web app: the numbers and the sentence, but no
-- Telegram identifiers and no join back to anything private.
create view public.v_rating_events_public as
select
  e.player_id,
  e.fixture_id,
  e.rating_before,
  e.rating_after,
  e.delta,
  e.reason,
  e.created_at
from public.rating_events e;

grant select on public.v_rating_events_public to anon, authenticated;

-- The season table the league page renders, with the player's own details folded in
-- so the web app needs one query rather than three.
create view public.v_season_table as
select
  s.season_id,
  s.player_id,
  p.display_name,
  p.emoji,
  p.rating,
  s.appearances,
  s.goals,
  s.assists,
  s.nutmegs,
  s.tackles,
  s.saves,
  s.own_goals,
  s.motm_votes,
  s.wins,
  s.draws,
  s.losses,
  s.avg_self_rating,
  s.last_played_at
from public.v_player_season_stats s
join public.players p on p.id = s.player_id
where p.is_active;

grant select on public.v_season_table to anon, authenticated;

-- Career table, same idea, for the hall of fame and player profiles.
create view public.v_career_table as
select
  c.player_id,
  p.display_name,
  p.emoji,
  p.rating,
  c.appearances,
  c.goals,
  c.assists,
  c.nutmegs,
  c.tackles,
  c.saves,
  c.own_goals,
  c.motm_votes,
  coalesce(a.motm_awards, 0) as motm_awards,
  c.wins,
  c.draws,
  c.losses,
  c.avg_self_rating,
  c.first_played_at,
  c.last_played_at
from public.v_player_career_stats c
join public.players p on p.id = c.player_id
left join public.v_player_motm_awards a on a.player_id = c.player_id;

grant select on public.v_career_table to anon, authenticated;
