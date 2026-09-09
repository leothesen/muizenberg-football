-- Read models.
--
-- Leaderboards, profiles and the Telegram summaries all read from these views so
-- that "how many goals has he got" has exactly one answer in the codebase.
--
-- They are security definer on purpose. Base tables are locked down completely (see
-- the RLS migration) and these curated views are the only surface the anon role can
-- read, which is also why none of them expose Telegram identifiers.

-- Who is in, who is on the waitlist. The waitlist is purely a function of when each
-- player last said yes, so it never needs to be stored or reconciled.
create view public.v_fixture_rsvps as
select
  r.fixture_id,
  r.player_id,
  p.display_name,
  p.emoji,
  p.rating,
  r.status,
  r.in_since,
  r.responded_at,
  r.promoted_at,
  case
    when r.status <> 'in' then null
    else rank() over (partition by r.fixture_id order by r.in_since, r.created_at)
  end as squad_position,
  case
    when r.status <> 'in' then false
    else rank() over (partition by r.fixture_id order by r.in_since, r.created_at)
         > public.fixture_capacity(f)
  end as is_waitlisted
from public.rsvps r
join public.players p on p.id = r.player_id
join public.fixtures f on f.id = r.fixture_id;

-- Votes received per fixture, used for man of the match.
create view public.v_fixture_motm_votes as
select
  mr.fixture_id,
  mr.motm_player_id as player_id,
  count(*)::int as votes
from public.match_reports mr
where mr.motm_player_id is not null
  and mr.submitted_at is not null
group by mr.fixture_id, mr.motm_player_id;

-- One row per player per game they were actually selected for.
create view public.v_player_fixture_stats as
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
  (mr.submitted_at is not null) as reported
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

-- Season table. This is what the league page and /table render.
create view public.v_player_season_stats as
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
  max(s.kickoff_at) as last_played_at
from public.v_player_fixture_stats s
group by s.player_id, s.season_id;

-- Lifetime totals, for the profile page and the hall of fame.
create view public.v_player_career_stats as
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
  max(s.kickoff_at) as last_played_at
from public.v_player_fixture_stats s
group by s.player_id;
