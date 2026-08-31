// Build-time config, from the repo-root `.env` (see vite.config.ts `envDir`).
// A missing value fails the build rather than shipping a broken app.

function required(name: string, value: string | undefined): string {
  if (value === undefined || value === '') {
    throw new Error(`missing ${name} — set it in the repo-root .env (see .env.example)`);
  }
  return value;
}

export const env = {
  supabaseUrl: required('VITE_SUPABASE_URL', import.meta.env.VITE_SUPABASE_URL),
  supabaseAnonKey: required('VITE_SUPABASE_ANON_KEY', import.meta.env.VITE_SUPABASE_ANON_KEY),
  /** The studio backend. */
  apiUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:8787',
} as const;
