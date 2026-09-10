-- Fix: the squad ordering needs a total order, not a ranking.
--
-- The first cut used rank() over (order by in_since, created_at). Ties share the
-- lowest rank, so if several players said yes in the same instant they all ranked 1
-- and `rank > capacity` was false for every one of them — the waitlist silently
-- stopped working and a fixture could report more players than it has room for.
-- Identical timestamps are not hypothetical: any batch insert produces them.
--
-- row_number() with player_id as a final tie-break gives a strict total order and
-- matches how splitSquad() in domain/squad.ts breaks the same tie, so the database
-- and the application can never disagree about who is playing.

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
  end as is_waitlisted
from public.rsvps r
join public.players p on p.id = r.player_id
join public.fixtures f on f.id = r.fixture_id;
