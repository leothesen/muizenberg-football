-- Fixtures (a Wednesday night) and the RSVP machine.
--
-- Attendance is the thing that actually makes or breaks a social league, so this is
-- the part of the schema that carries the most weight: capacity, ordering and a
-- waitlist that resolves deterministically.

create table public.fixtures (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id) on delete restrict,

  kickoff_at timestamptz not null,
  venue text not null default 'Muizenberg',

  status text not null default 'scheduled'
    check (status in ('scheduled', 'open', 'locked', 'played', 'cancelled')),

  -- Squad shape. 8 a side plus subs; both are per team, not totals.
  players_per_team smallint not null default 8 check (players_per_team between 3 and 11),
  subs_per_team smallint not null default 3 check (subs_per_team between 0 and 5),

  -- The RSVP message the bot edits in place as people answer. Null until posted.
  rsvp_chat_id bigint,
  rsvp_message_id bigint,
  -- The team-sheet message, posted once teams are picked.
  teams_message_id bigint,

  -- After this moment the bot stops accepting changes and picks teams.
  rsvp_closes_at timestamptz,

  cancelled_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index fixtures_season_kickoff_idx on public.fixtures (season_id, kickoff_at desc);
create index fixtures_status_idx on public.fixtures (status);
-- Only one fixture per kickoff moment, so a double-firing cron cannot create two.
create unique index fixtures_kickoff_idx on public.fixtures (kickoff_at);

create trigger fixtures_set_updated_at
  before update on public.fixtures
  for each row execute function public.set_updated_at();

-- Total spots on the night, derived so nothing can disagree about capacity.
create or replace function public.fixture_capacity(f public.fixtures)
returns integer
language sql
immutable
as $$
  select (f.players_per_team + f.subs_per_team) * 2;
$$;

create table public.rsvps (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references public.fixtures (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,

  status text not null check (status in ('in', 'out', 'maybe')),

  -- When they most recently said "in". This is what orders the squad and decides
  -- who is on the waitlist: first to commit, first onto the pitch. Dropping out and
  -- rejoining sends you to the back, which is the fair reading.
  in_since timestamptz,

  -- Set when a player who was on the waitlist gets promoted, so the bot can tell
  -- them exactly once.
  promoted_at timestamptz,

  responded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (fixture_id, player_id),
  -- 'in' without a timestamp would make the ordering ambiguous.
  constraint rsvps_in_has_timestamp check (status <> 'in' or in_since is not null)
);

create index rsvps_fixture_status_idx on public.rsvps (fixture_id, status, in_since);
create index rsvps_player_idx on public.rsvps (player_id);

create trigger rsvps_set_updated_at
  before update on public.rsvps
  for each row execute function public.set_updated_at();

-- Keep in_since honest without the application having to remember: it is stamped
-- when a player moves into 'in', and cleared when they leave it.
create or replace function public.rsvps_touch_in_since()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'in' then
    if tg_op = 'INSERT' or old.status is distinct from 'in' then
      new.in_since = now();
    end if;
  else
    new.in_since = null;
    new.promoted_at = null;
  end if;
  new.responded_at = now();
  return new;
end;
$$;

create trigger rsvps_touch_in_since
  before insert or update on public.rsvps
  for each row execute function public.rsvps_touch_in_since();
