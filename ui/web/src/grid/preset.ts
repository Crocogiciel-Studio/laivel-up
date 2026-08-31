// Grid-builder state <-> the `presets/*.json` shape that the CLI's `parseGrid`
// accepts (src/adapters/inbound/json-grid.ts). `toPreset` output must satisfy
// that schema byte-compatibly; `fromPreset` reads a stored grid body back.

export type Role = 'level' | 'confidence' | 'cap';

export interface LevelRow {
  id: string;
  label: string;
}

export interface BundleCard {
  criterionId: string;
  role: Role;
  weight: string; // kept as a string while editing
  params: Record<string, string>; // knob -> value, string while editing
}

export interface AxisLane {
  id: string;
  label: string;
  bundle: BundleCard[];
}

export interface GridBuilderState {
  gridId: string;
  label: string;
  evidenceFloor: string; // '' = omit
  levels: LevelRow[]; // rank is the row index
  axes: AxisLane[];
}

export interface PresetGrid {
  id: string;
  label?: string;
  evidenceFloor?: number;
  axisAggregation: 'confidence-weighted-vote';
  globalAggregation: 'min-across-axes';
  levels: { id: string; label?: string; rank: number }[];
  axes: {
    id: string;
    label?: string;
    bundle: { criterionId: string; weight: number; role: Role; params: Record<string, number> }[];
  }[];
}

export function emptyGrid(): GridBuilderState {
  return {
    gridId: '',
    label: '',
    evidenceFloor: '',
    levels: [
      { id: 'low', label: '' },
      { id: 'high', label: '' },
    ],
    axes: [{ id: 'axis-1', label: '', bundle: [] }],
  };
}

/** A fresh bundle card for a criterion, its params pre-filled from the catalogue defaults. */
export function cardFor(criterionId: string, paramDefaults: Record<string, number>): BundleCard {
  return {
    criterionId,
    role: 'level',
    weight: '1',
    params: Object.fromEntries(Object.entries(paramDefaults).map(([k, v]) => [k, String(v)])),
  };
}

// --- state -> preset -----------------------------------------------------------

function numOr(raw: string, fallback: number): number {
  const n = Number(raw.trim());
  return raw.trim() === '' || Number.isNaN(n) ? fallback : n;
}

export interface ToPresetResult {
  readonly preset: PresetGrid;
  readonly issues: readonly string[];
}

export function toPreset(state: GridBuilderState): ToPresetResult {
  const issues: string[] = [];

  const levelIds = state.levels.map((l) => l.id.trim());
  if (state.levels.length === 0) issues.push('add at least one level');
  if (new Set(levelIds).size !== levelIds.length) issues.push('level ids must be unique');
  if (levelIds.some((id) => id === '')) issues.push('every level needs an id');

  const axisIds = state.axes.map((a) => a.id.trim());
  if (state.axes.length === 0) issues.push('add at least one axis');
  if (new Set(axisIds).size !== axisIds.length) issues.push('axis ids must be unique');
  if (axisIds.some((id) => id === '')) issues.push('every axis needs an id');
  if (state.gridId.trim() === '') issues.push('the grid needs an id');

  const preset: PresetGrid = {
    id: state.gridId.trim(),
    axisAggregation: 'confidence-weighted-vote',
    globalAggregation: 'min-across-axes',
    levels: state.levels.map((l, rank) => ({
      id: l.id.trim(),
      ...(l.label.trim() === '' ? {} : { label: l.label.trim() }),
      rank,
    })),
    axes: state.axes.map((a) => ({
      id: a.id.trim(),
      ...(a.label.trim() === '' ? {} : { label: a.label.trim() }),
      bundle: a.bundle.map((c) => ({
        criterionId: c.criterionId,
        weight: numOr(c.weight, 1),
        role: c.role,
        params: Object.fromEntries(
          Object.entries(c.params).map(([k, v]) => [k, numOr(v, 0)]),
        ),
      })),
    })),
  };

  if (state.label.trim() !== '') preset.label = state.label.trim();
  if (state.evidenceFloor.trim() !== '') {
    const floor = Number(state.evidenceFloor.trim());
    if (Number.isNaN(floor) || floor < 0 || floor > 1) {
      issues.push('evidence floor must be between 0 and 1');
    } else {
      preset.evidenceFloor = floor;
    }
  }

  return { preset, issues };
}

// --- preset -> state ---------------------------------------------------------

export function fromPreset(name: string, body: unknown): GridBuilderState {
  const g = (typeof body === 'object' && body !== null ? body : {}) as Partial<PresetGrid>;
  const levels = Array.isArray(g.levels) ? [...g.levels].sort((a, b) => a.rank - b.rank) : [];

  // The builder's model is "rank = row order", so `toPreset` renumbers levels
  // to 0..n-1 on save. Every criterion indexes the grid by rank (`rank*` params,
  // resolved through `levelByRank`), so renumbering a grid whose stored ranks
  // are not already 0..n-1 would silently point those params at the wrong
  // level. Remap each rank-valued param through the same old-rank -> row-index
  // mapping here; identity for an already-contiguous grid, so a round-trip
  // stays structurally equal.
  const rankRemap = new Map(levels.map((l, i) => [l.rank, i]));
  const remapParam = (key: string, value: number | string): string =>
    /^rank/i.test(key) && typeof value === 'number' && rankRemap.has(value)
      ? String(rankRemap.get(value))
      : String(value);

  return {
    gridId: typeof g.id === 'string' ? g.id : name,
    label: typeof g.label === 'string' ? g.label : '',
    evidenceFloor: typeof g.evidenceFloor === 'number' ? String(g.evidenceFloor) : '',
    levels:
      levels.length > 0
        ? levels.map((l) => ({ id: l.id, label: l.label ?? '' }))
        : emptyGrid().levels,
    axes:
      Array.isArray(g.axes) && g.axes.length > 0
        ? g.axes.map((a) => ({
            id: a.id,
            label: a.label ?? '',
            bundle: (a.bundle ?? []).map((c) => ({
              criterionId: c.criterionId,
              role: c.role,
              weight: String(c.weight),
              params: Object.fromEntries(
                Object.entries(c.params ?? {}).map(([k, v]) => [k, remapParam(k, v)]),
              ),
            })),
          }))
        : emptyGrid().axes,
  };
}
