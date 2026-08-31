import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { supabaseAuthenticator } from './auth.js';

// Local dev: load the repo-root `.env` (this package has none of its own). In a
// container the environment is already populated, so a missing file is fine.
try {
  process.loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url)));
} catch {
  // no .env file — rely on the ambient environment
}
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
  siteUrls: config.siteUrls,
  logger: true,
});

try {
  const address = await app.listen({ port: config.PORT, host: config.HOST });
  app.log.info(`studio-server listening on ${address}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
