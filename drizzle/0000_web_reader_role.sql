-- The role the public website reads through.
--
-- Supabase handed us this for free: an `anon` key that could only see the curated
-- views, so the public pages physically could not render a Telegram identifier. That
-- property was enforced by Postgres rather than by remembering to be careful, and it
-- is worth more than the convenience it cost. This role is how it survives the move.
--
-- Deliberately NOLOGIN and without a password. Nothing ever connects *as*
-- `web_reader`. The server holds a single connection as the owning role and drops
-- into this one with `set local role web_reader` for the duration of a public read,
-- so the privilege boundary lives in the database while there stays exactly one
-- credential to manage — and no password has to be committed, rotated, or explained
-- to anybody.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'web_reader') then
    create role web_reader nologin;
  end if;
end
$$;

grant usage on schema public to web_reader;

-- The migrating role has to be able to enter the role it just created, or
-- `set local role` fails at runtime. Postgres grants the creator of a role admin
-- option on it, so this is allowed without superuser — and re-running it is a no-op.
grant web_reader to current_user;
