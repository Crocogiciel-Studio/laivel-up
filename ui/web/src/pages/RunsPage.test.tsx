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

function evaluation(levelId: string): Evaluation {
  return {
    subjectId: 'dev-x',
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

function run(over: Partial<RunView> & { id: string }): RunView {
  return {
    orgId: 'o1',
    createdBy: 'u1',
    subjectId: 'dev-x',
    createdAt: '2026-08-31T10:00:00.000Z',
    gridSnapshot: GRID_BODY,
    profileSnapshot: { subject: { id: 'dev-x' }, declared: { stack: ['ts'] } },
    evaluation: evaluation('junior'),
    ...over,
  };
}

afterEach(() => {
  listRuns.mockReset();
  createRun.mockReset();
  listProfiles.mockReset();
  listGrids.mockReset();
});

const list = (): HTMLElement => document.querySelector('.run-list') as HTMLElement;

const seed = (runs: RunView[]): void => {
  listRuns.mockResolvedValue(runs);
  listProfiles.mockResolvedValue([{ id: 'p1', name: 'Dev X', body: { subject: { id: 'dev-x' } }, orgId: 'o1', createdBy: 'u1', isTemplate: false, updatedAt: '' }]);
  listGrids.mockResolvedValue([{ id: 'gr1', name: 'Main grid', body: GRID_BODY, orgId: 'o1', createdBy: 'u1', isTemplate: false, updatedAt: '' }]);
};

describe('RunsPage', () => {
  it('lists runs newest first with the level from the snapshot', async () => {
    seed([
      run({ id: 'r-old', createdAt: '2026-08-01T00:00:00.000Z', evaluation: evaluation('junior') }),
      run({ id: 'r-new', createdAt: '2026-08-30T00:00:00.000Z', evaluation: evaluation('senior') }),
    ]);
    render(<RunsPage />);
    await waitFor(() => expect(within(list()).getAllByText('dev-x').length).toBeGreaterThan(0));
    const rows = within(list()).getAllByRole('row');
    // first data row is the newest run
    expect(within(rows[0] as HTMLElement).getByText(/Senior/)).toBeTruthy();
  });

  it('filters the list by developer', async () => {
    seed([
      run({ id: 'r1', subjectId: 'dev-x' }),
      run({ id: 'r2', subjectId: 'dev-y' }),
    ]);
    render(<RunsPage />);
    await waitFor(() => expect(within(list()).getByText('dev-y')).toBeTruthy());
    expect(within(list()).getByText('dev-x')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Developer'), { target: { value: 'dev-y' } });
    expect(within(list()).queryByText('dev-x')).toBeNull();
    expect(within(list()).getByText('dev-y')).toBeTruthy();
  });

  it('runs a profile against a grid and shows the result', async () => {
    seed([]);
    createRun.mockResolvedValue(run({ id: 'r-created', evaluation: evaluation('senior') }));
    // after the run, reload returns the new row
    listRuns.mockResolvedValueOnce([]).mockResolvedValue([run({ id: 'r-created', evaluation: evaluation('senior') })]);
    render(<RunsPage />);
    await waitFor(() => expect(screen.getByText('No runs yet.')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('Profile'), { target: { value: 'p1' } });
    fireEvent.change(screen.getByLabelText('Grid'), { target: { value: 'gr1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => expect(createRun).toHaveBeenCalled());
    const [input] = createRun.mock.calls[0] as [{ orgId: string; profileId: string; gridId: string }];
    expect(input).toMatchObject({ orgId: 'o1', profileId: 'p1', gridId: 'gr1' });
    // the created run auto-expands into an EvaluationView
    await waitFor(() => expect(screen.getByText('To reach Senior')).toBeTruthy());
  });

  it('flags a run whose grid was edited since', async () => {
    seed([run({ id: 'r1' })]);
    listGrids.mockResolvedValue([
      { id: 'gr1', name: 'Main grid', orgId: 'o1', createdBy: 'u1', isTemplate: false, updatedAt: '',
        body: { ...GRID_BODY, levels: [...GRID_BODY.levels, { id: 'staff', label: 'Staff', rank: 2 }] } },
    ]);
    render(<RunsPage />);
    await waitFor(() => expect(screen.getByText('grid edited since')).toBeTruthy());
  });

  it('shows a comparison table when a developer with several runs is selected', async () => {
    seed([
      run({ id: 'r1', createdAt: '2026-08-01T00:00:00.000Z', evaluation: evaluation('junior') }),
      run({ id: 'r2', createdAt: '2026-08-20T00:00:00.000Z', evaluation: evaluation('senior') }),
    ]);
    render(<RunsPage />);
    await waitFor(() => expect(screen.getAllByText('dev-x').length).toBeGreaterThan(0));
    fireEvent.change(screen.getByLabelText('Developer'), { target: { value: 'dev-x' } });
    expect(screen.getByText('dev-x over time')).toBeTruthy();
    expect(screen.getByText('Overall')).toBeTruthy();
    const compare = screen.getByText('dev-x over time').closest('table') as HTMLElement;
    expect(within(compare).getByText('PR size')).toBeTruthy();
  });
});
