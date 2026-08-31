import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Ladder } from './Ladder.js';

const SCALE = ['Junior', 'Mid', 'Senior', 'Staff'];

describe('Ladder', () => {
  it('renders nothing when the scale is empty', () => {
    const { container } = render(<Ladder scale={[]} current="Mid" />);
    expect(container.firstChild).toBeNull();
  });

  it('marks the current level and grades the ones below it', () => {
    render(<Ladder scale={SCALE} current="Senior" />);
    const steps = screen.getByRole('list', { name: 'level scale' }).querySelectorAll('li');
    expect([...steps].map((s) => s.className.replace('ladder-step ', ''))).toEqual([
      'below',
      'below',
      'here',
      'above',
    ]);
    expect(screen.getByText('Senior').closest('li')?.getAttribute('aria-current')).toBe('step');
  });

  it('grades every step as none when no level was ruled', () => {
    render(<Ladder scale={SCALE} current={null} />);
    const steps = screen.getByRole('list', { name: 'level scale' }).querySelectorAll('li');
    expect([...steps].every((s) => s.className.includes('none'))).toBe(true);
  });
});
