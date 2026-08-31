# Size

How large the changes the subject *usually* ships — not the biggest PR ever,
the routine one. Two criteria, source: `packages/core/src/criteria/size/`.

## `pr-feature-size` — `role: level` · `needs: vcsActivity`

Two independent families, reconciled conservatively (the coarser wins —
never the more flattering one):

- **Histogram shape** — the tier of the *median* PR in the xs/s/m/l/xl
  distribution. An `l`-median is lifted to `L-XL` when `xl` is a routine part
  of the mix (share ≥ `xlShare`), not a one-off.
- **Raw magnitude** — median files changed and median lines changed, each
  mapped to a tier by the thresholds below; the coarser of the two wins.

The reading is the **minimum** of the two families.

| `params` | Default | Meaning |
| --- | --- | --- |
| `linesS` / `linesM` / `linesL` | `120` / `400` / `900` | line-count tier boundaries |
| `filesS` / `filesM` / `filesL` | `4` / `12` / `22` | file-count tier boundaries |
| `xlShare` | `0.15` | XL share that lifts an L-median to L-XL |
| `minSamples` | `10` | below this many PRs, confidence's `sufficiency` drops |
| `rankNone` / `rankS` / `rankM` / `rankL` / `rankLxl` | `0`/`1`/`2`/`3`/`4` | tier → grid level |

## `pr-raw-distribution` — `role: confidence` · `needs: vcsActivity`

A cross-check, not a second vote. Where `pr-feature-size` trusts the
pre-aggregated histogram, this one **recounts from the raw PR rows**
(`pull-requests.json`) — an independent source of the same fact. Each PR is
bucketed by `additions + deletions` against the same line thresholds, and the
tier of the median PR is compared to what `pr-feature-size` elected.

Agrees → no effect. Disagrees → pulls the Size axis's confidence down; it
never raises or lowers the level itself.

| `params` | Default |
| --- | --- |
| `linesS` / `linesM` / `linesL` | `120` / `400` / `900` |
| `minSamples` | `10` |
| `rankNone` / `rankS` / `rankM` / `rankL` / `rankLxl` | `0`/`1`/`2`/`3`/`4` |
