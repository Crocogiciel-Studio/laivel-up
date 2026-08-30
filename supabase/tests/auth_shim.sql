-- Minimal stand-in for the parts of Supabase the studio migration and the RLS
-- smoke test lean on. The real local stack (`pnpm db:start`) provides all of
-- this already; the shim exists so `rls_smoke.sql` can run against a bare
-- Postgres — in CI, or for a quick check without pulling the Supabase images.
--
--   psql "$PG" -v ON_ERROR_STOP=1 -f supabase/tests/auth_shim.sql
--   psql "$PG" -v ON_ERROR_STOP=1 -f supabase/migrations/20260830120000_studio_init.sql
--   psql "$PG" -v ON_ERROR_STOP=1 -f supabase/tests/rls_smoke.sql
--
-- Apply it to a throwaway database only. It is never run against the real stack.

do $$ begin
  if not exists (select from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
end $$;

-- Supabase grants the API roles broad access to the public schema and sets
-- default privileges so every later-created table is reachable; RLS is what
-- actually narrows it. Mirror that so the migration's tables behave the same
-- here as on the real stack.
grant usage on schema public to anon, authenticated;
alter default privileges for role postgres in schema public
  grant all on tables to anon, authenticated;
alter default privileges for role postgres in schema public
  grant all on sequences to anon, authenticated;

create schema if not exists auth;

create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text
);

-- auth.uid() reads the 'sub' claim of the request's JWT, exactly as on Supabase.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid
$$;

grant usage on schema auth to anon, authenticated;
grant select on auth.users to authenticated;
