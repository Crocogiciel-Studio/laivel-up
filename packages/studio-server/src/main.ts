import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';

/**
 * Walk up from `from` until a directory carrying `pnpm-workspace.yaml` turns
 * up -- the monorepo root, wherever this package ends up living. A relative
 * `../../../` counted by hand breaks silently the next time something moves
 * (it did, in the packages/ restructure); this keeps working regardless.
 */
function findWorkspaceRoot(from: string): string | undefined {
  let dir = from;
  for (;;) {
    if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return undefined; // reached the filesystem root
    dir = parent;
  }
}

// Local dev: load the repo-root `.env` (this package has none of its own). In a
// container the environment is already populated, so a missing file is fine.
const workspaceRoot = findWorkspaceRoot(dirname(fileURLToPath(import.meta.url)));
if (workspaceRoot !== undefined) {
  try {
    process.loadEnvFile(resolve(workspaceRoot, '.env'));
  } catch {
    // no .env file — rely on the ambient environment
  }
}
import { buildApp } from './build-app.js';

const config = loadConfig();
const app = buildApp(config);

try {
  const address = await app.listen({ port: config.PORT, host: config.HOST });
  app.log.info(`studio-server listening on ${address}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
