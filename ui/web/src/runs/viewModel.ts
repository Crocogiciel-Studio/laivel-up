// The studio scores against grids the viewer package does not know, so it
// cannot reuse `@laivel-up/ui`'s `buildViewModel` as-is: that one resolves
// labels from a bundled grid list. This is the same transform, but the grid
// comes from the run's own snapshot. The label/message helpers are shared.
import { levelLabel, axisLabel, orderedLevelIds } from '@laivel-up/ui/grid';
import type { Grid } from '@laivel-up/ui/grid';
import { resolveMessage } from '@laivel-up/ui/messages';
import { t } from '@laivel-up/ui/i18n';
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

const pct = (confidence: number): number => Math.round(confidence * 100);
const has = <T>(v: T | null | undefined): v is T => v !== null && v !== undefined;

/** An `Evaluation` + the grid it was scored against -> the flat view model. */
export function buildRunViewModel(
  evaluation: Evaluation,
  gridSnapshot: unknown,
  lang: Lang = 'en',
): ViewModel {
  const grid = gridFromSnapshot(gridSnapshot);
  const bindingId = has(evaluation.global.bindingAxisId) ? evaluation.global.bindingAxisId : null;
  const progressionBinding = has(evaluation.progression.bindingAxisId)
    ? evaluation.progression.bindingAxisId
    : null;

  const axes = evaluation.axes.map((axis) => ({
    id: axis.axisId,
    name: axisLabel(grid, axis.axisId),
    level: levelLabel(grid, axis.levelId),
    ruled: has(axis.levelId),
    confidencePct: pct(axis.confidence),
    limitingFactor: t(lang, `factor.${axis.limitingFactor}`),
    binding: axis.axisId === bindingId,
    readings: axis.readings.map((r) => ({
      criterion: r.criterionId,
      role: t(lang, `role.${r.role}`),
      status: t(lang, `status.${r.status}`),
      ruled: r.status === 'read',
      level: levelLabel(grid, r.levelId),
      raw: has(r.rawValue) ? String(r.rawValue) : '—',
      confidencePct: pct(r.confidence),
      evidence: resolveMessage(r.evidence, lang),
    })),
  }));

  return {
    subjectId: evaluation.subjectId,
    gridId: evaluation.gridId,
    gridKnown: grid !== undefined,
    generatedAt: evaluation.generatedAt,
    verdict: {
      ruled: has(evaluation.global.levelId),
      level: levelLabel(grid, evaluation.global.levelId),
      confidencePct: pct(evaluation.global.confidence),
      bindingAxis: has(bindingId) ? axisLabel(grid, bindingId) : null,
      note: resolveMessage(evaluation.global.note, lang),
    },
    scale: orderedLevelIds(grid).map((id) => levelLabel(grid, id)),
    axes,
    progression: {
      targetLevel: levelLabel(grid, evaluation.progression.targetLevelId),
      bindingAxis: has(progressionBinding) ? axisLabel(grid, progressionBinding) : null,
      actions: evaluation.progression.actions.map((a) => resolveMessage(a, lang)),
    },
  };
}
