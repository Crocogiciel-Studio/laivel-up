-- Organisations: a grid or profile belongs to an org, and every member of that
-- org can see it. Admins and the creator can change it; a plain member has
-- read-only access to configs but may run evaluations. Runs are kept for
-- history and never edited.
--
-- Personal use is an org of one, created automatically on first sign-in (and
-- backfilled here for anyone who signed in before this migration).

-- Tables ---------------------------------------------------------------------

create table public.org (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(name) between 1 and 200),
  created_at timestamptz not null default now()
);

create table public.org_member (
  org_id     uuid not null references public.org (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create index org_member_user_idx on public.org_member (user_id);

-- Membership predicates. SECURITY DEFINER so they read org_member directly
-- without tripping its own RLS (which would recurse).

create function public.is_org_member(o uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.org_member
    where org_id = o and user_id = (select auth.uid())
  )
$$;

create function public.is_org_admin(o uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.org_member
    where org_id = o and user_id = (select auth.uid()) and role = 'admin'
  )
$$;

-- Orgs are created only through this function: it adds the creator as the first
-- admin in the same call. A direct `insert into org` has no policy, so the
-- client cannot do it (and could not read the row back anyway before the
-- membership exists). Runs as definer to bypass RLS for both writes.
create function public.create_org(p_name text)
returns public.org
language plpgsql
security definer
set search_path = ''
as $$
declare
  created public.org;
begin
  if (select auth.uid()) is null then
    raise exception 'must be signed in to create an org';
  end if;
  insert into public.org (name) values (p_name) returning * into created;
  insert into public.org_member (org_id, user_id, role)
    values (created.id, (select auth.uid()), 'admin');
  return created;
end;
$$;

grant execute on function public.create_org(text) to authenticated;

-- A new auth user gets a personal org.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  personal_org uuid;
begin
  insert into public.org (name)
    values (coalesce(nullif(new.email, ''), 'Personal') || '''s org')
    returning id into personal_org;
  insert into public.org_member (org_id, user_id, role)
    values (personal_org, new.id, 'admin');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- PostgREST exposes every public function as an RPC endpoint. These are internal:
-- the trigger function and the RLS predicates. Keep EXECUTE only where it is
-- actually needed -- `authenticated` must call the predicates for its policies,
-- and `create_org` is the one intentional client entry point.
revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.is_org_member(uuid) from anon;
revoke execute on function public.is_org_admin(uuid) from anon;
revoke execute on function public.create_org(text) from anon;

-- Re-shape grid / profile / run ---------------------------------------------

drop policy grid_owner_all on public.grid;
drop policy grid_template_read on public.grid;
drop policy profile_owner_all on public.profile;
drop policy profile_template_read on public.profile;
drop policy run_owner_all on public.run;

alter table public.grid drop constraint grid_owner_matches_kind;
alter table public.profile drop constraint profile_owner_matches_kind;

alter table public.grid drop column owner_id;
alter table public.profile drop column owner_id;
alter table public.run drop column owner_id;

alter table public.grid
  add column org_id uuid references public.org (id) on delete cascade,
  add column created_by uuid references auth.users (id) on delete set null,
  add constraint grid_org_matches_kind check (
    (is_template and org_id is null) or (not is_template and org_id is not null)
  );

alter table public.profile
  add column org_id uuid references public.org (id) on delete cascade,
  add column created_by uuid references auth.users (id) on delete set null,
  add constraint profile_org_matches_kind check (
    (is_template and org_id is null) or (not is_template and org_id is not null)
  );

alter table public.run
  add column org_id uuid not null references public.org (id) on delete cascade,
  add column created_by uuid references auth.users (id) on delete set null;

create index grid_org_idx on public.grid (org_id) where org_id is not null;
create index profile_org_idx on public.profile (org_id) where org_id is not null;

-- run_owner_subject_idx, grid_owner_idx, profile_owner_idx were indexes on
-- owner_id and went with the column above.
drop index if exists run_owner_subject_idx;
create index run_org_subject_idx on public.run (org_id, subject_id, created_at desc);

-- Policies -----------------------------------------------------------------------

-- org: members see it; creation goes through create_org(); admins manage it.
create policy org_read on public.org
  for select to authenticated
  using (public.is_org_member(id));

create policy org_admin_update on public.org
  for update to authenticated
  using (public.is_org_admin(id))
  with check (public.is_org_admin(id));

create policy org_admin_delete on public.org
  for delete to authenticated
  using (public.is_org_admin(id));

-- org_member: members see the roster; admins add and re-role; you can remove
-- yourself.
create policy org_member_read on public.org_member
  for select to authenticated
  using (public.is_org_member(org_id));

create policy org_member_admin_insert on public.org_member
  for insert to authenticated
  with check (public.is_org_admin(org_id));

create policy org_member_admin_update on public.org_member
  for update to authenticated
  using (public.is_org_admin(org_id))
  with check (public.is_org_admin(org_id));

create policy org_member_leave on public.org_member
  for delete to authenticated
  using (public.is_org_admin(org_id) or user_id = (select auth.uid()));

alter table public.org enable row level security;
alter table public.org_member enable row level security;

-- grid / profile: members read; admins and the creator write.
create policy grid_org_read on public.grid
  for select to authenticated
  using (is_template or public.is_org_member(org_id));

create policy grid_writer_insert on public.grid
  for insert to authenticated
  with check (
    not is_template
    and public.is_org_admin(org_id)
    and created_by = (select auth.uid())
  );

create policy grid_writer_update on public.grid
  for update to authenticated
  using (
    not is_template
    and (public.is_org_admin(org_id) or created_by = (select auth.uid()))
  )
  with check (
    not is_template
    and (public.is_org_admin(org_id) or created_by = (select auth.uid()))
  );

create policy grid_writer_delete on public.grid
  for delete to authenticated
  using (
    not is_template
    and (public.is_org_admin(org_id) or created_by = (select auth.uid()))
  );

create policy profile_org_read on public.profile
  for select to authenticated
  using (is_template or public.is_org_member(org_id));

create policy profile_writer_insert on public.profile
  for insert to authenticated
  with check (
    not is_template
    and public.is_org_admin(org_id)
    and created_by = (select auth.uid())
  );

create policy profile_writer_update on public.profile
  for update to authenticated
  using (
    not is_template
    and (public.is_org_admin(org_id) or created_by = (select auth.uid()))
  )
  with check (
    not is_template
    and (public.is_org_admin(org_id) or created_by = (select auth.uid()))
  );

create policy profile_writer_delete on public.profile
  for delete to authenticated
  using (
    not is_template
    and (public.is_org_admin(org_id) or created_by = (select auth.uid()))
  );

-- run: any member may run and read; runs are never updated; admin or creator
-- may prune.
create policy run_org_read on public.run
  for select to authenticated
  using (public.is_org_member(org_id));

create policy run_member_insert on public.run
  for insert to authenticated
  with check (
    public.is_org_member(org_id) and created_by = (select auth.uid())
  );

create policy run_writer_delete on public.run
  for delete to authenticated
  using (public.is_org_admin(org_id) or created_by = (select auth.uid()));

-- Backfill: a personal org for every existing user without a membership -------

do $$
declare
  u record;
  personal_org uuid;
begin
  for u in
    select id, email from auth.users
    where id not in (select user_id from public.org_member)
  loop
    insert into public.org (name)
      values (coalesce(nullif(u.email, ''), 'Personal') || '''s org')
      returning id into personal_org;
    insert into public.org_member (org_id, user_id, role)
      values (personal_org, u.id, 'admin');
  end loop;
end;
$$;
