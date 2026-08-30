---
objective: "`src/cli/main.ts` supports `--format json`, `--help`/`-h`, and distinguishes exit codes 0/1/2, with `parseArgs` testable in isolation."
status: pending
---

<!-- Fill or omit these sections; never add, rename, or reorder one. -->

# Plan: CLI ergonomics — --format, --help, exit codes

## Overview

| Field      | Value                                                                 |
| ---------- | ---------------------------------------------------------------------- |
| **Goal**   | Finish `src/cli/main.ts` ergonomics for a jury running the tool by hand: `--format json` (only accepted value), `--help`/`-h`, and exit codes 0/1/2 |
| **Source** | GitHub issue #23 — Crocogiciel-Studio/laivel-up (re-scoped: text rendering from #19 is dropped, JSON-only output; no more dependency on `text-evaluation.ts`) |

## Phases

| #   | Phase                                   | File                          |
| --- | ---------------------------------------- | ----------------------------- |
| 1   | `--format`/`--help`/exit codes + tests  | [`phase-1.md`](./phase-1.md) |

## Decisions

<!-- Architecture-magnitude only, one you'd regret reversing. Omit if none qualify. -->

| Decision                                                                 | Why                                                                                                     |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `parseArgs` returns `Result<Options, string>` instead of throwing/exiting directly | Issue requires it testable in isolation; matches the codebase's existing `Result` convention (`src/core/model/result.ts`) used by adapters |
| `--format` keeps only `json` as a valid value today, flag stays in the interface | Issue explicitly abandons text rendering (#19); human output moves to the UI (#41); `--format` is kept only so a future format can be added without breaking the CLI surface |
