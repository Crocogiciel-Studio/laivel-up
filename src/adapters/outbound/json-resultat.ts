import { writeFileSync } from 'node:fs';
import type { Resultat } from '../../core/model/resultat.js';
import type { Result } from '../../core/model/result.js';
import { ok, err } from '../../core/model/result.js';
import type { ResultatSink, SinkError } from '../../core/ports/io.js';
import { sinkError } from '../../core/ports/io.js';

export function renderResultatJson(resultat: Resultat): string {
  return JSON.stringify(resultat, null, 2);
}

/** Writes the evaluation as pretty JSON to a stream (stdout by default). */
export function jsonStreamSink(
  write: (chunk: string) => void = (chunk) => process.stdout.write(chunk),
): ResultatSink {
  return {
    emit(resultat: Resultat): Result<void, SinkError> {
      write(`${renderResultatJson(resultat)}\n`);
      return ok(undefined);
    },
  };
}

export function jsonFileSink(filePath: string): ResultatSink {
  return {
    emit(resultat: Resultat): Result<void, SinkError> {
      try {
        writeFileSync(filePath, `${renderResultatJson(resultat)}\n`, 'utf8');
      } catch (cause) {
        return err(sinkError(`cannot write evaluation to ${filePath}: ${String(cause)}`));
      }
      return ok(undefined);
    },
  };
}
