-- Which night this week.
--
-- The league's night was a constant in the code and a weekday in vercel.json, and it
-- was never actually fixed: the group it came from says Thursday evenings and ad hoc
-- Sundays, and in practice it has been landing on a Wednesday. A bot that confidently
-- announces the wrong night is worse than no bot, so the group votes.
--
-- Two tables and no poll entity. The Monday of the week scopes a vote, so two rows
-- with the same week_start are votes in the same poll and next Monday starts a fresh
-- one with no bookkeeping. night_polls exists only to remember which message to edit
-- as the tally changes, and whether the week has already been resolved into fixtures.

create table public.night_votes (
  id uuid primary key default gen_random_uuid(),

  -- The Monday, in league time. See domain/nights.ts weekStart: Sunday belongs to the
  -- week that is finishing, because a Sunday game is voted for six days earlier.
  week_start date not null,
  player_id uuid not null references public.players (id) on delete cascade,

  -- 'tue' | 'wed' | 'thu' | 'sat' | 'sun'. Deliberately not an enum: adding a night
  -- should be a change to one array in domain/nights.ts, not a migration, and a key
  -- nobody recognises is already ignored when the votes are tallied.
  night text not null,

  created_at timestamptz not null default now(),

  -- One vote per person per night. A person votes for as many nights as they like —
  -- "I can do Wednesday or Thursday" is the commonest honest answer, and forcing a
  -- single choice would split it and pick a worse night than either — but tapping
  -- the same night twice is a toggle, not a second vote.
  unique (week_start, player_id, night)
);

create index night_votes_week_idx on public.night_votes (week_start, night);

create table public.night_polls (
  week_start date primary key,
  chat_id bigint,
  message_id bigint,

  -- Set once the votes have been turned into fixtures. Stops a cron that fires twice
  -- from booking the same week twice, which is the same idempotency the RSVP poll
  -- gets from rsvp_message_id.
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

-- Neither table is public. The website shows fixtures and results; how somebody voted
-- on a night is chat business, and web_reader has no reason to see it.
alter table public.night_votes enable row level security;
alter table public.night_polls enable row level security;
revoke all on public.night_votes from web_reader;
revoke all on public.night_polls from web_reader;
