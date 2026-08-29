import { describe, expect, it } from 'vitest';
import { codeQualityFloor } from './code-quality-floor.js';
import { makeGrid, makeProfile } from '../../test/support/factories.js';
import type { StaticAnalysis } from '../core/model/profile.js';

const grid = makeGrid();

function run(
  sa: Partial<StaticAnalysis> | null,
  params: Record<string, number> = {},
): ReturnType<typeof codeQualityFloor.evaluate> {
  return codeQualityFloor.evaluate({
    profile: makeProfile({
      available: sa === null ? [] : ['staticAnalysis'],
      staticAnalysis:
        sa === null
          ? undefined
          : {
              ncloc: undefined,
              coverage: undefined,
              complexity: undefined,
              cognitiveComplexity: undefined,
              codeSmells: undefined,
              bugs: undefined,
              duplicatedLinesDensity: undefined,
              sqaleIndex: undefined,
              ...sa,
            },
    }),
    grid,
    axisId: 'harness',
    params,
  });
}

describe('codeQualityFloor', () => {
  it('caps at memory when duplication is high — dup 20', () => {
    const out = run({ duplicatedLinesDensity: 20, ncloc: 10_000, codeSmells: 5, cognitiveComplexity: 100 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l2');
      expect(out.value.rawValue).toBe('cap-poor');
      expect(out.value.confidence.singleSource).toBe(true);
      expect(out.value.confidence.agreement).toBe(1);
      expect(out.value.confidence.sufficiency).toBe(1);
      expect(out.value.confidence.margin).toBeGreaterThan(0);
    }
  });

  it('caps at memory when smells per kloc is high — 12 smells/KLOC', () => {
    const out = run({ duplicatedLinesDensity: 2, ncloc: 1_000, codeSmells: 12, cognitiveComplexity: 10 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l2');
      expect(out.value.rawValue).toBe('cap-poor');
    }
  });

  it('caps at memory when cognitive-complexity density is high', () => {
    const out = run({ duplicatedLinesDensity: 2, ncloc: 1_000, codeSmells: 3, cognitiveComplexity: 60 });
    expect(out.ok && out.value.rawValue).toBe('cap-poor');
  });

  it('does not cap clean code', () => {
    const out = run({ duplicatedLinesDensity: 3, ncloc: 40_000, codeSmells: 20, cognitiveComplexity: 900 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      // The grid's top level: a cap reading at the ceiling never sits below an
      // elected winner, so `applyCaps` ignores it.
      expect(out.value.levelId).toBe('l6');
      expect(out.value.rawValue).toBe('no-cap');
      expect(out.value.confidence.margin).toBeGreaterThan(0);
    }
  });

  it('caps perceval — dup 18.4 and 27.7 smells/kloc both clear the floor', () => {
    const out = run({
      duplicatedLinesDensity: 18.4,
      ncloc: 23_124,
      codeSmells: 641,
      cognitiveComplexity: 838,
    });
    expect(out.ok && out.value.levelId).toBe('l2');
    expect(out.ok && out.value.rawValue).toBe('cap-poor');
  });

  it('does not cap bohort', () => {
    const out = run({
      duplicatedLinesDensity: 5.8,
      ncloc: 36_162,
      codeSmells: 64,
      cognitiveComplexity: 915,
    });
    expect(out.ok && out.value.rawValue).toBe('no-cap');
  });

  it('does not cap leodagan', () => {
    const out = run({
      duplicatedLinesDensity: 1.7,
      ncloc: 46_032,
      codeSmells: 7,
      cognitiveComplexity: 1_090,
    });
    expect(out.ok && out.value.rawValue).toBe('no-cap');
  });

  it('does not cap arthur', () => {
    const out = run({
      duplicatedLinesDensity: 2.4,
      ncloc: 70_224,
      codeSmells: 10,
      cognitiveComplexity: 1_660,
    });
    expect(out.ok && out.value.rawValue).toBe('no-cap');
  });

  it('reads the boundary value exactly at dupHigh as a cap', () => {
    const out = run({ duplicatedLinesDensity: 12, ncloc: 10_000, codeSmells: 1, cognitiveComplexity: 10 });
    expect(out.ok && out.value.rawValue).toBe('cap-poor');
  });

  it('normalizes smells by kloc with a 1-kloc floor on ncloc', () => {
    // 8 smells over 500 ncloc => divisor floored at 1 kloc => 8 smells/kloc < 10 => no cap.
    const out = run({ duplicatedLinesDensity: 1, ncloc: 500, codeSmells: 8, cognitiveComplexity: 5 });
    expect(out.ok && out.value.rawValue).toBe('no-cap');
  });

  it('honours the grid calibration for the cap rank', () => {
    const out = run(
      { duplicatedLinesDensity: 20, ncloc: 10_000, codeSmells: 5, cognitiveComplexity: 100 },
      { rankCapPoor: 1 },
    );
    expect(out.ok && out.value.levelId).toBe('l1');
  });

  it('honours the grid calibration for the thresholds', () => {
    const out = run(
      { duplicatedLinesDensity: 15, ncloc: 10_000, codeSmells: 5, cognitiveComplexity: 100 },
      { dupHigh: 20 },
    );
    expect(out.ok && out.value.rawValue).toBe('no-cap');
  });

  it('always flags single-source and never leans on agreement', () => {
    const out = run({ duplicatedLinesDensity: 20, ncloc: 10_000, codeSmells: 5, cognitiveComplexity: 100 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.confidence.singleSource).toBe(true);
      expect(out.value.confidence.agreement).toBe(1);
    }
  });

  it('reads with only the duplication signal present', () => {
    const out = run({ duplicatedLinesDensity: 20 });
    expect(out.ok && out.value.rawValue).toBe('cap-poor');
  });

  it('returns missing-piece when staticAnalysis is absent', () => {
    const out = run(null);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.kind).toBe('missing-piece');
      expect(out.error.needed).toContain('staticAnalysis');
    }
  });

  it('returns missing-piece when no measure can drive a check', () => {
    const out = run({ coverage: 80 });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.kind).toBe('missing-piece');
  });

  it('returns missing-piece when smells and complexity lack ncloc and there is no duplication', () => {
    const out = run({ codeSmells: 500, cognitiveComplexity: 900 });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.kind).toBe('missing-piece');
  });
});
