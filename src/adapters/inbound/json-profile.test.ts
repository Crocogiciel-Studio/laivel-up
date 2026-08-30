import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { readProfileFromDirectory } from './json-profile.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXAMPLE = resolve(HERE, '../../../examples/dev-sample');
const FIXTURES = resolve(HERE, '../../../test/fixtures/profiles');

const tmpDirs: string[] = [];
afterEach(() => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  }
});

/** A throwaway profile directory holding just the given files. */
function tmpProfileDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'laivel-profile-'));
  tmpDirs.push(dir);
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(dir, name), body);
  }
  return dir;
}

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
    expect(profile.toolingContext?.sessionsPerWeek).toBe(18);
    expect(profile.toolingContext?.tokensPerWeek).toBe(900000);
    expect(profile.vcsActivity?.commits?.aiCoauthoredRatio).toBeCloseTo(0.72);
  });

  it('maps assistant_usage volume — sessions/tokens per week — onto the tooling context', () => {
    const result = readProfileFromDirectory(resolve(FIXTURES, 'bohort'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const tc = result.value.toolingContext;
    expect(tc?.editorIntegration).toBe(true);
    expect(tc?.declaredAssistantTools).toEqual(['claude-code', 'chatgpt-web']);
    expect(tc?.sessionsPerWeek).toBe(31);
    expect(tc?.tokensPerWeek).toBe(1_900_000);
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

  describe('work session heuristics from session.md', () => {
    it('bohort — counts the turns and the mid-task reprises', () => {
      const result = readProfileFromDirectory(resolve(FIXTURES, 'bohort'));
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const ws = result.value.workSession;
      expect(result.value.available).toContain('workSession');
      expect(ws?.promptToCommitSteps).toBe(6);
      expect(ws?.humanInterventionsMidTask).toBe(2);
      expect(ws?.framingOnly).toBe(false);
      expect(ws?.rawText).toContain('relance de facture impayée');
    });

    it('arthur — a longer framing then one explicit "je te reprends"', () => {
      const result = readProfileFromDirectory(resolve(FIXTURES, 'arthur'));
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const ws = result.value.workSession;
      expect(ws?.promptToCommitSteps).toBe(3);
      expect(ws?.humanInterventionsMidTask).toBe(1);
      expect(ws?.framingOnly).toBe(false);
    });

    it('perceval — no session.md leaves the work session unread', () => {
      const result = readProfileFromDirectory(resolve(FIXTURES, 'perceval'));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.workSession).toBeUndefined();
        expect(result.value.available).not.toContain('workSession');
      }
    });

    it('leodagan — also has no session.md', () => {
      const result = readProfileFromDirectory(resolve(FIXTURES, 'leodagan'));
      expect(result.ok && result.value.workSession).toBeUndefined();
    });
  });

  describe('self-assessed level extraction from declaratif.md', () => {
    const levelOf = (name: string): string | undefined => {
      const result = readProfileFromDirectory(resolve(FIXTURES, name));
      if (!result.ok) throw new Error(`fixture ${name} failed to parse`);
      return result.value.declared?.selfAssessedLevel;
    };

    it('perceval — "plutôt avancé" / "haut du panier" maps to the advanced band', () => {
      expect(levelOf('perceval')).toBe('advanced');
    });

    it('bohort — "milieu de tableau" maps to the intermediate band', () => {
      expect(levelOf('bohort')).toBe('intermediate');
    });

    it('leodagan — "façon par défaut de travailler" maps to the advanced band', () => {
      expect(levelOf('leodagan')).toBe('advanced');
    });

    it('arthur — no declaratif.md at all leaves the self-assessed level unknown', () => {
      expect(levelOf('arthur')).toBeUndefined();
    });

    it('emits only grid-neutral band tokens, never a grid level id', () => {
      const bands = ['perceval', 'bohort', 'leodagan'].map(levelOf);
      for (const band of bands) {
        expect(['beginner', 'intermediate', 'advanced']).toContain(band);
      }
    });
  });

  describe('explicit self_assessed_level in profile.json', () => {
    const levelOf = (dir: string): string | undefined => {
      const result = readProfileFromDirectory(dir);
      if (!result.ok) throw new Error('tmp profile failed to parse');
      return result.value.declared?.selfAssessedLevel;
    };

    it('passes an explicit value through verbatim when it is not a mapped phrase', () => {
      const dir = tmpProfileDir({
        'profile.json': JSON.stringify({ profile_id: 'x', self_assessed_level: 'green' }),
      });
      expect(levelOf(dir)).toBe('green');
    });

    it('still maps an explicit value that is itself a known phrase', () => {
      const dir = tmpProfileDir({
        'profile.json': JSON.stringify({
          profile_id: 'x',
          self_assessed_level: 'plutôt avancé, haut du panier',
        }),
      });
      expect(levelOf(dir)).toBe('advanced');
    });

    it('an explicit value wins over a contradicting declaratif.md', () => {
      const dir = tmpProfileDir({
        'profile.json': JSON.stringify({ profile_id: 'x', self_assessed_level: 'green' }),
        'declaratif.md': 'Mon niveau ? Je débute, je commence tout juste.',
      });
      expect(levelOf(dir)).toBe('green');
    });
  });

  describe('raw pull requests without git-activity.json', () => {
    it('gains vcsActivity but not toolingContext', () => {
      const dir = tmpProfileDir({
        'profile.json': JSON.stringify({ profile_id: 'x' }),
        'pull-requests.json': JSON.stringify([
          { changed_files: 3, additions: 40, deletions: 12 },
          { changed_files: 1, additions: 8, deletions: 2 },
        ]),
      });
      const result = readProfileFromDirectory(dir);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.available).toContain('vcsActivity');
      expect(result.value.available).not.toContain('toolingContext');
      expect(result.value.vcsActivity?.rawPullRequests).toHaveLength(2);
      expect(result.value.vcsActivity?.pullRequests).toBeUndefined();
    });
  });
});
