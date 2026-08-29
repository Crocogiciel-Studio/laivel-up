---
objective: "A second Harness criterion, role confidence, corroborates or contradicts tooling-context-depth's tier from artifact density, without ever changing the elected level."
status: pending
---

# Plan: Harness axe — critère behavior-artifact-density (rôle confidence)

## Overview

| Field      | Value                                                                 |
| ---------- | ---------------------------------------------------------------------- |
| **Goal**   | Add `behavior-artifact-density`, a `confidence`-role criterion on the `harness` axis, that reads an independent artifact-density signal and only pulls axis confidence down when it disagrees with the elected level. |
| **Source** | GitHub issue #20 — Crocogiciel-Studio/laivel-up                        |

## Phases

| #   | Phase                              | File                          |
| --- | ----------------------------------- | ------------------------------ |
| 1   | Criterion, wiring, calibration      | [`phase-1.md`](./phase-1.md)  |

## Resources

None consulted beyond the in-repo model files (`src/criteria/pr-feature-size.ts`, `src/core/engine/bundle.ts`).

## Decisions

| Decision | Why |
| --- | --- |
| The reading reuses `tc.projectMemoryPresent` / `tc.declaredAssistantTools` for the tiers below `densityStrong`, instead of a density-only cutoff between "nothing" and "prompts". | `applyContradictions` compares the reading's `levelId` to the axis's already-elected `levelId` by strict equality (`src/core/engine/bundle.ts`). A density-only tier boundary cannot reproduce the issue's own calibration table (perceval elects `red` at density 0, bohort elects `blue` at density 0 — two different elected levels for the same density). Mirroring `tooling-context-depth`'s own memory/prompts/nothing gate keeps the two criteria in lockstep below the behavior threshold, so the only realistic disagreement is exactly the one the issue describes: thin density (`< densityStrong`) while the axis already elected `behavior`+ off `tooling-context-depth`'s own (skills-excluded, presence-only) gate. |
