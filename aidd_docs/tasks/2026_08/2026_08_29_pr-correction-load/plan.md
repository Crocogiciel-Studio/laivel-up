---
objective: "The Intervention axis reads a level from a wired `pr-correction-load` criterion, calibrated against the four sample profiles."
status: in-progress
---

<!-- Fill or omit these sections; never add, rename, or reorder one. -->

# Plan: Axe Intervention — critère pr-correction-load

## Overview

| Field      | Value                                                                                   |
| ---------- | ---------------------------------------------------------------------------------------- |
| **Goal**   | Wire the Intervention axis with a first criterion, `pr-correction-load`, on the model of `pr-feature-size` |
| **Source** | GitHub issue #9 — Crocogiciel-Studio/laivel-up                                          |

## Phases

| #   | Phase                              | File                          |
| --- | ----------------------------------- | ----------------------------- |
| 1   | pr-correction-load criterion + wiring | [`phase-1.md`](./phase-1.md) |

## Decisions

<!-- Architecture-magnitude only, one you'd regret reversing. Omit if none qualify. -->

| Decision                                                                 | Why                                                                                                     |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Final band = family A (`medianCorrectionCommitsAfterOpen`) only; family B (`mergedWithoutHumanEditRatio`) feeds `agreement` only, never raises the band | Declarative/optimistic-signal principle already used elsewhere in the grid: a corroborating signal can lower confidence, never lift a level |
| Band 3 (Silver/Gold) out of scope for this criterion                     | No public sample profile reaches it; calibrating without evidence would be guessing                     |
| `intervention` is not added to `EXACT_AXES` in the regression guardrail | Only `leodagan`'s constraining axis is Parallelism, not Intervention — its Intervention reading legitimately over-reads Green; the generic `>=` guardrail already covers it |
