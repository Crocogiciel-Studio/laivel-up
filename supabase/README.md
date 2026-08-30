# Studio database

Local Supabase stack (Postgres + Auth) for the grid & profile studio — see
[`docs/studio.md`](../docs/studio.md) for how it fits the whole app, and epic
[#54](https://github.com/Crocogiciel-Studio/laivel-up/issues/54).

## Prerequisites

- Docker running.
- `pnpm install` (pins the Supabase CLI as a dev dependency).
- `psql` on `PATH` — used by `pnpm db:test`. `pnpm db:test:bare` needs only Docker.

## Commands

| Command | Does |
| --- | --- |
| `pnpm db:start` | Bring the local stack up. Prints the API URL, anon key, and service-role key — copy them into `.env`. |
| `pnpm db:stop` | Stop the stack. |
| `pnpm db:status` | Show URLs and keys for a running stack. |
| `pnpm db:reset` | Drop, recreate, re-run every migration, then `seed.sql`. |
| `pnpm db:new <name>` | Scaffold a new timestamped migration under `migrations/`. |
| `pnpm db:test` | Reset, then run the RLS smoke test. Non-zero exit means a policy regressed. |

## Layout

- `config.toml` — stack configuration. `realtime`, `storage`, and `edge_runtime`
  are off (unused). OAuth providers are defined but disabled; enable one and
  supply credentials via environment variables (`.env.example`).
- `migrations/` — ordered schema changes. `20260830120000_studio_init.sql`
  creates `grid`, `profile`, `run` and their RLS policies.
- `seed.sql` — data for a fresh stack. Templates land here in
  [#61](https://github.com/Crocogiciel-Studio/laivel-up/issues/61).
- `tests/rls_smoke.sql` — proves one user cannot read or write another's rows,
  and that templates are read-only.

## Schema

| Table | Holds | Ownership |
| --- | --- | --- |
| `grid` | a grid preset (`body` = the CLI's `presets/*.json` shape) | `owner_id`, or `NULL` for a seeded template |
| `profile` | an inbound profile (`body` = the CLI's profile JSON) | same |
| `run` | one evaluation + a full snapshot of the grid and profile it used | `owner_id`, always set |

RLS is keyed on `auth.uid()`. The backend forwards the caller's JWT to Postgres,
so these policies are the enforcement boundary — not application code.
