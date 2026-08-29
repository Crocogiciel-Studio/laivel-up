---
title: Hexagonal boundary
applies_to: "src/**,presets/**"
read_when: reviewing a change under src/ or presets/, or deciding where new code belongs
---

# Hexagonal boundary

The engine is ports & adapters. The core owns the domain model and the evaluation logic and depends
on no format, no framework, and no grid. Everything that speaks JSON, a clock, a file system or a
network is an adapter. These rules describe how the code is already organised — read the reference
files before calling a placement wrong.

## Core imports nothing outward {#core-no-outward-imports}

Nothing under `src/core/**` imports from `src/adapters/`, `src/criteria/`, `src/cli/`, or a runtime
npm package. The direction is enforced mechanically by `.dependency-cruiser.cjs`; a review finding
here is for an import that slips past it (a type re-exported through a shared file, a `import type`
that still couples the core to an adapter's shape). Reference: `src/core/index.ts` is the core's
whole public surface.

## Only the model crosses the boundary {#model-only-boundary}

What enters or leaves the core is a domain-model object — `Profile`, `Grid`, `Evaluation` — never a
raw JSON value, an adapter DTO, a Zod schema type, or a framework object. Rendering an `Evaluation`
to JSON is the outbound adapter's job. Reference: `src/adapters/outbound/json-evaluation.ts`.

## Adapters validate at the edge {#adapters-parse-at-the-edge}

An inbound adapter parses its raw source with Zod and returns a `Result`; malformed input becomes
`err(SourceError)`, never an exception and never a half-built model. The engine only ever receives
a validated model. Reference: `src/adapters/inbound/json-profile.ts`, `src/adapters/inbound/json-grid.ts`.

## Calibration lives in the grid, not the evaluator {#calibration-in-the-grid}

Thresholds, weights, tier-to-rank maps and the choice of statistic are grid configuration:
they live in `presets/*.json` under a bundle entry's `params` and reach a criterion through
`context.params`. An evaluator carries only in-code defaults for those knobs and reads the rest
from the grid — the same evaluator under a different preset must be able to yield a different
verdict. A magic number that decides a level and cannot be overridden from the preset is a finding.
Reference: `src/criteria/pr-feature-size.ts` (`PARAM_DEFAULTS` merged with `context.params`).

## The core names no grid, axis or "AIDD" {#no-domain-vocab-in-core}

Code under `src/core/**` hardcodes no axis id, no level id, and not the word "AIDD". The AIDD grid
is one preset among others; the core reads axes and levels from whatever `Grid` it is handed.
Reference: the header comment in `src/core/model/profile.ts`.
