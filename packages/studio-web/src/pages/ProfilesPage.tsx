import { useState } from 'react';
import type { ReactNode } from 'react';
import { useOrgScopedLoad } from '../org/useOrgScopedLoad.js';
import { ApiError } from '../api/client.js';
import { ProfileForm } from '../profile/ProfileForm.js';
import { emptyForm, fromBody } from '../profile/form.js';
import type { ProfileFormState } from '../profile/form.js';
import * as profileApi from '../profile/profileApi.js';
import type { ProfileSummary } from '../profile/profileApi.js';

type Editing = { mode: 'list' } | { mode: 'new' } | { mode: 'edit'; id: string; initial: ProfileFormState };

const listForOrg = (orgId: string): Promise<ProfileSummary[]> => profileApi.listProfiles(orgId);

export function ProfilesPage(): ReactNode {
  const { orgId, data: rows, error, setError, reload } = useOrgScopedLoad(listForOrg, []);

  const [editing, setEditing] = useState<Editing>({ mode: 'list' });
  const [seed, setSeed] = useState<ProfileFormState | undefined>(undefined);
  const [issues, setIssues] = useState<readonly string[] | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  if (orgId === undefined) {
    return <section className="page"><p className="muted">No organisation selected.</p></section>;
  }

  const closeForm = (): void => {
    setSeed(undefined);
    setError(null);
    setIssues(undefined);
    setEditing({ mode: 'list' });
  };

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
    profileApi
      .deleteProfile(id)
      .then(reload)
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : 'delete failed'));
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
          onCancel={closeForm}
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
