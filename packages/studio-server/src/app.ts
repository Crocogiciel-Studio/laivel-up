import Fastify from 'fastify';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import { z } from 'zod';
import { zodIssues as issuesOf } from 'laivel-up/compose';
import type { Authenticator, AuthedUser } from './auth.js';
import { bearer } from './auth.js';
import type {
  ArtifactKind,
  ArtifactRow,
  Db,
  OrgInviteRow,
  OrgMemberDetail,
  OrgRow,
  RunRow,
  Store,
} from './db.js';
import type { RunEvaluation } from './engine.js';
import type { CatalogueEntry } from './catalogue.js';
import type { ValidateArtifact } from './validation.js';

export interface AppDeps {
  readonly authenticator: Authenticator;
  readonly db: Db;
  readonly runEvaluation: RunEvaluation;
  readonly validateArtifact: ValidateArtifact;
  readonly catalogue: readonly CatalogueEntry[];
  /** Allowed CORS origins for the web app. */
  readonly siteUrls: readonly string[];
  readonly logger?: boolean;
}

const idParam = z.object({ id: z.string().uuid() });
const memberParams = z.object({ id: z.string().uuid(), userId: z.string().uuid() });
const inviteParams = z.object({ id: z.string().uuid(), inviteId: z.string().uuid() });
const tokenParam = z.object({ token: z.string().min(1).max(200) });

const orgCreate = z.object({ name: z.string().min(1).max(200) });
const roleBody = z.object({ role: z.enum(['admin', 'member']) });
const inviteCreate = z.object({
  email: z.string().email().optional(),
  role: z.enum(['admin', 'member']).default('member'),
});

const artifactList = z.object({ orgId: z.string().uuid().optional() });

const artifactCreate = z.object({
  orgId: z.string().uuid(),
  name: z.string().min(1).max(200),
  body: z.unknown(),
});

const artifactPatch = z
  .object({ name: z.string().min(1).max(200).optional(), body: z.unknown().optional() })
  .refine((v) => v.name !== undefined || 'body' in v, {
    message: 'provide at least one of name, body',
  });

const runQuery = z.object({
  orgId: z.string().uuid().optional(),
  subjectId: z.string().min(1).max(200).optional(),
});

const runCreate = z
  .object({
    orgId: z.string().uuid(),
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

function orgView(row: OrgRow): unknown {
  return { id: row.id, name: row.name, createdAt: row.created_at };
}

function memberView(row: OrgMemberDetail): unknown {
  return { userId: row.user_id, email: row.email, role: row.role, joinedAt: row.created_at };
}

function inviteView(row: OrgInviteRow): unknown {
  return {
    id: row.id,
    token: row.token,
    email: row.email,
    role: row.role,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
    createdAt: row.created_at,
  };
}

function artifactView(row: ArtifactRow): unknown {
  return {
    id: row.id,
    orgId: row.org_id,
    createdBy: row.created_by,
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
    orgId: row.org_id,
    createdBy: row.created_by,
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

/** A malformed path parameter — the error handler turns this into a 400. */
class BadRequest extends Error {}

/** Parse `request.params` (or a query), 400ing on a bad shape rather than 500ing. */
function parsePath<T>(schema: z.ZodType<T>, raw: unknown): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new BadRequest(issuesOf(parsed.error).join('; '));
  }
  return parsed.data;
}

/**
 * A write that changed no rows is either "not there" or "you can see it but not
 * change it" (a template, another member's grid). Distinguish with one read.
 */
async function notFoundOrForbidden(
  reply: FastifyReply,
  store: Store,
  kind: ArtifactKind,
  id: string,
): Promise<FastifyReply> {
  const visible = await store.get(kind, id);
  return visible === null
    ? reply.code(404).send({ error: `${kind} not found` })
    : reply.code(403).send({ error: `not allowed to change this ${kind}` });
}

/** A write blocked by row-level security surfaces as a Postgres error. */
function isForbidden(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /row-level security|violates|permission denied|not allowed|\b42501\b/i.test(message);
}

export function createApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({ logger: deps.logger ?? false });

  void app.register(cors, { origin: [...deps.siteUrls] });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof BadRequest) {
      void reply.code(400).send({ error: 'invalid path parameter', issues: [error.message] });
      return;
    }
    if (isForbidden(error)) {
      void reply.code(403).send({ error: 'not allowed for this org' });
      return;
    }
    app.log.error(error);
    void reply.code(500).send({ error: 'internal error' });
  });

  app.get('/health', () => ({ ok: true }));
  // Same check, reachable under /api/ — Vercel's serverless function only
  // owns that path space (see api/[...path].ts), so the deployed health
  // check hits this one instead of the bare /health above. (Fastify's
  // TS types only accept one path per .get() call, or this would be one.)
  app.get('/api/health', () => ({ ok: true }));

  // Everything under /api requires a valid bearer token, except the health
  // alias just above. `request.url` is the raw path *and* query string (a
  // Fastify/Node convention, not just a pathname) -- Vercel's catch-all
  // `api/[...path].ts` route appends the matched segments as a query string
  // to boot, so match on the path alone or the deployed health check 401s.
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const path = request.url.split('?')[0] ?? request.url;
    if (!path.startsWith('/api/') || path === '/api/health') {
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

  app.get('/api/orgs', async (request) => {
    const rows = await store(request).listOrgs();
    return rows.map(orgView);
  });

  app.post('/api/orgs', async (request, reply) => {
    const parsed = orgCreate.safeParse(request.body);
    if (!parsed.success) {
      return unprocessable(reply, 'invalid request body', issuesOf(parsed.error));
    }
    const row = await store(request).createOrg(parsed.data.name);
    return reply.code(201).send(orgView(row));
  });

  app.get('/api/orgs/:id/members', async (request) => {
    const { id } = parsePath(idParam, request.params);
    const rows = await store(request).listMembers(id);
    return rows.map(memberView);
  });

  app.patch('/api/orgs/:id/members/:userId', async (request, reply) => {
    const { id, userId } = parsePath(memberParams, request.params);
    const parsed = roleBody.safeParse(request.body);
    if (!parsed.success) {
      return unprocessable(reply, 'invalid request body', issuesOf(parsed.error));
    }
    const row = await store(request).updateMemberRole(id, userId, parsed.data.role);
    if (row === null) {
      return reply.code(404).send({ error: 'member not found' });
    }
    return reply.send({ ok: true });
  });

  app.delete('/api/orgs/:id/members/:userId', async (request, reply) => {
    const { id, userId } = parsePath(memberParams, request.params);
    const removed = await store(request).removeMember(id, userId);
    if (!removed) {
      return reply.code(404).send({ error: 'member not found' });
    }
    return reply.code(204).send();
  });

  app.get('/api/orgs/:id/invites', async (request) => {
    const { id } = parsePath(idParam, request.params);
    const rows = await store(request).listInvites(id);
    return rows.map(inviteView);
  });

  app.post('/api/orgs/:id/invites', async (request, reply) => {
    const { id } = parsePath(idParam, request.params);
    const parsed = inviteCreate.safeParse(request.body ?? {});
    if (!parsed.success) {
      return unprocessable(reply, 'invalid request body', issuesOf(parsed.error));
    }
    const row = await store(request).createInvite(id, {
      role: parsed.data.role,
      ...(parsed.data.email === undefined ? {} : { email: parsed.data.email }),
    });
    return reply.code(201).send(inviteView(row));
  });

  app.delete('/api/orgs/:id/invites/:inviteId', async (request, reply) => {
    const { id, inviteId } = parsePath(inviteParams, request.params);
    const removed = await store(request).deleteInvite(id, inviteId);
    if (!removed) {
      return reply.code(404).send({ error: 'invite not found' });
    }
    return reply.code(204).send();
  });

  app.post('/api/invites/:token/accept', async (request, reply) => {
    const { token } = parsePath(tokenParam, request.params);
    try {
      const member = await store(request).acceptInvite(token);
      return reply.code(201).send({ orgId: member.org_id, role: member.role });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/invite (not found|already used|expired|is for)/i.test(message)) {
        return reply.code(400).send({ error: message });
      }
      throw error;
    }
  });

  app.delete('/api/me', async (request, reply) => {
    try {
      await store(request).deleteAccount();
      return reply.code(204).send();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/promote another admin/i.test(message)) {
        return reply.code(409).send({ error: message });
      }
      throw error;
    }
  });

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
  app.get(`/api/${segment}`, async (request, reply) => {
    const parsed = artifactList.safeParse(request.query);
    if (!parsed.success) {
      return unprocessable(reply, 'invalid query', issuesOf(parsed.error));
    }
    const rows = await store(request).list(kind, parsed.data.orgId);
    return rows.map(artifactView);
  });

  app.get(`/api/${segment}/:id`, async (request, reply) => {
    const { id } = parsePath(idParam, request.params);
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
      orgId: parsed.data.orgId,
      name: parsed.data.name,
      body: parsed.data.body,
    });
    return reply.code(201).send(artifactView(row));
  });

  app.patch(`/api/${segment}/:id`, async (request, reply) => {
    const { id } = parsePath(idParam, request.params);
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
      return notFoundOrForbidden(reply, store(request), kind, id);
    }
    return artifactView(row);
  });

  app.delete(`/api/${segment}/:id`, async (request, reply) => {
    const { id } = parsePath(idParam, request.params);
    const removed = await store(request).remove(kind, id);
    if (!removed) {
      return notFoundOrForbidden(reply, store(request), kind, id);
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
    const rows = await store(request).listRuns({
      ...(parsed.data.orgId === undefined ? {} : { orgId: parsed.data.orgId }),
      ...(parsed.data.subjectId === undefined ? {} : { subjectId: parsed.data.subjectId }),
    });
    return rows.map(runView);
  });

  app.get('/api/runs/:id', async (request, reply) => {
    const { id } = parsePath(idParam, request.params);
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
    if (subjectId.length > 200) {
      return unprocessable(reply, 'subject id exceeds 200 characters', []);
    }
    const row = await s.createRun({
      orgId: input.orgId,
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

