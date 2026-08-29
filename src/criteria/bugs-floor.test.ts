import { describe, expect, it } from 'vitest';
import { bugsFloor } from './bugs-floor.js';
import { makeGrid, makeProfile } from '../../test/support/factories.js';
import type { StaticAnalysis } from '../core/model/profile.js';

const grid = makeGrid();

function run(
  sa: Partial<StaticAnalysis> | null,
  params: Record<string, number> = {},
): ReturnType<typeof bugsFloor.evaluate> {
  return bugsFloor.evaluate({
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

describe('bugsFloor', () => {
  it('caps at memory when bugs per kloc is high — bugsPerKloc 5', () => {
    const out = run({ bugs: 5, ncloc: 1_000 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l2');
      expect(out.value.rawValue).toBe('cap-buggy');
      expect(out.value.confidence.singleSource).toBe(true);
      expect(out.value.confidence.agreement).toBe(1);
      expect(out.value.confidence.sufficiency).toBe(1);
      expect(out.value.confidence.margin).toBeGreaterThan(0);
    }
  });

  it('caps at behavior when bugs per kloc is moderate — bugsPerKloc 0.7', () => {
    const out = run({ bugs: 7, ncloc: 10_000 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l3');
      expect(out.value.rawValue).toBe('cap-mid');
    }
  });

  it('does not cap when bugs per kloc is 0', () => {
    const out = run({ bugs: 0, ncloc: 10_000 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      // The grid's top level: a cap reading at the ceiling never sits below an
      // elected winner, so `applyCaps` ignores it.
      expect(out.value.levelId).toBe('l6');
      expect(out.value.rawValue).toBe('no-cap');
      expect(out.value.confidence.margin).toBeGreaterThan(0);
    }
  });

  it('caps perceval — 212 bugs over 23124 ncloc is 9.2 bugs/kloc', () => {
    const out = run({ bugs: 212, ncloc: 23_124 });
    expect(out.ok && out.value.levelId).toBe('l2');
    expect(out.ok && out.value.rawValue).toBe('cap-buggy');
  });

  it('does not cap bohort', () => {
    const out = run({ bugs: 0, ncloc: 36_162 });
    expect(out.ok && out.value.rawValue).toBe('no-cap');
  });

  it('does not cap leodagan', () => {
    const out = run({ bugs: 0, ncloc: 46_032 });
    expect(out.ok && out.value.rawValue).toBe('no-cap');
  });

  it('does not cap arthur', () => {
    const out = run({ bugs: 0, ncloc: 70_224 });
    expect(out.ok && out.value.rawValue).toBe('no-cap');
  });

  it('reads the boundary value exactly at bugsHigh as a buggy cap', () => {
    const out = run({ bugs: 2, ncloc: 1_000 });
    expect(out.ok && out.value.rawValue).toBe('cap-buggy');
  });

  it('reads the boundary value exactly at bugsMid as a mid cap', () => {
    const out = run({ bugs: 5, ncloc: 10_000 });
    expect(out.ok && out.value.rawValue).toBe('cap-mid');
  });

  it('normalizes bugs by kloc with a 1-kloc floor on ncloc', () => {
    // 1 bug over 400 ncloc => divisor floored at 1 kloc => 1 bug/kloc, a mid cap;
    // without the floor it would be 2.5 bugs/kloc and a buggy cap.
    const out = run({ bugs: 1, ncloc: 400 });
    expect(out.ok && out.value.rawValue).toBe('cap-mid');
  });

  it('honours the grid calibration for the cap rank', () => {
    const out = run({ bugs: 5, ncloc: 1_000 }, { rankCapBuggy: 1 });
    expect(out.ok && out.value.levelId).toBe('l1');
  });

  it('honours the grid calibration for the thresholds', () => {
    const out = run({ bugs: 7, ncloc: 10_000 }, { bugsMid: 1 });
    expect(out.ok && out.value.rawValue).toBe('no-cap');
  });

  it('always flags single-source and never leans on agreement', () => {
    const out = run({ bugs: 5, ncloc: 1_000 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.confidence.singleSource).toBe(true);
      expect(out.value.confidence.agreement).toBe(1);
    }
  });

  it('returns missing-piece when staticAnalysis is absent', () => {
    const out = run(null);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.kind).toBe('missing-piece');
      expect(out.error.needed).toContain('staticAnalysis');
    }
  });

  it('returns missing-piece when the bug count is absent', () => {
    const out = run({ ncloc: 10_000 });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.kind).toBe('missing-piece');
  });

  it('returns missing-piece when ncloc is absent', () => {
    const out = run({ bugs: 5 });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.kind).toBe('missing-piece');
  });
});
