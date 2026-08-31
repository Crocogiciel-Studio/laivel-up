# laivel-up

A parameterizable engine that places a developer on a leveling grid from
evidence about how they work, and says **why** — with a confidence trace and
a progression plan. No network, no LLM, no API key in the evaluation path.

The grid is not baked in. It is a **preset** — a config file — so the same
engine scores against the AIDD referential today and a different grid
tomorrow, with zero code change.

```bash
pnpm install && pnpm build
node packages/core/dist/cli/main.js --profile packages/core/examples/dev-sample
```

**Read the [full documentation](docs/README.md)** — every way to run it, the
domain model, how to author a profile or a grid, every built-in criterion —
or jump straight to [Getting started](docs/getting-started.md).

**Try the studio live**: [laivel-up-crocogiciel.vercel.app](https://laivel-up-crocogiciel.vercel.app/)
— grid builder, profile form, and run history, no local setup needed.

## This repo

A pnpm monorepo — one engine, one studio built around it. See
[`ARCHITECTURE.md`](ARCHITECTURE.md) for the map and the boundary rule.

| Package | What |
| --- | --- |
| `packages/core` | the evaluation engine (hexagonal), the criteria, the CLI — the product |
| `packages/viewer` | single-file static viewer for an `evaluation.json` |
| `packages/studio-server` | the studio backend (Fastify), wraps the engine |
| `packages/studio-web` | the studio SPA (React) — grids, profiles, runs, history |
| `packages/studio-db` | the studio's Supabase schema, RLS, migrations |

## License

MIT
