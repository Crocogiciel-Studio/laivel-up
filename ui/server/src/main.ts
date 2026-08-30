import { loadConfig } from './config.js';
import { supabaseAuthenticator } from './auth.js';
import { supabaseDb } from './db.js';
import { runEvaluation } from './engine.js';
import { validateArtifact } from './validation.js';
import { catalogue } from './catalogue.js';
import { createApp } from './app.js';

const config = loadConfig();

const app = createApp({
  authenticator: supabaseAuthenticator(config),
  db: supabaseDb(config),
  runEvaluation,
  validateArtifact,
  catalogue,
  siteUrl: config.STUDIO_SITE_URL,
  logger: true,
});

try {
  const address = await app.listen({ port: config.PORT, host: config.HOST });
  app.log.info(`studio-server listening on ${address}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
