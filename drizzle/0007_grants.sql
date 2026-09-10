-- Access model.
--
-- There are exactly two callers. The Next.js server connects as the owning role and
-- does every write. The public website connects as `web_reader`, which is granted
-- SELECT on the curated views and on nothing else — so those pages physically cannot
-- render a Telegram identifier, however carelessly they are written.
--
-- RLS stays enabled with no policies on every base table, but its job has changed.
-- Under Supabase it was the whole defence, because Supabase grants its API roles
-- access to new public tables automatically and RLS was what took that back. Plain
-- Postgres gives a role nothing it was not explicitly granted, so here the grants
-- below are what actually enforce the model and RLS is a second lock on the same
-- door. It costs nothing, and it means a stray `grant` cannot quietly open a base
-- table on its own.
--
-- Worth knowing: a table's owner bypasses RLS, which is how the server still writes.
-- Point a non-owner writer at this schema and every query silently returns nothing.

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

-- `web_reader` was never granted any of this, so these revokes are belt and braces
-- against a future `grant ... on all tables in schema public` doing it by accident.
-- They are cheap and they document the intent at the only place it is enforceable.
revoke all on public.players from web_reader;
revoke all on public.seasons from web_reader;
revoke all on public.fixtures from web_reader;
revoke all on public.rsvps from web_reader;
revoke all on public.fixture_teams from web_reader;
revoke all on public.team_players from web_reader;
revoke all on public.match_reports from web_reader;
revoke all on public.badges from web_reader;
revoke all on public.player_badges from web_reader;
revoke all on public.rating_events from web_reader;
revoke all on public.telegram_updates from web_reader;
revoke all on public.bot_state from web_reader;

-- The public read surface: curated, Telegram-identifier-free views.
grant select on public.v_fixture_rsvps to web_reader;
grant select on public.v_fixture_motm_votes to web_reader;
grant select on public.v_player_fixture_stats to web_reader;
grant select on public.v_player_season_stats to web_reader;
grant select on public.v_player_career_stats to web_reader;

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

grant select on public.v_players_public to web_reader;

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

grant select on public.v_fixtures_public to web_reader;

create view public.v_seasons_public as
select s.id, s.name, s.started_on, s.ended_on
from public.seasons s;

grant select on public.v_seasons_public to web_reader;

create view public.v_badges_public as
select b.code, b.name, b.description, b.emoji, b.tier, b.sort_order
from public.badges b;

grant select on public.v_badges_public to web_reader;

create view public.v_player_badges_public as
select pb.player_id, pb.badge_code, pb.fixture_id, pb.earned_at
from public.player_badges pb;

grant select on public.v_player_badges_public to web_reader;

create view public.v_fixture_teams_public as
select ft.id, ft.fixture_id, ft.side, ft.name, ft.colour, ft.goals
from public.fixture_teams ft;

grant select on public.v_fixture_teams_public to web_reader;

create view public.v_team_players_public as
select tp.fixture_team_id, tp.fixture_id, tp.player_id, tp.is_sub
from public.team_players tp;

grant select on public.v_team_players_public to web_reader;
