import { api } from '../api/client.js';

export interface ProfileSummary {
  readonly id: string;
  readonly orgId: string | null;
  readonly createdBy: string | null;
  readonly name: string;
  readonly body: unknown;
  readonly isTemplate: boolean;
  readonly updatedAt: string;
}

export const listProfiles = (orgId: string): Promise<ProfileSummary[]> =>
  api(`/api/profiles?orgId=${orgId}`);

export const getProfile = (id: string): Promise<ProfileSummary> => api(`/api/profiles/${id}`);

export const createProfile = (
  orgId: string,
  name: string,
  body: unknown,
): Promise<ProfileSummary> =>
  api('/api/profiles', { method: 'POST', body: JSON.stringify({ orgId, name, body }) });

export const updateProfile = (
  id: string,
  patch: { name?: string; body?: unknown },
): Promise<ProfileSummary> =>
  api(`/api/profiles/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });

export const deleteProfile = (id: string): Promise<void> =>
  api(`/api/profiles/${id}`, { method: 'DELETE' });
