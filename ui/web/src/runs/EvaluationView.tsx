import type { ReactNode } from 'react';
import type { ViewModel, AxisCard } from '@laivel-up/ui/view-model';

function Meter({ pct }: { readonly pct: number }): ReactNode {
  return (
    <span className="eval-meter" role="img" aria-label={`${pct}%`}>
      <span className="eval-meter-fill" style={{ width: `${pct}%` }} />
    </span>
  );
}

function Axis({ card }: { readonly card: AxisCard }): ReactNode {
  return (
    <section className={`eval-axis${card.binding ? ' binding' : ''}`}>
      <header>
        <h4>{card.name}</h4>
        {card.binding && <span className="eval-tag">binding</span>}
        <span className="eval-level">{card.ruled ? card.level : 'no level'}</span>
        <Meter pct={card.confidencePct} />
        <span className="muted small">{card.confidencePct}% · {card.limitingFactor}</span>
      </header>
      {card.readings.length > 0 && (
        <div className="eval-readings-wrap">
          <table className="eval-readings">
            <thead>
              <tr>
                <th>criterion</th>
                <th>role</th>
                <th>status</th>
                <th>level</th>
                <th>raw</th>
                <th>conf.</th>
                <th>evidence</th>
              </tr>
            </thead>
            <tbody>
              {card.readings.map((r) => (
                <tr key={r.criterion} className={r.ruled ? '' : 'muted'}>
                  <td><code>{r.criterion}</code></td>
                  <td>{r.role}</td>
                  <td>{r.status}</td>
                  <td>{r.level}</td>
                  <td>{r.raw}</td>
                  <td>{r.confidencePct}%</td>
                  <td>{r.evidence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function EvaluationView({ vm }: { readonly vm: ViewModel }): ReactNode {
  return (
    <div className="eval">
      <section className="eval-verdict">
        <div>
          <span className="eval-level big">{vm.verdict.ruled ? vm.verdict.level : 'No level ruled'}</span>
          <Meter pct={vm.verdict.confidencePct} />
          <span className="muted small">{vm.verdict.confidencePct}% confidence</span>
        </div>
        <p className="muted small">
          {vm.subjectId} · grid {vm.gridId}
          {!vm.gridKnown && ' · labels shown as ids'}
          {vm.verdict.bindingAxis !== null && ` · held back by ${vm.verdict.bindingAxis}`}
        </p>
        {vm.verdict.note !== '' && <p className="eval-note">{vm.verdict.note}</p>}
        {vm.scale.length > 0 && (
          <div className="eval-scale">
            {vm.scale.map((label) => (
              <span
                key={label}
                className={`eval-scale-step${label === vm.verdict.level ? ' here' : ''}`}
              >
                {label}
              </span>
            ))}
          </div>
        )}
      </section>

      <div className="eval-axes">
        {vm.axes.map((card) => (
          <Axis key={card.id} card={card} />
        ))}
      </div>

      {(vm.progression.actions.length > 0 || vm.progression.targetLevel !== '—') && (
        <section className="eval-progression">
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
    </div>
  );
}
