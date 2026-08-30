import Fastify from 'fastify';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import { z } from 'zod';
import type { Authenticator, AuthedUser } from './auth.js';
import { bearer } from './auth.js';
import type { ArtifactKind, ArtifactRow, Db, RunRow, Store } from './db.js';
import type { RunEvaluation } from './engine.js';
import type { CatalogueEntry } from './catalogue.js';
import type { ValidateArtifact } from './validation.js';

export interface AppDeps {
  readonly authenticator: Authenticator;
  readonly db: Db;
  readonly runEvaluation: RunEvaluation;
  readonly validateArtifact: ValidateArtifact;
  readonly catalogue: readonly CatalogueEntry[];
  readonly siteUrl: string;
  readonly logger?: boolean;
}

const idParam = z.object({ id: z.string().uuid() });

const artifactCreate = z.object({
  name: z.string().min(1).max(200),
  body: z.unknown(),
});

const artifactPatch = z
  .object({ name: z.string().min(1).max(200).optional(), body: z.unknown().optional() })
  .refine((v) => v.name !== undefined || 'body' in v, {
    message: 'provide at least one of name, body',
  });

const runQuery = z.object({ subjectId: z.string().min(1).max(200).optional() });

const runCreate = z
  .object({
    gridId: z.string().uuid().optional(),
    grid: z.unknown().optional(),
    profileId: z.string().uuid().optional(),
    profile: z.unknown().optional(),
    subjectId: z.string().min(1).max(200).optional(),
    minRuledAxes: z.number().int().nonnegative().optional(),
  })
  .refine((v) => (v.gridId === undefined) !== (v.grid === undefined), {
    message: 'provide exactly one of gridId, grid',
  })
  .refine((v) => (v.profileId === undefined) !== (v.profile === undefined), {
    message: 'provide exactly one of profileId, profile',
  });

function artifactView(row: ArtifactRow): unknown {
  return {
    id: row.id,
    name: row.name,
    body: row.body,
    isTemplate: row.is_template,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function runView(row: RunRow): unknown {
  return {
    id: row.id,
    subjectId: row.subject_id,
    gridSnapshot: row.grid_snapshot,
    profileSnapshot: row.profile_snapshot,
    evaluation: row.evaluation,
    createdAt: row.created_at,
  };
}

function unprocessable(reply: FastifyReply, message: string, issues: readonly string[]): FastifyReply {
  return reply.code(422).send({ error: message, issues });
}

export function createApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({ logger: deps.logger ?? false });

  void app.register(cors, { origin: deps.siteUrl });

  app.get('/health', () => ({ ok: true }));

  // Everything under /api requires a valid bearer token.
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.url.startsWith('/api/')) {
      return;
    }
    const token = bearer(request.headers.authorization);
    if (token === null) {
      await reply.code(401).send({ error: 'missing bearer token' });
      return;
    }
    const user = await deps.authenticator.verify(token);
    if (user === null) {
      await reply.code(401).send({ error: 'invalid or expired token' });
      return;
    }
    request.authedUser = user;
  });

  function store(request: FastifyRequest): Store {
    // The hook guarantees this for every /api route.
    return deps.db.forUser(request.authedUser as AuthedUser);
  }

  app.get('/api/catalogue', () => deps.catalogue);

  registerArtifactRoutes(app, 'grid', 'grids', deps, store);
  registerArtifactRoutes(app, 'profile', 'profiles', deps, store);
  registerRunRoutes(app, deps, store);

  return app;
}

function registerArtifactRoutes(
  app: FastifyInstance,
  kind: ArtifactKind,
  segment: string,
  deps: AppDeps,
  store: (request: FastifyRequest) => Store,
): void {
  app.get(`/api/${segment}`, async (request) => {
    const rows = await store(request).list(kind);
    return rows.map(artifactView);
  });

  app.get(`/api/${segment}/:id`, async (request, reply) => {
    const { id } = idParam.parse(request.params);
    const row = await store(request).get(kind, id);
    if (row === null) {
      return reply.code(404).send({ error: `${kind} not found` });
    }
    return artifactView(row);
  });

  app.post(`/api/${segment}`, async (request, reply) => {
    const parsed = artifactCreate.safeParse(request.body);
    if (!parsed.success) {
      return unprocessable(reply, 'invalid request body', issuesOf(parsed.error));
    }
    const valid = deps.validateArtifact(kind, parsed.data.body);
    if (!valid.ok) {
      return unprocessable(reply, valid.error.message, valid.error.issues);
    }
    const row = await store(request).create(kind, {
      name: parsed.data.name,
      body: parsed.data.body,
    });
    return reply.code(201).send(artifactView(row));
  });

  app.patch(`/api/${segment}/:id`, async (request, reply) => {
    const { id } = idParam.parse(request.params);
    const parsed = artifactPatch.safeParse(request.body);
    if (!parsed.success) {
      return unprocessable(reply, 'invalid request body', issuesOf(parsed.error));
    }
    if ('body' in parsed.data) {
      const valid = deps.validateArtifact(kind, parsed.data.body);
      if (!valid.ok) {
        return unprocessable(reply, valid.error.message, valid.error.issues);
      }
    }
    const patch: { name?: string; body?: unknown } = {};
    if (parsed.data.name !== undefined) patch.name = parsed.data.name;
    if ('body' in parsed.data) patch.body = parsed.data.body;

    const row = await store(request).update(kind, id, patch);
    if (row === null) {
      return reply.code(404).send({ error: `${kind} not found` });
    }
    return artifactView(row);
  });

  app.delete(`/api/${segment}/:id`, async (request, reply) => {
    const { id } = idParam.parse(request.params);
    const removed = await store(request).remove(kind, id);
    if (!removed) {
      return reply.code(404).send({ error: `${kind} not found` });
    }
    return reply.code(204).send();
  });
}

function registerRunRoutes(
  app: FastifyInstance,
  deps: AppDeps,
  store: (request: FastifyRequest) => Store,
): void {
  app.get('/api/runs', async (request, reply) => {
    const parsed = runQuery.safeParse(request.query);
    if (!parsed.success) {
      return unprocessable(reply, 'invalid query', issuesOf(parsed.error));
    }
    const rows = await store(request).listRuns(parsed.data.subjectId);
    return rows.map(runView);
  });

  app.get('/api/runs/:id', async (request, reply) => {
    const { id } = idParam.parse(request.params);
    const row = await store(request).getRun(id);
    if (row === null) {
      return reply.code(404).send({ error: 'run not found' });
    }
    return runView(row);
  });

  app.post('/api/runs', async (request, reply) => {
    const parsed = runCreate.safeParse(request.body);
    if (!parsed.success) {
      return unprocessable(reply, 'invalid request body', issuesOf(parsed.error));
    }
    const input = parsed.data;
    const s = store(request);

    const gridBody = await resolveBody(s, 'grid', input.gridId, input.grid);
    if (gridBody.kind === 'missing') {
      return reply.code(404).send({ error: 'grid not found' });
    }
    const profileBody = await resolveBody(s, 'profile', input.profileId, input.profile);
    if (profileBody.kind === 'missing') {
      return reply.code(404).send({ error: 'profile not found' });
    }

    const outcome = deps.runEvaluation(gridBody.body, profileBody.body, {
      ...(input.minRuledAxes === undefined ? {} : { minRuledAxes: input.minRuledAxes }),
    });
    if (!outcome.ok) {
      return unprocessable(reply, outcome.error.message, outcome.error.issues);
    }

    const subjectId = input.subjectId ?? subjectIdOf(profileBody.body) ?? 'unknown';
    const row = await s.createRun({
      subjectId,
      gridSnapshot: gridBody.body,
      profileSnapshot: profileBody.body,
      evaluation: outcome.value,
    });
    return reply.code(201).send(runView(row));
  });
}

type Resolved = { kind: 'ok'; body: unknown } | { kind: 'missing' };

async function resolveBody(
  store: Store,
  kind: ArtifactKind,
  id: string | undefined,
  inline: unknown,
): Promise<Resolved> {
  if (id === undefined) {
    return { kind: 'ok', body: inline };
  }
  const row = await store.get(kind, id);
  return row === null ? { kind: 'missing' } : { kind: 'ok', body: row.body };
}

function subjectIdOf(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const subject = (body as { subject?: unknown }).subject;
  if (typeof subject !== 'object' || subject === null) return undefined;
  const id = (subject as { id?: unknown }).id;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

function issuesOf(error: z.ZodError): readonly string[] {
  return error.issues.map((issue) => {
    const path = issue.path.join('.');
    return path.length > 0 ? `${path}: ${issue.message}` : issue.message;
  });
}
