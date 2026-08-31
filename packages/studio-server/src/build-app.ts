import type { FastifyInstance } from 'fastify';
import type { Config } from './config.js';
import { supabaseAuthenticator } from './auth.js';
import { supabaseDb } from './db.js';
import { runEvaluation } from './engine.js';
import { validateArtifact } from './validation.js';
import { catalogue } from './catalogue.js';
import { createApp } from './app.js';

/**
 * The one real (non-test) wiring of `createApp`'s dependencies — shared by
 * the long-lived process (`main.ts`) and the Vercel serverless entry
 * (`api/[...path].ts`) so the two never drift apart as `AppDeps` grows.
 */
export function buildApp(config: Config): FastifyInstance {
  return createApp({
    authenticator: supabaseAuthenticator(config),
    db: supabaseDb(config),
    runEvaluation,
    validateArtifact,
    catalogue,
    siteUrls: config.siteUrls,
    logger: true,
  });
}
