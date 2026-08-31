# Authoring a grid

A grid is a JSON preset. It declares the levels, the axes, which criteria
feed each axis and how heavily, and every threshold — the engine hardcodes
none of it. The AIDD reference grid
([`packages/core/presets/aidd.json`](../packages/core/presets/aidd.json)) is
one preset; a game progression system or an internal review rubric would be
another, with zero code change.

Build one by hand, or in the studio's drag-and-drop builder (`/grids`) — same
shape either way; the builder validates through this exact schema before
saving.

## Shape

```json
{
  "id": "aidd",
  "label": "AIDD reference grid",
  "evidenceFloor": 0.25,
  "levels": [
    { "id": "white", "label": "❖ White", "rank": 0 },
    { "id": "red", "label": "🔺 Red", "rank": 1 }
  ],
  "axes": [
    {
      "id": "size",
      "label": "Size",
      "bundle": [
        { "criterionId": "pr-feature-size", "weight": 1, "role": "level", "params": { "rankM": 2 } },
        { "criterionId": "declaratif-contradiction", "weight": 1, "role": "confidence", "params": {} }
      ]
    }
  ],
  "axisAggregation": "confidence-weighted-vote",
  "globalAggregation": "min-across-axes"
}
```

| Field | Meaning |
| --- | --- |
| `id` | the grid's own id — an evaluation records which grid scored it |
| `levels[]` | ordered rungs, low to high. `rank` is the sort key (unique, any integers); `id` is what a criterion emits; `label` is display-only |
| `axes[]` | one dimension each. `id` is stable, `label` is display-only |
| `axes[].bundle[]` | the criteria feeding this axis — see below |
| `evidenceFloor` | optional, `0`–`1`. Global confidence below this floor withholds a level entirely, rather than reporting a low-confidence one |
| `axisAggregation`, `globalAggregation` | fixed today — the only implemented strategies. Present so a future grid can request a different one without a schema break |

## A bundle entry

```json
{ "criterionId": "pr-feature-size", "weight": 1, "role": "level", "params": { "rankM": 2, "linesM": 400 } }
```

| Field | Meaning |
| --- | --- |
| `criterionId` | one of the [built-in criteria](criteria/README.md) |
| `weight` | its vote weight, `role: "level"` only — see below |
| `role` | `level` \| `confidence` \| `cap` — see [Concepts](concepts.md#how-a-verdict-is-built) |
| `params` | calibration overrides for that criterion, merged over its in-code defaults |

**`role` decides how a reading counts, not just how it is labelled:**

- **`level`** — joins the confidence-weighted vote for the axis's winning
  level. `weight` matters here: a `weight: 2` reading counts twice as much
  mass as a `weight: 1` one.
- **`confidence`** — never joins the vote. It only pulls the axis's
  confidence *down* when it disagrees with whatever the `level` criteria
  elected. `weight` is accepted but has no effect on a `confidence` entry.
- **`cap`** — never joins the vote either. It can only pull the elected
  level *down*, never raise or leave it — think of it as a ceiling, not a
  vote.

## Calibration (`params`)

Every threshold, band boundary, and rank mapping a criterion needs is a
`params` key — never hardcoded in the evaluator. Each criterion ships an
in-code default for every key it reads (`GET /api/catalogue` returns them, so
the studio builder can pre-fill a card), and a grid's `params` only need to
override the ones it wants to change.

Two conventions worth knowing before tuning one:

- **Rank params name the *grid cell* they resolve to**, not a raw number —
  e.g. `rankM` is "whatever rank the grid calls its M-tier cell", so the same
  criterion works unmodified across grids with different level counts.
- **A band's rank is the *top* of the cell it lands in.** A criterion that
  only ever reads a coarse band (e.g. Intervention's "after most / after
  some / at key stages") maps its highest calibrated band to the top level
  its evidence can support — see each criterion's page in the
  [criteria reference](criteria/README.md) for which bands are in scope.

## Validation

`parseGrid()` (the same function the CLI, the studio backend, and the grid
builder all call) rejects a preset whose level ranks or ids collide, whose
axis ids collide, or whose `evidenceFloor` sits outside `0`–`1` — with the
exact issue named, never a silent coercion.
