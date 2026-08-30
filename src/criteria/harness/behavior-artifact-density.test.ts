import { describe, expect, it } from 'vitest';
import { behaviorArtifactDensity } from './behavior-artifact-density.js';
import { evidenceText } from '../../../test/support/evidence.js';
import { makeProfile, makeGrid } from '../../../test/support/factories.js';
import type { ToolingContext } from '../../core/model/profile.js';

const grid = makeGrid();

function tc(overrides: Partial<ToolingContext> = {}): ToolingContext {
  return {
    projectMemoryPresent: false,
    projectMemoryLastUpdated: undefined,
    rulesCount: 0,
    skillsCount: 0,
    agentsCount: 0,
    hooksCount: 0,
    autoRetryLoopPresent: false,
    declaredAssistantTools: [],
    editorIntegration: undefined,
    sessionsPerWeek: undefined,
    tokensPerWeek: undefined,
    ...overrides,
  };
}

function run(
  toolingContext: ToolingContext,
  params: Record<string, number> = {},
): ReturnType<typeof behaviorArtifactDensity.evaluate> {
  return behaviorArtifactDensity.evaluate({
    profile: makeProfile({ available: ['toolingContext'], toolingContext }),
    grid,
    axisId: 'harness',
    params,
  });
}

describe('behaviorArtifactDensity', () => {
  it('is a confidence-role helper: single-source, never a level vote', () => {
    const out = run(tc({ rulesCount: 5 }));
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.value.confidence.singleSource).toBe(true);
  });

  it('reads the behavior tier when the artifact density clears densityStrong', () => {
    // leodagan: 3 rules + 2 agents + 1 hook + 3 skills = 9
    const out = run(
      tc({ projectMemoryPresent: true, rulesCount: 3, agentsCount: 2, hooksCount: 1, skillsCount: 3 }),
    );
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l4');
      expect(out.value.rawValue).toBe('behavior');
      expect(evidenceText(out.value.evidence)).toContain('= 9 (>= 4)');
    }
  });

  it('reads the behavior tier from skills + agents alone', () => {
    // arthur: 4 skills + 2 agents = 6
    const out = run(tc({ projectMemoryPresent: true, skillsCount: 4, agentsCount: 2 }));
    expect(out.ok && out.value.levelId).toBe('l4');
  });

  it('reads the memory tier for a thin-but-nonzero density', () => {
    const out = run(tc({ rulesCount: 2 }));
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l2');
      expect(out.value.rawValue).toBe('memory');
    }
  });

  it('reads the memory tier at density 0 when project memory is present (bohort)', () => {
    const out = run(tc({ projectMemoryPresent: true }));
    expect(out.ok && out.value.levelId).toBe('l2');
  });

  it('reads the prompts tier at density 0 with only a declared tool (perceval)', () => {
    const out = run(tc({ declaredAssistantTools: ['chatgpt-web'] }));
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l1');
      expect(out.value.rawValue).toBe('nothing/prompts');
    }
  });

  it('reads the nothing tier at density 0 with no memory and no declared tool', () => {
    const out = run(tc());
    expect(out.ok && out.value.levelId).toBe('l0');
  });

  it('honours the grid calibration for the tier ranks', () => {
    const out = run(tc({ rulesCount: 6 }), { rankBehavior: 6, densityStrong: 5 });
    expect(out.ok && out.value.levelId).toBe('l6');
  });

  it('margin shrinks as the density nears densityStrong from above', () => {
    const far = run(tc({ rulesCount: 12 }));
    const near = run(tc({ rulesCount: 5 }));
    expect(far.ok && near.ok).toBe(true);
    if (far.ok && near.ok) {
      expect(far.value.confidence.margin).toBe(1);
      expect(near.value.confidence.margin).toBeLessThan(1);
      expect(near.value.confidence.margin).toBeGreaterThan(0);
      expect(near.value.confidence.sufficiency).toBe(1);
    }
  });

  it('returns a missing-piece error when the section is absent', () => {
    const out = behaviorArtifactDensity.evaluate({
      profile: makeProfile(),
      grid,
      axisId: 'harness',
      params: {},
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.kind).toBe('missing-piece');
      expect(out.error.needed).toContain('toolingContext');
    }
  });
});
