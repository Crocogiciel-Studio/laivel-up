# Intervention

How much manual correction the work needed to land — fewer interventions
place higher. Four independent signal families can each place the level
(the grid decides which to include, and their weights); `revert-rate` caps.
Source: `packages/core/src/criteria/intervention/`.

All four `level` criteria share one band scale — 0 "intervenes on most", 1
"on some", 2 "at key stages only" — and the same convention: **a band's rank
is the top of its grid cell**. Band 3 ("never, once framed") is out of scope
everywhere here: no public sample profile reaches it, so nothing calibrates
it yet.

## `pr-correction-load` — `role: level` · `needs: vcsActivity`

Two families: **A** — median correction commits pushed after a PR opens,
decides the band whenever present. **B** — share of PRs merged with zero
human edit, corroborates when A is present, decides alone (at reduced
`sufficiency`) when A is absent.

| `params` | Default | Meaning |
| --- | --- | --- |
| `correctionsAfterMost` | `3` | median corrections at/above this → band 0 |
| `correctionsAfterSome` | `1.5` | at/above this → band 1 |
| `ratioAfterSome` / `ratioKeyStages` | `0.15` / `0.4` | family B's own thresholds |
| `minSamples` | `10` | below this many PRs, confidence drops |
| `rankAfterMost` / `rankAfterSome` / `rankKeyStages` | `1` / `2` / `4` | band → grid level |

## `session-intervention` — `role: level` · `needs: workSession`

Only present when a `session.md` transcript exists — then it is the axis's
**strongest** signal, an eyewitness account rather than a PR-metadata proxy.
One family: the count of explicit mid-task course-corrections, read by
shallow text heuristics — `sufficiency` is held at `0.7` to reflect that.

| `params` | Default |
| --- | --- |
| `interventionsSome` / `interventionsMost` | `1` / `3` |
| `rankAfterMost` / `rankAfterSome` / `rankKeyStages` | `1` / `2` / `4` |

## `review-comment-load` — `role: level` · `needs: vcsActivity`

One family: median review comments per PR. More back-and-forth in review
reads as more after-the-fact intervention.

| `params` | Default |
| --- | --- |
| `commentsAfterMost` / `commentsAfterSome` | `6` / `3` |
| `rankAfterMost` / `rankAfterSome` / `rankKeyStages` | `1` / `2` / `4` |

## `ci-iteration-load` — `role: level` · `needs: vcsActivity`

Two signals from the *same* family (CI health, so `agreement` is disabled by
design) — runs-to-green and CI failure rate. Either kind of churn reads as
the human stepping back in; the **worse** band of the two wins.

| `params` | Default |
| --- | --- |
| `runsAfterMost` / `runsAfterSome` | `3` / `2` |
| `failAfterMost` / `failAfterSome` | `0.25` / `0.08` |
| `rankAfterMost` / `rankAfterSome` / `rankKeyStages` | `1` / `2` / `4` |

## `revert-rate` — `role: cap` · `needs: vcsActivity`

A high revert rate is autonomy that failed — work that shipped and had to be
pulled back. Caps the axis regardless of how the other four read.

| `params` | Default |
| --- | --- |
| `revertHigh` / `revertMid` | `0.15` / `0.08` |
| `rankCapHigh` / `rankCapMid` | `2` / `3` |
