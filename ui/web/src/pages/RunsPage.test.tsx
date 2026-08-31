import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Evaluation } from '@laivel-up/ui/evaluation';
import type { RunView } from '../runs/runApi.js';

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

const listRuns = vi.fn();
const createRun = vi.fn();
vi.mock('../runs/runApi.js', () => ({
  listRuns: (...a: unknown[]) => listRuns(...a),
  createRun: (...a: unknown[]) => createRun(...a),
  getRun: vi.fn(),
}));

const listProfiles = vi.fn();
vi.mock('../profile/profileApi.js', () => ({ listProfiles: (...a: unknown[]) => listProfiles(...a) }));

const listGrids = vi.fn();
vi.mock('../grid/gridApi.js', () => ({ listGrids: (...a: unknown[]) => listGrids(...a) }));

const { RunsPage } = await import('./RunsPage.js');

const GRID_BODY = {
  id: 'g-main',
  levels: [
    { id: 'junior', label: 'Junior', rank: 0 },
    { id: 'senior', label: 'Senior', rank: 1 },
  ],
  axes: [{ id: 'size', label: 'PR size', bundle: [] }],
};

function evaluation(subjectId: string, levelId: string): Evaluation {
  return {
    subjectId,
    gridId: 'g-main',
    generatedAt: '2026-08-31T00:00:00.000Z',
    global: { levelId, confidence: 0.7, note: { key: 'x' } },
    axes: [
      {
        axisId: 'size',
        levelId,
        confidence: 0.7,
        limitingFactor: 'margin',
        readings: [
          {
            criterionId: 'pr-feature-size',
            axisId: 'size',
            role: 'level',
            status: 'read',
            levelId,
            rawValue: 'M',
            confidence: 0.7,
            limitingFactor: 'margin',
            evidence: { key: 'criterion.pr-feature-size', params: { detail: 'hist' } },
          },
        ],
      },
    ],
    progression: { targetLevelId: 'senior', actions: [] },
  };
}

function run(over: Partial<RunView> & { id: string; subjectId: string }): RunView {
  return {
    orgId: 'o1',
    createdBy: 'u1',
    createdAt: '2026-08-31T10:00:00.000Z',
    gridSnapshot: GRID_BODY,
    profileSnapshot: { subject: { id: over.subjectId }, declared: { stack: ['ts'] } },
    evaluation: evaluation(over.subjectId, 'junior'),
    ...over,
  };
}

afterEach(() => {
  listRuns.mockReset();
  createRun.mockReset();
  listProfiles.mockReset();
  listGrids.mockReset();
});

const seed = (runs: RunView[]): void => {
  listRuns.mockResolvedValue(runs);
  listProfiles.mockResolvedValue([
    { id: 'p1', name: 'Perceval', body: { subject: { id: 'perceval' } }, orgId: 'o1', createdBy: 'u1', isTemplate: false, updatedAt: '' },
    { id: 'p2', name: 'Bohort', body: { subject: { id: 'bohort' } }, orgId: 'o1', createdBy: 'u1', isTemplate: false, updatedAt: '' },
  ]);
  listGrids.mockResolvedValue([
    { id: 'gr1', name: 'AIDD reference', body: GRID_BODY, orgId: 'o1', createdBy: 'u1', isTemplate: false, updatedAt: '' },
  ]);
};

const rail = (): HTMLElement => screen.getByRole('navigation', { name: 'developers' });
const fiche = (): HTMLElement => document.querySelector('.fiche') as HTMLElement;
const verdictLevel = (): string => document.querySelector('.verdict-level')?.textContent ?? '';

describe('RunsPage', () => {
  it('lists developers in the rail and opens the first one', async () => {
    seed([
      run({ id: 'r1', subjectId: 'perceval', evaluation: evaluation('perceval', 'senior') }),
      run({ id: 'r2', subjectId: 'bohort', createdAt: '2026-08-01T00:00:00.000Z' }),
    ]);
    render(<RunsPage />);
    await waitFor(() => expect(within(fiche()).getByRole('heading', { name: 'perceval' })).toBeTruthy());
    expect(within(rail()).getByRole('button', { name: /perceval/i })).toBeTruthy();
    expect(within(rail()).getByRole('button', { name: /bohort/i })).toBeTruthy();
    // perceval ran most recently -> its fiche is shown, with the level from the snapshot grid
    expect(verdictLevel()).toBe('Senior');
  });

  it('switches the fiche when another developer is picked in the rail', async () => {
    seed([
      run({ id: 'r1', subjectId: 'perceval', evaluation: evaluation('perceval', 'senior') }),
      run({ id: 'r2', subjectId: 'bohort', createdAt: '2026-08-01T00:00:00.000Z', evaluation: evaluation('bohort', 'junior') }),
    ]);
    render(<RunsPage />);
    await waitFor(() => expect(within(fiche()).getByRole('heading', { name: 'perceval' })).toBeTruthy());
    fireEvent.click(within(rail()).getByRole('button', { name: /bohort/i }));
    expect(within(fiche()).getByRole('heading', { name: 'bohort' })).toBeTruthy();
    expect(verdictLevel()).toBe('Junior');
  });

  it('runs a batch of profiles against one grid', async () => {
    seed([]);
    createRun
      .mockResolvedValueOnce(run({ id: 'rc1', subjectId: 'perceval', evaluation: evaluation('perceval', 'senior') }))
      .mockResolvedValueOnce(run({ id: 'rc2', subjectId: 'bohort', evaluation: evaluation('bohort', 'junior') }));
    listRuns
      .mockResolvedValueOnce([])
      .mockResolvedValue([
        run({ id: 'rc1', subjectId: 'perceval', evaluation: evaluation('perceval', 'senior') }),
        run({ id: 'rc2', subjectId: 'bohort', evaluation: evaluation('bohort', 'junior') }),
      ]);
    render(<RunsPage />);
    await waitFor(() => expect(screen.getByText('No runs yet.')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: '+ New run' }));
    fireEvent.change(screen.getByLabelText('Grid'), { target: { value: 'gr1' } });
    fireEvent.click(screen.getByLabelText('Perceval'));
    fireEvent.click(screen.getByLabelText('Bohort'));
    fireEvent.click(screen.getByRole('button', { name: 'Run 2' }));

    await waitFor(() => expect(createRun).toHaveBeenCalledTimes(2));
    const calls = createRun.mock.calls.map((c) => c[0] as { profileId: string; gridId: string; orgId: string });
    expect(calls.map((c) => c.profileId).sort()).toEqual(['p1', 'p2']);
    expect(calls.every((c) => c.gridId === 'gr1' && c.orgId === 'o1')).toBe(true);
    // lands on a fiche once the batch settles
    await waitFor(() => expect(within(fiche()).getByRole('heading', { name: 'perceval' })).toBeTruthy());
  });

  it('shows the over-time history for a developer with several runs and switches on click', async () => {
    seed([
      run({ id: 'r-old', subjectId: 'perceval', createdAt: '2026-08-01T00:00:00.000Z', evaluation: evaluation('perceval', 'junior') }),
      run({ id: 'r-new', subjectId: 'perceval', createdAt: '2026-08-30T00:00:00.000Z', evaluation: evaluation('perceval', 'senior') }),
    ]);
    render(<RunsPage />);
    await waitFor(() => expect(within(fiche()).getByText('Over time')).toBeTruthy());
    // newest run is shown first
    expect(verdictLevel()).toBe('Senior');
    const bars = within(fiche()).getAllByRole('button').filter((b) => b.className.includes('history-bar'));
    expect(bars).toHaveLength(2);
    fireEvent.click(bars[0] as HTMLElement); // the older run
    expect(verdictLevel()).toBe('Junior');
  });

  it('flags a run whose grid was edited since', async () => {
    seed([run({ id: 'r1', subjectId: 'perceval' })]);
    listGrids.mockResolvedValue([
      {
        id: 'gr1', name: 'AIDD reference', orgId: 'o1', createdBy: 'u1', isTemplate: false, updatedAt: '',
        body: { ...GRID_BODY, levels: [...GRID_BODY.levels, { id: 'staff', label: 'Staff', rank: 2 }] },
      },
    ]);
    render(<RunsPage />);
    await waitFor(() => expect(screen.getByText('grid edited since this run')).toBeTruthy());
  });

  it('shows an empty state with a batch prompt when there are no runs', async () => {
    seed([]);
    render(<RunsPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run a batch' })).toBeTruthy());
  });
});
