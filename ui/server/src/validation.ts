import type { Result } from 'laivel-up';
import { ok, err } from 'laivel-up';
import { parseGrid, parseProfile } from 'laivel-up/compose';
import type { ArtifactKind } from './db.js';
import type { EngineError } from './engine.js';

/**
 * A grid or profile body must satisfy the same schema the CLI adapters use
 * before it is stored, so anything saved here also runs unchanged in the CLI.
 */
export type ValidateArtifact = (kind: ArtifactKind, body: unknown) => Result<void, EngineError>;

export const validateArtifact: ValidateArtifact = (kind, body) => {
  const parsed = kind === 'grid' ? parseGrid(body) : parseProfile(body);
  if (parsed.ok) {
    return ok(undefined);
  }
  return err({ message: parsed.error.message, issues: parsed.error.issues });
};
