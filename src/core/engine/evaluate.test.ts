import { describe, expect, it } from 'vitest';
import { evaluate } from './evaluate.js';
import { inMemoryCatalogue } from '../../adapters/catalogue/in-memory-catalogue.js';
import {
  fixedEvaluator,
  makeProfile,
  makeGrid,
} from '../../../test/support/factories.js';

const clock = (): Date => new Date('2026-08-29T00:00:00.000Z');

describe('evaluate', () => {
  it('runs profile + grid + catalogue end to end into an evaluation', () => {
    const grid = makeGrid({
      axes: [
        {
          id: 'a',
          label: 'A',
          bundle: [{ criterionId: 'fx', weight: 1, role: 'level', params: {} }],
        },
        {
          id: 'b',
          label: 'B',
          bundle: [{ criterionId: 'fy', weight: 1, role: 'level', params: {} }],
        },
      ],
    });
    const catalogue = inMemoryCatalogue([
      fixedEvaluator('fx', { levelId: 'l2' }),
      fixedEvaluator('fy', { levelId: 'l3' }),
    ]);

    const evaluation = evaluate(makeProfile(), grid, catalogue, { now: clock });

    expect(evaluation.subjectId).toBe('subj');
    expect(evaluation.gridId).toBe('test');
    expect(evaluation.generatedAt).toBe('2026-08-29T00:00:00.000Z');
    expect(evaluation.axes.map((a) => a.axisId)).toEqual(['a', 'b']);
    expect(evaluation.global.levelId).toBe('l2'); // min across a=l2, b=l3
    expect(evaluation.global.bindingAxisId).toBe('a');
    expect(evaluation.progression.targetLevelId).toBe('l3');
  });

  it('marks an axis unknown when its criterion has no evaluator', () => {
    const grid = makeGrid({
      axes: [
        {
          id: 'a',
          label: 'A',
          bundle: [{ criterionId: 'missing', weight: 1, role: 'level', params: {} }],
        },
      ],
    });
    const evaluation = evaluate(makeProfile(), grid, inMemoryCatalogue([]), { now: clock });
    const axisA = evaluation.axes[0];
    expect(axisA?.levelId).toBeUndefined();
    expect(axisA?.readings[0]?.evidence).toContain('no evaluator registered');
    expect(evaluation.global.levelId).toBeUndefined();
  });

  it('applies grid.evidenceFloor, and the grid wins over EvaluateOptions', () => {
    const bundle = [{ criterionId: 'fx', weight: 1, role: 'level' as const, params: {} }];
    const catalogue = inMemoryCatalogue([
      fixedEvaluator('fx', {
        levelId: 'l2',
        confidence: { agreement: 0.4, margin: 0.4, sufficiency: 0.4, singleSource: true },
      }),
    ]);
    const withFloor = makeGrid({ evidenceFloor: 0.6, axes: [{ id: 'a', label: 'A', bundle }] });

    // grid floor 0.6 > folded confidence 0.4 -> no level
    const gated = evaluate(makeProfile(), withFloor, catalogue, { now: clock });
    expect(gated.global.levelId).toBeUndefined();
    expect(gated.global.bindingAxisId).toBe('a');
    expect(gated.global.note.key).toBe('aggregate.confidence-below-floor');
    // the plan points at confidence, not "too few axes ruled"
    expect(gated.progression.bindingAxisId).toBe('a');
    expect(gated.progression.actions[0]?.key).toBe('progression.confidence-below-floor');

    // option would allow it, but the grid still wins
    const stillGated = evaluate(makeProfile(), withFloor, catalogue, { now: clock, evidenceFloor: 0 });
    expect(stillGated.global.levelId).toBeUndefined();

    // no grid floor -> the option applies
    const noGridFloor = makeGrid({ axes: [{ id: 'a', label: 'A', bundle }] });
    expect(evaluate(makeProfile(), noGridFloor, catalogue, { now: clock, evidenceFloor: 0.6 }).global.levelId).toBeUndefined();
    expect(evaluate(makeProfile(), noGridFloor, catalogue, { now: clock }).global.levelId).toBe('l2');
  });

  it('reports unknown when a criterion needs a profile section that is absent', () => {
    const grid = makeGrid({
      axes: [
        {
          id: 'a',
          label: 'A',
          bundle: [{ criterionId: 'needy', weight: 1, role: 'level', params: {} }],
        },
      ],
    });
    const needy = { ...fixedEvaluator('needy', { levelId: 'l1' }), needs: ['vcsActivity'] as const };
    const evaluation = evaluate(makeProfile(), grid, inMemoryCatalogue([needy]), { now: clock });
    expect(evaluation.axes[0]?.readings[0]?.evidence).toContain('vcsActivity');
  });
});
