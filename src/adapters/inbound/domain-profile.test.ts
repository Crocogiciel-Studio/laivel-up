import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseProfile } from './domain-profile.js';
import { readProfileFromDirectory } from './json-profile.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(HERE, '../../../test/fixtures/profiles');
const NAMES = ['perceval', 'bohort', 'leodagan', 'arthur'] as const;

describe('parseProfile', () => {
  it.each(NAMES)(
    'reproduces the domain Profile a forge export parses to (%s)',
    (name) => {
      const fromDir = readProfileFromDirectory(resolve(FIXTURES, name));
      expect(fromDir.ok).toBe(true);
      if (!fromDir.ok) return;

      // A studio row stores exactly this object as JSON.
      const body: unknown = JSON.parse(JSON.stringify(fromDir.value));
      const reparsed = parseProfile(body);

      expect(reparsed.ok).toBe(true);
      if (!reparsed.ok) return;
      expect(reparsed.value).toEqual(fromDir.value);
    },
  );

  it('derives available from the sections supplied', () => {
    const result = parseProfile({
      subject: { id: 'x' },
      declared: { stack: ['ts'] },
      staticAnalysis: { bugs: 0 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect([...result.value.available].sort()).toEqual(['declared', 'staticAnalysis']);
  });

  it('rejects an explicit available that disagrees with the sections', () => {
    const result = parseProfile({
      subject: { id: 'x' },
      declared: { stack: [] },
      available: ['declared', 'workSession'],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.issues.join(' ')).toContain('workSession');
  });

  it('rejects a missing subject id', () => {
    const result = parseProfile({ subject: {}, declared: { stack: [] } });
    expect(result.ok).toBe(false);
  });

  it('accepts a profile with no sections at all', () => {
    const result = parseProfile({ subject: { id: 'lone' } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.available).toEqual([]);
    expect(result.value.declared).toBeUndefined();
  });
});
