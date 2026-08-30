# Studio backend

The studio's only server. It does all CRUD for grids, profiles, and runs, and is
the one process that calls the evaluation engine. Part of the grid & profile
studio — see [`docs/studio.md`](../../docs/studio.md), epic
[#54](https://github.com/Crocogiciel-Studio/laivel-up/issues/54), issue
[#56](https://github.com/Crocogiciel-Studio/laivel-up/issues/56).

## Boundary

Imports the core through `laivel-up/compose` (a new subpath export), one way. It
never reaches into `src/`. Persistence and HTTP are adapters; the hexagon core is
untouched.

## Auth and ownership

Every `/api/*` request needs `Authorization: Bearer <supabase-jwt>`. The token is
verified against the local Supabase auth server, then **forwarded to Postgres**
on each query, so row-level security (issue #55) is what decides access — the
server adds no ownership checks of its own. There is no service-role key.

## Routes

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/health` | no auth |
| `GET` | `/api/catalogue` | the coded criteria a grid can pick from |
| `GET` `POST` | `/api/grids`, `/api/profiles` | list / create |
| `GET` `PATCH` `DELETE` | `/api/grids/:id`, `/api/profiles/:id` | owner-scoped; templates are read-only |
| `GET` | `/api/runs` | `?subjectId=` filters one developer's history |
| `GET` | `/api/runs/:id` | |
| `POST` | `/api/runs` | `{ gridId \| grid, profileId \| profile, subjectId?, minRuledAxes? }` |

`POST /api/runs` resolves the grid and profile (a saved id, or an inline body),
validates both against the CLI's schemas, runs the engine, and stores the run
with a **full snapshot** of the grid and profile it used plus the resulting
evaluation. Editing an original later never rewrites a past run.

A grid or profile body is rejected (422) unless it satisfies the same schema the
CLI adapters use, so anything saved here also runs in the CLI.

## Develop

```
pnpm install
pnpm db:start                 # from the repo root — Supabase + the keys for .env
pnpm build                    # build the core; ui/server imports laivel-up/compose
pnpm -C ui/server dev         # tsx watch on :8787
```

`pnpm -C ui/server test` needs the core built first (the integration test in
`engine.test.ts` loads the real wiring); the route tests use fakes and do not.

## Container

```
docker build -f ui/server/Dockerfile -t laivel-up-studio-server .
docker compose up --build     # server on :8787, Supabase via `pnpm db:start`
```
