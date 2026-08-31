# Getting started

Every way to run this, from "just show me a verdict" to the full multi-user
studio. Pick the row that matches what you want.

Requires Node 22+ and [pnpm](https://pnpm.io). `pnpm install` once at the repo
root before any of the below.

## 1. One evaluation, from the terminal

The core does not need a server, a database, or a network connection.

```bash
pnpm build
node packages/core/dist/cli/main.js --profile packages/core/examples/dev-sample
```

Prints the [evaluation JSON](../packages/core/docs/evaluation.schema.json) to
stdout — the global level, one entry per axis, the readings behind each, and
the progression plan.

```
usage: laivel-up --profile|-p <dir> [--grid|-g <preset.json>] [--min-axes <n>] [--format json] [--help|-h]
```

| Flag | Meaning | Default |
| --- | --- | --- |
| `--profile`, `-p` | a [profile directory](authoring-a-profile.md) | required |
| `--grid`, `-g` | a [grid preset](authoring-a-grid.md) JSON file | `packages/core/presets/aidd.json` |
| `--min-axes` | axes that must be ruled on before a global level is emitted | `1` |
| `--format` | output format; `json` is the only value today | `json` |

From source without a build (`tsx`, for iterating):

```bash
pnpm dev --profile packages/core/examples/dev-sample
```

## 2. See it rendered, offline

```bash
pnpm viz                          # evaluates the 4 sample profiles, opens the viewer
pnpm viz -p <dir> -g <preset.json>
```

Opens a browser tab per evaluated profile: verdict, per-axis confidence,
readings, progression. The same page is also a single static HTML file
(`packages/viewer`) — build it once and it opens from `file://` with no
server, no network:

```bash
pnpm -C packages/viewer run build   # -> packages/viewer/dist/index.html
```

Drop any `evaluation.json` onto that page to render it — the viewer never
runs the engine itself, it only renders the JSON.

## 3. The studio — the multi-user web app

Everything the CLI does, plus persistence, an org model, and a
drag-and-drop grid builder. See [Studio overview](studio.md) for what it is;
below is how to get it running.

```bash
cp .env.example .env    # SUPABASE_* for the backend, VITE_* for the web app
pnpm build              # the engine — studio-server imports it via laivel-up/compose
pnpm -C packages/studio-server dev   # backend, :8787
pnpm -C packages/studio-web dev      # web app, :5173
```

Needs a Supabase project (Cloud, or a local stack — see below) reachable at the
`SUPABASE_URL` / `VITE_SUPABASE_URL` in `.env`. Add
`http://127.0.0.1:5173` to that project's OAuth redirect allow-list.

### Studio, containerized

```bash
docker compose up --build   # web on :5173, backend on :8787 — reads the repo-root .env
```

### The studio's database

```bash
pnpm db:start        # a local Supabase stack, for offline dev
pnpm db:push         # apply migrations to the linked Cloud project
pnpm db:test:bare     # migrations + row-level-security smoke test, throwaway Postgres, no Supabase images
```

Full command reference: [`packages/studio-db/supabase/README.md`](../packages/studio-db/supabase/README.md).

## 4. Everything, verified

What CI runs, runnable locally exactly the same way:

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm depcruise && pnpm i18n:check && pnpm build
pnpm templates:check
pnpm -C packages/viewer test && pnpm -C packages/viewer run build
pnpm -C packages/studio-server test
pnpm -C packages/studio-web test
pnpm -C packages/studio-db db:test:bare
```

`pnpm test` includes a regression guardrail: the four sample profiles
(`perceval`, `bohort`, `leodagan`, `arthur`) must never read below their known
AIDD level — see [Concepts](concepts.md).
