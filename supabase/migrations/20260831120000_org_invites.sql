-- Growing an org past its creator: invites, roles, removal.
--
-- An admin creates an invite (optionally pinned to an email). Anyone signed in
-- redeems the token through accept_invite(); admins re-role or remove members,
-- and a member can remove themselves (org_member_leave, already in place).

create table public.org_invite (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.org (id) on delete cascade,
  -- opaque, using only core functions so the bare-Postgres tests need no pgcrypto
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

alter table public.org_invite enable row level security;

-- Members see their org's invites; only admins create and revoke them.
create policy org_invite_read on public.org_invite
  for select to authenticated
  using (public.is_org_member(org_id));

create policy org_invite_admin_insert on public.org_invite
  for insert to authenticated
  with check (public.is_org_admin(org_id) and created_by = (select auth.uid()));

create policy org_invite_admin_delete on public.org_invite
  for delete to authenticated
  using (public.is_org_admin(org_id));

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

revoke execute on function public.org_members(uuid) from anon;
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

revoke execute on function public.accept_invite(text) from anon;
grant execute on function public.accept_invite(text) to authenticated;
