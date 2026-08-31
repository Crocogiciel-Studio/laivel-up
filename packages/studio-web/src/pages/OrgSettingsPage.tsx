import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useAuth } from '../auth/AuthProvider.js';
import { useOrg } from '../org/OrgProvider.js';
import { useOrgScopedLoad } from '../org/useOrgScopedLoad.js';
import { ApiError } from '../api/client.js';
import * as orgApi from '../org/orgApi.js';
import type { Invite, Member, Role } from '../org/orgApi.js';

interface Roster {
  readonly members: readonly Member[];
  readonly invites: readonly Invite[];
}

const EMPTY_ROSTER: Roster = { members: [], invites: [] };

async function loadRoster(orgId: string): Promise<Roster> {
  const [members, invites] = await Promise.all([
    orgApi.listMembers(orgId),
    orgApi.listInvites(orgId),
  ]);
  return { members, invites: invites.filter((i) => i.acceptedAt === null) };
}

export function OrgSettingsPage(): ReactNode {
  const { session } = useAuth();
  const { currentOrg } = useOrg();
  const myId = session?.user.id;

  const { orgId, data: roster, error, setError, reload } = useOrgScopedLoad(loadRoster, EMPTY_ROSTER);
  const { members, invites } = roster;

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('member');

  const iAmAdmin = members.find((m) => m.userId === myId)?.role === 'admin';

  if (orgId === undefined) {
    return <section className="page"><p className="muted">No organisation selected.</p></section>;
  }

  const guard = (fn: () => Promise<unknown>) => () => {
    fn()
      .then(reload)
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : 'request failed'));
  };

  const onInvite = (e: FormEvent): void => {
    e.preventDefault();
    guard(() =>
      orgApi.createInvite(orgId, { role, ...(email.trim() === '' ? {} : { email: email.trim() }) }),
    )();
    setEmail('');
  };

  return (
    <section className="page">
      <h1>{currentOrg?.name} — settings</h1>
      {error !== null && <p className="error">{error}</p>}

      <h2>Members</h2>
      <table className="grid-table">
        <tbody>
          {members.map((m) => (
            <tr key={m.userId}>
              <td>{m.email ?? m.userId}{m.userId === myId ? ' (you)' : ''}</td>
              <td className="muted">{m.role}</td>
              <td>
                {iAmAdmin && m.userId !== myId && (
                  <>
                    <button
                      type="button"
                      className="secondary small"
                      onClick={guard(() =>
                        orgApi.setRole(orgId, m.userId, m.role === 'admin' ? 'member' : 'admin'),
                      )}
                    >
                      make {m.role === 'admin' ? 'member' : 'admin'}
                    </button>{' '}
                    <button
                      type="button"
                      className="secondary small"
                      onClick={guard(() => orgApi.removeMember(orgId, m.userId))}
                    >
                      remove
                    </button>
                  </>
                )}
                {m.userId === myId && members.length > 1 && (
                  <button
                    type="button"
                    className="secondary small"
                    onClick={guard(() => orgApi.removeMember(orgId, m.userId))}
                  >
                    leave
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {iAmAdmin && (
        <>
          <h2>Invites</h2>
          <form className="invite-form" onSubmit={onInvite}>
            <input
              type="email"
              placeholder="email (optional — pins the invite)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="member">member</option>
              <option value="admin">admin</option>
            </select>
            <button type="submit">Create invite</button>
          </form>
          <ul className="invite-list">
            {invites.map((inv) => (
              <li key={inv.id}>
                <code>{orgApi.inviteLink(inv.token)}</code>{' '}
                <span className="muted small">{inv.role}{inv.email !== null ? ` · ${inv.email}` : ''}</span>{' '}
                <button
                  type="button"
                  className="secondary small"
                  onClick={() => void navigator.clipboard?.writeText(orgApi.inviteLink(inv.token))}
                >
                  copy
                </button>{' '}
                <button
                  type="button"
                  className="secondary small"
                  onClick={guard(() => orgApi.revokeInvite(orgId, inv.id))}
                >
                  revoke
                </button>
              </li>
            ))}
            {invites.length === 0 && <li className="muted">No pending invites.</li>}
          </ul>
        </>
      )}
    </section>
  );
}
