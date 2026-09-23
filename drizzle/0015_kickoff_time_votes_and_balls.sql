-- What time, and who's bringing a ball.
--
-- Two questions the group was answering in chat and forgetting to answer at all.

-- The Monday poll asks what time as well as which night. Same shape as night_votes,
-- for the same reasons: the Monday of the week scopes a vote without a poll entity,
-- and a person may tap as many times as they could make.
create table public.time_votes (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  player_id uuid not null references public.players (id) on delete cascade,

  -- '1730' | '1800' | '1830' | '1900'. Not an enum, like night_votes.night: the list
  -- lives in domain/kickoff-times.ts, and a key nobody recognises is ignored when the
  -- votes are read.
  time text not null,

  created_at timestamptz not null default now(),
  unique (week_start, player_id, time)
);

create index time_votes_week_idx on public.time_votes (week_start, time);

alter table public.time_votes enable row level security;
revoke all on public.time_votes from web_reader;

-- Somebody has to bring a ball, and until now the only way to find out whether
-- anybody was going to was to turn up. A flag on the answer rather than a table of
-- its own: a ball is only any use from somebody who is coming, and "in, with a ball"
-- is one answer, not two.
alter table public.rsvps
  add column bringing_ball boolean not null default false;

-- The squad list is drawn from this view, so it carries the flag. Appended at the end,
-- which is the one change `create or replace view` allows without a drop.
create or replace view public.v_fixture_rsvps as
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
    else row_number() over (
      partition by r.fixture_id
      order by r.in_since, r.created_at, r.player_id
    )
  end as squad_position,
  case
    when r.status <> 'in' then false
    else row_number() over (
      partition by r.fixture_id
      order by r.in_since, r.created_at, r.player_id
    ) > public.fixture_capacity(f)
  end as is_waitlisted,
  r.bringing_ball
from public.rsvps r
join public.players p on p.id = r.player_id
join public.fixtures f on f.id = r.fixture_id;
