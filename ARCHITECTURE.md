# Architecture

Part of the [documentation corpus](docs/README.md).

A pnpm monorepo. One product — the **evaluation engine** — and a **studio**
delivery layer around it. The engine knows nothing about the studio; the studio
depends on the engine one way.

```
┌─────────────────────────────────────────────────────────────────────┐
│  packages/core          the engine (the product)                     │
│                                                                     │
│    src/core/            model + engine. no stack, no format,         │
│                         no framework — pure hexagon                  │
│    src/adapters/        JSON ⇄ model, at the edges                   │
│    src/criteria/        the coded criteria a grid picks from         │
│    src/cli/             `laivel-up --profile … --grid …`             │
│    presets/aidd.json    the AIDD grid, as one preset                 │
│    i18n/                message catalogues for the descriptors       │
│    test/                unit + the 4 sample-profile regression guard │
│                                                                     │
│    → package name `laivel-up`, subpath `laivel-up/compose`           │
└───────────────┬─────────────────────────────────────────────────────┘
                │ one-way, via `laivel-up/compose`
   ┌────────────┴───────────────┬──────────────────────┐
   ▼                            ▼                      ▼
packages/viewer          packages/studio-server   packages/studio-web
single-file static       Fastify — wraps the      React SPA — the app a
viewer for one           engine over HTTP,        Lead Tech signs into
evaluation.json          forwards the JWT so
(@laivel-up/ui)          Postgres RLS is the
                         boundary
                            │
                            ▼
                     packages/studio-db
                     Supabase schema, RLS,
                     migrations, seed templates
```

## The rule that matters

`packages/core/src/core/` imports **no adapter, no criterion, no CLI, no
third-party package**. Only the domain model crosses the boundary. Enforced by
`dependency-cruiser` (`packages/core/.dependency-cruiser.cjs`) and, for the
subtler leaks, by the `hexagon` review axis (`docs/agents/hexagon.md`).

The studio is a **delivery layer**, not a change to the engine. Every studio
package reaches the engine through the `laivel-up/compose` subpath export — the
same way the CLI does — and adds only adapters (HTTP, Postgres).

## Where things live

| Path | What |
| --- | --- |
| `packages/core/` | the engine, criteria, CLI, presets, i18n, its tests + configs (tsconfig, eslint, depcruise, vitest) |
| `packages/viewer/` | `@laivel-up/ui` — the static viewer; its own Vite toolchain |
| `packages/studio-server/` | `@laivel-up/studio-server` — Fastify backend |
| `packages/studio-web/` | `@laivel-up/studio-web` — React + Vite SPA |
| `packages/studio-db/` | `@laivel-up/studio-db` — `supabase/` (config, migrations, RLS tests) + the `db:*` scripts |
| `docs/` | `studio.md`, `evaluation.schema.json` lives in `packages/core/docs/`, and `docs/agents/` is the review pipeline |
| `aidd_docs/` | AIDD memory, specs, task notes |
| `.github/` | CI (`ci.yml`) + the multi-agent review pipeline |
| root | `pnpm-workspace.yaml`, `package.json` (scripts delegate to the packages), `docker-compose.yml` |

## Commands

Root scripts delegate to the right package, so day to day you run them from the
repo root:

```bash
pnpm build            # → packages/core
pnpm test             # → packages/core (engine + regression guardrail)
pnpm typecheck / lint / depcruise / i18n:check
pnpm db:push          # → packages/studio-db (supabase db push)
pnpm db:test:bare     # → packages/studio-db (migrations + RLS smoke on a throwaway Postgres)
pnpm templates:check  # → packages/studio-db (the seed migration matches the sources)
```

Per-package toolchains:

```bash
pnpm -C packages/viewer        test | build
pnpm -C packages/studio-server test | run build
pnpm -C packages/studio-web    test | run build
```
