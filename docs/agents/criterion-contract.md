---
title: Criterion evaluator contract
applies_to: "src/criteria/**,src/core/ports/criterion-evaluator.ts,src/core/engine/**"
read_when: reviewing a new or changed criterion evaluator, or engine code that runs one
---

# Criterion evaluator contract

A criterion is a pluggable evaluator behind one generic interface. Every evaluator honours the same
contract so the engine can run, skip or fold it without special-casing. Reference implementations:
`src/criteria/harness/tooling-context-depth.ts` (single-source) and `src/criteria/size/pr-feature-size.ts`
(two families). The interface itself: `src/core/ports/criterion-evaluator.ts`.

## evaluate() returns a Result and never throws {#returns-result-never-throws}

`evaluate(context)` returns `Result<CriterionOutput, MissingPiece>`. An expected failure — a
profile section it needs is absent, the grid declares no levels — is `err(missingPiece(...))`.
Nothing in the evaluation path throws for an outcome the engine is meant to handle.

## Missing data is "unknown", never a low reading {#missing-is-unknown-not-false}

When a signal is absent the evaluator returns `err(missingPiece)` or a reading with low
`sufficiency` — it never reports a low level to stand in for "not observed". A missing piece is
evidence we do not have, not evidence against. Reference: `readCriterion` in
`src/core/engine/evaluate.ts` turns a missing section into an `unknown` reading.

## The evaluator declares every section it reads {#declares-needs}

`needs` lists each `ProfileSection` the evaluator touches. The engine checks `needs` against the
profile's `available` set and emits `unknown` when a section is missing, so the evaluator never
runs on `undefined`. A read of `profile.vcsActivity` with `vcsActivity` absent from `needs` is a
finding.

## Deterministic and offline {#deterministic-and-offline}

Same input, same output. No wall-clock read, no network, no API key anywhere the evaluator can be
reached. When time is needed it is injected (`EvaluateOptions.now`), so a run is reproducible.
Reference: `src/core/engine/evaluate.ts`.

## Output carries a three-part confidence and one evidence sentence {#three-part-confidence}

`CriterionOutput.confidence` is `{ agreement, margin, sufficiency, singleSource }` and `evidence`
is one sentence quoting the signal the reading rests on. `singleSource: true` when only one signal
family produced a tier, which tells `foldConfidence` to ignore `agreement`. The fold takes the
weakest of the applicable checks — an evaluator that multiplies them, or omits `evidence`, breaks
the model. Reference: `src/core/engine/confidence.ts`.

## A declared or optimistic signal never raises a level {#declaratif-never-raises}

Self-reported input, or a corroborating family that reads higher than the deciding one, may lower
confidence or cap an axis down — it may never push the level up. Reconciliation between families
is conservative (the lower tier wins). Reference: `applyCaps` / `applyContradictions` in
`src/core/engine/bundle.ts`; the `min(tierA, tierB)` reconciliation in `pr-feature-size.ts`.
