import { defineConfig } from 'vitest/config';

// Kept out of tsconfig's `include` on purpose: importing from `vitest/config`
// pulls in vitest's bundled Vite types, which clash with the app's Vite 8 under
// `tsc`. vitest reads this at runtime, so that never matters here.
export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
