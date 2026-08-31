// Vercel serverless entry for the studio backend. Everything under `/api/*`
// (see vercel.json — Vercel's own filesystem routing owns that path space,
// no rewrite needed) is served by this one function.
//
// `buildApp` is the exact same `createApp` wiring
// packages/studio-server/src/main.ts uses — kept in one place so the two
// never drift apart. What's left out here only makes sense for a long-lived
// process: `.env` file loading (Vercel sets real environment variables;
// there is no `.env` file in the deployed function) and `.listen()` (a
// serverless function never binds a port — Vercel invokes the handler per
// request).
//
// The Fastify app is built once at module scope, so a warm invocation reuses
// it; `app.ready()` then handing the raw req/res to the underlying
// `http.Server` is Fastify's own documented pattern for platforms (Vercel,
// AWS Lambda via a URL) that hand you a plain Node request/response instead
// of calling `.listen()` for you.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { loadConfig } from '../packages/studio-server/src/config.js';
import { buildApp } from '../packages/studio-server/src/build-app.js';

const config = loadConfig();
const app = buildApp(config);
// `app.ready()` with no callback returns the app itself, thenable but not a
// real Promise (no `.catch`) -- wrap it so the rejection can be observed
// below independent of whether a request has arrived yet to `await ready`.
// Otherwise a plugin that fails to register could surface as an unhandled
// rejection on a cold start with no request in flight, rather than the 500
// every subsequent request still gets from its own `await ready`.
const ready = Promise.resolve(app.ready());
ready.catch((error: unknown) => {
  app.log.error(error, 'app failed to become ready');
});

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  await ready;
  app.server.emit('request', req, res);
}
