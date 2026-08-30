import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// The viewer must open from a bare `file://` on a judge's machine with no server
// and no network. `viteSingleFile` inlines every asset into one `dist/index.html`;
// `assetsInlineLimit: Infinity` keeps fonts/images inline too.
export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    target: 'es2022',
    assetsInlineLimit: Number.POSITIVE_INFINITY,
    cssCodeSplit: false,
    reportCompressedSize: false,
  },
});
