-- Fixes a real gap: there was no way to delete an account. org_keep_an_admin()
-- blocked removing the org's last admin unconditionally -- including when that
-- admin was the org's *only* member, where there is no one left to protect and
-- the block just made the row permanently stuck (this is what broke a full
-- data reset: deleting auth.users cascades into org_member, which the trigger
-- refused).
--
-- Fix: only block when *other* members would be left admin-less. Losing the
-- last member entirely is fine -- and an org with zero members is dead weight
-- (is_org_member can never be true for it again), so a new AFTER trigger drops
-- it once its last row is gone.
--
-- delete_account() is the actual "delete my account" entry point: it refuses
-- (naming the orgs) when the caller is the sole admin of a *shared* org, so
-- deleting never silently strands a team; otherwise it drops every membership
-- (letting the empty-org cleanup trigger fire) and the auth.users row itself.

create or replace function public.org_keep_an_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'admin'
     and (tg_op = 'DELETE' or new.role <> 'admin')
     and exists (
       select 1 from public.org_member
       where org_id = old.org_id and user_id <> old.user_id
     )
     and not exists (
       select 1 from public.org_member
       where org_id = old.org_id and user_id <> old.user_id and role = 'admin'
     )
  then
    raise exception 'an organisation must keep at least one admin';
  end if;
  return case tg_op when 'DELETE' then old else new end;
end;
$$;

-- An org with no members left is unreachable (every policy gates on
-- is_org_member) -- remove it rather than leave a permanent orphan.
create function public.org_cleanup_if_empty()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.org_member where org_id = old.org_id) then
    delete from public.org where id = old.org_id;
  end if;
  return old;
end;
$$;

revoke execute on function public.org_cleanup_if_empty() from public;

create trigger org_cleanup_if_empty_trg
  after delete on public.org_member
  for each row execute function public.org_cleanup_if_empty();

-- Delete the caller's account: every membership, then the auth.users row.
-- Refuses up front (naming the orgs) rather than leaving a partial delete
-- behind if it silently stopped partway through a shared org.
create function public.delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  blocking text;
begin
  if me is null then
    raise exception 'must be signed in to delete an account';
  end if;

  select string_agg(o.name, ', ')
    into blocking
    from public.org o
    join public.org_member admin_row on admin_row.org_id = o.id and admin_row.user_id = me
    where admin_row.role = 'admin'
      and exists (select 1 from public.org_member m2 where m2.org_id = o.id and m2.user_id <> me)
      and not exists (
        select 1 from public.org_member m3
        where m3.org_id = o.id and m3.user_id <> me and m3.role = 'admin'
      );

  if blocking is not null then
    raise exception
      'promote another admin (or leave) in % before deleting your account', blocking;
  end if;

  delete from public.org_member where user_id = me;
  delete from auth.users where id = me;
end;
$$;

revoke execute on function public.delete_account() from public;
grant execute on function public.delete_account() to authenticated;
