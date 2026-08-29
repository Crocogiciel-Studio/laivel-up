import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readProfileFromDirectory } from './json-profile.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXAMPLE = resolve(HERE, '../../../examples/dev-sample');

describe('readProfileFromDirectory', () => {
  it('parses the shipped example profile directory', () => {
    const result = readProfileFromDirectory(EXAMPLE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const profile = result.value;
    expect(profile.subject.id).toBe('dev-sample');
    expect(profile.available).toContain('declared');
    expect(profile.available).toContain('vcsActivity');
    expect(profile.available).toContain('toolingContext');
    expect(profile.toolingContext?.projectMemoryPresent).toBe(true);
    expect(profile.toolingContext?.rulesCount).toBe(2);
    expect(profile.vcsActivity?.commits?.aiCoauthoredRatio).toBeCloseTo(0.72);
  });

  it('fails when profile.json is missing', () => {
    const result = readProfileFromDirectory(resolve(HERE, 'does-not-exist'));
    expect(result.ok).toBe(false);
  });
});
