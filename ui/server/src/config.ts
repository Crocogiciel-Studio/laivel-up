import { z } from 'zod';

/**
 * The server only ever acts as the calling user: it verifies the Supabase JWT
 * with the anon key and forwards that JWT to Postgres so RLS is the enforcement
 * boundary. No service-role key -- there is no code path that needs to bypass a
 * row policy.
 */
// `localhost` and `127.0.0.1` are different CORS origins, and the dev server can
// be opened as either — so STUDIO_SITE_URL is a comma-separated allow-list, and
// the default covers both.
const originList = z
  .string()
  .default('http://localhost:5173,http://127.0.0.1:5173')
  .transform((value) => value.split(',').map((entry) => entry.trim()).filter(Boolean))
  .pipe(z.array(z.string().url()).min(1));

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
  HOST: z.string().default('0.0.0.0'),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  STUDIO_SITE_URL: originList,
});

export type Config = Omit<z.infer<typeof schema>, 'STUDIO_SITE_URL'> & {
  readonly siteUrls: readonly string[];
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`invalid environment:\n${issues}`);
  }
  const { STUDIO_SITE_URL, ...rest } = parsed.data;
  return { ...rest, siteUrls: STUDIO_SITE_URL };
}
