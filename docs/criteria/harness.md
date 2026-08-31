# Harness

How deeply the subject has invested in — and kept up — an AI-assisted
working environment. One criterion places the level; the rest either
corroborate (pull confidence down on disagreement) or cap (pull the level
down, never up, never sideways). Source: `packages/core/src/criteria/harness/`.

## `tooling-context-depth` — `role: level` · `needs: toolingContext`

The walking-skeleton criterion: one signal family, an ordinal tier —

```
nothing → prompts only → project memory → + behavior artifacts → + auto-retry loop
```

| `params` | Default | Tier |
| --- | --- | --- |
| `rankNothing` | `0` | no assistant tooling declared |
| `rankPrompts` | `1` | assistant used, no project memory |
| `rankMemory` | `2` | a project-memory file exists |
| `rankBehavior` | `4` | + rules/agents/hooks present |
| `rankLoop` | `6` | + an auto-retry loop |

## Confidence criteria (corroborate, never move the level)

Each reads an *independent* signal and only pulls Harness confidence down
when it disagrees with what `tooling-context-depth` elected.

**`behavior-artifact-density`** — re-derives the top of the ladder from the
raw *density* of behavior artifacts (`rulesCount + agentsCount + hooksCount +
skillsCount`), independent of the presence check above.

| `params` | Default |
| --- | --- |
| `densityStrong` | `4` |
| `rankNothing` / `rankPrompts` / `rankMemory` / `rankBehavior` | `0`/`1`/`2`/`4` |

**`memory-maintenance`** — checks the memory is *kept*, not just written
once: present with a recorded last-update date corroborates; present with no
update history reads one tier below.

| `params` | Default |
| --- | --- |
| `rankNone` / `rankPrompts` / `rankMemory` | `0` / `1` / `2` |

**`test-enforcement`** — `prsWithTestsRatio` and `coverageDelta` together: a
high ratio with non-negative coverage delta corroborates a high harness; a
low ratio or a coverage drop contradicts it.

| `params` | Default |
| --- | --- |
| `testsHigh` / `testsLow` | `0.7` / `0.4` |
| `coverageDrop` | `-0.02` |
| `rankPrompts` / `rankMemory` / `rankBehavior` | `1` / `2` / `4` |

**`assistant-integration`** — four independent +1 signals (editor
integration, ≥2 declared tools, weekly tokens, weekly sessions); score ≥ 3
corroborates, score 0 contradicts.

| `params` | Default |
| --- | --- |
| `tokensHigh` | `1,000,000` |
| `sessionsHigh` | `20` |
| `rankPrompts` / `rankMemory` / `rankBehavior` | `1` / `2` / `4` |

## Cap criteria (only ever pull the level down)

**`loop-convergence`** — `tooling-context-depth` credits the top tier the
moment a retry loop is *claimed*; this checks it actually converges (CI
doesn't take forever to go green). No loop claimed → no cap, not assessed.

| `params` | Default |
| --- | --- |
| `runsHigh` | `4` |
| `failHigh` | `0.3` |
| `rankCapNonConverging` | `4` |

**`commit-discipline`** — the AI-co-authored commit ratio. A harness barely
touching the actual commits caps the axis regardless of scaffolding.

| `params` | Default |
| --- | --- |
| `aiFloorHard` / `aiFloorSoft` | `0.15` / `0.35` |
| `rankCapHard` / `rankCapSoft` | `1` / `2` |

**`code-quality-floor`** — duplication, code-smell density, or cognitive
complexity beyond threshold caps the axis. "Quality is a prerequisite" — a
shiny harness with a dirty result is not at level.

| `params` | Default |
| --- | --- |
| `dupHigh` | `12` (duplicated lines %) |
| `smellsHigh` | `10` (per kLoC) |
| `complexityHigh` | `0.05` (cognitive complexity / LoC) |
| `rankCapPoor` | `2` |

**`bugs-floor`** — Sonar bug count, normalized to size. The sibling of
`code-quality-floor`.

| `params` | Default |
| --- | --- |
| `bugsHigh` / `bugsMid` | `2` / `0.5` (per kLoC) |
| `rankCapBuggy` / `rankCapMid` | `2` / `3` |
