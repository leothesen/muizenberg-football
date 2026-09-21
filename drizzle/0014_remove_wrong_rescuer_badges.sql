-- Take back "The Rescuer" from players who were never on a waiting list.
--
-- The badge is for coming off the waiting list when somebody drops out. Until the fix
-- that shipped alongside this, a plain "I'm in" with places free was also recorded as
-- a promotion (rsvps.promoted_at), so settlement gave the badge to everybody who signed
-- up. The first real Wednesday, 16 September, had seven in for a squad of twenty-four,
-- and all of them came away with it.
--
-- Which awards to take back, stated so it holds in any database rather than naming one
-- fixture: a waiting list only exists once more people are in than the squad holds. If
-- everyone who ever answered a fixture's poll — in, out or maybe, since a row is kept
-- whatever they last said — would have fitted in the squad, nobody on it can ever have
-- been waiting, so no Rescuer badge from that fixture was earned.
--
-- A badge is earned once, ever, and stored against the fixture it came from, so this
-- only removes awards made for such a fixture. A player who genuinely comes off a
-- waiting list later still gets it.

delete from public.player_badges pb
using public.fixtures f
where pb.badge_code = 'rescuer'
  and pb.fixture_id = f.id
  and (select count(*) from public.rsvps r where r.fixture_id = f.id)
      <= public.fixture_capacity(f);

-- The same fixtures' promotion marks were set by the same bug. Settlement has already
-- read them, so clearing them changes nothing it computed; it stops them saying
-- something that did not happen.
update public.rsvps r
set promoted_at = null
from public.fixtures f
where r.fixture_id = f.id
  and r.promoted_at is not null
  and (select count(*) from public.rsvps r2 where r2.fixture_id = f.id)
      <= public.fixture_capacity(f);
