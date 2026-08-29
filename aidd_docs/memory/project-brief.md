# Project Brief

## What it is

- A generic **developer-evaluation engine**: it takes a developer *dossier* and a *grid* definition, and returns a level per axis, a global level, a confidence, an observation trace, and a progression plan.
- The **AIDD level evaluator** (placing a developer on the White→Gold AIDD grid) is the first grid preset, not the product.
- Started during the LAIVEL UP hackathon (submission 2026-08-31); the deadline is context, the reusable engine is the goal.

## Why it exists

- A Lead Tech needs to place a developer on a competency grid from partial evidence — Git activity, pull requests, code, static analysis, repo context, self-report, work session, never all present — and get a defensible verdict plus a concrete way to move up.
- The engine is meant to be reused beyond AIDD (game progression systems, admin-run evaluations, ...), so being parameterizable at every level is a hard requirement, not a nice-to-have.

## Domain language

| Term | Meaning |
| ---- | ------- |
| Dossier | The input about one developer: a set of pieces (`git-activity`, `pull-requests`, `code`, `sonar-measures`, `repo-context`, `declaratif`, `session`), rarely complete |
| Grid (preset) | A config file: axes, ordered levels, which criteria feed which axis, thresholds, weights, aggregation method |
| Axis | One dimension of a grid (AIDD: Taille, Harness, Intervention, Parallèle) |
| Level | An ordered rung, per axis and global (AIDD: White < Red < Blue < Green < Copper < Silver < Gold) |
| Criterion | A small closed question on one axis, answered by an evaluator |
| Evaluator | A plugin reading part of the dossier; emits an axis-tagged ordinal reading + raw value + confidence + evidence sentence |
| Faisceau | The bundle of criteria feeding one axis; the axis verdict is a confidence-weighted vote across them |
| Confidence | Per criterion, the weakest of three checks: agreement across independent signal families, margin to threshold, evidence sufficiency (missing piece → "unknown", not "false") |
| Declaratif | Self-reported and unverified: facts win, a contradiction lowers confidence and can cap an axis, never raise it |

## Key features

- Deterministic, no LLM in the critical path — must run on a jury machine with no API key.
- Grid loaded as a swappable preset; the AIDD grid is one preset among others.
- Global level = `min()` across axes.
- Output = global level + per-axis level + limiting confidence factor + observation trace + progression plan (gap from the binding axis to its next threshold, turned into concrete actions).
- The four sample profiles (`perceval` Red, `bohort` Blue, `leodagan` Green, `arthur` Copper) are regression tests, not training data.
