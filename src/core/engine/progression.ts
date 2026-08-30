import type { Grid } from '../model/grid.js';
import { axisById, levelById, nextLevelUp } from '../model/grid.js';
import type { AxisVerdict, GlobalVerdict, Message, ProgressionPlan } from '../model/evaluation.js';
import { msg } from '../model/evaluation.js';

/**
 * The plan points at the one move that raises the global level: close the gap on
 * the binding axis to its next level up. Concrete per-criterion actions come
 * once real criteria are wired; for now the plan names the axis, the target, and
 * the check that is currently limiting confidence.
 */
export function planProgression(
  grid: Grid,
  global: GlobalVerdict,
  axes: readonly AxisVerdict[],
): ProgressionPlan {
  if (global.bindingAxisId === undefined || global.levelRank === undefined) {
    return {
      targetLevelId: undefined,
      bindingAxisId: undefined,
      actions: [msg('progression.insufficient-axes')],
    };
  }

  const bindingAxis = axisById(grid, global.bindingAxisId);
  const bindingVerdict = axes.find((axis) => axis.axisId === global.bindingAxisId);
  const target = nextLevelUp(grid, global.levelRank);
  const currentLabel =
    levelById(grid, global.levelId ?? '')?.label ?? global.levelId ?? 'current level';
  const axisLabel = bindingAxis?.label ?? global.bindingAxisId;

  if (target === undefined) {
    return {
      targetLevelId: undefined,
      bindingAxisId: global.bindingAxisId,
      actions: [msg('progression.top-level', { axis: axisLabel })],
    };
  }

  const actions: Message[] = [
    msg('progression.raise-axis', {
      axis: axisLabel,
      from: currentLabel,
      to: target.label ?? target.id,
    }),
  ];
  if (bindingVerdict !== undefined && bindingVerdict.limitingFactor !== 'none') {
    actions.push(
      msg('progression.confidence-limited', {
        axis: axisLabel,
        factor: `factor.${bindingVerdict.limitingFactor}`,
      }),
    );
  }

  return {
    targetLevelId: target.id,
    bindingAxisId: global.bindingAxisId,
    actions,
  };
}
