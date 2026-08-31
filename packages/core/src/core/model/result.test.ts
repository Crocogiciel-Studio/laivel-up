import { describe, expect, it } from 'vitest';
import { all, err, isErr, isOk, mapOk, ok } from './result.js';
import type { Result } from './result.js';

describe('Result', () => {
  it('wraps a value with ok', () => {
    const r: Result<number, string> = ok(42);
    expect(isOk(r)).toBe(true);
    expect(isErr(r)).toBe(false);
    expect(r.ok ? r.value : null).toBe(42);
  });

  it('wraps an error with err', () => {
    const r: Result<number, string> = err('nope');
    expect(isErr(r)).toBe(true);
    expect(r.ok ? null : r.error).toBe('nope');
  });

  it('maps only the ok branch', () => {
    expect(mapOk(ok(2), (n) => n * 3)).toEqual(ok(6));
    expect(mapOk(err('e'), (n: number) => n * 3)).toEqual(err('e'));
  });

  it('all collects values and short-circuits on the first error', () => {
    expect(all([ok(1), ok(2), ok(3)])).toEqual(ok([1, 2, 3]));
    expect(all([ok(1), err('bad'), ok(3)])).toEqual(err('bad'));
  });
});
