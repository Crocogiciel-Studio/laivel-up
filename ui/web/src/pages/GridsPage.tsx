import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useOrgScopedLoad } from '../org/useOrgScopedLoad.js';
import { ApiError } from '../api/client.js';
import { GridBuilder } from '../grid/GridBuilder.js';
import { emptyGrid, fromPreset } from '../grid/preset.js';
import type { GridBuilderState, PresetGrid } from '../grid/preset.js';
import * as gridApi from '../grid/gridApi.js';
import type { CatalogueEntry, GridSummary } from '../grid/gridApi.js';

type Editing =
  | { mode: 'list' }
  | { mode: 'new' }
  | { mode: 'edit'; id: string; initial: GridBuilderState };

export function GridsPage(): ReactNode {
  const { orgId, data: rows, error, setError, reload } = useOrgScopedLoad(gridApi.listGrids, []);

  const [catalogue, setCatalogue] = useState<CatalogueEntry[]>([]);
  const [editing, setEditing] = useState<Editing>({ mode: 'list' });
  const [seed, setSeed] = useState<GridBuilderState | undefined>(undefined);
  const [issues, setIssues] = useState<readonly string[] | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    gridApi.getCatalogue().then(setCatalogue).catch(() => {
      setError('could not load the criteria catalogue');
    });
  }, [setError]);

  if (orgId === undefined) {
    return <section className="page"><p className="muted">No organisation selected.</p></section>;
  }

  const closeForm = (): void => {
    setSeed(undefined);
    setError(null);
    setIssues(undefined);
    setEditing({ mode: 'list' });
  };

  const save = (name: string, preset: PresetGrid): void => {
    setSaving(true);
    setError(null);
    setIssues(undefined);
    const op =
      editing.mode === 'edit'
        ? gridApi.updateGrid(editing.id, { name, body: preset })
        : gridApi.createGrid(orgId, name, preset);
    op.then(() => {
      setEditing({ mode: 'list' });
      return reload();
    })
      .catch((e: unknown) => {
        if (e instanceof ApiError) {
          setError(e.message);
          setIssues(e.issues);
        } else {
          setError('save failed');
        }
      })
      .finally(() => setSaving(false));
  };

  const remove = (id: string): void => {
    gridApi
      .deleteGrid(id)
      .then(reload)
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : 'delete failed'));
  };

  const cloneTemplate = (row: GridSummary): void => {
    const seeded = fromPreset(row.name, row.body);
    seeded.gridId = `${row.name}-copy`; // fromPreset keeps the template's own id; a clone gets its own
    setSeed(seeded);
    setEditing({ mode: 'new' });
  };

  if (editing.mode !== 'list') {
    return (
      <section className="page">
        <h1>{editing.mode === 'edit' ? 'Edit grid' : 'New grid'}</h1>
        <GridBuilder
          initial={editing.mode === 'edit' ? editing.initial : seed}
          catalogue={catalogue}
          saving={saving}
          error={error}
          issues={issues}
          onSave={save}
          onCancel={closeForm}
        />
      </section>
    );
  }

  const mine = rows.filter((r) => !r.isTemplate);
  const templates = rows.filter((r) => r.isTemplate);

  return (
    <section className="page">
      <h1>Grids</h1>
      {error !== null && <p className="error">{error}</p>}
      <button type="button" onClick={() => { setSeed(emptyGrid()); setEditing({ mode: 'new' }); }}>
        New grid
      </button>

      <table className="grid-table">
        <tbody>
          {mine.map((r) => (
            <tr key={r.id}>
              <td>{r.name}</td>
              <td>
                <button
                  type="button"
                  className="secondary small"
                  onClick={() =>
                    setEditing({ mode: 'edit', id: r.id, initial: fromPreset(r.name, r.body) })
                  }
                >
                  edit
                </button>{' '}
                <button type="button" className="secondary small" onClick={() => remove(r.id)}>
                  delete
                </button>
              </td>
            </tr>
          ))}
          {mine.length === 0 && <tr><td className="muted">No grids yet.</td></tr>}
        </tbody>
      </table>

      {templates.length > 0 && (
        <>
          <h2>Templates</h2>
          <table className="grid-table">
            <tbody>
              {templates.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>
                    <button type="button" className="secondary small" onClick={() => cloneTemplate(r)}>
                      clone to edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
