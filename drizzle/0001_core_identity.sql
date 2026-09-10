-- Core identity for the league.
--
-- There is deliberately no use of Supabase Auth anywhere in this schema. A player
-- exists because they pressed a button in the Telegram group, so their Telegram user
-- id IS the identity. Nothing in the product ever asks anyone to make an account.

create extension if not exists "pgcrypto";

-- Shared updated_at trigger.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.players (
  id uuid primary key default gen_random_uuid(),

  -- The identity. Telegram user ids are stable and never reused.
  telegram_user_id bigint not null unique,
  -- Usernames are optional on Telegram and can be changed, so they are a display
  -- detail only and must never be used as a key.
  telegram_username text,

  first_name text not null,
  last_name text,
  -- What the league calls them. Defaults to first_name, overridable via /nickname.
  display_name text not null,
  -- Chosen in Telegram; stands in for an avatar without needing image uploads.
  emoji text not null default '⚽',

  preferred_position text not null default 'anywhere'
    check (preferred_position in ('gk', 'def', 'mid', 'att', 'anywhere')),

  -- Set false to retire someone without deleting their history.
  is_active boolean not null default true,
  -- Private chat id, captured the first time a player DMs the bot. Without it the
  -- bot cannot send them a post-match questionnaire.
  private_chat_id bigint,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index players_active_idx on public.players (is_active) where is_active;
create unique index players_telegram_username_idx
  on public.players (lower(telegram_username))
  where telegram_username is not null;

create trigger players_set_updated_at
  before update on public.players
  for each row execute function public.set_updated_at();

comment on column public.players.telegram_user_id is
  'The only identity in the system. No passwords, no email, no Supabase Auth.';

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  started_on date not null,
  ended_on date,
  created_at timestamptz not null default now()
);

-- Exactly one season can be open at a time.
create unique index seasons_one_current_idx on public.seasons ((ended_on is null))
  where ended_on is null;
