import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useOrgScopedLoad } from '../org/useOrgScopedLoad.js';
import * as profileApi from '../profile/profileApi.js';
import type { ProfileSummary } from '../profile/profileApi.js';
import * as gridApi from '../grid/gridApi.js';
import type { GridSummary } from '../grid/gridApi.js';
import * as runApi from '../runs/runApi.js';
import type { RunView } from '../runs/runApi.js';
import { buildRunViewModel } from '../runs/viewModel.js';
import { gridFreshness, profileFreshness } from '../runs/staleness.js';
import { runBatch } from '../runs/batch.js';
import type { BatchItem } from '../runs/batch.js';
import { ProfileEvaluation } from '../runs/ProfileEvaluation.js';
import type { HistoryPoint } from '../runs/ProfileEvaluation.js';
import { NewRunPanel } from '../runs/NewRunPanel.js';

const listForOrg = (orgId: string): Promise<RunView[]> => runApi.listRuns(orgId);
const shortDate = (iso: string): string =>
  new Date(iso).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
const byNewest = (a: RunView, b: RunView): number => b.createdAt.localeCompare(a.createdAt);

export function RunsPage(): ReactNode {
  const { orgId, data: runs, error, setError, reload } = useOrgScopedLoad(listForOrg, []);

  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [grids, setGrids] = useState<GridSummary[]>([]);
  const [sourcesLoaded, setSourcesLoaded] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [runBySubject, setRunBySubject] = useState<Record<string, string>>({});
  const [panelOpen, setPanelOpen] = useState(false);
  const [batch, setBatch] = useState<readonly BatchItem[] | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (orgId === undefined) return;
    setSourcesLoaded(false);
    Promise.all([profileApi.listProfiles(orgId), gridApi.listGrids(orgId)])
      .then(([p, g]) => {
        setProfiles(p);
        setGrids(g);
        setSourcesLoaded(true);
      })
      .catch(() => setError('could not load profiles and grids'));
  }, [orgId, setError]);

  // subjectId -> its runs, newest first; the rail is ordered by most-recent run.
  const bySubject = useMemo(() => {
    const map = new Map<string, RunView[]>();
    for (const r of runs) {
      const list = map.get(r.subjectId) ?? [];
      list.push(r);
      map.set(r.subjectId, list);
    }
    for (const list of map.values()) list.sort(byNewest);
    return map;
  }, [runs]);

  const subjects = useMemo(
    () =>
      [...bySubject.entries()]
        .sort((a, b) => byNewest(a[1][0] as RunView, b[1][0] as RunView))
        .map(([s]) => s),
    [bySubject],
  );

  // latest run per subject -> its view model, for the rail chips.
  const railVm = useMemo(() => {
    const map = new Map<string, ReturnType<typeof buildRunViewModel>>();
    for (const [s, list] of bySubject) {
      const latest = list[0];
      if (latest !== undefined) map.set(s, buildRunViewModel(latest.evaluation, latest.gridSnapshot));
    }
    return map;
  }, [bySubject]);

  useEffect(() => {
    if (subjects.length === 0) setSelected(null);
    else if (selected === null || !subjects.includes(selected)) setSelected(subjects[0] ?? null);
  }, [subjects, selected]);

  const currentRuns = selected === null ? [] : bySubject.get(selected) ?? [];
  const currentRunId =
    (selected !== null && runBySubject[selected]) ||
    (currentRuns[0]?.id ?? '');
  const currentRun = currentRuns.find((r) => r.id === currentRunId) ?? currentRuns[0];

  const currentVm = useMemo(
    () => (currentRun === undefined ? null : buildRunViewModel(currentRun.evaluation, currentRun.gridSnapshot)),
    [currentRun],
  );

  // the run only snapshots the grid body; show the saved grid's name when one
  // still carries that preset id, else fall back to the id.
  const gridName =
    grids.find((g) => (g.body as { id?: string } | null)?.id === currentVm?.gridId)?.name ??
    currentVm?.gridId ??
    '';

  const history: HistoryPoint[] = useMemo(() => {
    return [...currentRuns]
      .reverse()
      .map((r) => {
        const vm = buildRunViewModel(r.evaluation, r.gridSnapshot);
        const idx = vm.verdict.ruled ? vm.scale.indexOf(vm.verdict.level) : -1;
        return {
          runId: r.id,
          date: shortDate(r.createdAt),
          levelIndex: idx < 0 ? null : idx,
          levelLabel: vm.verdict.ruled ? vm.verdict.level : 'no level',
        };
      });
  }, [currentRuns]);

  if (orgId === undefined) {
    return <section className="page"><p className="muted">No organisation selected.</p></section>;
  }

  const handleRun = (gridId: string, profileIds: readonly string[]): void => {
    const picked = profiles.filter((p) => profileIds.includes(p.id));
    setRunning(true);
    setError(null);
    setBatch(picked.map((p) => ({ profileId: p.id, name: p.name, status: 'pending' as const })));
    runBatch(orgId, gridId, picked, setBatch)
      .then(async (items) => {
        await reload();
        const firstDone = items.find((it) => it.status === 'done' && it.subjectId !== undefined);
        if (firstDone?.subjectId !== undefined) {
          setSelected(firstDone.subjectId);
          setPanelOpen(false);
          setBatch(null);
        }
      })
      .catch(() => setError('the batch failed'))
      .finally(() => setRunning(false));
  };

  const railItem = (subject: string): ReactNode => {
    const vm = railVm.get(subject);
    return (
      <button
        key={subject}
        type="button"
        className={`rail-item${subject === selected && !panelOpen ? ' active' : ''}`}
        aria-current={subject === selected && !panelOpen ? 'true' : undefined}
        onClick={() => {
          setSelected(subject);
          setPanelOpen(false);
        }}
      >
        <span className="rail-name">{subject}</span>
        <span className={`pill ${vm?.verdict.ruled === true ? '' : 'pill-none'}`}>
          {vm?.verdict.ruled === true ? vm.verdict.level : 'no level'}
        </span>
        <span className="muted small">{vm?.verdict.confidencePct ?? 0}%</span>
      </button>
    );
  };

  return (
    <section className="page runs">
      <aside className="runs-rail">
        <button type="button" className="primary block" onClick={() => setPanelOpen(true)}>
          + New run
        </button>
        {error !== null && <p className="error small">{error}</p>}
        <nav aria-label="developers">
          {subjects.map(railItem)}
          {subjects.length === 0 && <p className="muted small">No runs yet.</p>}
        </nav>
      </aside>

      <main className="runs-main">
        {panelOpen ? (
          <NewRunPanel
            grids={grids}
            profiles={profiles}
            running={running}
            progress={batch}
            onRun={handleRun}
            onClose={() => {
              setPanelOpen(false);
              setBatch(null);
            }}
          />
        ) : currentRun !== undefined && currentVm !== null ? (
          <ProfileEvaluation
            vm={currentVm}
            meta={{
              date: shortDate(currentRun.createdAt),
              gridName,
              gridStale: sourcesLoaded ? gridFreshness(currentRun.gridSnapshot, grids) : 'current',
              profileStale: sourcesLoaded ? profileFreshness(currentRun.profileSnapshot, profiles) : 'current',
            }}
            history={history}
            selectedRunId={currentRun.id}
            onSelectRun={(runId) =>
              setRunBySubject((prev) => ({ ...prev, [selected ?? '']: runId }))
            }
          />
        ) : (
          <div className="runs-empty">
            <p>No runs yet. Score a few profiles against a grid to get started.</p>
            <button type="button" className="primary" onClick={() => setPanelOpen(true)}>
              Run a batch
            </button>
          </div>
        )}
      </main>
    </section>
  );
}
