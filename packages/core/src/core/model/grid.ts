/**
 * A grid (preset) is pure configuration: the ordered levels, the axes, which
 * criteria feed each axis and how heavily, and how readings fold into a verdict.
 * All calibration lives here — the same evaluator under a different grid yields
 * a different verdict. The core hardcodes no axis and no level.
 */

export interface GridLevel {
  readonly id: string;
  readonly label: string | undefined;
  /** Ordinal position, low → high. Ranks need not be contiguous. */
  readonly rank: number;
}

/** How a criterion's reading is used inside its axis. */
export type CriterionRole = 'level' | 'confidence' | 'cap';

export interface BundleEntry {
  readonly criterionId: string;
  readonly weight: number;
  readonly role: CriterionRole;
  /** Thresholds and knobs the criterion reads — its calibration surface. */
  readonly params: Readonly<Record<string, number>>;
}

export interface GridAxis {
  readonly id: string;
  readonly label: string | undefined;
  readonly bundle: readonly BundleEntry[];
}

export type AxisAggregationMethod = 'confidence-weighted-vote';
export type GlobalAggregationMethod = 'min-across-axes';

export interface Grid {
  readonly id: string;
  readonly label: string | undefined;
  /** Ordered low → high by rank. */
  readonly levels: readonly GridLevel[];
  readonly axes: readonly GridAxis[];
  readonly axisAggregation: AxisAggregationMethod;
  readonly globalAggregation: GlobalAggregationMethod;
  /**
   * Minimum global confidence `[0,1]` to emit a level at all. Below it the
   * engine returns no level (the evidence is too thin to place one), keeping the
   * binding axis for diagnosis. Absent or `0` disables the gate.
   */
  readonly evidenceFloor: number | undefined;
}

export function levelById(grid: Grid, id: string): GridLevel | undefined {
  return grid.levels.find((level) => level.id === id);
}

export function levelByRank(grid: Grid, rank: number): GridLevel | undefined {
  return grid.levels.find((level) => level.rank === rank);
}

export function orderedLevels(grid: Grid): readonly GridLevel[] {
  return [...grid.levels].sort((a, b) => a.rank - b.rank);
}

export function nextLevelUp(grid: Grid, rank: number): GridLevel | undefined {
  return orderedLevels(grid).find((level) => level.rank > rank);
}

export function axisById(grid: Grid, id: string): GridAxis | undefined {
  return grid.axes.find((axis) => axis.id === id);
}
