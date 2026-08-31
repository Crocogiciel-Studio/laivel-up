import { describe, expect, it, beforeEach } from 'vitest';
import type { LightMyRequestResponse } from 'fastify';
import type { Evaluation } from 'laivel-up';
import type { Authenticator } from './auth.js';
import type {
  ArtifactKind,
  ArtifactRow,
  Db,
  OrgInviteRow,
  OrgRow,
  RunRow,
  Store,
} from './db.js';
import type { RunEvaluation } from './engine.js';
import type { ValidateArtifact } from './validation.js';
import { createApp } from './app.js';

const U1_ID = '00000000-0000-0000-0000-0000000000a1';
const U2_ID = '00000000-0000-0000-0000-0000000000a2';

const auth: Authenticator = {
  verify: (jwt) =>
    Promise.resolve(
      jwt === 'u1-token' ? { id: U1_ID, jwt } : jwt === 'u2-token' ? { id: U2_ID, jwt } : null,
    ),
};

// A body is "valid" to the fake validator when it carries `{ valid: true }`.
const validateArtifact: ValidateArtifact = (_kind, body) =>
  typeof body === 'object' && body !== null && (body as { valid?: unknown }).valid === true
    ? { ok: true, value: undefined }
    : { ok: false, error: { message: 'invalid body', issues: ['not marked valid'] } };

const runEvaluation: RunEvaluation = (gridBody, profileBody, input) =>
  typeof gridBody === 'object' && gridBody !== null && (gridBody as { bad?: unknown }).bad === true
    ? { ok: false, error: { message: 'bad grid', issues: [] } }
    : { ok: true, value: { echoed: { gridBody, profileBody, input } } as unknown as Evaluation };

const RLS = new Error('new row violates row-level security policy');

const EMAILS: Record<string, string> = {
  [U1_ID]: 'u1@studio.test',
  [U2_ID]: 'u2@studio.test',
};

/**
 * In-memory Db that mimics the org RLS: a member reads an org's rows, an admin
 * or the row's creator writes, any member runs. Membership grows through
 * `createOrg` (creator = admin) or `acceptInvite`.
 */
function fakeDb(): Db {
  const orgs = new Map<string, OrgRow>();
  const roleOf = new Map<string, 'admin' | 'member'>(); // `${orgId}:${userId}`
  const invites = new Map<string, OrgInviteRow>(); // by id
  const tables: Record<ArtifactKind, Map<string, ArtifactRow>> = {
    grid: new Map(),
    profile: new Map(),
  };
  const runs = new Map<string, RunRow>();
  let seq = 0;
  const nextId = (): string => `00000000-0000-0000-0000-${String((seq += 1)).padStart(12, '0')}`;
  const now = (): string => new Date().toISOString();

  return {
    forUser(user) {
      const key = (orgId: string): string => `${orgId}:${user.id}`;
      const isMember = (orgId: string | null): boolean =>
        orgId !== null && roleOf.has(key(orgId));
      const isAdmin = (orgId: string | null): boolean =>
        orgId !== null && roleOf.get(key(orgId)) === 'admin';
      const visible = (row: ArtifactRow): boolean => row.is_template || isMember(row.org_id);
      const canWrite = (row: ArtifactRow): boolean =>
        !row.is_template && (isAdmin(row.org_id) || row.created_by === user.id);

      const store: Store = {
        listOrgs: () => Promise.resolve([...orgs.values()].filter((o) => isMember(o.id))),
        createOrg: (name) => {
          const row: OrgRow = { id: nextId(), name, created_at: now() };
          orgs.set(row.id, row);
          roleOf.set(key(row.id), 'admin');
          return Promise.resolve(row);
        },

        listMembers: (orgId) =>
          Promise.resolve(
            !isMember(orgId)
              ? []
              : [...roleOf.entries()]
                  .filter(([k]) => k.startsWith(`${orgId}:`))
                  .map(([k, role]) => {
                    const uid = k.slice(orgId.length + 1);
                    return {
                      user_id: uid,
                      email: EMAILS[uid] ?? null,
                      role,
                      created_at: now(),
                    };
                  }),
          ),
        updateMemberRole: (orgId, userId, role) => {
          if (!isAdmin(orgId) || !roleOf.has(`${orgId}:${userId}`)) return Promise.resolve(null);
          roleOf.set(`${orgId}:${userId}`, role);
          return Promise.resolve({ org_id: orgId, user_id: userId, role, created_at: now() });
        },
        removeMember: (orgId, userId) => {
          const mkey = `${orgId}:${userId}`;
          if (!roleOf.has(mkey) || !(isAdmin(orgId) || userId === user.id)) {
            return Promise.resolve(false);
          }
          roleOf.delete(mkey);
          return Promise.resolve(true);
        },

        listInvites: (orgId) =>
          Promise.resolve(
            isMember(orgId) ? [...invites.values()].filter((i) => i.org_id === orgId) : [],
          ),
        createInvite: (orgId, input) => {
          if (!isAdmin(orgId)) return Promise.reject(RLS);
          const row: OrgInviteRow = {
            id: nextId(),
            org_id: orgId,
            token: `tok-${nextId()}`,
            email: input.email ?? null,
            role: input.role,
            created_by: user.id,
            expires_at: new Date(Date.now() + 8.64e7).toISOString(),
            accepted_by: null,
            accepted_at: null,
            created_at: now(),
          };
          invites.set(row.id, row);
          return Promise.resolve(row);
        },
        deleteInvite: (orgId, inviteId) => {
          const row = invites.get(inviteId);
          if (row === undefined || row.org_id !== orgId || !isAdmin(orgId)) {
            return Promise.resolve(false);
          }
          invites.delete(inviteId);
          return Promise.resolve(true);
        },
        acceptInvite: (token) => {
          const row = [...invites.values()].find((i) => i.token === token);
          if (row === undefined) return Promise.reject(new Error('invite not found'));
          if (row.accepted_at !== null) return Promise.reject(new Error('invite already used'));
          if (row.email !== null && row.email !== EMAILS[user.id]) {
            return Promise.reject(new Error('invite is for a different email address'));
          }
          roleOf.set(`${row.org_id}:${user.id}`, row.role);
          invites.set(row.id, { ...row, accepted_by: user.id, accepted_at: now() });
          return Promise.resolve({
            org_id: row.org_id,
            user_id: user.id,
            role: row.role,
            created_at: now(),
          });
        },

        list: (kind, orgId) =>
          Promise.resolve(
            [...tables[kind].values()].filter(
              (r) => visible(r) && (orgId === undefined || r.org_id === orgId),
            ),
          ),
        get: (kind, id) => {
          const r = tables[kind].get(id);
          return Promise.resolve(r !== undefined && visible(r) ? r : null);
        },
        create: (kind, input) => {
          if (!isAdmin(input.orgId)) return Promise.reject(RLS);
          const row: ArtifactRow = {
            id: nextId(),
            org_id: input.orgId,
            created_by: user.id,
            name: input.name,
            body: input.body,
            is_template: false,
            created_at: now(),
            updated_at: now(),
          };
          tables[kind].set(row.id, row);
          return Promise.resolve(row);
        },
        update: (kind, id, patch) => {
          const r = tables[kind].get(id);
          if (r === undefined || !visible(r) || !canWrite(r)) return Promise.resolve(null);
          const next: ArtifactRow = { ...r, ...patch, updated_at: now() };
          tables[kind].set(id, next);
          return Promise.resolve(next);
        },
        remove: (kind, id) => {
          const r = tables[kind].get(id);
          if (r === undefined || !visible(r) || !canWrite(r)) return Promise.resolve(false);
          tables[kind].delete(id);
          return Promise.resolve(true);
        },

        listRuns: ({ orgId, subjectId }) =>
          Promise.resolve(
            [...runs.values()].filter(
              (r) =>
                isMember(r.org_id) &&
                (orgId === undefined || r.org_id === orgId) &&
                (subjectId === undefined || r.subject_id === subjectId),
            ),
          ),
        getRun: (id) => {
          const r = runs.get(id);
          return Promise.resolve(r !== undefined && isMember(r.org_id) ? r : null);
        },
        createRun: (input) => {
          if (!isMember(input.orgId)) return Promise.reject(RLS);
          const row: RunRow = {
            id: nextId(),
            org_id: input.orgId,
            created_by: user.id,
            subject_id: input.subjectId,
            grid_snapshot: input.gridSnapshot,
            profile_snapshot: input.profileSnapshot,
            evaluation: input.evaluation,
            created_at: now(),
          };
          runs.set(row.id, row);
          return Promise.resolve(row);
        },
      };
      return store;
    },
  };
}

function build(): ReturnType<typeof createApp> {
  return createApp({
    authenticator: auth,
    db: fakeDb(),
    runEvaluation,
    validateArtifact,
    catalogue: [{ id: 'demo-criterion', needs: ['declared'] }],
    siteUrls: ['http://127.0.0.1:5173', 'http://localhost:5173'],
  });
}

const U1 = { authorization: 'Bearer u1-token' };
const U2 = { authorization: 'Bearer u2-token' };

async function makeOrg(app: ReturnType<typeof createApp>, headers: typeof U1): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/orgs', headers, payload: { name: 'Acme' } });
  return (res.json() as { id: string }).id;
}

describe('studio server', () => {
  let app: ReturnType<typeof createApp>;
  beforeEach(() => {
    app = build();
  });

  it('serves health without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('rejects /api without a bearer token, and an unknown token', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/orgs' })).statusCode).toBe(401);
    const bad = await app.inject({
      method: 'GET',
      url: '/api/orgs',
      headers: { authorization: 'Bearer nope' },
    });
    expect(bad.statusCode).toBe(401);
  });

  it('exposes the catalogue', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/catalogue', headers: U1 });
    expect(res.json()).toEqual([{ id: 'demo-criterion', needs: ['declared'] }]);
  });

  it('creates an org and scopes it to its members', async () => {
    const orgId = await makeOrg(app, U1);
    expect(orgId).toBeTruthy();

    const mine = await app.inject({ method: 'GET', url: '/api/orgs', headers: U1 });
    expect((mine.json() as { id: string }[]).map((o) => o.id)).toEqual([orgId]);

    const theirs = await app.inject({ method: 'GET', url: '/api/orgs', headers: U2 });
    expect(theirs.json()).toEqual([]);
  });

  it('422s a grid create without an org', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/grids',
      headers: U1,
      payload: { name: 'g', body: { valid: true } },
    });
    expect(res.statusCode).toBe(422);
  });

  it('422s a grid body the validator rejects', async () => {
    const orgId = await makeOrg(app, U1);
    const res = await app.inject({
      method: 'POST',
      url: '/api/grids',
      headers: U1,
      payload: { orgId, name: 'g', body: { valid: false } },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().issues).toContain('not marked valid');
  });

  it('creates a grid in the org and scopes reads to members', async () => {
    const orgId = await makeOrg(app, U1);
    const created = await app.inject({
      method: 'POST',
      url: '/api/grids',
      headers: U1,
      payload: { orgId, name: 'team grid', body: { valid: true, id: 'g' } },
    });
    expect(created.statusCode).toBe(201);
    const row = created.json() as { id: string; orgId: string; createdBy: string };
    expect(row.orgId).toBe(orgId);
    expect(row.createdBy).toBe(U1_ID);

    const asMember = await app.inject({ method: 'GET', url: `/api/grids?orgId=${orgId}`, headers: U1 });
    expect((asMember.json() as unknown[]).length).toBe(1);

    const asOther = await app.inject({ method: 'GET', url: '/api/grids', headers: U2 });
    expect(asOther.json()).toEqual([]);
    const otherGet = await app.inject({ method: 'GET', url: `/api/grids/${row.id}`, headers: U2 });
    expect(otherGet.statusCode).toBe(404);
  });

  it('403s a write to an org the caller is not in', async () => {
    const orgId = await makeOrg(app, U1);
    const res = await app.inject({
      method: 'POST',
      url: '/api/grids',
      headers: U2,
      payload: { orgId, name: 'x', body: { valid: true } },
    });
    expect(res.statusCode).toBe(403);
  });

  it('lets the creator patch and delete', async () => {
    const orgId = await makeOrg(app, U1);
    const created = await app.inject({
      method: 'POST',
      url: '/api/profiles',
      headers: U1,
      payload: { orgId, name: 'p', body: { valid: true } },
    });
    const { id } = created.json() as { id: string };

    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/profiles/${id}`,
      headers: U1,
      payload: { name: 'renamed' },
    });
    expect(patch.statusCode).toBe(200);
    expect((patch.json() as { name: string }).name).toBe('renamed');

    const del = await app.inject({ method: 'DELETE', url: `/api/profiles/${id}`, headers: U1 });
    expect(del.statusCode).toBe(204);
  });

  it('runs an evaluation in the org, snapshots the inputs, derives the subject id', async () => {
    const orgId = await makeOrg(app, U1);
    const res = await app.inject({
      method: 'POST',
      url: '/api/runs',
      headers: U1,
      payload: {
        orgId,
        grid: { valid: true, id: 'g' },
        profile: { valid: true, subject: { id: 'dev-x' } },
      },
    });
    expect(res.statusCode).toBe(201);
    const run = res.json() as {
      orgId: string;
      createdBy: string;
      subjectId: string;
      gridSnapshot: unknown;
      profileSnapshot: unknown;
      evaluation: { echoed: { gridBody: { id: string } } };
    };
    expect(run.orgId).toBe(orgId);
    expect(run.createdBy).toBe(U1_ID);
    expect(run.subjectId).toBe('dev-x');
    expect(run.gridSnapshot).toEqual({ valid: true, id: 'g' });
    expect(run.evaluation.echoed.gridBody.id).toBe('g');

    const list = await app.inject({
      method: 'GET',
      url: `/api/runs?orgId=${orgId}&subjectId=dev-x`,
      headers: U1,
    });
    expect((list.json() as unknown[]).length).toBe(1);

    const empty = await app.inject({
      method: 'GET',
      url: `/api/runs?subjectId=nobody`,
      headers: U1,
    });
    expect(empty.json()).toEqual([]);
  });

  it('403s a run against an org the caller is not in', async () => {
    const orgId = await makeOrg(app, U1);
    const res = await app.inject({
      method: 'POST',
      url: '/api/runs',
      headers: U2,
      payload: { orgId, grid: { valid: true }, profile: { subject: { id: 'x' } } },
    });
    expect(res.statusCode).toBe(403);
  });

  it('422s when the engine rejects the grid', async () => {
    const orgId = await makeOrg(app, U1);
    const res = await app.inject({
      method: 'POST',
      url: '/api/runs',
      headers: U1,
      payload: { orgId, grid: { bad: true }, profile: { subject: { id: 'x' } } },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe('bad grid');
  });

  it('422s when both a ref and an inline body are given', async () => {
    const orgId = await makeOrg(app, U1);
    const res = await app.inject({
      method: 'POST',
      url: '/api/runs',
      headers: U1,
      payload: {
        orgId,
        gridId: '00000000-0000-0000-0000-000000000001',
        grid: { valid: true },
        profile: { subject: { id: 'x' } },
      },
    });
    expect(res.statusCode).toBe(422);
  });

  it('404s a run against a grid id that is not visible', async () => {
    const orgId = await makeOrg(app, U1);
    const res = await app.inject({
      method: 'POST',
      url: '/api/runs',
      headers: U1,
      payload: {
        orgId,
        gridId: '00000000-0000-0000-0000-0000000000ff',
        profile: { subject: { id: 'x' } },
      },
    });
    expect(res.statusCode).toBe(404);
  });

  it('invites a user, who joins, is promoted, then removed', async () => {
    const orgId = await makeOrg(app, U1);
    const inject = (
      method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
      url: string,
      headers: typeof U1,
      payload?: object,
    ): Promise<LightMyRequestResponse> =>
      app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) });

    expect(((await inject('GET', `/api/orgs/${orgId}/members`, U1)).json() as unknown[]).length).toBe(1);

    const invite = await inject('POST', `/api/orgs/${orgId}/invites`, U1, { role: 'member' });
    expect(invite.statusCode).toBe(201);
    const { token } = invite.json() as { token: string };

    const accept = await inject('POST', `/api/invites/${token}/accept`, U2);
    expect(accept.statusCode).toBe(201);
    expect((accept.json() as { orgId: string }).orgId).toBe(orgId);

    // U2 is a member now: sees the org and the 2-person roster.
    expect(((await inject('GET', '/api/orgs', U2)).json() as unknown[]).length).toBe(1);
    const roster = (await inject('GET', `/api/orgs/${orgId}/members`, U2)).json() as {
      userId: string;
      email: string;
    }[];
    expect(roster.length).toBe(2);
    const u2Id = roster.find((m) => m.email === 'u2@studio.test')?.userId ?? '';

    // A plain member cannot invite, and the token is single-use.
    expect((await inject('POST', `/api/orgs/${orgId}/invites`, U2, {})).statusCode).toBe(403);
    expect((await inject('POST', `/api/invites/${token}/accept`, U2)).statusCode).toBe(400);

    // Promote U2 -> now it can invite.
    const promote = await inject('PATCH', `/api/orgs/${orgId}/members/${u2Id}`, U1, { role: 'admin' });
    expect(promote.statusCode).toBe(200);
    expect((await inject('POST', `/api/orgs/${orgId}/invites`, U2, {})).statusCode).toBe(201);

    // Remove U2.
    expect((await inject('DELETE', `/api/orgs/${orgId}/members/${u2Id}`, U1)).statusCode).toBe(204);
    expect(((await inject('GET', '/api/orgs', U2)).json() as unknown[]).length).toBe(0);
  });

  it('400s an unknown invite token', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/invites/nope/accept', headers: U1 });
    expect(res.statusCode).toBe(400);
  });
});
