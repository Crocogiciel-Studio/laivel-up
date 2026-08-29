# laivel-up

A parameterizable engine that places a developer on a leveling grid from
evidence about how they work, and says **why** — with a confidence trace and a
progression plan.

The grid is not baked in. It is a **preset**: a config file that declares the
levels, the axes, which criteria feed each axis and how heavily, and where the
thresholds sit. The engine core hardcodes no axis and no level. The AIDD
referential ships as one preset (`presets/aidd.json`); a game progression system
or an internal review rubric would be another.

> Status: **walking skeleton**. The hexagon, the JSON adapters, the confidence
> and aggregation engine, and one wired criterion run end to end. Real criteria
> per axis (Taille, Intervention, En parallèle, Harness) land next.

## Run it

Requires Node 22+ and [pnpm](https://pnpm.io).

```bash
pnpm install
pnpm build
node dist/cli/main.js --dossier examples/dev-sample
```

That reads the sample profile directory, evaluates it against
`presets/aidd.json`, and prints the evaluation as JSON.

Flags:

| Flag | Meaning | Default |
| --- | --- | --- |
| `--dossier <dir>` | profile directory (the `profiles/<name>/` layout) | — (required) |
| `--grille <file>` | grid preset JSON | `presets/aidd.json` |
| `--min-axes <n>` | axes that must be ruled on before a global level is emitted | `1` |

No network, no API key. Every evaluator is deterministic and returns `unknown`
rather than guessing when the evidence it needs is absent.

## How a verdict is built

1. **Inbound adapter** parses a profile directory into a `Dossier` — a portable
   vocabulary of developer-activity facts. A missing file is `unknown`, never a
   negative reading.
2. For each axis in the grille, its **faisceau** of criteria runs. Each criterion
   is a pluggable evaluator that emits an ordinal level, a raw value, an evidence
   sentence, and a three-part confidence (`agreement` across signal families /
   `margin` to the threshold / evidence `sufficiency`).
3. **Confidence** is the weakest of those three, and the report names which one is
   limiting.
4. **Axis verdict** = a confidence-weighted vote across the faisceau. `cap`
   criteria can only pull an axis down; `confidence` criteria bite only when they
   contradict the vote.
5. **Global level** = the lowest axis level — a level holds only if every axis
   reaches it. The binding axis is the one holding the subject back.
6. **Progression plan** points at the one move that raises the global level.

## Layout

```
src/
  core/            no stack, no format, no framework — only the model crosses out
    model/         dossier · grille · resultat · Result<T,E>
    ports/         criterion-evaluator · evaluator-catalogue · dossier/grille/resultat IO
    engine/        confidence · faisceau · aggregate · progression · evaluate
  adapters/
    inbound/       JSON directory  -> Dossier   (Zod parse + reject)
    inbound/       JSON file       -> Grille
    outbound/      Resultat        -> JSON
    catalogue/     in-memory evaluator catalogue
  criteria/        the coded criteria a grille picks from
  cli/             the README entry point
presets/aidd.json  the AIDD referential as a preset
```

`dependency-cruiser` enforces the direction: nothing under `src/core` imports an
adapter, a criterion, the CLI, or a third-party package.

## Develop

```bash
pnpm typecheck   # tsc --noEmit, strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes
pnpm lint        # eslint, typescript-eslint strict-type-checked
pnpm test        # vitest — unit + the four sample profiles as a regression guardrail
pnpm depcruise   # boundary check
pnpm build       # emit dist/
```

## License

MIT
