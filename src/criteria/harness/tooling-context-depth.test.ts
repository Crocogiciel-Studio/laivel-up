import { describe, expect, it } from 'vitest';
import { toolingContextDepth } from './tooling-context-depth.js';
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

describe('toolingContextDepth', () => {
  it('reads the behavior tier when memory and rules/agents are in place', () => {
    const profile = makeProfile({
      available: ['toolingContext'],
      toolingContext: tc({ projectMemoryPresent: true, rulesCount: 3, agentsCount: 2 }),
    });
    const out = toolingContextDepth.evaluate({ profile, grid, axisId: 'a', params: {} });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l4');
      expect(out.value.confidence.singleSource).toBe(true);
      expect(evidenceText(out.value.evidence)).toContain('3 rules');
    }
  });

  it('reads the prompts tier when a tool is declared but nothing is set up', () => {
    const profile = makeProfile({
      available: ['toolingContext'],
      toolingContext: tc({ declaredAssistantTools: ['chatgpt-web'] }),
    });
    const out = toolingContextDepth.evaluate({ profile, grid, axisId: 'a', params: {} });
    expect(out.ok && out.value.levelId).toBe('l1');
  });

  it('reads the bottom tier when nothing at all is set up', () => {
    const profile = makeProfile({
      available: ['toolingContext'],
      toolingContext: tc(),
    });
    const out = toolingContextDepth.evaluate({ profile, grid, axisId: 'a', params: {} });
    expect(out.ok && out.value.levelId).toBe('l0');
  });

  it('honours the grid calibration for the tier ranks', () => {
    const profile = makeProfile({
      available: ['toolingContext'],
      toolingContext: tc({ projectMemoryPresent: true }),
    });
    const out = toolingContextDepth.evaluate({
      profile,
      grid,
      axisId: 'a',
      params: { rankMemory: 1 },
    });
    expect(out.ok && out.value.levelId).toBe('l1');
  });

  it('returns a missing-piece error when the section is absent', () => {
    const out = toolingContextDepth.evaluate({
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
});
