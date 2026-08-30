import { describe, expect, it } from 'vitest';
import type { Evaluation } from './evaluation';
import { buildViewModel } from './view-model';

const base: Evaluation = {
  subjectId: 'dev-sample',
  gridId: 'aidd',
  generatedAt: '2026-08-30T00:00:00.000Z',
  global: {
    levelId: 'blue',
    levelRank: 2,
    confidence: 0.55,
    bindingAxisId: 'size',
    note: { key: 'aggregate.binding', params: { axis: 'size' } },
  },
  axes: [
    {
      axisId: 'size',
      levelId: 'blue',
      levelRank: 2,
      confidence: 0.55,
      limitingFactor: 'sufficiency',
      readings: [
        {
          criterionId: 'pr-feature-size',
          axisId: 'size',
          role: 'level',
          status: 'read',
          levelId: 'blue',
          levelRank: 2,
          rawValue: 'M',
          confidence: 0.55,
          limitingFactor: 'margin',
          evidence: { key: 'criterion.pr-feature-size', params: { detail: 'histogram M' } },
        },
        {
          criterionId: 'declaratif-contradiction',
          axisId: 'size',
          role: 'confidence',
          status: 'unknown',
          confidence: 0,
          limitingFactor: 'sufficiency',
          evidence: { key: 'reading.evaluator-abstained', params: { detail: 'no self-assessed level' } },
        },
      ],
    },
    {
      axisId: 'harness',
      confidence: 0,
      limitingFactor: 'sufficiency',
      readings: [],
    },
  ],
  progression: {
    targetLevelId: 'green',
    bindingAxisId: 'size',
    actions: [
      { key: 'progression.raise-axis', params: { axis: 'Size', from: '🔹 Blue', to: '🟢 Green' } },
      { key: 'progression.confidence-limited', params: { axis: 'Size', factor: 'factor.sufficiency' } },
    ],
  },
};

describe('buildViewModel', () => {
  it('resolves level and axis labels from the bundled aidd grid', () => {
    const vm = buildViewModel(base, 'en');
    expect(vm.gridKnown).toBe(true);
    expect(vm.verdict.level).toBe('🔹 Blue');
    expect(vm.verdict.bindingAxis).toBe('Size');
    expect(vm.verdict.confidencePct).toBe(55);
    expect(vm.scale).toEqual(['❖ White', '🔺 Red', '🔹 Blue', '🟢 Green', '🥉 Copper', '🥈 Silver', '🥇 Gold']);
  });

  it('marks the binding axis and an unruled axis', () => {
    const vm = buildViewModel(base, 'en');
    const [size, harness] = vm.axes;
    expect(size?.binding).toBe(true);
    expect(size?.ruled).toBe(true);
    expect(harness?.binding).toBe(false);
    expect(harness?.ruled).toBe(false);
    expect(harness?.level).toBe('—');
  });

  it('localises role / status / limiting factor and resolves the evidence descriptor', () => {
    const fr = buildViewModel(base, 'fr');
    const size = fr.axes[0];
    expect(size?.limitingFactor).toBe('suffisance des preuves');
    expect(size?.readings[0]?.role).toBe('niveau');
    expect(size?.readings[1]?.status).toBe('inconnu');
    expect(size?.readings[0]?.evidence).toBe('taille de feature habituelle : histogram M');
  });

  it('resolves the note and progression actions against the bundled catalogue', () => {
    const en = buildViewModel(base, 'en');
    expect(en.verdict.note).toBe('size is binding');
    expect(en.progression.actions).toEqual([
      'Raise Size from 🔹 Blue toward 🟢 Green.',
      'Confidence on Size is limited by evidence sufficiency; add evidence that addresses it.',
    ]);

    const fr = buildViewModel(base, 'fr');
    expect(fr.verdict.note).toBe("size est l'axe contraignant");
    expect(fr.progression.actions[0]).toBe('Faites progresser Size de 🔹 Blue vers 🟢 Green.');
    expect(fr.progression.actions[1]).toContain('la suffisance des preuves');
  });

  it('shows an unknown reading with a dash for its missing value and level', () => {
    const vm = buildViewModel(base, 'en');
    const unknown = vm.axes[0]?.readings[1];
    expect(unknown?.raw).toBe('—');
    expect(unknown?.level).toBe('—');
    expect(unknown?.confidencePct).toBe(0);
  });

  it('falls back to raw ids when the grid is not bundled', () => {
    const vm = buildViewModel({ ...base, gridId: 'game-progression' }, 'en');
    expect(vm.gridKnown).toBe(false);
    expect(vm.verdict.level).toBe('blue');
    expect(vm.axes[0]?.name).toBe('size');
    expect(vm.scale).toEqual([]);
  });

  it('handles a global verdict with no level ruled', () => {
    const vm = buildViewModel(
      {
        ...base,
        global: {
          confidence: 0.1,
          note: { key: 'aggregate.evidence-bar-not-met', params: { ruled: 1, total: 4, required: 2 } },
        },
      },
      'en',
    );
    expect(vm.verdict.ruled).toBe(false);
    expect(vm.verdict.bindingAxis).toBeNull();
    expect(vm.verdict.note).toBe('evidence bar not met: 1/4 axes could be ruled on, 2 required');
  });

  it('tolerates a pre-#42 string note (unknown key falls back to itself)', () => {
    const vm = buildViewModel(
      { ...base, global: { ...base.global, note: 'legacy string' } as never },
      'en',
    );
    expect(vm.verdict.note).toBe('legacy string');
  });
});
