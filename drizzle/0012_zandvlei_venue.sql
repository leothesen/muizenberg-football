-- The venue becomes a real place, and a changeable one.
--
-- "Muizenberg" was the placeholder default from the first fixtures migration. It is
-- the right suburb and a useless direction: you can stand in Muizenberg and be a
-- kilometre from the goalposts. The league plays at Zandvlei Sports Ground, and
-- domain/venues.ts keys its coordinates off exactly this string — so the stored name
-- is now load-bearing for the map button and the calendar invite's GEO line, not just
-- decoration in a chat message.
--
-- The three new columns are for the weeks it is somewhere else. Most fixtures leave
-- them null and inherit Zandvlei's pin from the name lookup, which means the pin can
-- be corrected once rather than in every historical row. A fixture at an unusual
-- venue carries its own point, because there is nowhere else to put it.
--
-- Nine a side because that is what the current pitch holds. The old default of eight
-- was a guess made before anybody asked.

alter table public.fixtures alter column venue set default 'Zandvlei Sports Ground';
alter table public.fixtures alter column players_per_team set default 9;

-- numeric, not double precision: coordinates are compared and displayed, never used
-- for trigonometry here, and an exact decimal round-trips through the Bot API and
-- back without the last digit wandering.
alter table public.fixtures add column if not exists venue_lat numeric(9, 6);
alter table public.fixtures add column if not exists venue_lon numeric(9, 6);
alter table public.fixtures add column if not exists venue_url text;

-- A latitude of 200 is a parse failure that reached the database, not a pitch. Catch
-- it here so a malformed share link cannot make every later map button point at
-- nothing.
alter table public.fixtures add constraint fixtures_venue_lat_check
  check (venue_lat is null or (venue_lat >= -90 and venue_lat <= 90));
alter table public.fixtures add constraint fixtures_venue_lon_check
  check (venue_lon is null or (venue_lon >= -180 and venue_lon <= 180));

-- Coordinates arrive as a pair or not at all; half a point is a bug that would render
-- as a map button pointing at the equator.
alter table public.fixtures add constraint fixtures_venue_point_check
  check ((venue_lat is null) = (venue_lon is null));

-- Every fixture on record was played at Zandvlei; the column simply named the suburb.
-- Correcting the name is not rewriting history, it is finishing a sentence.
update public.fixtures set venue = 'Zandvlei Sports Ground' where venue = 'Muizenberg';

-- players_per_team is deliberately NOT backfilled. A fixture that has already been
-- played had whatever shape it had on the night, and rewriting it would quietly
-- change what "everyone started" meant on a week that is already settled. Only new
-- fixtures get nine.
