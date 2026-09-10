-- Development seed.
--
-- Gives a fresh database a season with real history in it, so the leaderboards,
-- profiles and cards have something to render without anyone having to play four
-- weeks of football first. Deterministic: every value derives from an md5 of the
-- player and the week, so a reset reproduces exactly the same league table.
--
-- There are no positions in this league. Everybody plays everywhere and the keeper
-- rotates during the game, which is why saves land on a different handful of players
-- each week rather than on a fixed pair of goalkeepers.

do $$
declare
  v_season uuid;
  v_fixture uuid;
  v_team_a uuid;
  v_team_b uuid;
  v_kickoff timestamptz;
  v_week int;
  v_goals_a int;
  v_goals_b int;
  r record;
begin
  insert into public.seasons (name, started_on)
  values ('Spring 2026', date '2026-08-05')
  returning id into v_season;

  insert into public.players
    (telegram_user_id, telegram_username, first_name, display_name, emoji, rating, private_chat_id)
  values
    (100001, 'leo',     'Leo',     'Leo',      '🦁', 72.5, 100001),
    (100002, 'sipho',   'Sipho',   'Sipho',    '⚡', 78.0, 100002),
    (100003, 'dave',    'Dave',    'Big Dave', '🐻', 66.0, 100003),
    (100004, 'thabo',   'Thabo',   'Thabo',    '🚀', 75.5, 100004),
    (100005, 'jonty',   'Jonty',   'Jonty',    '🎩', 69.0, 100005),
    (100006, 'ruan',    'Ruan',    'Ruan',     '🧱', 64.5, 100006),
    (100007, 'kagiso',  'Kagiso',  'Kaggy',    '🐆', 71.0, 100007),
    (100008, 'marco',   'Marco',   'Marco',    '🍕', 67.5, 100008),
    (100009, 'pieter',  'Pieter',  'Pieter',   '🧤', 70.0, 100009),
    (100010, 'ndumiso', 'Ndumiso', 'Ndu',      '🌟', 68.5, 100010),
    (100011, 'ollie',   'Ollie',   'Ollie',    '🦅', 63.0, 100011),
    (100012, 'shaun',   'Shaun',   'Shaun',    '🦈', 65.5, 100012),
    (100013, 'themba',  'Themba',  'Themba',   '🔥', 74.0, 100013),
    (100014, 'gareth',  'Gareth',  'Gaz',      '🪃', 62.0, 100014),
    (100015, 'yusuf',   'Yusuf',   'Yusuf',    '🌊', 66.5, 100015),
    (100016, 'craig',   'Craig',   'Craig',    '🐢', 60.0, 100016);

  -- Four Wednesdays already played, most recent last.
  for v_week in 1..4 loop
    -- Parentheses are load-bearing here. AT TIME ZONE binds tighter than the plus,
    -- so without the outer brackets the date is added to a *timetz* and the value
    -- lands two hours out. Always wrap the whole timestamp before converting it.
    v_kickoff := ((date '2026-08-12' + ((v_week - 1) * 7)) + time '18:00') at time zone 'Africa/Johannesburg';

    insert into public.fixtures (season_id, kickoff_at, status, rsvp_closes_at)
    values (v_season, v_kickoff, 'played', v_kickoff - interval '6 hours')
    returning id into v_fixture;

    insert into public.fixture_teams (fixture_id, side, name, colour)
    values (v_fixture, 'a', 'Bibs', 'hut-yellow') returning id into v_team_a;
    insert into public.fixture_teams (fixture_id, side, name, colour)
    values (v_fixture, 'b', 'Skins', 'hut-blue') returning id into v_team_b;

    insert into public.rsvps (fixture_id, player_id, status)
    select v_fixture, p.id, 'in' from public.players p;

    -- Sides shuffle from week to week.
    insert into public.team_players (fixture_team_id, player_id, is_sub)
    select
      case when (row_number() over (order by p.telegram_user_id) + v_week) % 2 = 0
           then v_team_a else v_team_b end,
      p.id,
      false
    from public.players p;

    insert into public.match_reports
      (fixture_id, player_id, goals, assists, nutmegs, tackles, saves, own_goals,
       self_rating, flow_state, submitted_at)
    select
      v_fixture,
      p.id,
      seed % 3,
      (seed / 3) % 3,
      (seed / 7) % 3,
      (seed / 11) % 7,
      -- Roughly one player in five spent a spell in goal this week.
      case when seed % 5 = 0 then 2 + ((seed / 13) % 6) else 0 end,
      case when seed % 23 = 0 then 1 else 0 end,
      4 + (seed % 7),
      'done',
      v_kickoff + interval '3 hours'
    from (
      select p.*, abs(('x' || substr(md5(p.id::text || v_week::text), 1, 8))::bit(32)::int) as seed
      from public.players p
    ) p;

    -- Everyone votes for the highest scorer who is not them.
    update public.match_reports mr
    set motm_player_id = (
      select mr2.player_id
      from public.match_reports mr2
      where mr2.fixture_id = v_fixture and mr2.player_id <> mr.player_id
      order by mr2.goals desc, mr2.assists desc, mr2.player_id
      limit 1
    )
    where mr.fixture_id = v_fixture;

    -- The score is whatever the players said they scored.
    select
      coalesce(sum(mr.goals) filter (where tp.fixture_team_id = v_team_a), 0),
      coalesce(sum(mr.goals) filter (where tp.fixture_team_id = v_team_b), 0)
    into v_goals_a, v_goals_b
    from public.match_reports mr
    join public.team_players tp
      on tp.player_id = mr.player_id and tp.fixture_id = v_fixture
    where mr.fixture_id = v_fixture;

    update public.fixture_teams set goals = v_goals_a where id = v_team_a;
    update public.fixture_teams set goals = v_goals_b where id = v_team_b;
  end loop;

  -- And one still to come, with the poll already out and answers trickling in.
  v_kickoff := ((date '2026-09-09' + 7) + time '18:00') at time zone 'Africa/Johannesburg';
  insert into public.fixtures (season_id, kickoff_at, status, rsvp_closes_at, rsvp_chat_id, rsvp_message_id)
  values (v_season, v_kickoff, 'open', v_kickoff - interval '6 hours', -1001234567890, 42)
  returning id into v_fixture;

  for r in
    select p.id, row_number() over (order by p.telegram_user_id) as n
    from public.players p
  loop
    insert into public.rsvps (fixture_id, player_id, status)
    values (
      v_fixture,
      r.id,
      case when r.n <= 11 then 'in' when r.n <= 14 then 'maybe' else 'out' end
    );
  end loop;

  -- Relative to now(), not to kickoff: the seeded fixture is in the future, and
  -- future in_since values would rank ahead of anybody answering during a demo.
  -- Aliased "target" rather than "r": the loop variable r is a PL/pgSQL record and
  -- would shadow a table alias of the same name.
  update public.rsvps target
  set in_since = now() - interval '4 hours' + (sub.n * interval '11 minutes')
  from (
    select id, row_number() over (order by player_id) as n
    from public.rsvps
    where fixture_id = v_fixture and status = 'in'
  ) sub
  where target.id = sub.id;
end $$;
