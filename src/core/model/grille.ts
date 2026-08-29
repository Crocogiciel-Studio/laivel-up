/**
 * A grille (preset) is pure configuration: the ordered levels, the axes, which
 * criteria feed each axis and how heavily, and how readings fold into a verdict.
 * All calibration lives here — the same evaluator under a different grille yields
 * a different verdict. The core hardcodes no axis and no level.
 */

export interface GrilleLevel {
  readonly id: string;
  readonly label: string | undefined;
  /** Ordinal position, low → high. Ranks need not be contiguous. */
  readonly rank: number;
}

/** How a criterion's reading is used inside its axis. */
export type CriterionRole = 'level' | 'confidence' | 'cap';

export interface FaisceauEntry {
  readonly criterionId: string;
  readonly weight: number;
  readonly role: CriterionRole;
  /** Thresholds and knobs the criterion reads — its calibration surface. */
  readonly params: Readonly<Record<string, number>>;
}

export interface GrilleAxis {
  readonly id: string;
  readonly label: string | undefined;
  readonly faisceau: readonly FaisceauEntry[];
}

export type AxisAggregationMethod = 'confidence-weighted-vote';
export type GlobalAggregationMethod = 'min-across-axes';

export interface Grille {
  readonly id: string;
  readonly label: string | undefined;
  /** Ordered low → high by rank. */
  readonly levels: readonly GrilleLevel[];
  readonly axes: readonly GrilleAxis[];
  readonly axisAggregation: AxisAggregationMethod;
  readonly globalAggregation: GlobalAggregationMethod;
}

export function levelById(grille: Grille, id: string): GrilleLevel | undefined {
  return grille.levels.find((level) => level.id === id);
}

export function levelByRank(grille: Grille, rank: number): GrilleLevel | undefined {
  return grille.levels.find((level) => level.rank === rank);
}

export function orderedLevels(grille: Grille): readonly GrilleLevel[] {
  return [...grille.levels].sort((a, b) => a.rank - b.rank);
}

export function nextLevelUp(grille: Grille, rank: number): GrilleLevel | undefined {
  return orderedLevels(grille).find((level) => level.rank > rank);
}

export function axisById(grille: Grille, id: string): GrilleAxis | undefined {
  return grille.axes.find((axis) => axis.id === id);
}
