import type { ReactNode } from 'react';
import type { ViewModel, AxisCard } from '@laivel-up/ui/view-model';
import type { Freshness } from './staleness.js';
import { Ladder } from './Ladder.js';

export interface HistoryPoint {
  readonly runId: string;
  readonly date: string;
  /** Index of the ruled level in the grid scale, or null when none was ruled. */
  readonly levelIndex: number | null;
  readonly levelLabel: string;
}

interface Props {
  readonly vm: ViewModel;
  readonly meta: {
    readonly date: string;
    readonly gridName: string;
    readonly gridStale: Freshness;
    readonly profileStale: Freshness;
  };
  readonly history: readonly HistoryPoint[];
  readonly selectedRunId: string;
  readonly onSelectRun: (runId: string) => void;
}

function ConfidenceBar({ pct }: { readonly pct: number }): ReactNode {
  return (
    <span className="conf" role="img" aria-label={`confidence ${pct}%`}>
      <span className="conf-fill" style={{ width: `${pct}%` }} />
    </span>
  );
}

function StaleNote({ what, state }: { readonly what: string; readonly state: Freshness }): ReactNode {
  if (state === 'current') return null;
  return (
    <span className={`stale ${state}`}>
      {state === 'changed' ? `${what} edited since this run` : `${what} no longer saved`}
    </span>
  );
}

function Axis({ card }: { readonly card: AxisCard }): ReactNode {
  return (
    <section className={`axis-card${card.binding ? ' binding' : ''}`}>
      <div className="axis-head">
        <h4>{card.name}</h4>
        {card.binding && <span className="pill pill-warn">held back here</span>}
        <span className={`pill ${card.ruled ? '' : 'pill-none'}`}>
          {card.ruled ? card.level : 'no level'}
        </span>
      </div>
      <div className="axis-meter">
        <ConfidenceBar pct={card.confidencePct} />
        <span className="muted small">
          {card.confidencePct}% confidence · limited by {card.limitingFactor}
        </span>
      </div>
      {card.readings.length > 0 && (
        <details className="axis-readings">
          <summary>{card.readings.length} criteria</summary>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>criterion</th>
                  <th>role</th>
                  <th>status</th>
                  <th>level</th>
                  <th>conf.</th>
                  <th>evidence</th>
                </tr>
              </thead>
              <tbody>
                {card.readings.map((r, i) => (
                  <tr key={`${r.criterion}-${String(i)}`} className={r.ruled ? '' : 'muted'}>
                    <td><code>{r.criterion}</code></td>
                    <td>{r.role}</td>
                    <td>{r.status}</td>
                    <td>{r.level}</td>
                    <td>{r.confidencePct}%</td>
                    <td>{r.evidence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}

function History({
  points,
  selectedRunId,
  onSelectRun,
}: {
  readonly points: readonly HistoryPoint[];
  readonly selectedRunId: string;
  readonly onSelectRun: (id: string) => void;
}): ReactNode {
  const span = Math.max(1, ...points.map((p) => (p.levelIndex ?? 0) + 1));
  return (
    <section className="history">
      <h4>Over time</h4>
      <ol className="history-track">
        {points.map((p) => {
          const h = p.levelIndex === null ? 6 : Math.round(((p.levelIndex + 1) / span) * 100);
          return (
            <li key={p.runId}>
              <button
                type="button"
                className={`history-bar${p.runId === selectedRunId ? ' current' : ''}`}
                style={{ height: `${Math.max(h, 6)}%` }}
                onClick={() => onSelectRun(p.runId)}
                aria-current={p.runId === selectedRunId ? 'true' : undefined}
                title={`${p.date} — ${p.levelLabel}`}
              >
                <span className="sr-only">{`${p.date}: ${p.levelLabel}`}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function ProfileEvaluation({ vm, meta, history, selectedRunId, onSelectRun }: Props): ReactNode {
  return (
    <article className="fiche">
      <header className="fiche-head">
        <div>
          <h2>{vm.subjectId}</h2>
          <p className="muted small">
            {meta.date} · grid {meta.gridName}
            {!vm.gridKnown && ' · labels shown as ids'}
          </p>
        </div>
        <div className="fiche-flags">
          <StaleNote what="grid" state={meta.gridStale} />
          <StaleNote what="profile" state={meta.profileStale} />
        </div>
      </header>

      <section className="verdict">
        <div className="verdict-line">
          <span className={`verdict-level${vm.verdict.ruled ? '' : ' none'}`}>
            {vm.verdict.ruled ? vm.verdict.level : 'No level ruled'}
          </span>
          <ConfidenceBar pct={vm.verdict.confidencePct} />
          <span className="muted small">{vm.verdict.confidencePct}% confidence</span>
        </div>
        {vm.verdict.bindingAxis !== null && (
          <p className="muted small">held back by {vm.verdict.bindingAxis}</p>
        )}
        {vm.verdict.note !== '' && <p className="verdict-note">{vm.verdict.note}</p>}
        <Ladder scale={vm.scale} current={vm.verdict.ruled ? vm.verdict.level : null} />
      </section>

      {history.length > 1 && (
        <History points={history} selectedRunId={selectedRunId} onSelectRun={onSelectRun} />
      )}

      <section className="axes">
        <h4>Axes</h4>
        {vm.axes.map((card) => (
          <Axis key={card.id} card={card} />
        ))}
      </section>

      {(vm.progression.actions.length > 0 || vm.progression.targetLevel !== '—') && (
        <section className="progression">
          <h4>To reach {vm.progression.targetLevel}</h4>
          {vm.progression.bindingAxis !== null && (
            <p className="muted small">limited by {vm.progression.bindingAxis}</p>
          )}
          <ul>
            {vm.progression.actions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
