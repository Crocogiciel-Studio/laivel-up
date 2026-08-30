import { env } from '../env.js';
import { supabase } from '../supabase.js';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues: readonly string[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Call the studio backend with the current user's access token attached. Every
 * `/api/*` route needs it; the backend forwards it to Postgres so RLS applies.
 */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  if (token !== undefined) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${env.apiUrl}${path}`, { ...init, headers });

  if (response.status === 204) {
    return undefined as T;
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const body = (payload ?? {}) as { error?: string; issues?: string[] };
    throw new ApiError(response.status, body.error ?? response.statusText, body.issues ?? []);
  }

  return payload as T;
}
