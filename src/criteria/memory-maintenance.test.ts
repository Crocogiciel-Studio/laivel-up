import { describe, expect, it } from 'vitest';
import { memoryMaintenance } from './memory-maintenance.js';
import { makeGrid, makeProfile } from '../../test/support/factories.js';
import type { ToolingContext } from '../core/model/profile.js';

const grid = makeGrid();

function run(
  toolingContext: Partial<ToolingContext> | undefined,
  params: Record<string, number> = {},
): ReturnType<typeof memoryMaintenance.evaluate> {
  return memoryMaintenance.evaluate({
    profile: makeProfile({
      available: toolingContext === undefined ? [] : ['toolingContext'],
      toolingContext:
        toolingContext === undefined
          ? undefined
          : {
              projectMemoryPresent: false,
              projectMemoryLastUpdated: undefined,
              rulesCount: 0,
              skillsCount: 0,
              agentsCount: 0,
              hooksCount: 0,
              autoRetryLoopPresent: undefined,
              declaredAssistantTools: [],
              editorIntegration: undefined,
              sessionsPerWeek: undefined,
              tokensPerWeek: undefined,
              ...toolingContext,
            },
    }),
    grid,
    axisId: 'harness',
    params,
  });
}

describe('memoryMaintenance', () => {
  it('is a confidence-role helper: single-source, fixed margin, never leans on agreement', () => {
    const out = run({ projectMemoryPresent: true, projectMemoryLastUpdated: '2026-07-12' });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.confidence.singleSource).toBe(true);
      expect(out.value.confidence.agreement).toBe(1);
      expect(out.value.confidence.margin).toBeCloseTo(0.7, 5);
      expect(out.value.confidence.sufficiency).toBe(1);
    }
  });

  it('perceval — memory absent: reads the "nothing" tier', () => {
    const out = run({ projectMemoryPresent: false, projectMemoryLastUpdated: undefined });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l0');
      expect(out.value.rawValue).toBe('nothing');
      expect(out.value.evidence).toContain('absent');
    }
  });

  it('bohort — present, last updated 2026-07-12: reads the "memory" tier, corroborates', () => {
    const out = run({ projectMemoryPresent: true, projectMemoryLastUpdated: '2026-07-12' });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l2');
      expect(out.value.rawValue).toBe('memory');
      expect(out.value.evidence).toContain('2026-07-12');
    }
  });

  it('leodagan — present, last updated 2026-07-11: reads the "memory" tier', () => {
    const out = run({ projectMemoryPresent: true, projectMemoryLastUpdated: '2026-07-11' });
    expect(out.ok && out.value.levelId).toBe('l2');
    expect(out.ok && out.value.rawValue).toBe('memory');
  });

  it('arthur — present, last updated 2026-07-14: reads the "memory" tier', () => {
    const out = run({ projectMemoryPresent: true, projectMemoryLastUpdated: '2026-07-14' });
    expect(out.ok && out.value.levelId).toBe('l2');
    expect(out.ok && out.value.rawValue).toBe('memory');
  });

  it('present but never updated: drops to the "prompts" tier and contradicts a "memory"+ read', () => {
    const out = run({ projectMemoryPresent: true, projectMemoryLastUpdated: undefined });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l1');
      expect(out.value.rawValue).toBe('prompts');
      expect(out.value.evidence).toContain('no recorded update');
    }
  });

  it('treats a blank last-updated string the same as no date', () => {
    const out = run({ projectMemoryPresent: true, projectMemoryLastUpdated: '   ' });
    expect(out.ok && out.value.rawValue).toBe('prompts');
  });

  it('honours the grid calibration for the tier ranks', () => {
    const out = run(
      { projectMemoryPresent: true, projectMemoryLastUpdated: '2026-07-12' },
      { rankMemory: 5 },
    );
    expect(out.ok && out.value.levelId).toBe('l5');
  });

  it('returns missing-piece when the profile carries no toolingContext', () => {
    const out = run(undefined);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.kind).toBe('missing-piece');
      expect(out.error.needed).toContain('toolingContext');
    }
  });
});
