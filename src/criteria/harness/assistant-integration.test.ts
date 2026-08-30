import { describe, expect, it } from 'vitest';
import { assistantIntegration } from './assistant-integration.js';
import { evidenceText } from '../../../test/support/evidence.js';
import { makeGrid, makeProfile } from '../../../test/support/factories.js';
import type { ToolingContext } from '../../core/model/profile.js';

const grid = makeGrid();

function run(
  toolingContext: Partial<ToolingContext> | undefined,
  params: Record<string, number> = {},
): ReturnType<typeof assistantIntegration.evaluate> {
  return assistantIntegration.evaluate({
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

describe('assistantIntegration', () => {
  it('is a confidence-role helper: single-source, fixed sufficiency, never leans on agreement', () => {
    const out = run({
      editorIntegration: true,
      declaredAssistantTools: ['claude-code', 'chatgpt-web'],
      tokensPerWeek: 1_900_000,
      sessionsPerWeek: 31,
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.confidence.singleSource).toBe(true);
      expect(out.value.confidence.agreement).toBe(1);
      expect(out.value.confidence.sufficiency).toBe(1);
      expect(out.value.confidence.margin).toBeCloseTo(1, 5);
    }
  });

  it('perceval — false / 1 tool / 140k tokens/wk / 22 sessions/wk: score 1 => memory tier', () => {
    const out = run({
      editorIntegration: false,
      declaredAssistantTools: ['chatgpt-web'],
      tokensPerWeek: 140_000,
      sessionsPerWeek: 22,
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l2');
      expect(out.value.rawValue).toBe('memory');
      expect(out.value.confidence.margin).toBeCloseTo(0.25, 5);
      expect(evidenceText(out.value.evidence)).toContain('score 1/4');
    }
  });

  it('bohort — true / 2 tools / 1.9M / 31: score 4 => behavior tier, corroborates', () => {
    const out = run({
      editorIntegration: true,
      declaredAssistantTools: ['claude-code', 'chatgpt-web'],
      tokensPerWeek: 1_900_000,
      sessionsPerWeek: 31,
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l4');
      expect(out.value.rawValue).toBe('behavior');
    }
  });

  it('leodagan — true / 1 tool / 6.8M / 26: score 3 => behavior tier', () => {
    const out = run({
      editorIntegration: true,
      declaredAssistantTools: ['claude-code'],
      tokensPerWeek: 6_800_000,
      sessionsPerWeek: 26,
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l4');
      expect(out.value.rawValue).toBe('behavior');
      expect(out.value.confidence.margin).toBeCloseTo(0.75, 5);
    }
  });

  it('arthur — true / 2 tools / 21M / 74: score 4 => behavior tier', () => {
    const out = run({
      editorIntegration: true,
      declaredAssistantTools: ['claude-code', 'codex'],
      tokensPerWeek: 21_000_000,
      sessionsPerWeek: 74,
    });
    expect(out.ok && out.value.levelId).toBe('l4');
    expect(out.ok && out.value.rawValue).toBe('behavior');
  });

  it('no integration signal at all: score 0 => prompts tier, contradicts a high read', () => {
    const out = run({
      editorIntegration: false,
      declaredAssistantTools: [],
      tokensPerWeek: 0,
      sessionsPerWeek: 0,
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l1');
      expect(out.value.rawValue).toBe('prompts');
      expect(out.value.confidence.margin).toBe(0);
    }
  });

  it('absent usage volume is not counted against the subject (treated as unknown, not zero)', () => {
    const out = run({
      editorIntegration: true,
      declaredAssistantTools: ['claude-code', 'codex'],
    });
    expect(out.ok).toBe(true);
    // editor + 2 tools = score 2, the two usage signals abstain
    if (out.ok) {
      expect(out.value.rawValue).toBe('memory');
      expect(evidenceText(out.value.evidence)).toContain('? tokens/wk');
    }
  });

  it('honours the grid calibration for the tier ranks', () => {
    const out = run(
      {
        editorIntegration: true,
        declaredAssistantTools: ['claude-code', 'chatgpt-web'],
        tokensPerWeek: 1_900_000,
        sessionsPerWeek: 31,
      },
      { rankBehavior: 5 },
    );
    expect(out.ok && out.value.levelId).toBe('l5');
  });

  it('honours the tokensHigh / sessionsHigh thresholds from the preset', () => {
    const out = run(
      {
        editorIntegration: false,
        declaredAssistantTools: ['chatgpt-web'],
        tokensPerWeek: 140_000,
        sessionsPerWeek: 22,
      },
      { sessionsHigh: 25 },
    );
    // sessionsPerWeek 22 now below the raised threshold => score 0
    expect(out.ok && out.value.rawValue).toBe('prompts');
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
