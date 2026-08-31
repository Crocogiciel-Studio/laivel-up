/**
 * The minimum of a grid the viewer needs: ordered levels (id -> label with its
 * emoji, rank) and axis labels. Bundled from the repo's default preset so the
 * viewer needs only an evaluation.json as input; an evaluation produced against
 * a different grid falls back to raw ids (see `resolveGrid`).
 */
import aiddPreset from 'laivel-up/presets/aidd.json';

export interface GridLevel {
  readonly id: string;
  readonly label: string;
  readonly rank: number;
}

export interface GridAxis {
  readonly id: string;
  readonly label: string;
}

export interface Grid {
  readonly id: string;
  readonly levels: readonly GridLevel[];
  readonly axes: readonly GridAxis[];
}

const AIDD: Grid = {
  id: aiddPreset.id,
  levels: aiddPreset.levels,
  axes: aiddPreset.axes.map((a) => ({ id: a.id, label: a.label })),
};

const KNOWN: readonly Grid[] = [AIDD];

/** The bundled grid whose id matches, or `undefined` — then the viewer shows ids. */
export function resolveGrid(gridId: string): Grid | undefined {
  return KNOWN.find((g) => g.id === gridId);
}

export function levelLabel(grid: Grid | undefined, levelId: string | null | undefined): string {
  if (levelId === null || levelId === undefined) return '—';
  return grid?.levels.find((l) => l.id === levelId)?.label ?? levelId;
}

export function axisLabel(grid: Grid | undefined, axisId: string): string {
  return grid?.axes.find((a) => a.id === axisId)?.label ?? axisId;
}

/** Ordered level ids (low -> high) for a progression scale, or `[]` when unknown. */
export function orderedLevelIds(grid: Grid | undefined): readonly string[] {
  if (grid === undefined) return [];
  return [...grid.levels].sort((a, b) => a.rank - b.rank).map((l) => l.id);
}
