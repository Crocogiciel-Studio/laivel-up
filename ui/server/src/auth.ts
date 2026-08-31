import { createClient } from '@supabase/supabase-js';
import type { Config } from './config.js';

export interface AuthedUser {
  readonly id: string;
  /** The raw bearer token, forwarded to Postgres so RLS applies to every query. */
  readonly jwt: string;
}

export interface Authenticator {
  /** Resolve a bearer token to a user, or null if it is missing/invalid/expired. */
  verify(jwt: string): Promise<AuthedUser | null>;
}

/** Verifies the token against the local Supabase auth server. */
export function supabaseAuthenticator(config: Config): Authenticator {
  const client = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return {
    async verify(jwt) {
      const { data, error } = await client.auth.getUser(jwt);
      if (error !== null || data.user === null) {
        return null;
      }
      return { id: data.user.id, jwt };
    },
  };
}

/** Pull a bearer token out of an Authorization header value (scheme is case-insensitive, RFC 7235). */
export function bearer(header: string | undefined): string | null {
  if (header === undefined) {
    return null;
  }
  const match = /^Bearer +(.+)$/i.exec(header);
  return match?.[1] ?? null;
}
