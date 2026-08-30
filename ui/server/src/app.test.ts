import { describe, expect, it, beforeEach } from 'vitest';
import type { Evaluation } from 'laivel-up';
import type { Authenticator } from './auth.js';
import type { ArtifactKind, ArtifactRow, Db, RunRow, Store } from './db.js';
import type { RunEvaluation } from './engine.js';
import type { ValidateArtifact } from './validation.js';
import { createApp } from './app.js';

const auth: Authenticator = {
  verify: (jwt) =>
    Promise.resolve(
      jwt === 'u1-token'
        ? { id: 'u1', jwt }
        : jwt === 'u2-token'
          ? { id: 'u2', jwt }
          : null,
    ),
};

// A body is "valid" to the fake validator when it carries `{ valid: true }`.
const validateArtifact: ValidateArtifact = (_kind, body) =>
  typeof body === 'object' && body !== null && (body as { valid?: unknown }).valid === true
    ? { ok: true, value: undefined }
    : { ok: false, error: { message: 'invalid body', issues: ['not marked valid'] } };

// The fake evaluation carries its inputs back so tests can check what the route
// passed through; a grid body of `{ bad: true }` is rejected.
const runEvaluation: RunEvaluation = (gridBody, profileBody, input) =>
  typeof gridBody === 'object' && gridBody !== null && (gridBody as { bad?: unknown }).bad === true
    ? { ok: false, error: { message: 'bad grid', issues: [] } }
    : {
        ok: true,
        value: { echoed: { gridBody, profileBody, input } } as unknown as Evaluation,
      };

function fakeDb(): Db {
  const tables: Record<ArtifactKind, Map<string, ArtifactRow>> = {
    grid: new Map(),
    profile: new Map(),
  };
  const runs = new Map<string, RunRow>();
  let seq = 0;
  const nextId = (): string =>
    `00000000-0000-0000-0000-${String((seq += 1)).padStart(12, '0')}`;

  return {
    forUser(user) {
      const visible = (row: ArtifactRow): boolean =>
        row.owner_id === user.id || row.is_template;
      const owned = (row: ArtifactRow | undefined): row is ArtifactRow =>
        row !== undefined && row.owner_id === user.id;

      const store: Store = {
        list: (kind) => Promise.resolve([...tables[kind].values()].filter(visible)),
        get: (kind, id) => {
          const row = tables[kind].get(id);
          return Promise.resolve(row !== undefined && visible(row) ? row : null);
        },
        create: (kind, input) => {
          const now = new Date().toISOString();
          const row: ArtifactRow = {
            id: nextId(),
            owner_id: user.id,
            name: input.name,
            body: input.body,
            is_template: false,
            created_at: now,
            updated_at: now,
          };
          tables[kind].set(row.id, row);
          return Promise.resolve(row);
        },
        update: (kind, id, patch) => {
          const row = tables[kind].get(id);
          if (!owned(row)) return Promise.resolve(null);
          const next: ArtifactRow = { ...row, ...patch, updated_at: new Date().toISOString() };
          tables[kind].set(id, next);
          return Promise.resolve(next);
        },
        remove: (kind, id) => {
          const row = tables[kind].get(id);
          if (!owned(row)) return Promise.resolve(false);
          tables[kind].delete(id);
          return Promise.resolve(true);
        },
        listRuns: (subjectId) =>
          Promise.resolve(
            [...runs.values()].filter(
              (r) => r.owner_id === user.id && (subjectId === undefined || r.subject_id === subjectId),
            ),
          ),
        getRun: (id) => {
          const row = runs.get(id);
          return Promise.resolve(row !== undefined && row.owner_id === user.id ? row : null);
        },
        createRun: (input) => {
          const row: RunRow = {
            id: nextId(),
            owner_id: user.id,
            subject_id: input.subjectId,
            grid_snapshot: input.gridSnapshot,
            profile_snapshot: input.profileSnapshot,
            evaluation: input.evaluation,
            created_at: new Date().toISOString(),
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
    siteUrl: 'http://127.0.0.1:5173',
  });
}

const U1 = { authorization: 'Bearer u1-token' };
const U2 = { authorization: 'Bearer u2-token' };

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

  it('rejects /api without a bearer token', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/grids' })).statusCode).toBe(401);
  });

  it('rejects an unknown token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/grids',
      headers: { authorization: 'Bearer nope' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('exposes the catalogue', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/catalogue', headers: U1 });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([{ id: 'demo-criterion', needs: ['declared'] }]);
  });

  it('422s a grid body the validator rejects', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/grids',
      headers: U1,
      payload: { name: 'g', body: { valid: false } },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().issues).toContain('not marked valid');
  });

  it('creates a grid and scopes it to its owner', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/grids',
      headers: U1,
      payload: { name: 'my grid', body: { valid: true, id: 'g' } },
    });
    expect(created.statusCode).toBe(201);
    const { id } = created.json() as { id: string };

    const asOwner = await app.inject({ method: 'GET', url: '/api/grids', headers: U1 });
    expect((asOwner.json() as unknown[]).length).toBe(1);

    const asOther = await app.inject({ method: 'GET', url: '/api/grids', headers: U2 });
    expect(asOther.json()).toEqual([]);

    const otherGet = await app.inject({ method: 'GET', url: `/api/grids/${id}`, headers: U2 });
    expect(otherGet.statusCode).toBe(404);
  });

  it('lets only the owner patch and delete', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/profiles',
      headers: U1,
      payload: { name: 'p', body: { valid: true } },
    });
    const { id } = created.json() as { id: string };

    const otherPatch = await app.inject({
      method: 'PATCH',
      url: `/api/profiles/${id}`,
      headers: U2,
      payload: { name: 'hijack' },
    });
    expect(otherPatch.statusCode).toBe(404);

    const ownPatch = await app.inject({
      method: 'PATCH',
      url: `/api/profiles/${id}`,
      headers: U1,
      payload: { name: 'renamed' },
    });
    expect(ownPatch.statusCode).toBe(200);
    expect((ownPatch.json() as { name: string }).name).toBe('renamed');

    const del = await app.inject({ method: 'DELETE', url: `/api/profiles/${id}`, headers: U1 });
    expect(del.statusCode).toBe(204);
  });

  it('runs an evaluation, snapshots the inputs, derives the subject id', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/runs',
      headers: U1,
      payload: {
        grid: { valid: true, id: 'g' },
        profile: { valid: true, subject: { id: 'dev-x' } },
      },
    });
    expect(res.statusCode).toBe(201);
    const run = res.json() as {
      subjectId: string;
      gridSnapshot: unknown;
      profileSnapshot: unknown;
      evaluation: { echoed: { gridBody: { id: string } } };
    };
    expect(run.subjectId).toBe('dev-x');
    expect(run.gridSnapshot).toEqual({ valid: true, id: 'g' });
    expect(run.profileSnapshot).toEqual({ valid: true, subject: { id: 'dev-x' } });
    expect(run.evaluation.echoed.gridBody.id).toBe('g');

    const list = await app.inject({
      method: 'GET',
      url: '/api/runs?subjectId=dev-x',
      headers: U1,
    });
    expect((list.json() as unknown[]).length).toBe(1);

    const empty = await app.inject({
      method: 'GET',
      url: '/api/runs?subjectId=nobody',
      headers: U1,
    });
    expect(empty.json()).toEqual([]);
  });

  it('422s when the engine rejects the grid', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/runs',
      headers: U1,
      payload: { grid: { bad: true }, profile: { subject: { id: 'x' } } },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe('bad grid');
  });

  it('422s when both a ref and an inline body are given', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/runs',
      headers: U1,
      payload: {
        gridId: '00000000-0000-0000-0000-000000000001',
        grid: { valid: true },
        profile: { subject: { id: 'x' } },
      },
    });
    expect(res.statusCode).toBe(422);
  });

  it('404s a run against a grid id that is not visible', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/runs',
      headers: U1,
      payload: {
        gridId: '00000000-0000-0000-0000-0000000000ff',
        profile: { subject: { id: 'x' } },
      },
    });
    expect(res.statusCode).toBe(404);
  });
});
