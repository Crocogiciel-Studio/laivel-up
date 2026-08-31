import { RAW_PR_FIELDS, SECTIONS, SUBJECT_FIELDS } from './schema.js';
import type { FieldDef, SectionKey } from './schema.js';

export interface ProfileFormState {
  name: string;
  subject: Record<string, string>;
  sections: Record<SectionKey, boolean>;
  /** keyed "section.field" for flat sections, "section.group.field" for groups */
  values: Record<string, string>;
  rawPRs: Record<string, string>[];
}

export function emptyForm(): ProfileFormState {
  return {
    name: '',
    subject: {},
    sections: {
      declared: false,
      vcsActivity: false,
      staticAnalysis: false,
      toolingContext: false,
      workSession: false,
    },
    values: {},
    rawPRs: [],
  };
}

// --- form -> body ----------------------------------------------------------------

function scalar(field: FieldDef, raw: string | undefined): unknown {
  const value = (raw ?? '').trim();
  if (value === '') return undefined;
  switch (field.kind) {
    case 'number':
      return Number.isNaN(Number(value)) ? undefined : Number(value);
    case 'int': {
      const parsed = Number.parseInt(value, 10);
      return Number.isNaN(parsed) ? undefined : parsed;
    }
    case 'bool':
      return value === 'true';
    case 'stringList':
      return value
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean);
    case 'textarea':
      return field.key === 'notes'
        ? value.split('\n').map((s) => s.trim()).filter(Boolean)
        : value;
    case 'text':
      return value;
  }
}

function pruneEmpty(obj: Record<string, unknown>): Record<string, unknown> | undefined {
  const entries = Object.entries(obj).filter(([, v]) => v !== undefined);
  return entries.length === 0 ? undefined : Object.fromEntries(entries);
}

export function toBody(form: ProfileFormState): Record<string, unknown> {
  const body: Record<string, unknown> = {};

  const subject: Record<string, unknown> = {};
  for (const f of SUBJECT_FIELDS) {
    const v = scalar(f, form.subject[f.key]);
    if (v !== undefined) subject[f.key] = v;
  }
  body.subject = subject;

  for (const section of SECTIONS) {
    if (!form.sections[section.key]) continue;

    if (section.fields) {
      const out: Record<string, unknown> = {};
      for (const f of section.fields) {
        const v = scalar(f, form.values[`${section.key}.${f.key}`]);
        if (v !== undefined) out[f.key] = v;
      }
      if (section.key === 'toolingContext') {
        // required by the model
        out.projectMemoryPresent = form.values['toolingContext.projectMemoryPresent'] === 'true';
        for (const k of ['rulesCount', 'skillsCount', 'agentsCount', 'hooksCount']) {
          out[k] = out[k] ?? 0;
        }
      }
      body[section.key] = out;
      continue;
    }

    // vcsActivity: groups + rawPullRequests
    const vcs: Record<string, unknown> = {};
    for (const group of section.groups ?? []) {
      const g: Record<string, unknown> = {};
      for (const f of group.fields) {
        const v = scalar(f, form.values[`${section.key}.${group.key}.${f.key}`]);
        if (v !== undefined) g[f.key] = v;
      }
      if (group.key === 'pullRequests') {
        const sd = ['sd_xs', 'sd_s', 'sd_m', 'sd_l', 'sd_xl'].map((k) => g[k]);
        for (const k of ['sd_xs', 'sd_s', 'sd_m', 'sd_l', 'sd_xl']) delete g[k];
        if (sd.every((x) => typeof x === 'number')) {
          g.sizeDistribution = { xs: sd[0], s: sd[1], m: sd[2], l: sd[3], xl: sd[4] };
        }
      }
      const pruned = pruneEmpty(g);
      if (pruned !== undefined) vcs[group.key] = pruned;
    }

    const prs = form.rawPRs
      .map((row) => {
        const pr: Record<string, unknown> = {};
        for (const f of RAW_PR_FIELDS) {
          const v = scalar(f, row[f.key]);
          if (v !== undefined) pr[f.key] = v;
        }
        return pr;
      })
      .filter((pr) => Object.keys(pr).length > 0);
    if (prs.length > 0) vcs.rawPullRequests = prs;

    body[section.key] = vcs;
  }

  return body;
}

// --- body -> form ----------------------------------------------------------------

function toStr(v: unknown): string {
  if (v === undefined || v === null) return '';
  if (Array.isArray(v)) return v.join('\n');
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
}

export function fromBody(name: string, body: unknown): ProfileFormState {
  const form = emptyForm();
  form.name = name;
  if (typeof body !== 'object' || body === null) return form;
  const b = body as Record<string, unknown>;

  const subject = (b.subject ?? {}) as Record<string, unknown>;
  for (const f of SUBJECT_FIELDS) form.subject[f.key] = toStr(subject[f.key]);

  for (const section of SECTIONS) {
    const raw = b[section.key];
    if (raw === undefined) continue;
    form.sections[section.key] = true;
    const s = (raw ?? {}) as Record<string, unknown>;

    if (section.fields) {
      for (const f of section.fields) {
        form.values[`${section.key}.${f.key}`] = toStr(s[f.key]);
      }
      continue;
    }

    for (const group of section.groups ?? []) {
      const g = (s[group.key] ?? {}) as Record<string, unknown>;
      const sd = (g.sizeDistribution ?? {}) as Record<string, unknown>;
      for (const f of group.fields) {
        const map: Record<string, unknown> = {
          sd_xs: sd.xs,
          sd_s: sd.s,
          sd_m: sd.m,
          sd_l: sd.l,
          sd_xl: sd.xl,
        };
        form.values[`${section.key}.${group.key}.${f.key}`] = toStr(map[f.key] ?? g[f.key]);
      }
    }
    if (Array.isArray(s.rawPullRequests)) {
      form.rawPRs = (s.rawPullRequests as Record<string, unknown>[]).map((pr) => {
        const row: Record<string, string> = {};
        for (const f of RAW_PR_FIELDS) row[f.key] = toStr(pr[f.key]);
        return row;
      });
    }
  }

  return form;
}
