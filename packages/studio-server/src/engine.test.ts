import { describe, expect, it } from 'vitest';
import aiddGrid from '../../core/presets/aidd.json' with { type: 'json' };
import { runEvaluation } from './engine.js';

// Integration: exercises the real `laivel-up/compose` wiring. Needs the core
// built (`pnpm build` at the repo root); CI builds it before this runs.
describe('runEvaluation', () => {
  it('evaluates a minimal profile against the AIDD preset', () => {
    const outcome = runEvaluation(
      aiddGrid,
      { subject: { id: 'test-dev' }, declared: { stack: ['ts'], selfAssessedLevel: 'intermediate' } },
      {},
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.subjectId).toBe('test-dev');
    expect(Array.isArray(outcome.value.axes)).toBe(true);
  });

  it('rejects an invalid grid body', () => {
    const outcome = runEvaluation({}, { subject: { id: 'x' } }, {});
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.issues.length).toBeGreaterThan(0);
  });

  it('rejects an invalid profile body', () => {
    const outcome = runEvaluation(aiddGrid, { subject: {} }, {});
    expect(outcome.ok).toBe(false);
  });
});
