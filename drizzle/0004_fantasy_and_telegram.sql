-- The fantasy layer's persistent state, plus the Telegram plumbing.

-- Current rating lives on the player for cheap reads; every change is also recorded
-- as an event so a card can show form and history rather than just a number.
alter table public.players
  add column rating numeric(5, 2) not null default 65.00
    check (rating between 40 and 99);

create table public.rating_events (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  fixture_id uuid references public.fixtures (id) on delete cascade,

  rating_before numeric(5, 2) not null,
  rating_after numeric(5, 2) not null,
  delta numeric(5, 2) not null,
  -- Human-readable, shown in Telegram: "2 goals, a nutmeg and a win".
  reason text not null default '',

  created_at timestamptz not null default now(),

  unique (player_id, fixture_id)
);

create index rating_events_player_idx on public.rating_events (player_id, created_at desc);

-- Badge catalogue. Static rows, seeded by migration, referenced by code.
create table public.badges (
  code text primary key,
  name text not null,
  description text not null,
  emoji text not null,
  -- Rarer badges are worth more on a profile.
  tier text not null default 'bronze' check (tier in ('bronze', 'silver', 'gold', 'legendary')),
  sort_order smallint not null default 100
);

create table public.player_badges (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  badge_code text not null references public.badges (code) on delete cascade,
  -- The night it was earned, for "won at" storytelling. Null for lifetime awards.
  fixture_id uuid references public.fixtures (id) on delete set null,

  earned_at timestamptz not null default now(),

  -- A badge is earned once. Repeat performances show as a count on the card instead
  -- of duplicate rows, so this is deliberately unique per player.
  unique (player_id, badge_code)
);

create index player_badges_player_idx on public.player_badges (player_id);

-- Telegram sends the same update again if our webhook is slow or errors, so every
-- update id is recorded and replays are dropped. Without this a double-tapped
-- button can double-count a goal.
create table public.telegram_updates (
  update_id bigint primary key,
  kind text,
  received_at timestamptz not null default now()
);

create index telegram_updates_received_idx on public.telegram_updates (received_at desc);

-- Small key/value store for bot bookkeeping that does not deserve its own table
-- (last nudge sent, emulator cursor, and so on).
create table public.bot_state (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create trigger bot_state_set_updated_at
  before update on public.bot_state
  for each row execute function public.set_updated_at();
