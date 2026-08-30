import { describe, expect, it } from 'vitest';
import { resolveMessage } from './messages';

describe('resolveMessage', () => {
  it('resolves a core key with its params in en and fr', () => {
    expect(resolveMessage({ key: 'aggregate.binding', params: { axis: 'size' } }, 'en')).toBe(
      'size is binding',
    );
    expect(resolveMessage({ key: 'aggregate.binding', params: { axis: 'size' } }, 'fr')).toBe(
      "size est l'axe contraignant",
    );
  });

  it('resolves a namespaced param value through the catalogue', () => {
    expect(
      resolveMessage(
        { key: 'progression.confidence-limited', params: { axis: 'Size', factor: 'factor.margin' } },
        'fr',
      ),
    ).toContain('la marge au seuil');
  });

  it('leaves an unfilled placeholder visible', () => {
    expect(resolveMessage({ key: 'aggregate.binding' }, 'en')).toBe('{axis} is binding');
  });

  it('falls back to the key when the catalogue has no entry', () => {
    expect(resolveMessage({ key: 'nope.missing' }, 'en')).toBe('nope.missing');
  });

  it('tolerates a plain string (pre-#42 evaluation.json)', () => {
    expect(resolveMessage('size is binding', 'en')).toBe('size is binding');
  });
});
