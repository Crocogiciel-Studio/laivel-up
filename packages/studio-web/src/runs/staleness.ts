// A run stores a full copy of the grid and profile it scored, and no link back
// to the rows they came from. So "has the source changed since?" is a
// best-effort match: a grid snapshot is tied to the saved grid with the same
// preset id, a profile snapshot to the saved profile with the same subject id
// (an org realistically keeps one profile per developer). `unlinked` means no
// such row exists any more -- deleted, or it was an inline/template body.

export type Freshness = 'current' | 'changed' | 'unlinked';

/** Deterministic JSON with sorted keys, so member order does not read as a change. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

const idOf = (body: unknown): string | undefined => {
  const id = (body as { id?: unknown } | null)?.id;
  return typeof id === 'string' ? id : undefined;
};

const subjectIdOf = (body: unknown): string | undefined => {
  const subject = (body as { subject?: { id?: unknown } } | null)?.subject;
  return typeof subject?.id === 'string' ? subject.id : undefined;
};

function freshness(
  snapshot: unknown,
  current: readonly { readonly body: unknown }[],
  keyOf: (body: unknown) => string | undefined,
): Freshness {
  const key = keyOf(snapshot);
  if (key === undefined) return 'unlinked';
  const matches = current.filter((row) => keyOf(row.body) === key);
  if (matches.length === 0) return 'unlinked';
  // Several rows can share a key (two grids cloned from one preset id, two
  // profiles for one subject). The run is fresh if any of them still matches.
  const wanted = stableStringify(snapshot);
  return matches.some((row) => stableStringify(row.body) === wanted) ? 'current' : 'changed';
}

export function gridFreshness(
  snapshot: unknown,
  grids: readonly { readonly body: unknown }[],
): Freshness {
  return freshness(snapshot, grids, idOf);
}

export function profileFreshness(
  snapshot: unknown,
  profiles: readonly { readonly body: unknown }[],
): Freshness {
  return freshness(snapshot, profiles, subjectIdOf);
}
