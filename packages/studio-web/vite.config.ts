import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Walk up from `from` until a directory carrying `pnpm-workspace.yaml` turns
 * up -- the monorepo root, wherever this package ends up living. A relative
 * `../../` counted by hand breaks silently the next time something moves (it
 * did, in the packages/ restructure); this keeps working regardless.
 */
function findWorkspaceRoot(from: string): string {
  let dir = from;
  for (;;) {
    if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`no pnpm-workspace.yaml found above ${from}`);
    dir = parent;
  }
}

// The repo-root .env holds the studio config; read VITE_* vars from there so the
// web app and the server share one file.
const repoRoot = findWorkspaceRoot(dirname(fileURLToPath(import.meta.url)));

export default defineConfig({
  plugins: [react()],
  envDir: repoRoot,
  server: { port: 5173, fs: { allow: [repoRoot] } },
  build: { target: 'es2022', outDir: 'dist' },
});
