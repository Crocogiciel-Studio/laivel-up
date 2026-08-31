import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GridBuilder } from './GridBuilder.js';
import { emptyGrid } from './preset.js';
import type { CatalogueEntry } from './gridApi.js';

const catalogue: CatalogueEntry[] = [
  { id: 'pr-feature-size', needs: ['vcsActivity'], paramDefaults: { rankS: 1, linesS: 120 } },
  { id: 'commit-discipline', needs: ['vcsActivity'], paramDefaults: { aiFloorSoft: 0.35 } },
];

function seed() {
  const g = emptyGrid();
  g.gridId = 'demo';
  g.levels = [
    { id: 'low', label: '' },
    { id: 'high', label: '' },
  ];
  return g;
}

describe('GridBuilder', () => {
  it('adds a criterion to an axis with its param defaults pre-filled', () => {
    const onSave = vi.fn();
    render(
      <GridBuilder
        initial={seed()}
        catalogue={catalogue}
        saving={false}
        error={null}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('add criterion to axis 1'), {
      target: { value: 'pr-feature-size' },
    });

    // param inputs appear, seeded from paramDefaults
    expect((screen.getByLabelText('pr-feature-size rankS') as HTMLInputElement).value).toBe('1');
    expect((screen.getByLabelText('pr-feature-size linesS') as HTMLInputElement).value).toBe('120');

    fireEvent.click(screen.getByRole('button', { name: 'Save grid' }));
    const [, preset] = onSave.mock.calls[0] as [
      string,
      { axes: { bundle: { criterionId: string; role: string; params: Record<string, number> }[] }[] },
    ];
    expect(preset.axes[0]?.bundle[0]).toEqual({
      criterionId: 'pr-feature-size',
      weight: 1,
      role: 'level',
      params: { rankS: 1, linesS: 120 },
    });
  });

  it('edits role, weight and a param, and removes the card', () => {
    const onSave = vi.fn();
    render(
      <GridBuilder
        initial={seed()}
        catalogue={catalogue}
        saving={false}
        error={null}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('add criterion to axis 1'), {
      target: { value: 'commit-discipline' },
    });
    fireEvent.change(screen.getByLabelText('commit-discipline role'), { target: { value: 'cap' } });
    fireEvent.change(screen.getByLabelText('commit-discipline weight'), { target: { value: '2.5' } });
    fireEvent.change(screen.getByLabelText('commit-discipline aiFloorSoft'), {
      target: { value: '0.4' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save grid' }));

    const [, preset] = onSave.mock.calls[0] as [
      string,
      { axes: { bundle: { role: string; weight: number; params: Record<string, number> }[] }[] },
    ];
    expect(preset.axes[0]?.bundle[0]).toMatchObject({
      role: 'cap',
      weight: 2.5,
      params: { aiFloorSoft: 0.4 },
    });

    fireEvent.click(screen.getByRole('button', { name: 'remove commit-discipline from axis 1' }));
    expect(screen.queryByLabelText('commit-discipline role')).toBeNull();
  });

  it('blocks the save and lists client issues on a duplicate level id', () => {
    const onSave = vi.fn();
    const g = seed();
    g.levels = [
      { id: 'x', label: '' },
      { id: 'x', label: '' },
    ];
    render(
      <GridBuilder
        initial={g}
        catalogue={catalogue}
        saving={false}
        error={null}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save grid' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('level ids must be unique')).toBeTruthy();
  });

  it('adds and reorders levels', () => {
    const onSave = vi.fn();
    render(
      <GridBuilder
        initial={seed()}
        catalogue={catalogue}
        saving={false}
        error={null}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '+ level' }));
    fireEvent.change(screen.getByLabelText('level 2 id'), { target: { value: 'mid' } });
    // move it up one
    const ups = screen.getAllByRole('button', { name: '↑' });
    fireEvent.click(ups[2] as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: 'Save grid' }));

    const [, preset] = onSave.mock.calls[0] as [string, { levels: { id: string; rank: number }[] }];
    expect(preset.levels.map((l) => l.id)).toEqual(['low', 'mid', 'high']);
    expect(preset.levels.map((l) => l.rank)).toEqual([0, 1, 2]);
  });

  it('renders a server issue passed via props', () => {
    render(
      <GridBuilder
        initial={seed()}
        catalogue={catalogue}
        saving={false}
        error="grid preset is invalid"
        issues={['axes: array must contain at least 1 element']}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText('grid preset is invalid')).toBeTruthy();
    expect(screen.getByText('axes: array must contain at least 1 element')).toBeTruthy();
  });
});
