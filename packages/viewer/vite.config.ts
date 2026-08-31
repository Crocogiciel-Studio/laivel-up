import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `packages/core/presets/aidd.json` provides the level/axis labels grid.ts imports;
// let the dev server read it from the sibling package.
const workspaceRoot = fileURLToPath(new URL('../..', import.meta.url));

// The viewer must open from a bare `file://` on a judge's machine with no server
// and no network. `viteSingleFile` inlines every asset into one `dist/index.html`;
// `assetsInlineLimit: Infinity` keeps fonts/images inline too.
export default defineConfig({
  plugins: [viteSingleFile()],
  server: {
    fs: { allow: [workspaceRoot] },
  },
  build: {
    target: 'es2022',
    assetsInlineLimit: Number.POSITIVE_INFINITY,
    cssCodeSplit: false,
    reportCompressedSize: false,
  },
});
