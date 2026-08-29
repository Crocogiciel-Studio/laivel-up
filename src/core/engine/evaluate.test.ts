import { describe, expect, it } from 'vitest';
import { evaluate } from './evaluate.js';
import { inMemoryCatalogue } from '../../adapters/catalogue/in-memory-catalogue.js';
import {
  fixedEvaluator,
  makeDossier,
  makeGrille,
} from '../../../test/support/factories.js';

const clock = (): Date => new Date('2026-08-29T00:00:00.000Z');

describe('evaluate', () => {
  it('runs dossier + grille + catalogue end to end into a resultat', () => {
    const grille = makeGrille({
      axes: [
        {
          id: 'a',
          label: 'A',
          faisceau: [{ criterionId: 'fx', weight: 1, role: 'level', params: {} }],
        },
        {
          id: 'b',
          label: 'B',
          faisceau: [{ criterionId: 'fy', weight: 1, role: 'level', params: {} }],
        },
      ],
    });
    const catalogue = inMemoryCatalogue([
      fixedEvaluator('fx', { levelId: 'l2' }),
      fixedEvaluator('fy', { levelId: 'l3' }),
    ]);

    const resultat = evaluate(makeDossier(), grille, catalogue, { now: clock });

    expect(resultat.subjectId).toBe('subj');
    expect(resultat.grilleId).toBe('test');
    expect(resultat.generatedAt).toBe('2026-08-29T00:00:00.000Z');
    expect(resultat.axes.map((a) => a.axisId)).toEqual(['a', 'b']);
    expect(resultat.global.levelId).toBe('l2'); // min across a=l2, b=l3
    expect(resultat.global.bindingAxisId).toBe('a');
    expect(resultat.progression.targetLevelId).toBe('l3');
  });

  it('marks an axis unknown when its criterion has no evaluator', () => {
    const grille = makeGrille({
      axes: [
        {
          id: 'a',
          label: 'A',
          faisceau: [{ criterionId: 'missing', weight: 1, role: 'level', params: {} }],
        },
      ],
    });
    const resultat = evaluate(makeDossier(), grille, inMemoryCatalogue([]), { now: clock });
    const axisA = resultat.axes[0];
    expect(axisA?.levelId).toBeUndefined();
    expect(axisA?.readings[0]?.evidence).toContain('no evaluator registered');
    expect(resultat.global.levelId).toBeUndefined();
  });

  it('reports unknown when a criterion needs a dossier section that is absent', () => {
    const grille = makeGrille({
      axes: [
        {
          id: 'a',
          label: 'A',
          faisceau: [{ criterionId: 'needy', weight: 1, role: 'level', params: {} }],
        },
      ],
    });
    const needy = { ...fixedEvaluator('needy', { levelId: 'l1' }), needs: ['vcsActivity'] as const };
    const resultat = evaluate(makeDossier(), grille, inMemoryCatalogue([needy]), { now: clock });
    expect(resultat.axes[0]?.readings[0]?.evidence).toContain('vcsActivity');
  });
});
