-- Somebody's mate who is not on Telegram.
--
-- This matters most right now and will matter least later. The league is moving from
-- a 38-person WhatsApp group, and for the first month or two most of those people
-- will not have installed anything. A bot that can only count the people who already
-- migrated reports five in when eleven are playing, picks the wrong format, and makes
-- teams from half a squad — so the count has to be able to include people the bot
-- cannot talk to.
--
-- A guest is a player like any other, minus a Telegram account. They take a place,
-- they go on the team sheet, and if they show up often enough somebody will eventually
-- talk them into installing the app, at which point they stop being a guest by
-- getting a telegram_user_id rather than by being migrated.

alter table public.players alter column telegram_user_id drop not null;

alter table public.players add column if not exists is_guest boolean not null default false;

-- Who brought them. Not bookkeeping: a name with nobody attached is a mystery on the
-- team sheet, and the person who added them is the only one who can say who they are.
alter table public.players add column if not exists invited_by uuid references public.players (id) on delete set null;

-- The invariant that keeps the two kinds apart. Without it a guest could acquire a
-- telegram id without ever being un-flagged, and would then be skipped by everything
-- that messages real players while looking like one.
alter table public.players add constraint players_guest_has_no_telegram_check
  check (
    (is_guest and telegram_user_id is null)
    or (not is_guest and telegram_user_id is not null)
  );

-- silentPlayers reads every active player to work out who to chase. A guest has no
-- private chat and no telegram id, so without an index-backed way to exclude them the
-- nudge cron would try to send an ephemeral message addressed to nobody.
create index players_real_active_idx on public.players (is_active) where is_active and not is_guest;
