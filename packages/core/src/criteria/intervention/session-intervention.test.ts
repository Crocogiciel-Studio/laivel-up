import { describe, expect, it } from 'vitest';
import { sessionIntervention } from './session-intervention.js';
import { makeProfile, makeGrid } from '../../../test/support/factories.js';
import type { WorkSession } from '../../core/model/profile.js';

const grid = makeGrid();

function run(
  ws: Partial<WorkSession>,
  params: Record<string, number> = {},
): ReturnType<typeof sessionIntervention.evaluate> {
  return sessionIntervention.evaluate({
    profile: makeProfile({
      available: ['workSession'],
      workSession: {
        promptToCommitSteps: undefined,
        humanInterventionsMidTask: undefined,
        framingOnly: undefined,
        rawText: undefined,
        ...ws,
      },
    }),
    grid,
    axisId: 'intervention',
    params,
  });
}

describe('sessionIntervention', () => {
  it('reads band 1 (mid-task some) like bohort — a few reprises over the session', () => {
    const out = run({ promptToCommitSteps: 6, humanInterventionsMidTask: 2, framingOnly: false });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l2');
      expect(out.value.rawValue).toBe('mid-task-some');
      expect(out.value.confidence.singleSource).toBe(true);
      expect(out.value.confidence.sufficiency).toBe(0.7);
      expect(out.value.confidence.margin).toBeGreaterThan(0.3);
    }
  });

  it('reads band 2 (framing mostly) like arthur — framing plus a key-stage reprise', () => {
    const out = run({ promptToCommitSteps: 3, humanInterventionsMidTask: 1, framingOnly: false });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l4');
      expect(out.value.rawValue).toBe('framing-mostly');
      expect(out.value.confidence.margin).toBeGreaterThan(0);
    }
  });

  it('reads band 0 (mid-task heavy) when corrections pile up past interventionsMost', () => {
    const out = run({ promptToCommitSteps: 8, humanInterventionsMidTask: 6 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l1');
      expect(out.value.rawValue).toBe('mid-task-heavy');
    }
  });

  it('caps a framing-only, zero-correction run at band 2 — it never reads above rankKeyStages', () => {
    const out = run({ promptToCommitSteps: 4, humanInterventionsMidTask: 0, framingOnly: true });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l4');
      expect(out.value.rawValue).toBe('framing-mostly');
    }
  });

  it('does not treat framingOnly as band 3 when corrections were still detected', () => {
    const out = run({ promptToCommitSteps: 5, humanInterventionsMidTask: 2, framingOnly: true });
    expect(out.ok && out.value.levelId).toBe('l2');
    expect(out.ok && out.value.rawValue).toBe('mid-task-some');
  });

  it('honours the grid calibration for the band ranks', () => {
    const out = run({ humanInterventionsMidTask: 6 }, { rankAfterMost: 5 });
    expect(out.ok && out.value.levelId).toBe('l5');
  });

  it('reads the boundary value exactly at interventionsSome as band 2', () => {
    const out = run({ humanInterventionsMidTask: 1 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.rawValue).toBe('framing-mostly');
      expect(out.value.confidence.margin).toBeGreaterThan(0);
    }
  });

  it('reads the boundary value exactly at interventionsMost as band 1', () => {
    const out = run({ humanInterventionsMidTask: 3 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.rawValue).toBe('mid-task-some');
      expect(out.value.confidence.margin).toBeGreaterThan(0);
    }
  });

  it('is more confident at the centre of band 1 than at its edges', () => {
    const centre = run({ humanInterventionsMidTask: 2 });
    const edge = run({ humanInterventionsMidTask: 3 });
    expect(centre.ok && edge.ok).toBe(true);
    if (centre.ok && edge.ok) {
      expect(centre.value.rawValue).toBe('mid-task-some');
      expect(edge.value.rawValue).toBe('mid-task-some');
      expect(centre.value.confidence.margin).toBeGreaterThan(edge.value.confidence.margin);
    }
  });

  it('returns missing-piece when there is no work session', () => {
    const out = sessionIntervention.evaluate({
      profile: makeProfile({ available: ['workSession'], workSession: undefined }),
      grid,
      axisId: 'intervention',
      params: {},
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.kind).toBe('missing-piece');
  });

  it('returns missing-piece when the heuristics produced nothing exploitable', () => {
    const out = run({ rawText: 'some free text with no turn structure' });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.kind).toBe('missing-piece');
  });
});
