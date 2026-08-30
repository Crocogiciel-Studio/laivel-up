// Vite exposes VITE_* on import.meta.env; jsdom tests need them stubbed so
// src/env.ts does not throw at import time.
Object.assign(import.meta.env, {
  VITE_SUPABASE_URL: 'http://localhost:54321',
  VITE_SUPABASE_ANON_KEY: 'test-anon-key',
  VITE_API_URL: 'http://localhost:8787',
});
