import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { RAW_PR_FIELDS, SECTIONS, SUBJECT_FIELDS } from './schema.js';
import type { FieldDef, SectionKey } from './schema.js';
import { emptyForm, toBody } from './form.js';
import type { ProfileFormState } from './form.js';

interface Props {
  readonly initial?: ProfileFormState | undefined;
  readonly saving: boolean;
  readonly error: string | null;
  readonly issues?: readonly string[] | undefined;
  readonly onSave: (name: string, body: unknown) => void;
  readonly onCancel: () => void;
}

function Field({
  def,
  value,
  onChange,
}: {
  def: FieldDef;
  value: string;
  onChange: (v: string) => void;
}): ReactNode {
  // No `id`: a raw-PR row repeats the same field defs, which would duplicate
  // DOM ids across rows. The wrapping `<label>` already associates the control.
  const common = { value, onChange: (e: { target: { value: string } }) => onChange(e.target.value) };
  return (
    <label className="field">
      <span>{def.label}</span>
      {def.kind === 'bool' ? (
        <select {...common}>
          <option value="">—</option>
          <option value="true">yes</option>
          <option value="false">no</option>
        </select>
      ) : def.kind === 'textarea' || def.kind === 'stringList' ? (
        <textarea rows={def.kind === 'stringList' ? 2 : 4} {...common} />
      ) : (
        <input type={def.kind === 'text' ? 'text' : 'number'} {...common} />
      )}
    </label>
  );
}

export function ProfileForm({ initial, saving, error, issues, onSave, onCancel }: Props): ReactNode {
  const [form, setForm] = useState<ProfileFormState>(initial ?? emptyForm());
  // A stable id per raw-PR row, independent of its position, so React keeps
  // the right row (and its focus) mounted across a remove in the middle.
  const [prKeys, setPrKeys] = useState<string[]>(() => form.rawPRs.map(() => crypto.randomUUID()));
  const [localIssues, setLocalIssues] = useState<readonly string[]>([]);

  const setValue = (key: string, v: string): void =>
    setForm((f) => ({ ...f, values: { ...f.values, [key]: v } }));
  const setSubject = (key: string, v: string): void =>
    setForm((f) => ({ ...f, subject: { ...f.subject, [key]: v } }));
  const toggleSection = (key: SectionKey): void =>
    setForm((f) => ({ ...f, sections: { ...f.sections, [key]: !f.sections[key] } }));

  const setPR = (i: number, key: string, v: string): void =>
    setForm((f) => {
      const rawPRs = f.rawPRs.map((row, j) => (j === i ? { ...row, [key]: v } : row));
      return { ...f, rawPRs };
    });
  const addPR = (): void => {
    setForm((f) => ({ ...f, rawPRs: [...f.rawPRs, {}] }));
    setPrKeys((keys) => [...keys, crypto.randomUUID()]);
  };
  const removePR = (i: number): void => {
    setForm((f) => ({ ...f, rawPRs: f.rawPRs.filter((_, j) => j !== i) }));
    setPrKeys((keys) => keys.filter((_, j) => j !== i));
  };

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    const { body, issues: clientIssues } = toBody(form);
    if (clientIssues.length > 0) {
      setLocalIssues(clientIssues);
      return;
    }
    setLocalIssues([]);
    onSave(form.name.trim(), body);
  };

  return (
    <form className="profile-form" onSubmit={submit}>
      <label className="field">
        <span>Profile name</span>
        <input
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          required
        />
      </label>

      <fieldset>
        <legend>Subject</legend>
        {SUBJECT_FIELDS.map((f) => (
          <Field key={f.key} def={f} value={form.subject[f.key] ?? ''} onChange={(v) => setSubject(f.key, v)} />
        ))}
      </fieldset>

      {SECTIONS.map((section) => {
        const on = form.sections[section.key];
        return (
          <fieldset key={section.key} className={on ? 'section on' : 'section'}>
            <legend>
              <label>
                <input type="checkbox" checked={on} onChange={() => toggleSection(section.key)} />{' '}
                {section.label}
              </label>
            </legend>

            {on && section.fields?.map((f) => (
              <Field
                key={f.key}
                def={f}
                value={form.values[`${section.key}.${f.key}`] ?? ''}
                onChange={(v) => setValue(`${section.key}.${f.key}`, v)}
              />
            ))}

            {on &&
              section.groups?.map((group) => (
                <div key={group.key} className="group">
                  <h4>{group.label}</h4>
                  {group.fields.map((f) => (
                    <Field
                      key={f.key}
                      def={f}
                      value={form.values[`${section.key}.${group.key}.${f.key}`] ?? ''}
                      onChange={(v) => setValue(`${section.key}.${group.key}.${f.key}`, v)}
                    />
                  ))}
                </div>
              ))}

            {on && section.rawPullRequests && (
              <div className="group">
                <h4>Raw pull requests</h4>
                {form.rawPRs.map((row, i) => (
                  <div key={prKeys[i]} className="raw-pr">
                    {RAW_PR_FIELDS.map((f) => (
                      <Field
                        key={f.key}
                        def={f}
                        value={row[f.key] ?? ''}
                        onChange={(v) => setPR(i, f.key, v)}
                      />
                    ))}
                    <button type="button" className="secondary small" onClick={() => removePR(i)}>
                      remove
                    </button>
                  </div>
                ))}
                <button type="button" className="secondary small" onClick={addPR}>
                  + pull request
                </button>
              </div>
            )}
          </fieldset>
        );
      })}

      {error !== null && <p className="error">{error}</p>}
      {localIssues.length > 0 && (
        <ul className="error">
          {localIssues.map((it) => (
            <li key={it}>{it}</li>
          ))}
        </ul>
      )}
      {issues !== undefined && issues.length > 0 && (
        <ul className="error">
          {issues.map((it) => (
            <li key={it}>{it}</li>
          ))}
        </ul>
      )}

      <div className="actions">
        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save profile'}
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
