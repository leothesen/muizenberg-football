-- Dev helper: answers the post-match questionnaire for most of a locked fixture's
-- squad, so the settlement cron and the match-report picture can be driven end to end
-- on a laptop without tapping through nine questions eleven times.
--
-- Two people are deliberately left silent, because "somebody never answered" is a
-- real state the match report has to handle and the happy path would never show it.
--
--   docker exec -i supabase_db_muizenberg-football psql -U postgres -d postgres \
--     < scripts/fill-reports.sql
do $$
declare
  v_fixture uuid;
  v_team_a uuid;
  v_team_b uuid;
  v_goals_a int;
  v_goals_b int;
  v_quiet uuid[];
begin
  select id into v_fixture
  from public.fixtures where status = 'locked' order by kickoff_at desc limit 1;

  if v_fixture is null then
    raise notice 'no locked fixture to fill';
    return;
  end if;

  select id into v_team_a from public.fixture_teams where fixture_id = v_fixture and side = 'a';
  select id into v_team_b from public.fixture_teams where fixture_id = v_fixture and side = 'b';

  select array_agg(player_id) into v_quiet
  from (
    select tp.player_id
    from public.team_players tp
    join public.players p on p.id = tp.player_id
    where tp.fixture_id = v_fixture
    order by p.telegram_user_id desc
    limit 2
  ) q;

  -- Deterministic, and keyed on telegram_user_id rather than the random player id so
  -- two runs of the same demo produce the same night.
  update public.match_reports mr
  set
    goals = s.seed % 4,
    assists = (s.seed / 5) % 3,
    nutmegs = (s.seed / 7) % 3,
    tackles = (s.seed / 11) % 8,
    saves = case when s.seed % 4 = 0 then 3 + ((s.seed / 13) % 5) else 0 end,
    self_rating = 5 + (s.seed % 6)
  from (
    select p.id as player_id,
           abs(('x' || substr(md5(p.telegram_user_id::text || 'live'), 1, 8))::bit(32)::int) as seed
    from public.players p
  ) s
  where mr.fixture_id = v_fixture and mr.player_id = s.player_id;

  select
    coalesce(sum(mr.goals) filter (where tp.fixture_team_id = v_team_a), 0),
    coalesce(sum(mr.goals) filter (where tp.fixture_team_id = v_team_b), 0)
  into v_goals_a, v_goals_b
  from public.match_reports mr
  join public.team_players tp on tp.player_id = mr.player_id and tp.fixture_id = v_fixture
  where mr.fixture_id = v_fixture;

  update public.match_reports mr
  set
    reported_goals_for = case when tp.fixture_team_id = v_team_a then v_goals_a else v_goals_b end,
    reported_goals_against = case when tp.fixture_team_id = v_team_a then v_goals_b else v_goals_a end
  from public.team_players tp
  where tp.player_id = mr.player_id and tp.fixture_id = v_fixture and mr.fixture_id = v_fixture;

  update public.match_reports mr
  set motm_player_id = (
    select mr2.player_id
    from public.match_reports mr2
    join public.players p2 on p2.id = mr2.player_id
    where mr2.fixture_id = v_fixture and mr2.player_id <> mr.player_id
    order by mr2.goals desc, mr2.assists desc, p2.telegram_user_id
    limit 1
  )
  where mr.fixture_id = v_fixture;

  update public.match_reports
  set flow_state = 'done', submitted_at = now()
  where fixture_id = v_fixture and not (player_id = any(v_quiet));

  raise notice 'filled fixture %: score %-%, % left silent', v_fixture, v_goals_a, v_goals_b,
    coalesce(array_length(v_quiet, 1), 0);
end $$;
