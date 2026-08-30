import type { Grid } from '../model/grid.js';
import { levelById } from '../model/grid.js';
import type { AxisVerdict, GlobalVerdict } from '../model/evaluation.js';
import { msg } from '../model/evaluation.js';

/**
 * Global level = the lowest axis level — a level is reached only if every axis
 * reaches it. The binding axis is the one holding the subject back. Global
 * confidence is the weakest link between the binding axis's own confidence and
 * how many axes could be ruled on at all (coverage).
 */
export function aggregate(
  grid: Grid,
  axes: readonly AxisVerdict[],
  minRuledAxes: number,
): GlobalVerdict {
  const ruled = axes.filter(
    (axis): axis is AxisVerdict & { levelRank: number } => axis.levelRank !== undefined,
  );

  const coverage = grid.axes.length > 0 ? ruled.length / grid.axes.length : 0;

  if (ruled.length === 0 || ruled.length < minRuledAxes) {
    return {
      levelId: undefined,
      levelRank: undefined,
      confidence: 0,
      bindingAxisId: undefined,
      note: msg('aggregate.evidence-bar-not-met', {
        ruled: ruled.length,
        total: grid.axes.length,
        required: minRuledAxes,
      }),
    };
  }

  const binding = [...ruled].sort((a, b) => a.levelRank - b.levelRank)[0];
  if (binding === undefined) {
    return {
      levelId: undefined,
      levelRank: undefined,
      confidence: 0,
      bindingAxisId: undefined,
      note: msg('aggregate.no-axis-ruled'),
    };
  }

  const level = levelById(grid, binding.levelId ?? '');
  const confidence = Math.min(binding.confidence, coverage);

  return {
    levelId: level?.id ?? binding.levelId,
    levelRank: binding.levelRank,
    confidence,
    bindingAxisId: binding.axisId,
    note:
      coverage < 1
        ? msg('aggregate.binding-partial-coverage', {
            ruled: ruled.length,
            total: grid.axes.length,
            axis: binding.axisId,
          })
        : msg('aggregate.binding', { axis: binding.axisId }),
  };
}
