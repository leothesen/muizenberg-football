-- Team sheets and the post-match self-report.
--
-- Every number in this league is self-reported and unverified. That is a deliberate
-- product choice, not a gap: there is no referee on a Wednesday night, and a system
-- that tries to police honesty stops being fun. The schema therefore records who
-- claimed what, and never pretends to a truth it cannot have.

create table public.fixture_teams (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references public.fixtures (id) on delete cascade,

  side text not null check (side in ('a', 'b')),
  name text not null,
  -- Tailwind token from the beach-hut palette, so Telegram and the web app agree.
  colour text not null default 'hut-blue',

  -- Final score, null until the result is settled from player reports.
  goals smallint check (goals >= 0),

  created_at timestamptz not null default now(),

  unique (fixture_id, side)
);

create table public.team_players (
  id uuid primary key default gen_random_uuid(),
  fixture_team_id uuid not null references public.fixture_teams (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,

  is_sub boolean not null default false,

  created_at timestamptz not null default now(),

  unique (fixture_team_id, player_id)
);

create index team_players_player_idx on public.team_players (player_id);

-- A player can only be on one team in a given fixture. Enforced with a helper index
-- on a denormalised fixture_id, because the unique constraint above cannot see it.
alter table public.team_players
  add column fixture_id uuid references public.fixtures (id) on delete cascade;

create or replace function public.team_players_set_fixture_id()
returns trigger
language plpgsql
as $$
begin
  select ft.fixture_id into new.fixture_id
  from public.fixture_teams ft
  where ft.id = new.fixture_team_id;
  return new;
end;
$$;

create trigger team_players_set_fixture_id
  before insert or update on public.team_players
  for each row execute function public.team_players_set_fixture_id();

create unique index team_players_one_team_per_fixture_idx
  on public.team_players (fixture_id, player_id);

create table public.match_reports (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references public.fixtures (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,

  goals smallint not null default 0 check (goals between 0 and 30),
  assists smallint not null default 0 check (assists between 0 and 30),
  nutmegs smallint not null default 0 check (nutmegs between 0 and 30),
  tackles smallint not null default 0 check (tackles between 0 and 50),
  saves smallint not null default 0 check (saves between 0 and 50),
  own_goals smallint not null default 0 check (own_goals between 0 and 10),

  -- "How did you play?" 1-10. Nullable because the flow can be abandoned midway.
  self_rating smallint check (self_rating between 1 and 10),

  -- "Who else played well?" One vote, never for yourself.
  motm_player_id uuid references public.players (id) on delete set null,

  -- Score from this player's own point of view; easier to answer honestly than
  -- "what was the score for team A". Reconciled into fixture_teams.goals later.
  reported_goals_for smallint check (reported_goals_for between 0 and 50),
  reported_goals_against smallint check (reported_goals_against between 0 and 50),

  -- Position in the DM question flow, and the message being edited in place.
  flow_state text not null default 'not_started',
  flow_message_id bigint,

  submitted_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (fixture_id, player_id),
  constraint match_reports_no_self_motm check (motm_player_id is distinct from player_id)
);

create index match_reports_fixture_idx on public.match_reports (fixture_id);
create index match_reports_player_idx on public.match_reports (player_id);
create index match_reports_pending_idx on public.match_reports (fixture_id)
  where submitted_at is null;

create trigger match_reports_set_updated_at
  before update on public.match_reports
  for each row execute function public.set_updated_at();
