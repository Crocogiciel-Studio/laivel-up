import { api } from '../api/client.js';
import type { Evaluation } from '@laivel-up/ui/evaluation';

export interface RunView {
  readonly id: string;
  readonly orgId: string;
  readonly createdBy: string | null;
  readonly subjectId: string;
  readonly gridSnapshot: unknown;
  readonly profileSnapshot: unknown;
  readonly evaluation: Evaluation;
  readonly createdAt: string;
}

export interface CreateRunInput {
  readonly orgId: string;
  readonly gridId: string;
  readonly profileId: string;
  readonly subjectId?: string;
  readonly minRuledAxes?: number;
}

export const listRuns = (orgId: string, subjectId?: string): Promise<RunView[]> => {
  const q = new URLSearchParams({ orgId });
  if (subjectId !== undefined && subjectId !== '') q.set('subjectId', subjectId);
  return api(`/api/runs?${q.toString()}`);
};

export const getRun = (id: string): Promise<RunView> => api(`/api/runs/${id}`);

export const createRun = (input: CreateRunInput): Promise<RunView> =>
  api('/api/runs', { method: 'POST', body: JSON.stringify(input) });
