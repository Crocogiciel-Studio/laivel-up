import { describe, expect, it } from 'vitest';
import { foldConfidence, weakestOf } from './confidence.js';

describe('foldConfidence', () => {
  it('takes the weakest of the three checks and names it', () => {
    const folded = foldConfidence({
      agreement: 0.9,
      margin: 0.4,
      sufficiency: 0.8,
      singleSource: false,
    });
    expect(folded.value).toBeCloseTo(0.4);
    expect(folded.limitingFactor).toBe('margin');
  });

  it('ignores agreement when the criterion is single-source', () => {
    const folded = foldConfidence({
      agreement: 0.1,
      margin: 0.7,
      sufficiency: 0.9,
      singleSource: true,
    });
    expect(folded.value).toBeCloseTo(0.7);
    expect(folded.limitingFactor).toBe('margin');
  });

  it('reports "none" when nothing drags confidence below 1', () => {
    const folded = foldConfidence({
      agreement: 1,
      margin: 1,
      sufficiency: 1,
      singleSource: false,
    });
    expect(folded.value).toBe(1);
    expect(folded.limitingFactor).toBe('none');
  });

  it('clamps out-of-range and NaN inputs', () => {
    const folded = foldConfidence({
      agreement: 2,
      margin: Number.NaN,
      sufficiency: -1,
      singleSource: false,
    });
    expect(folded.value).toBe(0);
  });
});

describe('weakestOf', () => {
  it('returns the smallest part with its tag', () => {
    const folded = weakestOf([
      ['agreement', 0.8],
      ['sufficiency', 0.3],
      ['margin', 0.6],
    ]);
    expect(folded.value).toBeCloseTo(0.3);
    expect(folded.limitingFactor).toBe('sufficiency');
  });
});
