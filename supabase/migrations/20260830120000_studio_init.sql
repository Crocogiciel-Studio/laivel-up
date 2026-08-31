-- Studio schema: organisations, and the grids / profiles / evaluation runs they
-- own.
--
--   org / org_member  -- a team and its roster (admin | member). A new auth user
--                        gets a personal org; orgs are created via create_org().
--   org_invite        -- a link an admin shares; accept_invite() redeems it.
--   grid, profile     -- authored artifacts; `body` is the JSON the CLI adapters
--                        already parse. `is_template` rows are ownerless global
--                        references, readable by all, writable by none.
--   run               -- one evaluation, with a full copy of the grid and
--                        profile it used so history stays truthful.
--
-- Access is row-level security keyed on auth.uid() via is_org_member() /
-- is_org_admin(): members read an org's configs, an admin or the config's
-- creator writes them, any member may run. The backend forwards the caller's
-- JWT, so these policies -- not application code -- are the boundary.

-- Housekeeping trigger --------------------------------------------------------

-- Bump `updated_at` on every UPDATE. SECURITY INVOKER (the default); it only
-- rewrites NEW, so RLS never bears on it. Empty search_path so an injected
-- schema cannot shadow anything (now() is in pg_catalog, always resolved).
create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Organisations ------------------------------------------------------------------

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
-- without tripping its own RLS (which would recurse). `revoke from public`
-- because CREATE FUNCTION grants EXECUTE to PUBLIC, and a later `revoke from
-- anon` alone would not remove that.

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

revoke execute on function public.is_org_member(uuid) from public;
revoke execute on function public.is_org_admin(uuid) from public;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.is_org_admin(uuid) to authenticated;

-- Orgs are created only through this function: it adds the creator as the first
-- admin in the same call. A direct `insert into org` has no policy, so a client
-- cannot do it -- and could not read the row back before the membership exists.
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

revoke execute on function public.create_org(text) from public;
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

-- Trigger function only; never an RPC target.
revoke execute on function public.handle_new_user() from public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Invites -----------------------------------------------------------------------

create table public.org_invite (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.org (id) on delete cascade,
  -- opaque, core functions only so the bare-Postgres tests need no pgcrypto
  token       text not null unique
                default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  email       text,
  role        text not null default 'member' check (role in ('admin', 'member')),
  created_by  uuid references auth.users (id) on delete set null,
  expires_at  timestamptz not null default now() + interval '14 days',
  accepted_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  created_at  timestamptz not null default now()
);

create index org_invite_org_idx on public.org_invite (org_id);

-- The roster with emails. SECURITY DEFINER to reach auth.users, gated on
-- membership so a non-member gets nothing.
create function public.org_members(p_org uuid)
returns table (user_id uuid, email text, role text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, u.email, m.role, m.created_at
  from public.org_member m
  join auth.users u on u.id = m.user_id
  where m.org_id = p_org and public.is_org_member(p_org)
$$;

revoke execute on function public.org_members(uuid) from public;
grant execute on function public.org_members(uuid) to authenticated;

-- Redeem an invite. Definer so the org_member row is written despite the
-- admin-only insert policy; validates token, expiry, email, and single use.
create function public.accept_invite(p_token text)
returns public.org_member
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.org_invite;
  me uuid := (select auth.uid());
  my_email text;
  joined public.org_member;
begin
  if me is null then
    raise exception 'must be signed in to accept an invite';
  end if;

  select * into inv from public.org_invite where token = p_token;
  if inv.id is null then
    raise exception 'invite not found';
  end if;
  if inv.accepted_at is not null then
    raise exception 'invite already used';
  end if;
  if inv.expires_at < now() then
    raise exception 'invite expired';
  end if;

  if inv.email is not null then
    select email into my_email from auth.users where id = me;
    if lower(coalesce(my_email, '')) <> lower(inv.email) then
      raise exception 'invite is for a different email address';
    end if;
  end if;

  insert into public.org_member (org_id, user_id, role)
    values (inv.org_id, me, inv.role)
    on conflict (org_id, user_id) do update set role = excluded.role
    returning * into joined;

  update public.org_invite
    set accepted_by = me, accepted_at = now()
    where id = inv.id;

  return joined;
end;
$$;

revoke execute on function public.accept_invite(text) from public;
grant execute on function public.accept_invite(text) to authenticated;

-- Artifacts and runs ----------------------------------------------------------

create table public.grid (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid references public.org (id) on delete cascade,
  created_by  uuid references auth.users (id) on delete set null,
  name        text not null check (length(name) between 1 and 200),
  body        jsonb not null,
  is_template boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint grid_org_matches_kind check (
    (is_template and org_id is null) or (not is_template and org_id is not null)
  )
);

create index grid_org_idx on public.grid (org_id) where org_id is not null;
create index grid_template_idx on public.grid (is_template) where is_template;

create trigger grid_touch_updated_at
  before update on public.grid
  for each row execute function public.touch_updated_at();

create table public.profile (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid references public.org (id) on delete cascade,
  created_by  uuid references auth.users (id) on delete set null,
  name        text not null check (length(name) between 1 and 200),
  body        jsonb not null,
  is_template boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint profile_org_matches_kind check (
    (is_template and org_id is null) or (not is_template and org_id is not null)
  )
);

create index profile_org_idx on public.profile (org_id) where org_id is not null;
create index profile_template_idx on public.profile (is_template) where is_template;

create trigger profile_touch_updated_at
  before update on public.profile
  for each row execute function public.touch_updated_at();

create table public.run (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.org (id) on delete cascade,
  created_by       uuid references auth.users (id) on delete set null,
  subject_id       text not null check (length(subject_id) between 1 and 200),
  grid_snapshot    jsonb not null,
  profile_snapshot jsonb not null,
  evaluation       jsonb not null,
  created_at       timestamptz not null default now()
);

create index run_org_subject_idx on public.run (org_id, subject_id, created_at desc);

-- Row-level security ------------------------------------------------------------

alter table public.org enable row level security;
alter table public.org_member enable row level security;
alter table public.org_invite enable row level security;
alter table public.grid enable row level security;
alter table public.profile enable row level security;
alter table public.run enable row level security;

-- org: members see it; creation is create_org(); admins manage it.
create policy org_read on public.org
  for select to authenticated using (public.is_org_member(id));
create policy org_admin_update on public.org
  for update to authenticated using (public.is_org_admin(id)) with check (public.is_org_admin(id));
create policy org_admin_delete on public.org
  for delete to authenticated using (public.is_org_admin(id));

-- org_member: members see the roster; admins add and re-role; you can leave.
create policy org_member_read on public.org_member
  for select to authenticated using (public.is_org_member(org_id));
create policy org_member_admin_insert on public.org_member
  for insert to authenticated with check (public.is_org_admin(org_id));
create policy org_member_admin_update on public.org_member
  for update to authenticated using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));
create policy org_member_leave on public.org_member
  for delete to authenticated using (public.is_org_admin(org_id) or user_id = (select auth.uid()));

-- org_invite: members see them; only admins create and revoke.
create policy org_invite_read on public.org_invite
  for select to authenticated using (public.is_org_member(org_id));
create policy org_invite_admin_insert on public.org_invite
  for insert to authenticated
  with check (public.is_org_admin(org_id) and created_by = (select auth.uid()));
create policy org_invite_admin_delete on public.org_invite
  for delete to authenticated using (public.is_org_admin(org_id));

-- grid / profile: members read (plus templates); admin or the creator writes;
-- a plain member cannot create one.
create policy grid_org_read on public.grid
  for select to authenticated using (is_template or public.is_org_member(org_id));
create policy grid_writer_insert on public.grid
  for insert to authenticated
  with check (not is_template and public.is_org_admin(org_id) and created_by = (select auth.uid()));
create policy grid_writer_update on public.grid
  for update to authenticated
  using (not is_template and (public.is_org_admin(org_id) or created_by = (select auth.uid())))
  with check (not is_template and (public.is_org_admin(org_id) or created_by = (select auth.uid())));
create policy grid_writer_delete on public.grid
  for delete to authenticated
  using (not is_template and (public.is_org_admin(org_id) or created_by = (select auth.uid())));

create policy profile_org_read on public.profile
  for select to authenticated using (is_template or public.is_org_member(org_id));
create policy profile_writer_insert on public.profile
  for insert to authenticated
  with check (not is_template and public.is_org_admin(org_id) and created_by = (select auth.uid()));
create policy profile_writer_update on public.profile
  for update to authenticated
  using (not is_template and (public.is_org_admin(org_id) or created_by = (select auth.uid())))
  with check (not is_template and (public.is_org_admin(org_id) or created_by = (select auth.uid())));
create policy profile_writer_delete on public.profile
  for delete to authenticated
  using (not is_template and (public.is_org_admin(org_id) or created_by = (select auth.uid())));

-- run: any member may run and read; runs are never updated; admin or creator
-- may prune.
create policy run_org_read on public.run
  for select to authenticated using (public.is_org_member(org_id));
create policy run_member_insert on public.run
  for insert to authenticated
  with check (public.is_org_member(org_id) and created_by = (select auth.uid()));
create policy run_writer_delete on public.run
  for delete to authenticated
  using (public.is_org_admin(org_id) or created_by = (select auth.uid()));
