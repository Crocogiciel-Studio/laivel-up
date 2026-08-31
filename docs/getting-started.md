# Getting started

Every way to run this, from "just show me a verdict" to the full multi-user
studio.

Requires Node 22+ and [pnpm](https://pnpm.io). `pnpm install` once at the repo
root first.

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
pnpm dev --profile examples/dev-sample
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
drag-and-drop grid builder — see [Studio overview](studio.md) for what it is.
Running it (dev, Docker, the database) is one set of steps, kept in one
place: [Studio overview → Running](studio.md#running).

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
