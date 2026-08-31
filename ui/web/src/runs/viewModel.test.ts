import { describe, expect, it } from 'vitest';
import type { Evaluation } from '@laivel-up/ui/evaluation';
import { buildRunViewModel, gridFromSnapshot } from './viewModel.js';

const snapshot = {
  id: 'custom',
  levels: [
    { id: 'junior', label: 'Junior', rank: 0 },
    { id: 'senior', label: 'Senior', rank: 1 },
  ],
  axes: [{ id: 'size', label: 'PR size', bundle: [] }],
};

const evaluation: Evaluation = {
  subjectId: 'dev-x',
  gridId: 'custom',
  generatedAt: '2026-08-31T00:00:00.000Z',
  global: {
    levelId: 'senior',
    confidence: 0.8,
    bindingAxisId: 'size',
    note: { key: 'aggregate.binding', params: { axis: 'size' } },
  },
  axes: [
    {
      axisId: 'size',
      levelId: 'senior',
      confidence: 0.8,
      limitingFactor: 'margin',
      readings: [
        {
          criterionId: 'pr-feature-size',
          axisId: 'size',
          role: 'level',
          status: 'read',
          levelId: 'senior',
          rawValue: 'M',
          confidence: 0.8,
          limitingFactor: 'margin',
          evidence: { key: 'criterion.pr-feature-size', params: { detail: 'x' } },
        },
      ],
    },
  ],
  progression: { targetLevelId: 'senior', actions: [] },
};

describe('gridFromSnapshot', () => {
  it('returns undefined for a body that is not a grid preset', () => {
    expect(gridFromSnapshot(null)).toBeUndefined();
    expect(gridFromSnapshot({ id: 'x' })).toBeUndefined();
  });
});

describe('buildRunViewModel', () => {
  it('resolves labels from the run snapshot, not the bundled grid', () => {
    const vm = buildRunViewModel(evaluation, snapshot);
    expect(vm.gridKnown).toBe(true);
    expect(vm.verdict.level).toBe('Senior');
    expect(vm.verdict.confidencePct).toBe(80);
    expect(vm.verdict.bindingAxis).toBe('PR size');
    expect(vm.axes[0]?.name).toBe('PR size');
    expect(vm.axes[0]?.readings[0]?.level).toBe('Senior');
    expect(vm.scale).toEqual(['Junior', 'Senior']);
  });

  it('falls back to ids when the snapshot is not a usable grid', () => {
    const vm = buildRunViewModel(evaluation, { not: 'a grid' });
    expect(vm.gridKnown).toBe(false);
    expect(vm.verdict.level).toBe('senior');
    expect(vm.axes[0]?.name).toBe('size');
  });
});
