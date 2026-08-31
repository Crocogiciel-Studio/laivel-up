# Grid & profile studio

A web app around the evaluation engine. A Lead Tech signs in, builds grids with a
drag-and-drop builder, fills profiles through a form, runs evaluations, and keeps
the history per developer.

The app (backend + web) is self-hosted; the database is a **Supabase Cloud**
project so several leads share it. A local Supabase stack (`supabase start`) is
an option for offline development.

Tracking: epic [#54](https://github.com/Crocogiciel-Studio/laivel-up/issues/54),
phases [#55](https://github.com/Crocogiciel-Studio/laivel-up/issues/55)–[#61](https://github.com/Crocogiciel-Studio/laivel-up/issues/61).

## Boundary

The studio is a **delivery layer**, not a change to the engine. It lives under
`ui/` and imports the core one way through `laivel-up/compose` — a subpath
export that wires the engine to the built-in criterion catalogue — exactly like
the CLI does. The hexagon rules still hold: nothing in `src/` imports the studio,
and the core gains no dependency. Persistence and HTTP are new adapters.

The offline CLI and the single-file viewer are unaffected.

```
web (SPA, #57)  ->  server (Node)  ->  src/core engine
                         |
                         v
              Supabase Cloud: Postgres + Auth
```

## Pieces

| Piece | Issue | State |
| --- | --- | --- |
| Schema + RLS, Supabase Cloud | #55 | done |
| Node backend: CRUD + run endpoint | #56 | done |
| Web shell: routing + OAuth login | #57 | done |
| Profile form editor | #58 | done (`ui/web/src/profile/`) |
| Drag-and-drop grid builder | #59 | done (`ui/web/src/grid/`) |
| Run + persisted history + comparison | #60 | done (`ui/web/src/runs/`) |
| Seeded read-only templates | #61 | this change (`supabase/migrations/…seed_templates.sql`) |

The web app under `ui/web` — React + Vite + React Router, Supabase OAuth
client-side, all data through the backend — carries the shell (`/login`, an org
switcher, `/org` settings), the profile form (`/profiles`), the grid builder
(`/grids`), and the run screen (`/runs`): pick a saved profile and grid,
`POST /api/runs`, and the stored evaluation is rendered through `@laivel-up/ui`'s
view-model helpers (resolved against the run's own grid snapshot). History is
grouped by developer with an over-time comparison, and a run is flagged when the
grid or profile it used has been edited since.

Each criterion declares its `paramDefaults` (`src/core/ports/criterion-evaluator.ts`);
`/api/catalogue` returns them so the builder pre-fills a criterion card. The
builder's output is the `presets/*.json` shape — `ui/web/src/grid/preset.test.ts`
round-trips the AIDD preset through it and checks the result still parses via
`laivel-up/compose`.

## Data model

A grid, profile, or run belongs to an **organisation**, not a person. Every
member of the org sees its configs; an **admin or the config's creator** can
change them; **any member can run** an evaluation, and runs are kept as history.
A new user gets a personal org automatically, so solo use just works.

Tables: `org`, `org_member`, `grid`, `profile`, `run` — see
[`supabase/README.md`](../supabase/README.md). A `run` stores a full copy of the
grid and profile it used, so editing an original never rewrites history.

The known references — the AIDD grid and the four sample profiles
(`perceval`, `bohort`, `leodagan`, `arthur`) — ship as ownerless
`is_template = true` rows in the `20260901000000_seed_templates.sql` migration,
so every user sees them and clones them to edit. The migration is generated from
`presets/aidd.json` and `test/fixtures/profiles/*` by
`scripts/build-template-seed.mjs` (fixed ids, `ON CONFLICT DO UPDATE`), so a
`db push` or a local `db reset` keeps the templates in step with the repo — edit
the sources and re-run, never the `.sql`.

Auth is Supabase Auth (OAuth). Access is enforced by Postgres row-level security
(`is_org_member` / `is_org_admin`); the backend forwards the caller's JWT so the
policies apply to every query. An admin invites people with a link
(`accept_invite()` redeems the token), re-roles or removes members; a member can
leave — the org settings page (`/org`) covers all of it.

## Running

```
pnpm install
cp .env.example .env           # SUPABASE_* for the server, VITE_* for the web app
pnpm build                     # the core — ui/server imports laivel-up/compose
pnpm -C ui/server dev          # backend on :8787, against the Cloud project
pnpm -C ui/web dev             # app on :5173
```

Add `http://127.0.0.1:5173` to the project's redirect allow-list and enable an
OAuth provider (dashboard: Authentication → URL Configuration / Providers).

`docker compose up --build` builds both tiers from the repo-root `.env`.

Applying migrations to Cloud: `pnpm db:link` once, then `pnpm db:push`.
Offline dev instead: `pnpm db:start` for a local stack, `pnpm db:test` /
`pnpm db:test:bare` to check the schema + RLS against a throwaway Postgres.

See [`ui/server/README.md`](../ui/server/README.md) for the routes.
