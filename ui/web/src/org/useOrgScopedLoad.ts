import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../api/client.js';
import { useOrg } from './OrgProvider.js';

/**
 * Load data scoped to the current org: re-fetches when the org changes, tracks
 * an `error` from a failed fetch, and exposes `reload` for a mutation's own
 * error handling to call afterwards.
 */
export function useOrgScopedLoad<T>(
  fetcher: (orgId: string) => Promise<T>,
  fallback: T,
): {
  readonly orgId: string | undefined;
  readonly data: T;
  readonly error: string | null;
  setError(error: string | null): void;
  reload(): Promise<void>;
} {
  const { currentOrg } = useOrg();
  const orgId = currentOrg?.id;

  const [data, setData] = useState<T>(fallback);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (orgId === undefined) return;
    setError(null);
    try {
      setData(await fetcher(orgId));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'failed to load');
    }
    // `fetcher` is expected to be stable (a plain function reference or one
    // memoised by the caller) -- including it would re-run this on every render.
  }, [orgId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { orgId, data, error, setError, reload };
}
