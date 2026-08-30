import { z } from 'zod';

/**
 * The server only ever acts as the calling user: it verifies the Supabase JWT
 * with the anon key and forwards that JWT to Postgres so RLS is the enforcement
 * boundary. No service-role key -- there is no code path that needs to bypass a
 * row policy.
 */
const schema = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
  HOST: z.string().default('0.0.0.0'),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  STUDIO_SITE_URL: z.string().url().default('http://127.0.0.1:5173'),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`invalid environment:\n${issues}`);
  }
  return parsed.data;
}
