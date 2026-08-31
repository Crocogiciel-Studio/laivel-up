import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The repo-root .env holds the studio config; read VITE_* vars from there so the
// web app and the server share one file.
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

export default defineConfig({
  plugins: [react()],
  envDir: repoRoot,
  server: { port: 5173, fs: { allow: [repoRoot] } },
  build: { target: 'es2022', outDir: 'dist' },
});
