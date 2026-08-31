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

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if not exists (select from pg_roles where rolname = r) then
      execute format('create role %I nologin noinherit', r);
    end if;
  end loop;
end $$;

-- A fresh Supabase project also sets default privileges so every later-created
-- public table is reachable by the API roles; mirror that here so migrations
-- run before `20260831160000_api_role_grants.sql` behave the same as on Supabase.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on sequences to anon, authenticated, service_role;

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
-- No SELECT on auth.users: real Supabase does not grant it either, and the FK
-- check on created_by / org_member.user_id runs with the table owner's privileges.
