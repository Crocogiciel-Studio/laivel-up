---
objective: "docs/evaluation.schema.json exists, validates a real evaluate() output field-for-field against the adapter's actual JSON.stringify() shape, and the test fails if Evaluation gains a field the schema doesn't declare."
status: implemented
---

<!-- Fill or omit these sections; never add, rename, or reorder one. -->

# Plan: Evaluation JSON output schema + conformance test

## Overview

| Field      | Value                   |
| ---------- | ----------------------- |
| **Goal**   | Document the JSON shape emitted by `src/adapters/outbound/json-evaluation.ts` as a versioned draft-07 JSON Schema, lock it with a conformance test, and point to it from the README |
| **Source** | GitHub issue #21 (Crocogiciel-Studio/laivel-up) |

## Phases

| #   | Phase        | File                         |
| --- | ------------ | ---------------------------- |
| 1   | Schema + conformance test | [`phase-1.md`](./phase-1.md) |

## Resources

<!-- External sources only (URLs, docs), not code files. Omit if none consulted. -->

None consulted beyond in-repo code.

## Decisions

<!-- Architecture-magnitude only, one you'd regret reversing. Omit if none qualify. -->

| Decision   | Why   |
| ---------- | ----- |
| `| undefined` model fields become **optional properties** in the schema (absent from `required`), not nullable (`type: [..., "null"]`) | `renderEvaluationJson` calls `JSON.stringify(evaluation, null, 2)` directly with no transform. `JSON.stringify` drops object properties whose value is `undefined` — it never serializes them as `null`. Confirmed with `node -e 'JSON.stringify({a: undefined, b: 1})'` → `{"b":1}`. Modeling them as nullable would make the schema accept a shape the adapter never emits, and reject the shape it does. The issue's own override clause governs: "si l'adapter et le schéma divergent, corriger le schéma pour matcher l'adapter tel qu'il est." |
| No `ajv` import | `ajv` is only a transitive dev dependency (via eslint tooling), not declared in `package.json`; importing it directly is fragile under pnpm's strict `node_modules` layout and would read as a de facto new dependency. Written a small structural validator instead (issue explicitly allows this fallback and forbids new runtime deps). |
