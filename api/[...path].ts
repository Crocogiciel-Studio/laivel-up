// Vercel serverless entry for the studio backend. Everything under `/api/*`
// (see vercel.json — Vercel's own filesystem routing owns that path space,
// no rewrite needed) is served by this one function.
//
// This is the same `createApp` wiring as packages/studio-server/src/main.ts,
// minus the two things that only make sense for a long-lived process:
// `.env` file loading (Vercel sets real environment variables; there is no
// `.env` file in the deployed function) and `.listen()` (a serverless
// function never binds a port — Vercel invokes the handler per request).
//
// The Fastify app is built once at module scope, so a warm invocation reuses
// it; `app.ready()` then handing the raw req/res to the underlying
// `http.Server` is Fastify's own documented pattern for platforms (Vercel,
// AWS Lambda via a URL) that hand you a plain Node request/response instead
// of calling `.listen()` for you.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { loadConfig } from '../packages/studio-server/src/config.js';
import { supabaseAuthenticator } from '../packages/studio-server/src/auth.js';
import { supabaseDb } from '../packages/studio-server/src/db.js';
import { runEvaluation } from '../packages/studio-server/src/engine.js';
import { validateArtifact } from '../packages/studio-server/src/validation.js';
import { catalogue } from '../packages/studio-server/src/catalogue.js';
import { createApp } from '../packages/studio-server/src/app.js';

const config = loadConfig();

const app = createApp({
  authenticator: supabaseAuthenticator(config),
  db: supabaseDb(config),
  runEvaluation,
  validateArtifact,
  catalogue,
  siteUrls: config.siteUrls,
  logger: true,
});

const ready = app.ready();

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  await ready;
  app.server.emit('request', req, res);
}
