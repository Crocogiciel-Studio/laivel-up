import { describe, expect, it } from 'vitest';
import { behaviorArtifactDensity } from './behavior-artifact-density.js';
import { makeProfile, makeGrid } from '../../test/support/factories.js';
import type { ToolingContext } from '../core/model/profile.js';

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
    ...overrides,
  };
}

describe('behaviorArtifactDensity', () => {
  it('reads the behavior tier when density crosses densityStrong, regardless of project memory', () => {
    const profile = makeProfile({
      available: ['toolingContext'],
      toolingContext: tc({ rulesCount: 2, agentsCount: 2, projectMemoryPresent: false }),
    });
    const out = behaviorArtifactDensity.evaluate({ profile, grid, axisId: 'a', params: {} });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l4');
      expect(out.value.confidence.singleSource).toBe(true);
      expect(out.value.evidence).toContain('artifact density 4');
    }
  });

  it('reads the memory tier when density is thin but project memory is present', () => {
    const profile = makeProfile({
      available: ['toolingContext'],
      toolingContext: tc({ rulesCount: 2, projectMemoryPresent: true }),
    });
    const out = behaviorArtifactDensity.evaluate({ profile, grid, axisId: 'a', params: {} });
    expect(out.ok && out.value.levelId).toBe('l2');
  });

  it('reads the prompts tier when density is zero, a tool is declared, and no project memory', () => {
    const profile = makeProfile({
      available: ['toolingContext'],
      toolingContext: tc({ declaredAssistantTools: ['chatgpt-web'] }),
    });
    const out = behaviorArtifactDensity.evaluate({ profile, grid, axisId: 'a', params: {} });
    expect(out.ok && out.value.levelId).toBe('l1');
  });

  it('reads the nothing tier when density is zero, no tools declared, no project memory', () => {
    const profile = makeProfile({
      available: ['toolingContext'],
      toolingContext: tc(),
    });
    const out = behaviorArtifactDensity.evaluate({ profile, grid, axisId: 'a', params: {} });
    expect(out.ok && out.value.levelId).toBe('l0');
  });

  it('honours the grid calibration for the tier ranks', () => {
    const profile = makeProfile({
      available: ['toolingContext'],
      toolingContext: tc({ projectMemoryPresent: true }),
    });
    const out = behaviorArtifactDensity.evaluate({
      profile,
      grid,
      axisId: 'a',
      params: { rankMemory: 1 },
    });
    expect(out.ok && out.value.levelId).toBe('l1');
  });

  it('returns a missing-piece error when the section is absent', () => {
    const out = behaviorArtifactDensity.evaluate({
      profile: makeProfile(),
      grid,
      axisId: 'a',
      params: {},
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.kind).toBe('missing-piece');
      expect(out.error.needed).toContain('toolingContext');
    }
  });

  it('margin is higher far from the crossed threshold than one unit away from it', () => {
    const far = makeProfile({
      available: ['toolingContext'],
      toolingContext: tc({ rulesCount: 10 }),
    });
    const near = makeProfile({
      available: ['toolingContext'],
      toolingContext: tc({ rulesCount: 4 }),
    });
    const farOut = behaviorArtifactDensity.evaluate({
      profile: far,
      grid,
      axisId: 'a',
      params: {},
    });
    const nearOut = behaviorArtifactDensity.evaluate({
      profile: near,
      grid,
      axisId: 'a',
      params: {},
    });
    expect(farOut.ok && nearOut.ok).toBe(true);
    if (farOut.ok && nearOut.ok) {
      expect(farOut.value.confidence.margin).toBeGreaterThan(nearOut.value.confidence.margin);
    }
  });
});
