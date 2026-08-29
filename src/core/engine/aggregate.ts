import type { Grid } from '../model/grid.js';
import { levelById } from '../model/grid.js';
import type { AxisVerdict, GlobalVerdict } from '../model/evaluation.js';

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
      note:
        `evidence bar not met: ${String(ruled.length)}/${String(grid.axes.length)} ` +
        `axes could be ruled on, ${String(minRuledAxes)} required`,
    };
  }

  const binding = [...ruled].sort((a, b) => a.levelRank - b.levelRank)[0];
  if (binding === undefined) {
    return {
      levelId: undefined,
      levelRank: undefined,
      confidence: 0,
      bindingAxisId: undefined,
      note: 'no axis could be ruled on',
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
        ? `ruled on ${String(ruled.length)}/${String(grid.axes.length)} axes; ` +
          `${binding.axisId} is binding`
        : `${binding.axisId} is binding`,
  };
}
