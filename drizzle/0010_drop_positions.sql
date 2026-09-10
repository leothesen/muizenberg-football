-- Remove preferred positions.
--
-- The league does not have them. Everybody plays everywhere and the keeper rotates
-- during the game, so a stored position was modelling something that does not exist
-- and would only ever have been wrong. Saves stay as a reportable stat precisely
-- because anybody might end up in goal.
--
-- Both views that referenced the column are dropped and rebuilt; Postgres will not
-- drop a column anything still depends on.

drop view if exists public.v_fixture_rsvps;
drop view if exists public.v_players_public;

alter table public.players drop column if exists preferred_position;

create view public.v_fixture_rsvps as
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

create view public.v_players_public as
select
  p.id,
  p.display_name,
  p.emoji,
  p.rating,
  p.is_active,
  p.created_at
from public.players p;

grant select on public.v_fixture_rsvps to web_reader;
grant select on public.v_players_public to web_reader;
