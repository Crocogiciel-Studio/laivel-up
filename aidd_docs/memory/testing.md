# Testing

## Strategy

- **TDD** — a failing test comes before the code, on the core and on every criterion evaluator.
- Unit tests on the domain (bundles, confidence, `min()` aggregation) and on each evaluator in isolation.
- **Regression** — the four sample profiles (`perceval` Red, `bohort` Blue, `leodagan` Green, `arthur` Copper): the engine's global verdict must not contradict their assigned level. They are a guardrail, not a tuning target — thresholds are authored from the AIDD reference grid, then checked here.

## Tools

- **Vitest** — runner and assertions.

## Conventions

- Tests sit beside the code as `*.test.ts`.
- Every evaluator: one test for a clear reading, one for the "unknown" path (missing piece).
- No network in tests; external-tool evaluators run against captured fixtures.

## Run

- `pnpm test` — everything
- `pnpm test <path>` — one file
