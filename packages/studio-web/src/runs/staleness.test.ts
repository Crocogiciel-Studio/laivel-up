import { describe, expect, it } from 'vitest';
import { gridFreshness, profileFreshness, stableStringify } from './staleness.js';

describe('stableStringify', () => {
  it('is insensitive to key order', () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }));
  });
  it('drops undefined members, keeps nested arrays ordered', () => {
    expect(stableStringify({ a: undefined, b: [3, 1] })).toBe('{"b":[3,1]}');
  });
});

describe('gridFreshness', () => {
  const snapshot = { id: 'g1', levels: [{ id: 'low', rank: 0 }] };

  it('is current when a saved grid matches byte-for-byte', () => {
    expect(gridFreshness(snapshot, [{ body: { levels: [{ rank: 0, id: 'low' }], id: 'g1' } }])).toBe(
      'current',
    );
  });
  it('is changed when the saved grid with the same id differs', () => {
    expect(
      gridFreshness(snapshot, [{ body: { id: 'g1', levels: [{ id: 'low', rank: 0 }, { id: 'hi', rank: 1 }] } }]),
    ).toBe('changed');
  });
  it('is unlinked when no saved grid carries that id', () => {
    expect(gridFreshness(snapshot, [{ body: { id: 'other' } }])).toBe('unlinked');
    expect(gridFreshness({ nope: true }, [])).toBe('unlinked');
  });
});

describe('profileFreshness', () => {
  const snapshot = { subject: { id: 'dev-x' }, declared: { stack: ['ts'] } };

  it('matches on subject id and compares the body', () => {
    expect(
      profileFreshness(snapshot, [{ body: { declared: { stack: ['ts'] }, subject: { id: 'dev-x' } } }]),
    ).toBe('current');
    expect(
      profileFreshness(snapshot, [{ body: { subject: { id: 'dev-x' }, declared: { stack: ['go'] } } }]),
    ).toBe('changed');
    expect(profileFreshness(snapshot, [{ body: { subject: { id: 'dev-y' } } }])).toBe('unlinked');
  });
});
