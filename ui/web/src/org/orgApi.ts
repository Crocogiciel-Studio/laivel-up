import { api } from '../api/client.js';

export type Role = 'admin' | 'member';

export interface Member {
  readonly userId: string;
  readonly email: string | null;
  readonly role: Role;
  readonly joinedAt: string;
}

export interface Invite {
  readonly id: string;
  readonly token: string;
  readonly email: string | null;
  readonly role: Role;
  readonly expiresAt: string;
  readonly acceptedAt: string | null;
  readonly createdAt: string;
}

export const listMembers = (orgId: string): Promise<Member[]> =>
  api(`/api/orgs/${orgId}/members`);

export const setRole = (orgId: string, userId: string, role: Role): Promise<void> =>
  api(`/api/orgs/${orgId}/members/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });

export const removeMember = (orgId: string, userId: string): Promise<void> =>
  api(`/api/orgs/${orgId}/members/${userId}`, { method: 'DELETE' });

export const listInvites = (orgId: string): Promise<Invite[]> =>
  api(`/api/orgs/${orgId}/invites`);

export const createInvite = (
  orgId: string,
  input: { email?: string; role: Role },
): Promise<Invite> =>
  api(`/api/orgs/${orgId}/invites`, { method: 'POST', body: JSON.stringify(input) });

export const revokeInvite = (orgId: string, inviteId: string): Promise<void> =>
  api(`/api/orgs/${orgId}/invites/${inviteId}`, { method: 'DELETE' });

export const acceptInvite = (token: string): Promise<{ orgId: string; role: Role }> =>
  api(`/api/invites/${token}/accept`, { method: 'POST' });

/** The link an admin shares. */
export const inviteLink = (token: string): string =>
  `${window.location.origin}/invite/${token}`;
