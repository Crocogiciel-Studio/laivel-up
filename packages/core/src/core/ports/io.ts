import type { Profile } from '../model/profile.js';
import type { Grid } from '../model/grid.js';
import type { Evaluation } from '../model/evaluation.js';
import type { Result } from '../model/result.js';

/** Where a profile comes from — a directory of JSON, a DB row, an HTTP body. */
export interface ProfileSource {
  load(): Result<Profile, SourceError>;
}

/** Where a grid preset comes from. */
export interface GridSource {
  load(): Result<Grid, SourceError>;
}

/** Where the evaluation goes — stdout JSON, a file, a queue, a render. */
export interface EvaluationSink {
  emit(evaluation: Evaluation): Result<void, SinkError>;
}

export interface SourceError {
  readonly kind: 'source-error';
  readonly message: string;
  readonly issues: readonly string[];
}

export interface SinkError {
  readonly kind: 'sink-error';
  readonly message: string;
}

export function sourceError(message: string, issues: readonly string[] = []): SourceError {
  return { kind: 'source-error', message, issues };
}

export function sinkError(message: string): SinkError {
  return { kind: 'sink-error', message };
}
