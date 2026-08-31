import { useState } from 'react';
import type { ReactNode } from 'react';
import type { GridSummary } from '../grid/gridApi.js';
import type { ProfileSummary } from '../profile/profileApi.js';
import type { BatchItem } from './batch.js';

interface Props {
  readonly grids: readonly GridSummary[];
  readonly profiles: readonly ProfileSummary[];
  readonly running: boolean;
  readonly progress: readonly BatchItem[] | null;
  readonly onRun: (gridId: string, profileIds: readonly string[]) => void;
  readonly onClose: () => void;
}

const STATUS_MARK: Record<BatchItem['status'], string> = {
  pending: '·',
  running: '…',
  done: '✓',
  error: '✕',
};

export function NewRunPanel({ grids, profiles, running, progress, onRun, onClose }: Props): ReactNode {
  const [gridId, setGridId] = useState('');
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());

  const toggle = (id: string): void =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allPicked = profiles.length > 0 && picked.size === profiles.length;
  const toggleAll = (): void =>
    setPicked(allPicked ? new Set() : new Set(profiles.map((p) => p.id)));

  const canRun = gridId !== '' && picked.size > 0 && !running;

  return (
    <div className="new-run">
      <div className="new-run-head">
        <h2>New run</h2>
        <button type="button" className="secondary small" onClick={onClose} disabled={running}>
          Close
        </button>
      </div>

      <label className="field">
        <span>Grid</span>
        <select value={gridId} onChange={(e) => setGridId(e.target.value)} disabled={running}>
          <option value="">— pick a grid —</option>
          {grids.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
      </label>

      <fieldset className="profile-pick" disabled={running}>
        <legend>
          Profiles
          <button type="button" className="link" onClick={toggleAll} disabled={running}>
            {allPicked ? 'clear' : 'select all'}
          </button>
        </legend>
        {profiles.length === 0 && <p className="muted small">No profiles yet — create one first.</p>}
        {profiles.map((p) => (
          <label key={p.id} className="check">
            <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} />
            <span>{p.name}</span>
            {p.isTemplate && <span className="pill pill-soft">template</span>}
          </label>
        ))}
      </fieldset>

      <button
        type="button"
        className="primary"
        disabled={!canRun}
        onClick={() => onRun(gridId, [...picked])}
      >
        {running ? 'Running…' : `Run ${picked.size || ''}`.trim()}
      </button>

      {progress !== null && (
        <ul className="batch-progress">
          {progress.map((it) => (
            <li key={it.profileId} className={`batch-item ${it.status}`}>
              <span className="batch-mark">{STATUS_MARK[it.status]}</span>
              <span>{it.name}</span>
              {it.error !== undefined && <span className="muted small">{it.error}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
