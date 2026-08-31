import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

class MockApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues: readonly string[] = [],
  ) {
    super(message);
  }
}

vi.mock('../org/OrgProvider.js', () => ({
  useOrg: () => ({ currentOrg: { id: 'o1', name: 'Acme', createdAt: '' } }),
}));
vi.mock('../api/client.js', () => ({ ApiError: MockApiError }));

const listGrids = vi.fn();
const createGrid = vi.fn();
const updateGrid = vi.fn();
const deleteGrid = vi.fn();
const getCatalogue = vi.fn();
vi.mock('../grid/gridApi.js', () => ({
  listGrids: (...a: unknown[]) => listGrids(...a),
  createGrid: (...a: unknown[]) => createGrid(...a),
  updateGrid: (...a: unknown[]) => updateGrid(...a),
  deleteGrid: (...a: unknown[]) => deleteGrid(...a),
  getCatalogue: (...a: unknown[]) => getCatalogue(...a),
}));

const { GridsPage } = await import('./GridsPage.js');

const CATALOGUE = [
  { id: 'pr-feature-size', needs: ['vcsActivity'], paramDefaults: { rankS: 1 } },
];

afterEach(() => {
  listGrids.mockReset();
  createGrid.mockReset();
  updateGrid.mockReset();
  deleteGrid.mockReset();
  getCatalogue.mockReset();
});

describe('GridsPage', () => {
  it('lists org grids and templates separately', async () => {
    getCatalogue.mockResolvedValue(CATALOGUE);
    listGrids.mockResolvedValue([
      { id: 'g1', orgId: 'o1', createdBy: 'u1', name: 'my grid', body: {}, isTemplate: false, updatedAt: '' },
      { id: 't1', orgId: null, createdBy: null, name: 'AIDD reference', body: { id: 'aidd', levels: [{ id: 'a', rank: 0 }], axes: [{ id: 'x', bundle: [] }] }, isTemplate: true, updatedAt: '' },
    ]);
    render(<GridsPage />);
    await waitFor(() => expect(screen.getByText('my grid')).toBeTruthy());
    expect(screen.getByText('AIDD reference')).toBeTruthy();
    expect(screen.getByText('Templates')).toBeTruthy();
  });

  it('creates a grid and returns to the list', async () => {
    getCatalogue.mockResolvedValue(CATALOGUE);
    listGrids.mockResolvedValue([]);
    createGrid.mockResolvedValue({});
    render(<GridsPage />);
    await waitFor(() => expect(screen.getByText('No grids yet.')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'New grid' }));
    fireEvent.change(screen.getByLabelText('Grid id'), { target: { value: 'demo' } });
    fireEvent.change(screen.getByLabelText('add criterion to axis 1'), {
      target: { value: 'pr-feature-size' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save grid' }));

    await waitFor(() => expect(createGrid).toHaveBeenCalled());
    const [orgId, name, body] = createGrid.mock.calls[0] as [string, string, { id: string }];
    expect(orgId).toBe('o1');
    expect(name).toBe('demo');
    expect(body.id).toBe('demo');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Grids' })).toBeTruthy());
  });

  it('edits an existing grid through updateGrid and returns to the list', async () => {
    getCatalogue.mockResolvedValue(CATALOGUE);
    listGrids.mockResolvedValue([
      {
        id: 'g1',
        orgId: 'o1',
        createdBy: 'u1',
        name: 'my grid',
        body: {
          id: 'my-grid',
          levels: [{ id: 'low', rank: 0 }, { id: 'high', rank: 1 }],
          axes: [{ id: 'a', bundle: [] }],
        },
        isTemplate: false,
        updatedAt: '',
      },
    ]);
    updateGrid.mockResolvedValue({});
    render(<GridsPage />);
    await waitFor(() => expect(screen.getByText('my grid')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'edit' }));
    fireEvent.change(screen.getByLabelText('Grid id'), { target: { value: 'my-grid-v2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save grid' }));

    await waitFor(() => expect(updateGrid).toHaveBeenCalled());
    const [id, patch] = updateGrid.mock.calls[0] as [string, { name: string; body: { id: string } }];
    expect(id).toBe('g1');
    expect(patch.name).toBe('my-grid-v2');
    expect(patch.body.id).toBe('my-grid-v2');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Grids' })).toBeTruthy());
  });

  it('surfaces server 422 issues and clears them on cancel', async () => {
    getCatalogue.mockResolvedValue(CATALOGUE);
    listGrids.mockResolvedValue([]);
    createGrid.mockRejectedValue(new MockApiError(422, 'grid preset is invalid', ['id: too short']));
    render(<GridsPage />);
    await waitFor(() => expect(screen.getByText('No grids yet.')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'New grid' }));
    fireEvent.change(screen.getByLabelText('Grid id'), { target: { value: 'd' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save grid' }));
    await waitFor(() => expect(screen.getByText('grid preset is invalid')).toBeTruthy());
    expect(screen.getByText('id: too short')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'New grid' }));
    expect(screen.queryByText('grid preset is invalid')).toBeNull();
  });

  it('clones a template into a fresh editable draft', async () => {
    getCatalogue.mockResolvedValue(CATALOGUE);
    listGrids.mockResolvedValue([
      {
        id: 't1',
        orgId: null,
        createdBy: null,
        name: 'AIDD',
        body: { id: 'aidd', levels: [{ id: 'white', rank: 0 }, { id: 'gold', rank: 6 }], axes: [{ id: 'size', bundle: [] }] },
        isTemplate: true,
        updatedAt: '',
      },
    ]);
    render(<GridsPage />);
    await waitFor(() => expect(screen.getByText('AIDD')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'clone to edit' }));
    expect(screen.getByRole('heading', { name: 'New grid' })).toBeTruthy();
    // a clone gets its own id, not the template's
    expect((screen.getByLabelText('Grid id') as HTMLInputElement).value).toBe('AIDD-copy');
    expect((screen.getByLabelText('level 0 id') as HTMLInputElement).value).toBe('white');
  });

  it('surfaces the delete error', async () => {
    getCatalogue.mockResolvedValue(CATALOGUE);
    listGrids.mockResolvedValue([
      { id: 'g1', orgId: 'o1', createdBy: 'u1', name: 'Mine', body: {}, isTemplate: false, updatedAt: '' },
    ]);
    deleteGrid.mockRejectedValue(new MockApiError(403, 'not allowed to change this grid'));
    render(<GridsPage />);
    await waitFor(() => expect(screen.getByText('Mine')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'delete' }));
    await waitFor(() => expect(screen.getByText('not allowed to change this grid')).toBeTruthy());
  });
});
