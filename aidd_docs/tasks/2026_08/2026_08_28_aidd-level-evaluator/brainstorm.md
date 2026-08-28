# AI-Driven Development level evaluator

The goal of this repository is to build an **AI-Driven Development level evaluator**: from what is
known about a developer, place them on the AIDD grid (White → Gold) and give them a progression
plan. The LAIVEL UP hackathon is the context and the deadline (submission Monday 31 August, 12:00),
but **the product** is what matters, not the exercise.

A Lead Tech takes a profile folder — Git activity, pull requests, code, static analysis, repo
context, self-report, work session, never all present at once — and the tool returns the level,
what led there, and how to move up one rung.

The project is seen in three stages:

1. **A deterministic evaluation component**, JSON in / JSON out. This is the hackathon submission.
2. **Collectors** (tools / plugins) to build datasets from real people.
3. **Continuous evaluation over time**: data captured as it comes, permanent evaluation, badges and
   gamification (can start as early as stage 2).

We build a solid technical core first; UX and tooling come around it.

Framing constraint: at judging time the tool runs **without an API key**, on the jury's machine,
from the documentation alone. The deterministic path is the deliverable, not an option.

## What is clear

- Submission = public MIT repo + component that runs offline from the docs + one-page method +
  two-minute video. No LLM in the critical path.
- Each grid axis (Size, Harness, Intervention, Parallelism) is broken into **unit criteria**,
  simple, individually evaluable.
- **Per-criterion confidence** = `A · M · S`:
  - `A` — agreement across independent signal families (each signal reduced to the ordinal level
    it implies);
  - `M` — margin to the decision threshold (a value sitting right on a boundary lowers
    confidence);
  - `S` — evidence sufficiency (data volume; width of a Wilson interval for ratios; missing piece
    → `S ≈ 0`, criterion is "unknown", not "false").
  - The limiting factor is surfaced in the output.
- **Axis confidence**: same three-factor model, where the criteria become the signals and the
  per-criterion confidences weight the votes. No literal multiplication of confidences (otherwise
  more criteria = less confidence, which is perverse).
- Overall level = `min()` across the 4 axes. Output = level + trace of the observations that lead
  to it + progression plan = the gap between the binding axis and the next threshold, turned into
  concrete actions drawn from the grid.
- Signals handled as **ordinal**, not z-scores (too few calibration profiles).
- Signal-independence families **defined by hand** for the MVP; moving to a computed `n_eff` is
  deferred to stage 2/3, once there is a population of profiles.
- **Single-signal criteria allowed**: `A` disabled, `conf_criterion = M · S`, "single source" flag
  in the output. Lower confidence ceiling accepted.
- Cross-check `declaratif.md` vs facts: facts win, a contradiction lowers confidence and is shown
  plainly (trap #1 in the subject).
- Incomplete folders handled; the tool states a **minimum bar** below which it refuses to rule.
- **Clean / hexagonal architecture**: the core (grid, axes, criteria, confidence computation)
  depends on no stack and no format; profile readers, the optional LLM, and output formats are
  plug-and-play adapters.
- The hackathon itself is built with clean AIDD practice (context, rules, agents, flow) — this is
  jury criterion #3 ("how you built it").
- LLM enrichment layer: later, optional (local model or provided key), frozen in the output
  artifact when used, never required. It refines the qualitative axes and the wording; it never
  changes the level on its own.

## Still open (carried assumptions, non-blocking)

- List of criteria per axis, their signals, the independence families, the thresholds, the
  per-axis aggregation statistic → **dedicated "rules & thresholds" brainstorm**.
- "Intent over raw size" (a 45-line PR can be L): lever to explore, LLM-free method undecided —
  heuristic (modules touched, title/body keywords, PR body narrative) vs trusting the provided
  `size_distribution`.
- Exact output JSON schema, and whether a human-readable text rendering ships alongside the JSON.
- Stack and language: deferred until the skeleton.

## Next move

List the criteria per axis and their signals, using the 4 known profiles (perceval Red,
bohort Blue, leodagan Green, arthur Copper) as the answer key. Then fix the thresholds. Then stand
up the hexagonal skeleton of the component.
