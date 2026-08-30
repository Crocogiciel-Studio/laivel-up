/**
 * Pure transform: an Evaluation (+ the grid it was scored against) into a flat
 * view model the DOM layer renders. All display strings are resolved here so the
 * rendering stays mechanical and this stays unit-testable without a DOM.
 *
 * `evidence`, `note` and progression `actions` are `{ key, params }` descriptors
 * resolved against the bundled core catalogue. Everything the UI itself labels
 * goes through `t`.
 */
import type { Evaluation } from './evaluation';
import { type Grid, resolveGrid, levelLabel, axisLabel, orderedLevelIds } from './grid';
import { resolveMessage } from './messages';
import { t, type Lang } from './i18n';

export interface ReadingRow {
  readonly criterion: string;
  readonly role: string;
  readonly status: string;
  readonly ruled: boolean;
  readonly level: string;
  readonly raw: string;
  readonly confidencePct: number;
  readonly evidence: string;
}

export interface AxisCard {
  readonly id: string;
  readonly name: string;
  readonly level: string;
  readonly ruled: boolean;
  readonly confidencePct: number;
  readonly limitingFactor: string;
  readonly binding: boolean;
  readonly readings: readonly ReadingRow[];
}

export interface ViewModel {
  readonly subjectId: string;
  readonly gridId: string;
  readonly gridKnown: boolean;
  readonly generatedAt: string;
  readonly verdict: {
    readonly ruled: boolean;
    readonly level: string;
    readonly confidencePct: number;
    readonly bindingAxis: string | null;
    readonly note: string;
  };
  readonly scale: readonly string[];
  readonly axes: readonly AxisCard[];
  readonly progression: {
    readonly targetLevel: string;
    readonly bindingAxis: string | null;
    readonly actions: readonly string[];
  };
}

const pct = (confidence: number): number => Math.round(confidence * 100);
const has = <T>(v: T | null | undefined): v is T => v !== null && v !== undefined;

export function buildViewModel(evaluation: Evaluation, lang: Lang): ViewModel {
  const grid: Grid | undefined = resolveGrid(evaluation.gridId);
  const bindingId = has(evaluation.global.bindingAxisId) ? evaluation.global.bindingAxisId : null;
  const progressionBinding = has(evaluation.progression.bindingAxisId)
    ? evaluation.progression.bindingAxisId
    : null;

  const axes: AxisCard[] = evaluation.axes.map((axis) => ({
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
