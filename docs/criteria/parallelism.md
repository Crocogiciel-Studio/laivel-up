# Parallelism

How many streams of work the subject usually runs at once. Source:
`packages/core/src/criteria/parallelism/`.

## `concurrent-streams` — `role: level` · `needs: vcsActivity`

One signal: the **median** number of concurrent branches — a habit, not a
spike. The peak (`maxConcurrentBranches`) never enters the reading, only
tempers confidence when it clears the threshold the median stays under (a
hint the median may understate the routine).

```
median <= 0          → nothing in parallel
median < threshold    → a single stream at a time
median >= threshold   → several streams in flight
```

| `params` | Default | Meaning |
| --- | --- | --- |
| `multiStreamThreshold` | `3` | median at/above this reads "several streams" |
| `rankNone` / `rankSingleStream` / `rankMultiStream` | `0` / `3` / `6` | band → grid level |

## `branch-burstiness` — `role: confidence` · `needs: vcsActivity`

Checks the peak isn't doing all the work the median gets credit for: when
`maxConcurrentBranches` towers over the median (`ratio = max / max(median,
1)` past `burstyRatio`), the parallelism came in a burst, not as a sustained
habit — the reading drops one band and, if it now differs from what
`concurrent-streams` elected, pulls confidence down.

| `params` | Default |
| --- | --- |
| `multiStreamThreshold` | `3` |
| `burstyRatio` | `3` |
| `rankNone` / `rankSingleStream` / `rankMultiStream` | `0` / `3` / `6` |
