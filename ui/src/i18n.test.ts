import { describe, expect, it } from 'vitest';
import { t } from './i18n';

describe('t', () => {
  it('resolves a key in the requested language', () => {
    expect(t('fr', 'lang.label')).toBe('Langue');
    expect(t('en', 'lang.label')).toBe('Language');
  });

  it('substitutes named placeholders', () => {
    expect(t('en', 'loaded.ok', { subject: 'arthur', grid: 'aidd' })).toBe(
      'Loaded evaluation for arthur (grid aidd).',
    );
  });

  it('leaves an unfilled placeholder visible rather than dropping it', () => {
    expect(t('en', 'loaded.ok', { subject: 'arthur' })).toBe(
      'Loaded evaluation for arthur (grid {grid}).',
    );
  });

  it('falls back to the key itself when it exists in no catalogue', () => {
    expect(t('fr', 'nope.not.here')).toBe('nope.not.here');
  });
});
