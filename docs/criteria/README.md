# Criteria reference

Every criterion the engine ships with. A grid's [bundle](../authoring-a-grid.md#a-bundle-entry)
picks from these by id and assigns each a `role`; a criterion's own code never
decides that — see [Concepts](../concepts.md) for what `level` / `confidence`
/ `cap` mean.

Each is a small, closed question: it reads one signal family (sometimes two,
reconciled conservatively), and returns a level, a confidence, or `unknown`.
The page for each names its `needs` — the profile section it reads — and its
default `params`; every one of those is overridable per grid.

## By axis (AIDD grid)

| Axis | What it measures |
| --- | --- |
| [Size](size.md) | How large the changes the subject typically ships are |
| [Harness](harness.md) | How deeply they've invested in and kept up an AI-assisted working environment |
| [Intervention](intervention.md) | How much manual correction the work needed to land |
| [Parallelism](parallelism.md) | How many streams of work they usually run at once |

## Cross-cutting

### `declaratif-contradiction`

Wired on **every** axis, always with `role: confidence`, never `level` — a
grid never lets a self-report decide a level. It carries the subject's own
self-assessment (a grid level id, or a grid-neutral band —
`beginner`/`intermediate`/`advanced` — read off free text) into the bundle so
the engine can *show* when self-image and measured level part ways.

`needs`: `declared`.

When it disagrees with the level the axis elected, it pulls that axis's
confidence down — never up, and never enough to move the level itself. The
bite fades with the rank gap:

```
strength = max(0, 1 − contradictionSlope × |rankDeclared − rankElected|)
```

| `params` | Default | Meaning |
| --- | --- | --- |
| `contradictionSlope` | `0.35` | how fast the bite fades with distance |
| `rankSelfBeginner` / `rankSelfIntermediate` / `rankSelfAdvanced` | `1` / `2` / `3` | which grid level a free-text band resolves to |

No self-assessment in the profile, or a band the grid does not calibrate →
the criterion abstains (`unknown`) rather than falling back to a default —
see [Concepts](../concepts.md#two-rules-that-shape-every-criterion).

## Reading a criterion's own source

Every criterion's file opens with a doc comment describing its exact
signal(s), thresholds, and reasoning — the pages here summarize it, the
source is the ground truth if the two ever seem to disagree (they shouldn't).
Look under `packages/core/src/criteria/`.
