-- Access model.
--
-- There are exactly two callers. The Next.js server acts as service_role, which
-- bypasses RLS entirely and does every write. Browsers act as anon and may read
-- nothing but the curated views. Enabling RLS with no policies at all is therefore
-- the correct configuration for every base table, not an oversight: an anon client
-- pointed at these tables gets back an empty set.

alter table public.players enable row level security;
alter table public.seasons enable row level security;
alter table public.fixtures enable row level security;
alter table public.rsvps enable row level security;
alter table public.fixture_teams enable row level security;
alter table public.team_players enable row level security;
alter table public.match_reports enable row level security;
alter table public.badges enable row level security;
alter table public.player_badges enable row level security;
alter table public.rating_events enable row level security;
alter table public.telegram_updates enable row level security;
alter table public.bot_state enable row level security;

-- Supabase grants the API roles access to new public tables by default. Take it
-- back, so that a mistake in a policy cannot become a data leak.
revoke all on public.players from anon, authenticated;
revoke all on public.seasons from anon, authenticated;
revoke all on public.fixtures from anon, authenticated;
revoke all on public.rsvps from anon, authenticated;
revoke all on public.fixture_teams from anon, authenticated;
revoke all on public.team_players from anon, authenticated;
revoke all on public.match_reports from anon, authenticated;
revoke all on public.badges from anon, authenticated;
revoke all on public.player_badges from anon, authenticated;
revoke all on public.rating_events from anon, authenticated;
revoke all on public.telegram_updates from anon, authenticated;
revoke all on public.bot_state from anon, authenticated;

-- The public read surface: curated, Telegram-identifier-free views.
grant select on public.v_fixture_rsvps to anon, authenticated;
grant select on public.v_fixture_motm_votes to anon, authenticated;
grant select on public.v_player_fixture_stats to anon, authenticated;
grant select on public.v_player_season_stats to anon, authenticated;
grant select on public.v_player_career_stats to anon, authenticated;

-- A players view without the Telegram columns, so the web app can show names.
create view public.v_players_public as
select
  p.id,
  p.display_name,
  p.emoji,
  p.preferred_position,
  p.rating,
  p.is_active,
  p.created_at
from public.players p;

grant select on public.v_players_public to anon, authenticated;

-- Fixture list for the web app: no Telegram message ids.
create view public.v_fixtures_public as
select
  f.id,
  f.season_id,
  f.kickoff_at,
  f.venue,
  f.status,
  f.players_per_team,
  f.subs_per_team,
  public.fixture_capacity(f) as capacity,
  f.rsvp_closes_at,
  f.cancelled_reason
from public.fixtures f;

grant select on public.v_fixtures_public to anon, authenticated;

create view public.v_seasons_public as
select s.id, s.name, s.started_on, s.ended_on
from public.seasons s;

grant select on public.v_seasons_public to anon, authenticated;

create view public.v_badges_public as
select b.code, b.name, b.description, b.emoji, b.tier, b.sort_order
from public.badges b;

grant select on public.v_badges_public to anon, authenticated;

create view public.v_player_badges_public as
select pb.player_id, pb.badge_code, pb.fixture_id, pb.earned_at
from public.player_badges pb;

grant select on public.v_player_badges_public to anon, authenticated;

create view public.v_fixture_teams_public as
select ft.id, ft.fixture_id, ft.side, ft.name, ft.colour, ft.goals
from public.fixture_teams ft;

grant select on public.v_fixture_teams_public to anon, authenticated;

create view public.v_team_players_public as
select tp.fixture_team_id, tp.fixture_id, tp.player_id, tp.is_sub
from public.team_players tp;

grant select on public.v_team_players_public to anon, authenticated;
