import { api } from '../api/client.js';
import type { PresetGrid } from './preset.js';

export interface GridSummary {
  readonly id: string;
  readonly orgId: string | null;
  readonly createdBy: string | null;
  readonly name: string;
  readonly body: unknown;
  readonly isTemplate: boolean;
  readonly updatedAt: string;
}

export interface CatalogueEntry {
  readonly id: string;
  readonly needs: readonly string[];
  readonly paramDefaults: Readonly<Record<string, number>>;
}

export const getCatalogue = (): Promise<CatalogueEntry[]> => api('/api/catalogue');

export const listGrids = (orgId: string): Promise<GridSummary[]> =>
  api(`/api/grids?orgId=${orgId}`);

export const createGrid = (orgId: string, name: string, body: PresetGrid): Promise<GridSummary> =>
  api('/api/grids', { method: 'POST', body: JSON.stringify({ orgId, name, body }) });

export const updateGrid = (
  id: string,
  patch: { name?: string; body?: PresetGrid },
): Promise<GridSummary> =>
  api(`/api/grids/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });

export const deleteGrid = (id: string): Promise<void> =>
  api(`/api/grids/${id}`, { method: 'DELETE' });
