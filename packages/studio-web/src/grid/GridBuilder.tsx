import { useMemo, useState } from 'react';
import type { DragEvent, FormEvent, ReactNode } from 'react';
import type { CatalogueEntry } from './gridApi.js';
import {
  cardFor,
  emptyGrid,
  toPreset,
} from './preset.js';
import type { BundleCard, GridBuilderState, Role } from './preset.js';

const ROLES: readonly Role[] = ['level', 'confidence', 'cap'];
const DND_TYPE = 'application/x-laivel-criterion';

interface Props {
  readonly initial?: GridBuilderState | undefined;
  readonly catalogue: readonly CatalogueEntry[];
  readonly saving: boolean;
  readonly error: string | null;
  readonly issues?: readonly string[] | undefined;
  readonly onSave: (name: string, preset: ReturnType<typeof toPreset>['preset']) => void;
  readonly onCancel: () => void;
}

export function GridBuilder({
  initial,
  catalogue,
  saving,
  error,
  issues,
  onSave,
  onCancel,
}: Props): ReactNode {
  const [name, setName] = useState(initial?.gridId ?? '');
  const [grid, setGrid] = useState<GridBuilderState>(initial ?? emptyGrid());
  const [localIssues, setLocalIssues] = useState<readonly string[]>([]);

  const defaultsById = useMemo(
    () => new Map(catalogue.map((c) => [c.id, c.paramDefaults])),
    [catalogue],
  );

  const { preset } = useMemo(() => toPreset({ ...grid, gridId: name }), [grid, name]);

  const patch = (fn: (g: GridBuilderState) => GridBuilderState): void => setGrid(fn);

  const addCriterion = (axisIdx: number, criterionId: string): void => {
    if (criterionId === '') return;
    const card = cardFor(criterionId, defaultsById.get(criterionId) ?? {});
    patch((g) => ({
      ...g,
      axes: g.axes.map((a, i) => (i === axisIdx ? { ...a, bundle: [...a.bundle, card] } : a)),
    }));
  };

  const updateCard = (
    axisIdx: number,
    cardIdx: number,
    fn: (c: BundleCard) => BundleCard,
  ): void =>
    patch((g) => ({
      ...g,
      axes: g.axes.map((a, i) =>
        i === axisIdx
          ? { ...a, bundle: a.bundle.map((c, j) => (j === cardIdx ? fn(c) : c)) }
          : a,
      ),
    }));

  const removeCard = (axisIdx: number, cardIdx: number): void =>
    patch((g) => ({
      ...g,
      axes: g.axes.map((a, i) =>
        i === axisIdx ? { ...a, bundle: a.bundle.filter((_, j) => j !== cardIdx) } : a,
      ),
    }));

  const setAxisField = (axisIdx: number, field: 'id' | 'label', value: string): void =>
    patch((g) => ({
      ...g,
      axes: g.axes.map((a, i) => (i === axisIdx ? { ...a, [field]: value } : a)),
    }));

  const addAxis = (): void =>
    patch((g) => {
      let n = g.axes.length + 1;
      while (g.axes.some((a) => a.id === `axis-${n}`)) n += 1;
      return { ...g, axes: [...g.axes, { id: `axis-${n}`, label: '', bundle: [] }] };
    });
  const removeAxis = (axisIdx: number): void =>
    patch((g) => ({ ...g, axes: g.axes.filter((_, i) => i !== axisIdx) }));

  const setLevelField = (idx: number, field: 'id' | 'label', value: string): void =>
    patch((g) => ({
      ...g,
      levels: g.levels.map((l, i) => (i === idx ? { ...l, [field]: value } : l)),
    }));
  const addLevel = (): void =>
    patch((g) => ({ ...g, levels: [...g.levels, { id: '', label: '' }] }));
  const removeLevel = (idx: number): void =>
    patch((g) => ({ ...g, levels: g.levels.filter((_, i) => i !== idx) }));
  const moveLevel = (idx: number, dir: -1 | 1): void =>
    patch((g) => {
      const to = idx + dir;
      if (to < 0 || to >= g.levels.length) return g;
      const levels = [...g.levels];
      const [row] = levels.splice(idx, 1);
      levels.splice(to, 0, row as (typeof levels)[number]);
      return { ...g, levels };
    });

  const onDrop = (axisIdx: number) => (e: DragEvent): void => {
    e.preventDefault();
    const criterionId = e.dataTransfer.getData(DND_TYPE);
    if (criterionId !== '') addCriterion(axisIdx, criterionId);
  };

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    const { preset: out, issues: clientIssues } = toPreset({ ...grid, gridId: name });
    if (clientIssues.length > 0) {
      setLocalIssues(clientIssues);
      return;
    }
    setLocalIssues([]);
    onSave(name.trim(), out);
  };

  return (
    <form className="grid-builder" onSubmit={submit}>
      <div className="gb-head">
        <label className="field">
          <span>Grid id</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="field">
          <span>Label</span>
          <input
            value={grid.label}
            onChange={(e) => patch((g) => ({ ...g, label: e.target.value }))}
          />
        </label>
        <label className="field">
          <span>Evidence floor (0–1)</span>
          <input
            type="number"
            step="0.01"
            value={grid.evidenceFloor}
            onChange={(e) => patch((g) => ({ ...g, evidenceFloor: e.target.value }))}
          />
        </label>
      </div>

      <div className="gb-body">
        <aside className="gb-palette" aria-label="criteria">
          <h4>Criteria</h4>
          {catalogue.map((c) => (
            <div
              key={c.id}
              className="gb-chip"
              draggable
              onDragStart={(e) => e.dataTransfer.setData(DND_TYPE, c.id)}
            >
              <code>{c.id}</code>
              <span className="muted small">{c.needs.join(', ') || 'no inputs'}</span>
            </div>
          ))}
        </aside>

        <div className="gb-axes">
          {grid.axes.map((axis, ai) => (
            <section
              key={ai}
              className="gb-axis"
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop(ai)}
            >
              <header>
                <input
                  aria-label={`axis ${ai + 1} id`}
                  value={axis.id}
                  onChange={(e) => setAxisField(ai, 'id', e.target.value)}
                />
                <input
                  aria-label={`axis ${ai + 1} label`}
                  placeholder="label"
                  value={axis.label}
                  onChange={(e) => setAxisField(ai, 'label', e.target.value)}
                />
                <button type="button" className="secondary small" onClick={() => removeAxis(ai)}>
                  remove axis
                </button>
              </header>

              {axis.bundle.map((card, ci) => (
                <div key={ci} className="gb-card">
                  <div className="gb-card-head">
                    <code>{card.criterionId}</code>
                    <select
                      aria-label={`${card.criterionId} role`}
                      value={card.role}
                      onChange={(e) =>
                        updateCard(ai, ci, (c) => ({ ...c, role: e.target.value as Role }))
                      }
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    <label className="inline">
                      weight{' '}
                      <input
                        type="number"
                        step="0.1"
                        aria-label={`${card.criterionId} weight`}
                        value={card.weight}
                        onChange={(e) =>
                          updateCard(ai, ci, (c) => ({ ...c, weight: e.target.value }))
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="secondary small"
                      aria-label={`remove ${card.criterionId} from axis ${ai + 1}`}
                      onClick={() => removeCard(ai, ci)}
                    >
                      remove
                    </button>
                  </div>
                  <div className="gb-params">
                    {Object.keys(card.params).length === 0 && (
                      <span className="muted small">no params</span>
                    )}
                    {Object.entries(card.params).map(([k, v]) => (
                      <label key={k} className="field small">
                        <span>{k}</span>
                        <input
                          type="number"
                          step="any"
                          aria-label={`${card.criterionId} ${k}`}
                          value={v}
                          onChange={(e) =>
                            updateCard(ai, ci, (c) => ({
                              ...c,
                              params: { ...c.params, [k]: e.target.value },
                            }))
                          }
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ))}

              <div className="gb-add">
                <select
                  aria-label={`add criterion to axis ${ai + 1}`}
                  value=""
                  onChange={(e) => {
                    addCriterion(ai, e.target.value);
                    e.currentTarget.value = '';
                  }}
                >
                  <option value="">+ add criterion…</option>
                  {catalogue.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.id}
                    </option>
                  ))}
                </select>
              </div>
            </section>
          ))}
          <button type="button" className="secondary small" onClick={addAxis}>
            + axis
          </button>
        </div>
      </div>

      <div className="gb-levels">
        <h4>Levels (rank = row order, low → high)</h4>
        {grid.levels.map((lvl, i) => (
          <div key={i} className="gb-level-row">
            <span className="muted small">{i}</span>
            <input
              aria-label={`level ${i} id`}
              placeholder="id"
              value={lvl.id}
              onChange={(e) => setLevelField(i, 'id', e.target.value)}
            />
            <input
              aria-label={`level ${i} label`}
              placeholder="label"
              value={lvl.label}
              onChange={(e) => setLevelField(i, 'label', e.target.value)}
            />
            <button type="button" className="secondary small" onClick={() => moveLevel(i, -1)}>
              ↑
            </button>
            <button type="button" className="secondary small" onClick={() => moveLevel(i, 1)}>
              ↓
            </button>
            <button type="button" className="secondary small" onClick={() => removeLevel(i)}>
              remove
            </button>
          </div>
        ))}
        <button type="button" className="secondary small" onClick={addLevel}>
          + level
        </button>
      </div>

      <details className="gb-preview">
        <summary>JSON preview</summary>
        <pre>{JSON.stringify(preset, null, 2)}</pre>
      </details>

      {error !== null && <p className="error">{error}</p>}
      {[...localIssues, ...(issues ?? [])].length > 0 && (
        <ul className="error">
          {[...localIssues, ...(issues ?? [])].map((it) => (
            <li key={it}>{it}</li>
          ))}
        </ul>
      )}

      <div className="actions">
        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save grid'}
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
