import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `presets/aidd.json` lives at the repo root, one level above this package, and
// grid.ts imports it for level/axis labels. Let the dev server read it.
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

// The viewer must open from a bare `file://` on a judge's machine with no server
// and no network. `viteSingleFile` inlines every asset into one `dist/index.html`;
// `assetsInlineLimit: Infinity` keeps fonts/images inline too.
export default defineConfig({
  plugins: [viteSingleFile()],
  server: {
    fs: { allow: [repoRoot] },
  },
  build: {
    target: 'es2022',
    assetsInlineLimit: Number.POSITIVE_INFINITY,
    cssCodeSplit: false,
    reportCompressedSize: false,
  },
});
