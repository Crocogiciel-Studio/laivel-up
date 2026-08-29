import type { Grille } from '../model/grille.js';
import { axisById, levelById, nextLevelUp } from '../model/grille.js';
import type { AxisVerdict, GlobalVerdict, ProgressionPlan } from '../model/resultat.js';

/**
 * The plan points at the one move that raises the global level: close the gap on
 * the binding axis to its next level up. Concrete per-criterion actions come
 * once real criteria are wired; for now the plan names the axis, the target, and
 * the check that is currently limiting confidence.
 */
export function planProgression(
  grille: Grille,
  global: GlobalVerdict,
  axes: readonly AxisVerdict[],
): ProgressionPlan {
  if (global.bindingAxisId === undefined || global.levelRank === undefined) {
    return {
      targetLevelId: undefined,
      bindingAxisId: undefined,
      actions: [
        'Provide more of the dossier: too few axes could be ruled on to place a level.',
      ],
    };
  }

  const bindingAxis = axisById(grille, global.bindingAxisId);
  const bindingVerdict = axes.find((axis) => axis.axisId === global.bindingAxisId);
  const target = nextLevelUp(grille, global.levelRank);
  const currentLabel =
    levelById(grille, global.levelId ?? '')?.label ?? global.levelId ?? 'current level';
  const axisLabel = bindingAxis?.label ?? global.bindingAxisId;

  if (target === undefined) {
    return {
      targetLevelId: undefined,
      bindingAxisId: global.bindingAxisId,
      actions: [`Top level reached on the binding axis ${axisLabel}.`],
    };
  }

  const actions = [
    `Raise ${axisLabel} from ${currentLabel} toward ${target.label ?? target.id}.`,
  ];
  if (bindingVerdict !== undefined && bindingVerdict.limitingFactor !== 'none') {
    actions.push(
      `Confidence on ${axisLabel} is limited by ${bindingVerdict.limitingFactor}; ` +
        `add evidence that addresses it.`,
    );
  }

  return {
    targetLevelId: target.id,
    bindingAxisId: global.bindingAxisId,
    actions,
  };
}
