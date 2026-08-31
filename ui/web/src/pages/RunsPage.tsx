import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useOrgScopedLoad } from '../org/useOrgScopedLoad.js';
import { ApiError } from '../api/client.js';
import * as profileApi from '../profile/profileApi.js';
import type { ProfileSummary } from '../profile/profileApi.js';
import * as gridApi from '../grid/gridApi.js';
import type { GridSummary } from '../grid/gridApi.js';
import * as runApi from '../runs/runApi.js';
import type { RunView } from '../runs/runApi.js';
import { buildRunViewModel } from '../runs/viewModel.js';
import { gridFreshness, profileFreshness } from '../runs/staleness.js';
import type { Freshness } from '../runs/staleness.js';
import { EvaluationView } from '../runs/EvaluationView.js';

const listForOrg = (orgId: string): Promise<RunView[]> => runApi.listRuns(orgId);

const byNewest = (a: RunView, b: RunView): number => b.createdAt.localeCompare(a.createdAt);
const shortDate = (iso: string): string =>
  new Date(iso).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });

function FreshnessTag({ what, state }: { readonly what: string; readonly state: Freshness }): ReactNode {
  if (state === 'current') return null;
  const label = state === 'changed' ? `${what} edited since` : `${what} not saved`;
  return <span className={`run-stale ${state}`}>{label}</span>;
}

export function RunsPage(): ReactNode {
  const { orgId, data: runs, error, setError, reload } = useOrgScopedLoad(listForOrg, []);

  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [grids, setGrids] = useState<GridSummary[]>([]);
  const [sourcesLoaded, setSourcesLoaded] = useState(false);
  const [profileId, setProfileId] = useState('');
  const [gridId, setGridId] = useState('');
  const [subject, setSubject] = useState('');
  const [running, setRunning] = useState(false);
  const [subjectFilter, setSubjectFilter] = useState('');
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());

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

  const subjects = useMemo(
    () => [...new Set(runs.map((r) => r.subjectId))].sort(),
    [runs],
  );

  const shown = useMemo(() => {
    const list = subjectFilter === '' ? runs : runs.filter((r) => r.subjectId === subjectFilter);
    return [...list].sort(byNewest);
  }, [runs, subjectFilter]);

  const viewModels = useMemo(
    () => new Map(shown.map((r) => [r.id, buildRunViewModel(r.evaluation, r.gridSnapshot)])),
    [shown],
  );

  if (orgId === undefined) {
    return <section className="page"><p className="muted">No organisation selected.</p></section>;
  }

  const runNow = (): void => {
    if (profileId === '' || gridId === '') {
      setError('pick a profile and a grid');
      return;
    }
    setRunning(true);
    setError(null);
    runApi
      .createRun({
        orgId,
        profileId,
        gridId,
        ...(subject.trim() === '' ? {} : { subjectId: subject.trim() }),
      })
      .then((created) => {
        setSubject('');
        setOpen(new Set([created.id]));
        return reload();
      })
      .catch((e: unknown) => {
        setError(e instanceof ApiError ? e.message : 'the run failed');
      })
      .finally(() => setRunning(false));
  };

  const toggle = (id: string): void =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const comparison = subjectFilter !== '' && shown.length > 1 ? [...shown].reverse() : [];
  // axis id -> label, unioned across the compared runs (later runs win the label)
  const axisColumns = [
    ...new Map(
      comparison.flatMap((r) => (viewModels.get(r.id)?.axes ?? []).map((a) => [a.id, a.name] as const)),
    ),
  ];

  return (
    <section className="page">
      <h1>Runs</h1>
      {error !== null && <p className="error">{error}</p>}

      <div className="run-new">
        <label className="field">
          <span>Profile</span>
          <select value={profileId} onChange={(e) => setProfileId(e.target.value)}>
            <option value="">— pick —</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Grid</span>
          <select value={gridId} onChange={(e) => setGridId(e.target.value)}>
            <option value="">— pick —</option>
            {grids.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Subject id (optional)</span>
          <input
            value={subject}
            placeholder="defaults to the profile's subject"
            onChange={(e) => setSubject(e.target.value)}
          />
        </label>
        <button type="button" onClick={runNow} disabled={running}>
          {running ? 'Running…' : 'Run'}
        </button>
      </div>

      <div className="run-filter">
        <label className="field">
          <span>Developer</span>
          <select value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)}>
            <option value="">all ({runs.length})</option>
            {subjects.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>

      {comparison.length > 1 && (
        <div className="run-compare-wrap">
          <table className="run-compare">
            <thead>
              <tr>
                <th>{subjectFilter} over time</th>
                {comparison.map((r) => (
                  <th key={r.id}>{shortDate(r.createdAt)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="run-compare-overall">
                <td>Overall</td>
                {comparison.map((r) => {
                  const vm = viewModels.get(r.id);
                  return <td key={r.id}>{vm?.verdict.ruled === true ? vm.verdict.level : '—'}</td>;
                })}
              </tr>
              {axisColumns.map(([axisId, axisName]) => (
                <tr key={axisId}>
                  <td>{axisName}</td>
                  {comparison.map((r) => {
                    const axis = viewModels.get(r.id)?.axes.find((a) => a.id === axisId);
                    return <td key={r.id}>{axis?.ruled === true ? axis.level : '—'}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <table className="grid-table run-list">
        <tbody>
          {shown.map((r) => {
            const vm = viewModels.get(r.id);
            return (
              <tr key={r.id}>
                <td colSpan={2}>
                  <div className="run-row">
                    <span className="muted small">{shortDate(r.createdAt)}</span>
                    <strong>{r.subjectId}</strong>
                    <span className="muted small">
                      {vm?.verdict.ruled === true ? vm.verdict.level : 'no level'} · {vm?.verdict.confidencePct ?? 0}%
                    </span>
                    {sourcesLoaded && (
                      <>
                        <FreshnessTag what="grid" state={gridFreshness(r.gridSnapshot, grids)} />
                        <FreshnessTag what="profile" state={profileFreshness(r.profileSnapshot, profiles)} />
                      </>
                    )}
                    <button type="button" className="secondary small" onClick={() => toggle(r.id)}>
                      {open.has(r.id) ? 'hide' : 'view'}
                    </button>
                  </div>
                  {open.has(r.id) && vm !== undefined && <EvaluationView vm={vm} />}
                </td>
              </tr>
            );
          })}
          {shown.length === 0 && <tr><td className="muted">No runs yet.</td></tr>}
        </tbody>
      </table>
    </section>
  );
}
