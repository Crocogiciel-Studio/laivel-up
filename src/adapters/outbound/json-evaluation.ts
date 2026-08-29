import { writeFileSync } from 'node:fs';
import type { Evaluation } from '../../core/model/evaluation.js';
import type { Result } from '../../core/model/result.js';
import { ok, err } from '../../core/model/result.js';
import type { EvaluationSink, SinkError } from '../../core/ports/io.js';
import { sinkError } from '../../core/ports/io.js';

export function renderEvaluationJson(evaluation: Evaluation): string {
  return JSON.stringify(evaluation, null, 2);
}

/** Writes the evaluation as pretty JSON to a stream (stdout by default). */
export function jsonStreamSink(
  write: (chunk: string) => void = (chunk) => process.stdout.write(chunk),
): EvaluationSink {
  return {
    emit(evaluation: Evaluation): Result<void, SinkError> {
      write(`${renderEvaluationJson(evaluation)}\n`);
      return ok(undefined);
    },
  };
}

export function jsonFileSink(filePath: string): EvaluationSink {
  return {
    emit(evaluation: Evaluation): Result<void, SinkError> {
      try {
        writeFileSync(filePath, `${renderEvaluationJson(evaluation)}\n`, 'utf8');
      } catch (cause) {
        return err(sinkError(`cannot write evaluation to ${filePath}: ${String(cause)}`));
      }
      return ok(undefined);
    },
  };
}
