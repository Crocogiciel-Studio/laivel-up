import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readDossierFromDirectory } from './json-dossier.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXAMPLE = resolve(HERE, '../../../examples/dev-sample');

describe('readDossierFromDirectory', () => {
  it('parses the shipped example profile directory', () => {
    const result = readDossierFromDirectory(EXAMPLE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const dossier = result.value;
    expect(dossier.subject.id).toBe('dev-sample');
    expect(dossier.available).toContain('declared');
    expect(dossier.available).toContain('vcsActivity');
    expect(dossier.available).toContain('toolingContext');
    expect(dossier.toolingContext?.projectMemoryPresent).toBe(true);
    expect(dossier.toolingContext?.rulesCount).toBe(2);
    expect(dossier.vcsActivity?.commits?.aiCoauthoredRatio).toBeCloseTo(0.72);
  });

  it('fails when profile.json is missing', () => {
    const result = readDossierFromDirectory(resolve(HERE, 'does-not-exist'));
    expect(result.ok).toBe(false);
  });
});
