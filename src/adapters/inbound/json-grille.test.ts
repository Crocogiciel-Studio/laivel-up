import { describe, expect, it } from 'vitest';
import { parseGrille } from './json-grille.js';

const valid = {
  id: 'demo',
  levels: [
    { id: 'low', rank: 0 },
    { id: 'high', rank: 1 },
  ],
  axes: [
    {
      id: 'only',
      faisceau: [{ criterionId: 'c', weight: 1, role: 'level' }],
    },
  ],
};

describe('parseGrille', () => {
  it('accepts a well-formed preset and defaults optional fields', () => {
    const result = parseGrille(valid);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.axisAggregation).toBe('confidence-weighted-vote');
      expect(result.value.globalAggregation).toBe('min-across-axes');
      expect(result.value.axes[0]?.faisceau[0]?.params).toEqual({});
    }
  });

  it('rejects duplicate level ranks with a readable issue', () => {
    const result = parseGrille({
      ...valid,
      levels: [
        { id: 'a', rank: 0 },
        { id: 'b', rank: 0 },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.issues.join(' ')).toContain('rank');
    }
  });

  it('rejects a preset with no axes', () => {
    const result = parseGrille({ ...valid, axes: [] });
    expect(result.ok).toBe(false);
  });

  it('rejects a non-object', () => {
    expect(parseGrille(null).ok).toBe(false);
    expect(parseGrille('nope').ok).toBe(false);
  });
});
