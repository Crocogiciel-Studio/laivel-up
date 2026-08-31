# Studio database

Schema, RLS, and migrations for the grid & profile studio — see
[`docs/studio.md`](../docs/studio.md) for how it fits the whole app, and epic
[#54](https://github.com/Crocogiciel-Studio/laivel-up/issues/54).

The deployed database is a **Supabase Cloud** project. A local stack
(`supabase start`) is optional, for offline development.

## Prerequisites

- `pnpm install` (pins the Supabase CLI as a dev dependency).
- Docker — only for a local stack or `pnpm db:test:bare`.
- `psql` on `PATH` — only for `pnpm db:test`.

## Commands

| Command | Does |
| --- | --- |
| `pnpm db:new <name>` | Scaffold a new timestamped migration under `migrations/`. |
| `pnpm db:link` | Link the CLI to the Cloud project (`--project-ref <ref>`). Once. |
| `pnpm db:push` | Apply pending migrations to the linked Cloud project. |
| `pnpm db:test` | Reset a local DB, then run the RLS smoke test. Non-zero exit = a policy regressed. |
| `pnpm db:test:bare` | Same, against a throwaway Docker Postgres — no Supabase images. |
| `pnpm db:start` / `db:stop` / `db:status` / `db:reset` | Local stack, for offline dev. |

CI runs the smoke test on every push (`.github/workflows/ci.yml`, job `db`), so
a broken policy or migration fails the build before it can reach Cloud.

## Layout

- `config.toml` — configuration for a *local* stack only. `realtime`, `storage`,
  `edge_runtime`, `analytics` are off; OAuth blocks are defined but disabled.
  Cloud auth providers and redirect URLs are set in the dashboard.
- `migrations/` — ordered schema changes. `20260830120000_studio_init.sql`
  creates `grid`, `profile`, `run`; `20260831090000_orgs.sql` adds `org` /
  `org_member` and re-scopes everything from a single owner to an org;
  `20260831120000_org_invites.sql` adds `org_invite` + `accept_invite()` and the
  `org_members()` roster function.
- `seed.sql` — data for a fresh local DB. Templates land here in
  [#61](https://github.com/Crocogiciel-Studio/laivel-up/issues/61).
- `tests/rls_smoke.sql` — proves one user cannot read or write another's rows,
  and that templates are read-only. `tests/auth_shim.sql` fakes the minimal
  Supabase surface so it runs on a bare Postgres.
- `scripts/db-smoke.sh` (repo root) — apply shim + migrations + smoke test; the
  CI `db` job and `db:test:bare` both call it.

## Schema

| Table | Holds | Scope |
| --- | --- | --- |
| `org` | an organisation | created via `create_org()`; a new user gets a personal one |
| `org_member` | `(org_id, user_id, role)` — `admin` or `member` | admins manage the roster; you can leave |
| `grid` | a grid preset (`body` = the CLI's `presets/*.json` shape) | `org_id` + `created_by`; `NULL` org for a seeded template |
| `profile` | an inbound profile (`body` = the CLI's profile JSON) | same |
| `run` | one evaluation + a full snapshot of the grid and profile it used | `org_id` + `created_by`, always set |

RLS, keyed on `auth.uid()` via `is_org_member()` / `is_org_admin()`:

- **grid / profile** — members read; an **admin or the creator** writes; a plain
  member cannot create one.
- **run** — any member may create and read; runs are never updated; an admin or
  the creator may delete.
- **template** (`is_template`, no org) — readable by any signed-in user, writable
  by none.

The backend forwards the caller's JWT to Postgres, so these policies are the
enforcement boundary — not application code.
