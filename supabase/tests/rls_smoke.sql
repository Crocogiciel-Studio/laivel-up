-- RLS smoke test for the studio schema.
--
-- Run against a database that has the studio migration applied:
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_smoke.sql
--
-- or `pnpm db:test`, which points it at the local stack. Every check raises an
-- exception on failure, so a non-zero exit means a policy regressed. The whole
-- script runs in one transaction and rolls back -- it leaves no rows behind.

begin;

-- Two authenticated users, created as the table owner (bypasses RLS).
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'alice@studio.test'),
  ('22222222-2222-2222-2222-222222222222', 'bob@studio.test');

-- A seeded template, ownerless.
insert into public.grid (name, body, is_template)
  values ('AIDD reference (test)', '{"id":"aidd"}'::jsonb, true);

-- Helper: become an authenticated user for the rest of the current statement
-- batch. Supabase's auth.uid() reads the 'sub' claim.
create or replace function pg_temp.become(user_id uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_id::text, 'role', 'authenticated')::text,
    true
  );
end;
$$;

do $$
declare
  alice uuid := '11111111-1111-1111-1111-111111111111';
  bob   uuid := '22222222-2222-2222-2222-222222222222';
  alice_grid uuid;
  alice_run  uuid;
  visible int;
begin
  -- Alice writes a grid of her own.
  perform pg_temp.become(alice);
  insert into public.grid (owner_id, name, body)
    values (alice, 'alice grid', '{"id":"g1"}'::jsonb)
    returning id into alice_grid;

  -- She sees her grid plus the template: 2 rows.
  select count(*) into visible from public.grid;
  if visible <> 2 then
    raise exception 'alice should see her grid + 1 template, saw %', visible;
  end if;

  -- Bob cannot see Alice's grid -- only the template.
  perform pg_temp.become(bob);
  select count(*) into visible from public.grid;
  if visible <> 1 then
    raise exception 'bob should see only the template, saw %', visible;
  end if;

  select count(*) into visible from public.grid where id = alice_grid;
  if visible <> 0 then
    raise exception 'bob must not see alice grid %', alice_grid;
  end if;

  -- Bob cannot update Alice's grid (0 rows match the USING clause).
  update public.grid set name = 'hijacked' where id = alice_grid;
  get diagnostics visible = row_count;
  if visible <> 0 then
    raise exception 'bob updated % of alice grid rows, expected 0', visible;
  end if;

  -- Bob cannot write a template (no INSERT policy covers is_template rows).
  begin
    insert into public.grid (name, body, is_template)
      values ('bob template', '{}'::jsonb, true);
    raise exception 'bob was allowed to insert a template';
  exception when insufficient_privilege or check_violation then
    null; -- expected: RLS check rejects it
  end;

  -- Bob cannot forge ownership on insert (WITH CHECK ties owner_id to auth.uid()).
  begin
    insert into public.grid (owner_id, name, body)
      values (alice, 'forged', '{}'::jsonb);
    raise exception 'bob inserted a grid owned by alice';
  exception when insufficient_privilege then
    null; -- expected
  end;

  -- Bob cannot delete Alice's grid (0 rows match the USING clause).
  delete from public.grid where id = alice_grid;
  get diagnostics visible = row_count;
  if visible <> 0 then
    raise exception 'bob deleted % of alice grid rows, expected 0', visible;
  end if;

  -- profile: same owner isolation as grid.
  perform pg_temp.become(alice);
  insert into public.profile (owner_id, name, body)
    values (alice, 'alice profile', '{"subject":{"id":"p1"}}'::jsonb);
  perform pg_temp.become(bob);
  select count(*) into visible from public.profile;
  if visible <> 0 then
    raise exception 'bob should see none of alice profiles, saw %', visible;
  end if;

  -- run: owner-only, no template concept -- bob sees nothing.
  perform pg_temp.become(alice);
  insert into public.run
    (owner_id, subject_id, grid_snapshot, profile_snapshot, evaluation)
    values (alice, 'dev-x', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb)
    returning id into alice_run;
  select count(*) into visible from public.run;
  if visible <> 1 then
    raise exception 'alice should see her run, saw %', visible;
  end if;

  perform pg_temp.become(bob);
  select count(*) into visible from public.run;
  if visible <> 0 then
    raise exception 'bob should see none of alice runs, saw %', visible;
  end if;

  select count(*) into visible from public.run where id = alice_run;
  if visible <> 0 then
    raise exception 'bob must not see alice run %', alice_run;
  end if;

  update public.run set subject_id = 'hijacked' where id = alice_run;
  get diagnostics visible = row_count;
  if visible <> 0 then
    raise exception 'bob updated % of alice run rows, expected 0', visible;
  end if;

  raise notice 'rls_smoke: all checks passed';
end;
$$;

rollback;
