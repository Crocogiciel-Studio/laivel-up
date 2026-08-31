-- RLS smoke test for the studio schema (org model).
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_smoke.sql
--
-- or `pnpm db:test` / `pnpm db:test:bare`. Every check raises on failure, so a
-- non-zero exit means a policy regressed. Runs in one transaction and rolls
-- back -- it leaves nothing behind.
--
-- Model under test:
--   * a new auth user gets a personal org (trigger)
--   * the creator of an org is its first admin (trigger)
--   * grid/profile: members read; admin or the creator writes; a plain member
--     cannot create one
--   * run: any member may create and read; nobody updates; admin or creator deletes
--   * templates: world-readable, never writable
--   * an org keeps at least one admin -- unless it has no other members left,
--     in which case it is cleaned up entirely (org_cleanup_if_empty)
--   * delete_account() refuses to strand a shared org, otherwise removes every
--     membership and the auth.users row

begin;

-- Three users. The on_auth_user_created trigger gives each a personal org.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'alice@studio.test'),
  ('22222222-2222-2222-2222-222222222222', 'bob@studio.test'),
  ('33333333-3333-3333-3333-333333333333', 'carol@studio.test');

-- The read-only templates come from the 20260901000000_seed_templates.sql
-- migration (1 grid + 4 profiles), already applied above.

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
  carol uuid := '33333333-3333-3333-3333-333333333333';
  team uuid;
  team_grid uuid;
  team_run uuid;
  invite_token text;
  n int;
begin
  -- Alice creates a shared org; create_org makes her its admin in the same call.
  perform pg_temp.become(alice);
  select id into team from public.create_org('Team');

  select count(*) into n from public.org_member where org_id = team and user_id = alice and role = 'admin';
  if n <> 1 then raise exception 'org creator should be admin, got %', n; end if;

  -- Alice sees her personal org + Team; Carol only her personal org.
  select count(*) into n from public.org;
  if n <> 2 then raise exception 'alice should see 2 orgs, saw %', n; end if;

  perform pg_temp.become(carol);
  select count(*) into n from public.org;
  if n <> 1 then raise exception 'carol should see 1 org, saw %', n; end if;

  -- Alice adds Bob as a plain member.
  perform pg_temp.become(alice);
  insert into public.org_member (org_id, user_id, role) values (team, bob, 'member');

  -- created_by cannot be forged on insert.
  begin
    insert into public.grid (org_id, name, body, created_by)
      values (team, 'forged', '{}'::jsonb, bob);
    raise exception 'alice forged created_by';
  exception when insufficient_privilege then null;
  end;

  -- Admin creates a grid in Team.
  insert into public.grid (org_id, name, body, created_by)
    values (team, 'team grid', '{"id":"g1"}'::jsonb, alice)
    returning id into team_grid;

  -- Bob (member) reads it...
  perform pg_temp.become(bob);
  select count(*) into n from public.grid where id = team_grid;
  if n <> 1 then raise exception 'member should read the team grid, saw %', n; end if;

  -- ...but cannot create, update, or delete a grid.
  begin
    insert into public.grid (org_id, name, body, created_by)
      values (team, 'bob grid', '{}'::jsonb, bob);
    raise exception 'member was allowed to create a grid';
  exception when insufficient_privilege then null;
  end;

  update public.grid set name = 'hijacked' where id = team_grid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'member updated % team grid rows', n; end if;

  delete from public.grid where id = team_grid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'member deleted % team grid rows', n; end if;

  -- Bob (member) CAN run, and reads his run.
  insert into public.run (org_id, subject_id, grid_snapshot, profile_snapshot, evaluation, created_by)
    values (team, 'dev-x', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, bob)
    returning id into team_run;
  select count(*) into n from public.run where id = team_run;
  if n <> 1 then raise exception 'member should see their run, saw %', n; end if;

  -- Runs are never updated.
  update public.run set subject_id = 'x' where id = team_run;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'run was updatable (% rows)', n; end if;

  -- Carol (not a member) sees nothing of Team, and cannot write to it.
  perform pg_temp.become(carol);
  select count(*) into n from public.grid where id = team_grid;
  if n <> 0 then raise exception 'non-member saw a team grid'; end if;
  select count(*) into n from public.run where id = team_run;
  if n <> 0 then raise exception 'non-member saw a team run'; end if;

  begin
    insert into public.run (org_id, subject_id, grid_snapshot, profile_snapshot, evaluation, created_by)
      values (team, 'dev-y', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, carol);
    raise exception 'non-member ran against the team org';
  exception when insufficient_privilege then null;
  end;

  -- Bob cannot add Carol to Team (not an admin).
  perform pg_temp.become(bob);
  begin
    insert into public.org_member (org_id, user_id, role) values (team, carol, 'member');
    raise exception 'member added another member';
  exception when insufficient_privilege then null;
  end;

  -- Everyone sees the seeded templates (1 grid + 4 profiles); nobody writes,
  -- updates or deletes one.
  select count(*) into n from public.grid where is_template;
  if n <> 1 then raise exception 'bob should see 1 template grid, saw %', n; end if;
  select count(*) into n from public.profile where is_template;
  if n <> 4 then raise exception 'bob should see 4 template profiles, saw %', n; end if;
  begin
    insert into public.grid (name, body, is_template) values ('bob tmpl', '{}'::jsonb, true);
    raise exception 'member inserted a template';
  exception when insufficient_privilege or check_violation then null;
  end;
  update public.grid set name = 'hijacked' where is_template;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'member updated % template grid rows', n; end if;
  delete from public.profile where is_template;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'member deleted % template profile rows', n; end if;

  -- Invites: an admin invites, a member cannot; the invitee redeems the token.
  perform pg_temp.become(alice);
  insert into public.org_invite (org_id, created_by, role)
    values (team, alice, 'member')
    returning token into invite_token;

  perform pg_temp.become(bob);
  begin
    insert into public.org_invite (org_id, created_by, role) values (team, bob, 'member');
    raise exception 'member created an invite';
  exception when insufficient_privilege then null;
  end;

  perform pg_temp.become(carol);
  select count(*) into n from public.org_invite;
  if n <> 0 then raise exception 'non-member read an invite row, saw %', n; end if;

  perform public.accept_invite(invite_token);
  select count(*) into n from public.grid where id = team_grid;
  if n <> 1 then raise exception 'accepted member cannot see the team grid'; end if;

  -- The token is single-use. accept_invite raises P0001 on a used token, which
  -- is also the code a bare `raise exception` here would carry -- so record
  -- whether the second call returned, and assert outside the handler.
  declare reused boolean := false;
  begin
    begin
      perform public.accept_invite(invite_token);
      reused := true;
    exception when raise_exception then null; -- expected
    end;
    if reused then raise exception 'invite was reusable'; end if;
  end;

  -- The sole admin cannot leave or self-demote (org would be unmanageable).
  perform pg_temp.become(alice);
  declare left_ok boolean := false;
  begin
    begin
      delete from public.org_member where org_id = team and user_id = alice;
      left_ok := true;
    exception when raise_exception then null; -- expected: keep-an-admin trigger
    end;
    if left_ok then raise exception 'the last admin was allowed to leave'; end if;
  end;

  -- delete_account() refuses for the same reason (Team still has Bob and no
  -- other admin), and changes nothing when it does.
  begin
    perform public.delete_account();
    raise exception 'delete_account allowed stranding the team';
  exception when raise_exception then null; -- expected
  end;
  select count(*) into n from public.org_member where org_id = team and user_id = alice;
  if n <> 1 then raise exception 'alice membership changed despite the refusal'; end if;
  -- authenticated has no SELECT on auth.users; bypass RLS/grants to check it
  perform set_config('role', 'postgres', true);
  select count(*) into n from auth.users where id = alice;
  if n <> 1 then raise exception 'alice account changed despite the refusal'; end if;

  -- Bob leaves Team and loses access to its grid.
  perform pg_temp.become(bob);
  delete from public.org_member where org_id = team and user_id = bob;
  select count(*) into n from public.grid where id = team_grid;
  if n <> 0 then raise exception 'ex-member still sees the team grid'; end if;

  -- Carol is a plain member of Team (she accepted the invite above) and admin
  -- of nothing shared, so delete_account succeeds outright; her emptied
  -- personal org is cleaned up, not left orphaned. Bind carol_org to that
  -- personal org explicitly -- she has two memberships now, and picking the
  -- Team one would make the cleanup check pass for the wrong reason.
  perform pg_temp.become(carol);
  declare
    carol_org uuid;
    remaining int;
  begin
    select org_id into carol_org
      from public.org_member where user_id = carol and org_id <> team;
    perform public.delete_account();

    select count(*) into remaining from public.org_member where user_id = carol;
    if remaining <> 0 then raise exception 'carol membership survived delete_account'; end if;

    -- switch back to the superuser role to see past RLS and confirm the org
    -- row itself is gone, not merely inaccessible to the now-deleted user
    perform set_config('role', 'postgres', true);
    select count(*) into remaining from public.org where id = carol_org;
    if remaining <> 0 then raise exception 'carol''s emptied org was not cleaned up'; end if;
    select count(*) into remaining from auth.users where id = carol;
    if remaining <> 0 then raise exception 'carol''s auth.users row survived delete_account'; end if;
  end;

  raise notice 'rls_smoke: all checks passed';
end;
$$;

rollback;
