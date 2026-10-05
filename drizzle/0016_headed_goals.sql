-- Headed goals.
--
-- The league wants more headers, so the questionnaire now asks, straight after
-- "how many did you score?", whether any of them were headers — and if so, how many.
-- A headed goal is one of the goals, never an extra one, so the column counts a
-- subset of `goals` and the check says so. Scoring gives each one a bonus on top of
-- the goal itself (see domain/rating.ts).

alter table public.match_reports
  add column headed_goals smallint not null default 0
    check (headed_goals between 0 and 30),
  add constraint match_reports_headed_goals_within_goals
    check (headed_goals <= goals);

-- Every stat view carries the new column. Appended at the end of each, which is the
-- one change `create or replace view` allows without dropping the views that depend
-- on it — and dropping them would also drop their grants to web_reader.

create or replace view public.v_player_fixture_stats as
select
  tp.player_id,
  f.id as fixture_id,
  f.season_id,
  f.kickoff_at,
  ft.side,
  ft.goals as goals_for,
  opp.goals as goals_against,
  case
    when ft.goals is null or opp.goals is null then null
    when ft.goals > opp.goals then 'win'
    when ft.goals < opp.goals then 'loss'
    else 'draw'
  end as outcome,
  tp.is_sub,
  coalesce(mr.goals, 0) as goals,
  coalesce(mr.assists, 0) as assists,
  coalesce(mr.nutmegs, 0) as nutmegs,
  coalesce(mr.tackles, 0) as tackles,
  coalesce(mr.saves, 0) as saves,
  coalesce(mr.own_goals, 0) as own_goals,
  mr.self_rating,
  coalesce(v.votes, 0) as motm_votes,
  (mr.submitted_at is not null) as reported,
  coalesce(mr.headed_goals, 0) as headed_goals
from public.team_players tp
join public.fixtures f on f.id = tp.fixture_id
join public.fixture_teams ft on ft.id = tp.fixture_team_id
join public.fixture_teams opp on opp.fixture_id = f.id and opp.side <> ft.side
left join public.match_reports mr
  on mr.fixture_id = f.id
 and mr.player_id = tp.player_id
 and mr.submitted_at is not null
left join public.v_fixture_motm_votes v
  on v.fixture_id = f.id and v.player_id = tp.player_id
where f.status = 'played';

create or replace view public.v_player_season_stats as
select
  s.player_id,
  s.season_id,
  count(*)::int as appearances,
  sum(s.goals)::int as goals,
  sum(s.assists)::int as assists,
  sum(s.nutmegs)::int as nutmegs,
  sum(s.tackles)::int as tackles,
  sum(s.saves)::int as saves,
  sum(s.own_goals)::int as own_goals,
  sum(s.motm_votes)::int as motm_votes,
  count(*) filter (where s.outcome = 'win')::int as wins,
  count(*) filter (where s.outcome = 'draw')::int as draws,
  count(*) filter (where s.outcome = 'loss')::int as losses,
  round(avg(s.self_rating), 2) as avg_self_rating,
  max(s.kickoff_at) as last_played_at,
  sum(s.headed_goals)::int as headed_goals
from public.v_player_fixture_stats s
group by s.player_id, s.season_id;

create or replace view public.v_player_career_stats as
select
  s.player_id,
  count(*)::int as appearances,
  sum(s.goals)::int as goals,
  sum(s.assists)::int as assists,
  sum(s.nutmegs)::int as nutmegs,
  sum(s.tackles)::int as tackles,
  sum(s.saves)::int as saves,
  sum(s.own_goals)::int as own_goals,
  sum(s.motm_votes)::int as motm_votes,
  count(*) filter (where s.outcome = 'win')::int as wins,
  count(*) filter (where s.outcome = 'draw')::int as draws,
  count(*) filter (where s.outcome = 'loss')::int as losses,
  round(avg(s.self_rating), 2) as avg_self_rating,
  min(s.kickoff_at) as first_played_at,
  max(s.kickoff_at) as last_played_at,
  sum(s.headed_goals)::int as headed_goals
from public.v_player_fixture_stats s
group by s.player_id;

create or replace view public.v_season_table as
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
  s.last_played_at,
  s.headed_goals
from public.v_player_season_stats s
join public.players p on p.id = s.player_id
where p.is_active;

create or replace view public.v_career_table as
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
  c.last_played_at,
  c.headed_goals
from public.v_player_career_stats c
join public.players p on p.id = c.player_id
left join public.v_player_motm_awards a on a.player_id = c.player_id;

-- Badges for them, in the gap the catalogue left after Scoring.
insert into public.badges (code, name, description, emoji, tier, sort_order) values
  ('first_header',    'Head Boy',           'Your first headed goal.',                            '🦒', 'silver',    25),
  ('header_brace',    'Aerial Threat',      'Two headed goals in one night.',                     '🚀', 'gold',      26),
  ('headers_10',      'Head and Shoulders', 'Ten career headed goals.',                           '🧴', 'legendary', 27);
