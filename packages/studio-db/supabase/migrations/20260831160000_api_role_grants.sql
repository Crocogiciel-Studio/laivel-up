-- Pin the table privileges Supabase's API roles need, in the schema itself.
--
-- On a fresh Supabase project `CREATE TABLE public.x` grants SELECT/INSERT/
-- UPDATE/DELETE to anon, authenticated and service_role automatically, via
-- ALTER DEFAULT PRIVILEGES set up at project bootstrap. That default can be
-- lost -- e.g. tables dropped and recreated by a role the default was not
-- configured for -- and then every PostgREST query fails with `permission
-- denied`, RLS never even getting a look in. Making the grant explicit here
-- means the schema no longer depends on that ambient project state.
--
-- This is not a security loosening: RLS is enabled on every table, anon has no
-- policy, and the studio server always acts as `authenticated` with the
-- caller's JWT. The grant only lets a request reach the policies.

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public
  to anon, authenticated, service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;
