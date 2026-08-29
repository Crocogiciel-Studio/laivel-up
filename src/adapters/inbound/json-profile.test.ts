import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readProfileFromDirectory } from './json-profile.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXAMPLE = resolve(HERE, '../../../examples/dev-sample');
const FIXTURES = resolve(HERE, '../../../test/fixtures/profiles');

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

  describe('raw pull requests from pull-requests.json', () => {
    it('bohort — parses the GitHub-style rows into vcsActivity.rawPullRequests', () => {
      const result = readProfileFromDirectory(resolve(FIXTURES, 'bohort'));
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const rows = result.value.vcsActivity?.rawPullRequests;
      expect(rows).toBeDefined();
      expect(rows).toHaveLength(12);
      expect(rows?.[0]).toEqual({
        changedFiles: 6,
        additions: 132,
        deletions: 43,
        commits: 7,
        reviewComments: 6,
      });
    });

    it('leodagan — also carries raw pull requests', () => {
      const result = readProfileFromDirectory(resolve(FIXTURES, 'leodagan'));
      expect(result.ok && result.value.vcsActivity?.rawPullRequests).toHaveLength(12);
    });

    it('perceval — no pull-requests.json leaves rawPullRequests undefined', () => {
      const result = readProfileFromDirectory(resolve(FIXTURES, 'perceval'));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.vcsActivity?.rawPullRequests).toBeUndefined();
    });
  });

  describe('self-assessed level extraction from declaratif.md', () => {
    const levelOf = (name: string): string | undefined => {
      const result = readProfileFromDirectory(resolve(FIXTURES, name));
      if (!result.ok) throw new Error(`fixture ${name} failed to parse`);
      return result.value.declared?.selfAssessedLevel;
    };

    it('perceval — "plutôt avancé" / "haut du panier" maps to green', () => {
      expect(levelOf('perceval')).toBe('green');
    });

    it('bohort — "milieu de tableau" maps to blue', () => {
      expect(levelOf('bohort')).toBe('blue');
    });

    it('leodagan — "façon par défaut de travailler" maps to green', () => {
      expect(levelOf('leodagan')).toBe('green');
    });

    it('arthur — no declaratif.md at all leaves the self-assessed level unknown', () => {
      expect(levelOf('arthur')).toBeUndefined();
    });
  });
});
