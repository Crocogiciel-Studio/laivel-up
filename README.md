# laivel-up

A parameterizable engine that places a developer on a leveling grid from
evidence about how they work, and says **why** — with a confidence trace and a
progression plan.

The grid is not baked in. It is a **preset**: a config file that declares the
levels, the axes, which criteria feed each axis and how heavily, and where the
thresholds sit. The engine core hardcodes no axis and no level. The AIDD
reference grid ships as one preset (`presets/aidd.json`); a game progression
system or an internal review rubric would be another.

> Status: hexagonal engine operational — four axes wired (Size, Harness,
> Intervention, Parallelism), each with its own bundle of criteria, JSON
> output conforming to the schema, and a bilingual viewer.

## Run it

Requires Node 22+ and [pnpm](https://pnpm.io).

```bash
pnpm install
pnpm build
node dist/cli/main.js --profile examples/dev-sample
```

That reads the sample profile directory, evaluates it against
`presets/aidd.json`, and prints the evaluation as JSON. The emitted JSON's
shape is documented in [`docs/evaluation.schema.json`](docs/evaluation.schema.json).

To run straight from the TypeScript source without a build (local dev):

```bash
pnpm dev --profile examples/dev-sample
```

Flags:

| Flag | Meaning | Default |
| --- | --- | --- |
| `--profile <dir>`, `-p` | profile directory (the `profiles/<name>/` layout) | — (required) |
| `--grid <file>`, `-g` | grid preset JSON | `presets/aidd.json` |
| `--min-axes <n>` | axes that must be ruled on before a global level is emitted | `1` |
| `--format <json>` | output format; `json` is the only accepted value today | `json` |
| `--help`, `-h` | print usage and exit | — |

No network, no API key. Every evaluator is deterministic and returns `unknown`
rather than guessing when the evidence it needs is absent.

## See it rendered

```bash
pnpm viz                         # evaluates test/fixtures/profiles/* and opens the viewer
pnpm viz -p <dir> -g <preset>    # one profile
```

Serves the HTML locally — no application server required (Vite in dev); the
`ui/` bundle is also a single static file openable from `file://`. See
[`ui/README.md`](ui/README.md) for detail (Docker, `?src=`).

## What it measures

Four axes, each fed by its own bundle of criteria plus a cross-cutting
self-report check (`declaratif-contradiction`) that only lowers confidence when
it disagrees with the vote, never moving a level:

- **Size** — how large the changes the subject typically ships are: PR
  feature-size distribution (files, lines, tier histogram), corroborated by
  the raw PR sizes.
- **Harness** — how deeply the subject has invested in and kept up an
  AI-assisted working environment: tooling context depth, behavior-artifact
  density, loop convergence, commit discipline, code-quality and bugs floors,
  memory maintenance, test enforcement, assistant integration.
- **Intervention** — how much manual correction the work needed to land:
  session transcripts when present, PR correction load, review-comment load,
  CI-iteration load, revert rate. Fewer interventions place higher.
- **Parallelism** — how many streams of work the subject usually runs at
  once: concurrent streams and branch burstiness.

An axis with no supporting evidence stays `unknown` rather than guessing, the
global level is the `min()` across axes that could be ruled on, and per
criterion the confidence is the weakest of agreement / margin / sufficiency —
the report names whichever one is limiting.

## How a verdict is built

1. **Inbound adapter** parses a profile directory into a `Profile` — a portable
   vocabulary of developer-activity facts. A missing file is `unknown`, never a
   negative reading.
2. For each axis in the grid, its **bundle** of criteria runs. Each criterion is
   a pluggable evaluator that emits an ordinal level, a raw value, an evidence
   sentence, and a three-part confidence (`agreement` across signal families /
   `margin` to the threshold / evidence `sufficiency`).
3. **Confidence** is the weakest of those three, and the report names which one is
   limiting.
4. **Axis verdict** = a confidence-weighted vote across the bundle. `cap`
   criteria can only pull an axis down; `confidence` criteria bite only when they
   contradict the vote.
5. **Global level** = the lowest axis level — a level holds only if every axis
   reaches it. The binding axis is the one holding the subject back.
6. **Progression plan** points at the one move that raises the global level.

`GlobalVerdict.note` and `ProgressionPlan.actions` are i18n descriptors —
`{ key, params }` resolved by the consumer against `i18n/{en,fr}.json`;
`evidence` sentences are still English-only.

## Layout

```
src/
  core/            no stack, no format, no framework — only the model crosses out
    model/         profile · grid · evaluation · Result<T,E>
    ports/         criterion-evaluator · evaluator-catalogue · profile/grid/evaluation IO
    engine/        confidence · bundle · aggregate · progression · evaluate
  adapters/
    inbound/       JSON directory  -> Profile   (Zod parse + reject)
    inbound/       JSON file       -> Grid
    outbound/      Evaluation      -> JSON
    catalogue/     in-memory evaluator catalogue
  criteria/        the coded criteria a grid picks from
  cli/             the README entry point
presets/aidd.json  the AIDD reference grid as a preset
```

`dependency-cruiser` enforces the direction: nothing under `src/core` imports an
adapter, a criterion, the CLI, or a third-party package.

## Develop

```bash
pnpm dev         # run the CLI from source (tsx), e.g. pnpm dev --profile examples/dev-sample
pnpm typecheck   # tsc --noEmit, strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes
pnpm lint        # eslint, typescript-eslint strict-type-checked
pnpm test        # vitest — unit + the four sample profiles as a regression guardrail
pnpm depcruise   # boundary check
pnpm build       # emit dist/
```

## License

MIT
