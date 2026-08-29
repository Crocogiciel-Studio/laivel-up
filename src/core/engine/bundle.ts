import type { Grid, GridAxis } from '../model/grid.js';
import { levelByRank } from '../model/grid.js';
import type { AxisVerdict, CriterionReading, LimitingFactor } from '../model/evaluation.js';
import { weakestOf } from './confidence.js';

/**
 * Axis verdict = a confidence-weighted vote across the axis bundle.
 *
 * Each `level` reading drops `weight × confidence` onto the level it read. The
 * winning level is the heaviest bucket. Axis confidence is the weakest of:
 *  - agreement: how concentrated the vote is on the winner
 *  - margin:    how far the winner leads the runner-up
 *  - sufficiency: how much of the intended bundle actually produced a reading
 * `cap` readings clamp the winner down; `confidence` readings only pull the axis
 * confidence down when they disagree.
 */
export function runBundle(
  grid: Grid,
  axis: GridAxis,
  readings: readonly CriterionReading[],
): AxisVerdict {
  const weightOf = (criterionId: string): number =>
    axis.bundle.find((entry) => entry.criterionId === criterionId)?.weight ?? 0;

  const levelReads = readings.filter(
    (r) => r.role === 'level' && r.status === 'read' && r.levelId !== undefined,
  );
  const levelEntryCount = axis.bundle.filter((entry) => entry.role === 'level').length;

  if (levelReads.length === 0) {
    return {
      axisId: axis.id,
      levelId: undefined,
      levelRank: undefined,
      confidence: 0,
      limitingFactor: 'sufficiency',
      readings,
    };
  }

  const buckets = new Map<string, number>();
  let totalMass = 0;
  for (const reading of levelReads) {
    const levelId = reading.levelId;
    if (levelId === undefined) continue;
    const mass = weightOf(reading.criterionId) * reading.confidence;
    buckets.set(levelId, (buckets.get(levelId) ?? 0) + mass);
    totalMass += mass;
  }

  const ranked = [...buckets.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    const rankA = grid.levels.find((l) => l.id === a[0])?.rank ?? 0;
    const rankB = grid.levels.find((l) => l.id === b[0])?.rank ?? 0;
    return rankA - rankB;
  });

  const winner = ranked[0] ?? ['', 0];
  const runnerUp = ranked[1]?.[1] ?? 0;
  const winnerId = winner[0];
  const winnerMass = winner[1];

  const agreement = totalMass > 0 ? winnerMass / totalMass : 0;
  const margin = winnerMass > 0 ? (winnerMass - runnerUp) / winnerMass : 0;
  const readMass = levelReads.reduce((sum, r) => sum + r.confidence, 0);
  const sufficiency = levelEntryCount > 0 ? Math.min(1, readMass / levelEntryCount) : 0;

  let folded = weakestOf([
    ['agreement', agreement],
    ['margin', margin],
    ['sufficiency', sufficiency],
  ]);

  let levelId = winnerId;
  let levelRank = grid.levels.find((l) => l.id === winnerId)?.rank;

  // cap readings clamp the axis down
  for (const reading of readings) {
    if (
      reading.role === 'cap' &&
      reading.status === 'read' &&
      reading.levelRank !== undefined &&
      levelRank !== undefined &&
      reading.levelRank < levelRank
    ) {
      levelRank = reading.levelRank;
      levelId = levelByRank(grid, reading.levelRank)?.id ?? reading.levelId ?? levelId;
      folded = weakestOf([
        [folded.limitingFactor, folded.value],
        ['margin', reading.confidence],
      ]);
    }
  }

  // confidence readings only bite when they contradict the winner
  for (const reading of readings) {
    if (
      reading.role === 'confidence' &&
      reading.status === 'read' &&
      reading.levelId !== undefined &&
      reading.levelId !== levelId
    ) {
      folded = weakestOf([
        [folded.limitingFactor, folded.value],
        ['agreement', reading.confidence],
      ]);
    }
  }

  const limitingFactor: LimitingFactor = folded.value >= 1 ? 'none' : folded.limitingFactor;

  return {
    axisId: axis.id,
    levelId,
    levelRank,
    confidence: folded.value,
    limitingFactor,
    readings,
  };
}
