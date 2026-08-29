import type { Grid, GridAxis } from '../model/grid.js';
import { levelByRank } from '../model/grid.js';
import type { AxisVerdict, CriterionReading } from '../model/evaluation.js';
import type { FoldedConfidence } from './confidence.js';
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
  const levelReads = readings.filter(isLevelRead);
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

  const levelEntryCount = axis.bundle.filter((entry) => entry.role === 'level').length;
  const { buckets, totalMass } = tallyVotes(levelReads, axis);
  const ranked = rankByMassThenRank(buckets, grid);

  const winner = ranked[0];
  const winnerId = winner?.[0] ?? '';
  const winnerMass = winner?.[1] ?? 0;
  const runnerUpMass = ranked[1]?.[1] ?? 0;

  const readMass = levelReads.reduce((sum, r) => sum + r.confidence, 0);
  const initial = weakestOf([
    ['agreement', totalMass > 0 ? winnerMass / totalMass : 0],
    ['margin', winnerMass > 0 ? (winnerMass - runnerUpMass) / winnerMass : 0],
    ['sufficiency', levelEntryCount > 0 ? Math.min(1, readMass / levelEntryCount) : 0],
  ]);

  const winnerRank = grid.levels.find((l) => l.id === winnerId)?.rank;
  const capped = applyCaps(readings, grid, winnerId, winnerRank, initial);
  const folded = applyContradictions(axis, readings, capped.levelId, capped.levelRank, capped.folded);

  return {
    axisId: axis.id,
    levelId: capped.levelId,
    levelRank: capped.levelRank,
    confidence: folded.value,
    limitingFactor: folded.value >= 1 ? 'none' : folded.limitingFactor,
    readings,
  };
}

type Vote = readonly [levelId: string, mass: number];

function isLevelRead(reading: CriterionReading): boolean {
  return (
    reading.role === 'level' && reading.status === 'read' && reading.levelId !== undefined
  );
}

/** Sum `weight × confidence` per level; return the buckets and their total. */
function tallyVotes(
  levelReads: readonly CriterionReading[],
  axis: GridAxis,
): { buckets: Map<string, number>; totalMass: number } {
  const weightOf = (criterionId: string): number =>
    axis.bundle.find((entry) => entry.criterionId === criterionId)?.weight ?? 0;

  const buckets = new Map<string, number>();
  let totalMass = 0;
  for (const reading of levelReads) {
    if (reading.levelId === undefined) continue;
    const mass = weightOf(reading.criterionId) * reading.confidence;
    buckets.set(reading.levelId, (buckets.get(reading.levelId) ?? 0) + mass);
    totalMass += mass;
  }
  return { buckets, totalMass };
}

/** Heaviest bucket first; ties broken by the lower grid rank. */
function rankByMassThenRank(buckets: Map<string, number>, grid: Grid): Vote[] {
  const rankOf = (levelId: string): number =>
    grid.levels.find((l) => l.id === levelId)?.rank ?? 0;
  return [...buckets.entries()].sort(([idA, massA], [idB, massB]) =>
    massB === massA ? rankOf(idA) - rankOf(idB) : massB - massA,
  );
}

/** A `cap` reading pulls the elected level down to its own, never up. */
function applyCaps(
  readings: readonly CriterionReading[],
  grid: Grid,
  levelId: string,
  levelRank: number | undefined,
  folded: FoldedConfidence,
): { levelId: string; levelRank: number | undefined; folded: FoldedConfidence } {
  let id = levelId;
  let rank = levelRank;
  let confidence = folded;
  for (const reading of readings) {
    if (!capsBelow(reading, rank)) continue;
    rank = reading.levelRank;
    id = levelByRank(grid, reading.levelRank)?.id ?? reading.levelId ?? id;
    confidence = weakestOf([
      [confidence.limitingFactor, confidence.value],
      ['margin', reading.confidence],
    ]);
  }
  return { levelId: id, levelRank: rank, folded: confidence };
}

function capsBelow(
  reading: CriterionReading,
  currentRank: number | undefined,
): reading is CriterionReading & { levelRank: number } {
  return (
    reading.role === 'cap' &&
    reading.status === 'read' &&
    reading.levelRank !== undefined &&
    currentRank !== undefined &&
    reading.levelRank < currentRank
  );
}

/** A `confidence` reading only bites when it disagrees with the elected level. */
function applyContradictions(
  axis: GridAxis,
  readings: readonly CriterionReading[],
  levelId: string,
  levelRank: number | undefined,
  folded: FoldedConfidence,
): FoldedConfidence {
  let confidence = folded;
  for (const reading of readings) {
    if (!contradicts(reading, levelId)) continue;
    confidence = weakestOf([
      [confidence.limitingFactor, confidence.value],
      ['agreement', contradictionStrength(axis, reading, levelRank)],
    ]);
  }
  return confidence;
}

/**
 * How hard a contradicting `confidence` reading pulls the axis confidence down.
 * By default it is the reading's own folded confidence — how sure that criterion
 * is of the tier it read. A bundle entry may instead opt into a rank-gap model
 * by declaring a `contradictionSlope` param: the strength then falls off
 * linearly with the distance between the level the reading points at and the one
 * the axis elected, `max(0, 1 - slope * |readingRank - electedRank|)`.
 */
function contradictionStrength(
  axis: GridAxis,
  reading: CriterionReading,
  electedRank: number | undefined,
): number {
  const slope = axis.bundle.find((entry) => entry.criterionId === reading.criterionId)?.params
    .contradictionSlope;
  if (slope === undefined || reading.levelRank === undefined || electedRank === undefined) {
    return reading.confidence;
  }
  const gap = Math.abs(reading.levelRank - electedRank);
  return Math.max(0, 1 - slope * gap);
}

function contradicts(reading: CriterionReading, levelId: string): boolean {
  return (
    reading.role === 'confidence' &&
    reading.status === 'read' &&
    reading.levelId !== undefined &&
    reading.levelId !== levelId
  );
}
