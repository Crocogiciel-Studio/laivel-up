-- Studio schema: the grids, profiles, and evaluation runs a Lead Tech owns.
--
-- Three tables, one shape:
--   grid, profile  -- authored artifacts; `body` is the JSON the CLI adapters
--                     already parse (a preset for grid, an inbound profile for
--                     profile). `is_template` rows are the seeded references
--                     (issue #61) -- ownerless, readable by everyone, writable
--                     by no one through the API.
--   run            -- one evaluation. Carries a full copy of the grid and the
--                     profile it used, so history stays truthful when the
--                     originals are later edited.
--
-- Ownership is enforced by RLS keyed on the Supabase user id. The backend
-- forwards the caller's JWT to Postgres, so these policies -- not application
-- code -- are what keeps one lead out of another's rows.

-- `gen_random_uuid()` is a core function since Postgres 13, so no extension is
-- needed.

-- Bump `updated_at` on every UPDATE. Runs as the invoking role (the default
-- SECURITY INVOKER); it only rewrites NEW, so RLS never bears on it. Empty
-- search_path so an injected schema cannot shadow anything (now() is in
-- pg_catalog, which is always resolved).
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- grid --------------------------------------------------------------------------

create table public.grid (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid references auth.users (id) on delete cascade,
  name        text not null check (length(name) between 1 and 200),
  body        jsonb not null,
  is_template boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- A template has no owner; an authored grid always has one.
  constraint grid_owner_matches_kind check (
    (is_template and owner_id is null) or (not is_template and owner_id is not null)
  )
);

create index grid_owner_idx on public.grid (owner_id) where owner_id is not null;
create index grid_template_idx on public.grid (is_template) where is_template;

create trigger grid_touch_updated_at
  before update on public.grid
  for each row execute function public.touch_updated_at();

-- profile ---------------------------------------------------------------------

create table public.profile (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid references auth.users (id) on delete cascade,
  name        text not null check (length(name) between 1 and 200),
  body        jsonb not null,
  is_template boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint profile_owner_matches_kind check (
    (is_template and owner_id is null) or (not is_template and owner_id is not null)
  )
);

create index profile_owner_idx on public.profile (owner_id) where owner_id is not null;
create index profile_template_idx on public.profile (is_template) where is_template;

create trigger profile_touch_updated_at
  before update on public.profile
  for each row execute function public.touch_updated_at();

-- run -----------------------------------------------------------------------------

create table public.run (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references auth.users (id) on delete cascade,
  subject_id       text not null check (length(subject_id) between 1 and 200),
  grid_snapshot    jsonb not null,
  profile_snapshot jsonb not null,
  evaluation       jsonb not null,
  created_at       timestamptz not null default now()
);

-- History for one developer is read newest-first and filtered by subject.
create index run_owner_subject_idx on public.run (owner_id, subject_id, created_at desc);

-- Row-level security ------------------------------------------------------------

alter table public.grid enable row level security;
alter table public.profile enable row level security;
alter table public.run enable row level security;

-- grid: an authenticated user has full control of their own rows...
create policy grid_owner_all on public.grid
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- ...and may read any template, but the absence of an INSERT/UPDATE/DELETE
-- policy for templates means they cannot write them.
create policy grid_template_read on public.grid
  for select to authenticated
  using (is_template);

create policy profile_owner_all on public.profile
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy profile_template_read on public.profile
  for select to authenticated
  using (is_template);

-- run: strictly owner-scoped, no template concept.
create policy run_owner_all on public.run
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
