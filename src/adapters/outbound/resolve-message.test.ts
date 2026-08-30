import { describe, expect, it } from 'vitest';
import { msg } from '../../core/model/evaluation.js';
import { resolveMessage, type MessageCatalogue } from './resolve-message.js';

const catalogue: MessageCatalogue = {
  'aggregate.binding': '{axis} is binding',
  'progression.raise-axis': 'Raise {axis} from {from} toward {to}.',
  'progression.confidence-limited': 'limited by {factor}',
  'factor.margin': 'margin to threshold',
  'plain': 'no placeholders here',
};

describe('resolveMessage', () => {
  it('fills every placeholder from params', () => {
    expect(resolveMessage(msg('progression.raise-axis', { axis: 'Size', from: 'Blue', to: 'Green' }), catalogue)).toBe(
      'Raise Size from Blue toward Green.',
    );
  });

  it('coerces numeric params to strings', () => {
    const c = { 'x': 'ruled {n}/{total}' };
    expect(resolveMessage(msg('x', { n: 1, total: 3 }), c)).toBe('ruled 1/3');
  });

  it('returns a no-placeholder template unchanged', () => {
    expect(resolveMessage(msg('plain'), catalogue)).toBe('no placeholders here');
  });

  it('leaves an unfilled placeholder visible', () => {
    expect(resolveMessage(msg('aggregate.binding'), catalogue)).toBe('{axis} is binding');
  });

  it('falls back to the key when the catalogue has no entry', () => {
    expect(resolveMessage(msg('unknown.key', { a: 1 }), catalogue)).toBe('unknown.key');
  });

  it('resolves a param value that is itself a namespaced catalogue key', () => {
    expect(resolveMessage(msg('progression.confidence-limited', { factor: 'factor.margin' }), catalogue)).toBe(
      'limited by margin to threshold',
    );
  });

  it('leaves a namespaced param untouched when the catalogue lacks it', () => {
    expect(resolveMessage(msg('progression.confidence-limited', { factor: 'factor.none' }), catalogue)).toBe(
      'limited by factor.none',
    );
  });
});
