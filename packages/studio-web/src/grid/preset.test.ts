import { describe, expect, it } from 'vitest';
import { parseGrid } from 'laivel-up/compose';
import aiddBody from '../../../core/presets/aidd.json' with { type: 'json' };
import { cardFor, emptyGrid, fromPreset, toPreset } from './preset.js';

describe('grid preset transform', () => {
  it('an empty grid needs an id and reports it', () => {
    const { issues } = toPreset(emptyGrid());
    expect(issues).toContain('the grid needs an id');
  });

  it('a minimal built grid parses through the engine', () => {
    const state = emptyGrid();
    state.gridId = 'demo';
    state.levels = [
      { id: 'low', label: '' },
      { id: 'high', label: 'High' },
    ];
    state.axes = [
      { id: 'only', label: 'Only', bundle: [cardFor('pr-feature-size', { rankS: 1, linesS: 120 })] },
    ];
    const { preset, issues } = toPreset(state);
    expect(issues).toEqual([]);

    const parsed = parseGrid(preset);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.levels.map((l) => l.rank)).toEqual([0, 1]);
    expect(parsed.value.axes[0]?.bundle[0]?.params).toEqual({ rankS: 1, linesS: 120 });
  });

  it('flags duplicate level and axis ids', () => {
    const state = emptyGrid();
    state.gridId = 'demo';
    state.levels = [
      { id: 'x', label: '' },
      { id: 'x', label: '' },
    ];
    state.axes = [
      { id: 'a', label: '', bundle: [] },
      { id: 'a', label: '', bundle: [] },
    ];
    const { issues } = toPreset(state);
    expect(issues).toContain('level ids must be unique');
    expect(issues).toContain('axis ids must be unique');
  });

  it('bounds the evidence floor to 0..1', () => {
    const state = emptyGrid();
    state.gridId = 'demo';
    state.evidenceFloor = '1.5';
    expect(toPreset(state).issues).toContain('evidence floor must be between 0 and 1');
  });

  it('round-trips the AIDD preset: fromPreset -> toPreset is structurally equal', () => {
    const state = fromPreset('aidd', aiddBody);
    const { preset, issues } = toPreset(state);
    expect(issues).toEqual([]);
    // key order differs, so compare parsed structures
    expect(JSON.parse(JSON.stringify(preset))).toEqual(aiddBody);
  });

  it('remaps rank-valued params when a loaded grid has non-contiguous ranks', () => {
    const body = {
      id: 'sparse',
      levels: [
        { id: 'a', rank: 0 },
        { id: 'b', rank: 5 },
        { id: 'c', rank: 9 },
      ],
      axes: [
        {
          id: 'x',
          bundle: [
            {
              criterionId: 'declaratif-contradiction',
              role: 'confidence',
              weight: 1,
              params: {
                contradictionSlope: 0.35,
                rankSelfBeginner: 0,
                rankSelfIntermediate: 5,
                rankSelfAdvanced: 9,
              },
            },
          ],
        },
      ],
    };
    const { preset, issues } = toPreset(fromPreset('sparse', body));
    expect(issues).toEqual([]);
    expect(preset.levels.map((l) => l.rank)).toEqual([0, 1, 2]);
    // 0 -> 0, 5 -> 1, 9 -> 2; contradictionSlope is not a rank, so it is left alone
    expect(preset.axes[0]?.bundle[0]?.params).toEqual({
      contradictionSlope: 0.35,
      rankSelfBeginner: 0,
      rankSelfIntermediate: 1,
      rankSelfAdvanced: 2,
    });
  });

  it('the AIDD round-trip still parses through the engine', () => {
    const { preset } = toPreset(fromPreset('aidd', aiddBody));
    expect(parseGrid(preset).ok).toBe(true);
  });
});
