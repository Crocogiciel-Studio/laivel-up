import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useOrg } from '../org/OrgProvider.js';
import { ApiError } from '../api/client.js';
import { ProfileForm } from '../profile/ProfileForm.js';
import { emptyForm, fromBody } from '../profile/form.js';
import type { ProfileFormState } from '../profile/form.js';
import * as profileApi from '../profile/profileApi.js';
import type { ProfileSummary } from '../profile/profileApi.js';

type Editing = { mode: 'list' } | { mode: 'new' } | { mode: 'edit'; id: string; initial: ProfileFormState };

export function ProfilesPage(): ReactNode {
  const { currentOrg } = useOrg();
  const orgId = currentOrg?.id;

  const [rows, setRows] = useState<ProfileSummary[]>([]);
  const [editing, setEditing] = useState<Editing>({ mode: 'list' });
  const [seed, setSeed] = useState<ProfileFormState | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<readonly string[] | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (orgId === undefined) return;
    setError(null);
    try {
      setRows(await profileApi.listProfiles(orgId));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'failed to load profiles');
    }
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (orgId === undefined) {
    return <section className="page"><p className="muted">No organisation selected.</p></section>;
  }

  const save = (name: string, body: unknown): void => {
    setSaving(true);
    setError(null);
    setIssues(undefined);
    const op =
      editing.mode === 'edit'
        ? profileApi.updateProfile(editing.id, { name, body })
        : profileApi.createProfile(orgId, name, body);
    op.then(() => {
      setEditing({ mode: 'list' });
      return load();
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
    profileApi.deleteProfile(id).then(load).catch(() => setError('delete failed'));
  };

  const cloneTemplate = (row: ProfileSummary): void => {
    setSeed(fromBody(`${row.name} (copy)`, row.body));
    setEditing({ mode: 'new' });
  };

  if (editing.mode !== 'list') {
    return (
      <section className="page">
        <h1>{editing.mode === 'edit' ? 'Edit profile' : 'New profile'}</h1>
        <ProfileForm
          initial={editing.mode === 'edit' ? editing.initial : seed}
          saving={saving}
          error={error}
          issues={issues}
          onSave={save}
          onCancel={() => {
            setSeed(undefined);
            setEditing({ mode: 'list' });
          }}
        />
      </section>
    );
  }

  const mine = rows.filter((r) => !r.isTemplate);
  const templates = rows.filter((r) => r.isTemplate);

  return (
    <section className="page">
      <h1>Profiles</h1>
      {error !== null && <p className="error">{error}</p>}
      <button type="button" onClick={() => { setSeed(emptyForm()); setEditing({ mode: 'new' }); }}>
        New profile
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
                    setEditing({ mode: 'edit', id: r.id, initial: fromBody(r.name, r.body) })
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
          {mine.length === 0 && <tr><td className="muted">No profiles yet.</td></tr>}
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
