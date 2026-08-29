import type { Dossier } from '../model/dossier.js';
import type { Grille } from '../model/grille.js';
import type { Resultat } from '../model/resultat.js';
import type { Result } from '../model/result.js';

/** Where a dossier comes from — a directory of JSON, a DB row, an HTTP body. */
export interface DossierSource {
  load(): Result<Dossier, SourceError>;
}

/** Where a grille preset comes from. */
export interface GrilleSource {
  load(): Result<Grille, SourceError>;
}

/** Where the evaluation goes — stdout JSON, a file, a queue, a render. */
export interface ResultatSink {
  emit(resultat: Resultat): Result<void, SinkError>;
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
