# Grid & profile studio

A self-hosted web app around the evaluation engine. A Lead Tech signs in, builds
grids with a drag-and-drop builder, fills profiles through a form, runs
evaluations, and keeps the history per developer.

Tracking: epic [#54](https://github.com/Crocogiciel-Studio/laivel-up/issues/54),
phases [#55](https://github.com/Crocogiciel-Studio/laivel-up/issues/55)–[#61](https://github.com/Crocogiciel-Studio/laivel-up/issues/61).

## Boundary

The studio is a **delivery layer**, not a change to the engine. It lives under
`ui/` and imports `src/core` one way, exactly like the CLI. The hexagon rules
still hold: nothing in `src/` imports the studio, and the core gains no
dependency. Persistence and HTTP are new adapters.

The offline CLI and the single-file viewer are unaffected.

```
web (SPA, #57)  ->  server (Node, #56)  ->  src/core engine
                          |
                          v
                   Supabase: Postgres + Auth (#55)
```

## Pieces

| Piece | Issue | State |
| --- | --- | --- |
| Supabase stack + schema + RLS | #55 | this change |
| Node backend: CRUD + run endpoint | #56 | — |
| Web shell: routing + OAuth login | #57 | — |
| Profile form editor | #58 | — |
| Drag-and-drop grid builder | #59 | — |
| Run + persisted history + comparison | #60 | — |
| Seeded read-only templates | #61 | — |

## Data model

Three tables — `grid`, `profile`, `run` — in the local Supabase Postgres. See
[`supabase/README.md`](../supabase/README.md). A `run` stores a full copy of the
grid and profile it used, so editing an original never rewrites history.

Auth is Supabase Auth (OAuth). Ownership is enforced by Postgres row-level
security keyed on the Supabase user id; the backend forwards the caller's JWT so
the policies apply to every query.

## Running the database (phase 1)

```
pnpm install
pnpm db:start     # bring up Postgres + Auth, prints keys for .env
pnpm db:test      # reset + RLS smoke test
```

`docker compose` for the `server` and `web` tiers arrives with #56 / #57.
