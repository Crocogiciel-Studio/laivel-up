import { describe, expect, it } from 'vitest';
import { parseEvaluation } from './evaluation';

const valid = {
  subjectId: 'dev-sample',
  gridId: 'aidd',
  global: { confidence: 0.5, note: 'x' },
  axes: [],
  progression: { actions: [] },
  generatedAt: '2026-08-30T00:00:00.000Z',
};

describe('parseEvaluation', () => {
  it('accepts a well-formed evaluation', () => {
    const result = parseEvaluation(JSON.stringify(valid));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.subjectId).toBe('dev-sample');
    }
  });

  it('rejects text that is not JSON', () => {
    const result = parseEvaluation('{ not json');
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) {
      expect(result.error).toMatch(/^not valid JSON:/);
    }
  });

  it('rejects a JSON scalar', () => {
    expect(parseEvaluation('42')).toEqual({ ok: false, error: 'expected a JSON object' });
  });

  it('rejects JSON null', () => {
    expect(parseEvaluation('null')).toEqual({ ok: false, error: 'expected a JSON object' });
  });

  it.each(['subjectId', 'gridId', 'global', 'axes', 'progression'])(
    'rejects an object missing "%s"',
    (key) => {
      const rest: Record<string, unknown> = { ...valid };
      delete rest[key];
      const result = parseEvaluation(JSON.stringify(rest));
      expect(result).toEqual({
        ok: false,
        error: `missing "${key}" — is this a laivel-up evaluation?`,
      });
    },
  );

  it('rejects a non-array "axes"', () => {
    const result = parseEvaluation(JSON.stringify({ ...valid, axes: {} }));
    expect(result).toEqual({ ok: false, error: '"axes" must be an array' });
  });
});
