# Authoring a grid

A grid is a JSON preset: levels, axes, which criteria feed each axis and how
heavily, every threshold. The engine hardcodes none of it. The AIDD
reference grid ([`packages/core/presets/aidd.json`](../packages/core/presets/aidd.json))
is one preset among others.

Build one by hand, or in the studio's drag-and-drop builder (`/grids`) — same
shape either way; the studio backend rejects a save that doesn't satisfy this
exact schema, whichever produced it.

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
| `role` | `level` \| `confidence` \| `cap` — what each does to the vote is in [Concepts](concepts.md#how-a-verdict-is-built); only `level` uses `weight` |
| `params` | calibration overrides for that criterion, merged over its in-code defaults |

## Calibration (`params`)

Every threshold and band boundary a criterion needs is a `params` key —
never hardcoded. Each criterion ships an in-code default for every key
(`GET /api/catalogue` returns them, so the builder pre-fills a card); a
grid's `params` only overrides what it wants to change.

Two conventions to know before tuning one:

- **A rank param names the grid cell it resolves to**, not a raw number —
  `rankM` means "whatever rank this grid calls its M-tier", so one
  criterion works unmodified across grids with different level counts.
- **A band's rank is the top of the cell it lands in.** A criterion reading
  a coarse band (e.g. Intervention's "after most / some / key stages") maps
  its highest calibrated band to the top level its evidence supports — see
  each page in the [criteria reference](criteria/README.md) for which bands
  are in scope.

## Validation

`parseGrid()` — the same function the CLI and the studio backend both call
— rejects a preset whose level ranks or ids collide, whose axis ids
collide, or whose `evidenceFloor` sits outside `0`–`1`, with the exact issue
named, never a silent coercion. The builder runs its own checks
client-side (same rules, faster feedback) and its output is proven, in
tests, to still satisfy this schema.
