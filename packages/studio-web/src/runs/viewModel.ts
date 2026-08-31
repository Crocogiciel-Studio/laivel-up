// The studio scores against grids the viewer package does not bundle, so it
// resolves labels from the run's own grid snapshot. The transform itself is
// `@laivel-up/ui`'s `buildViewModelFor`, given that snapshot as the grid.
import { buildViewModelFor } from '@laivel-up/ui/view-model';
import type { Grid } from '@laivel-up/ui/grid';
import type { Lang } from '@laivel-up/ui/i18n';
import type { ViewModel } from '@laivel-up/ui/view-model';
import type { Evaluation } from '@laivel-up/ui/evaluation';

interface SnapshotLevel {
  readonly id: string;
  readonly label?: string;
  readonly rank: number;
}
interface SnapshotAxis {
  readonly id: string;
  readonly label?: string;
}
interface SnapshotGrid {
  readonly id?: string;
  readonly levels?: readonly SnapshotLevel[];
  readonly axes?: readonly SnapshotAxis[];
}

/** The run's grid snapshot, narrowed to the shape the view model needs. */
export function gridFromSnapshot(snapshot: unknown): Grid | undefined {
  if (typeof snapshot !== 'object' || snapshot === null) return undefined;
  const g = snapshot as SnapshotGrid;
  if (typeof g.id !== 'string' || !Array.isArray(g.levels)) return undefined;
  return {
    id: g.id,
    levels: g.levels.map((l) => ({ id: l.id, label: l.label ?? l.id, rank: l.rank })),
    axes: (g.axes ?? []).map((a) => ({ id: a.id, label: a.label ?? a.id })),
  };
}

/** An `Evaluation` + the grid snapshot it was scored against -> the flat view model. */
export function buildRunViewModel(
  evaluation: Evaluation,
  gridSnapshot: unknown,
  lang: Lang = 'en',
): ViewModel {
  return buildViewModelFor(evaluation, gridFromSnapshot(gridSnapshot), lang);
}
