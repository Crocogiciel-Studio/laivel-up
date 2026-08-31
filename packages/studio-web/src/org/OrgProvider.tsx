import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '../auth/AuthProvider.js';
import { api, ApiError } from '../api/client.js';

export interface Org {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
}

interface OrgState {
  /** undefined while loading. */
  readonly orgs: readonly Org[] | undefined;
  readonly currentOrg: Org | undefined;
  /** Non-null when the last orgs request failed. */
  readonly error: string | null;
  select(orgId: string): void;
  create(name: string): Promise<Org>;
  reload(): Promise<void>;
}

const OrgContext = createContext<OrgState | null>(null);
const STORAGE_KEY = 'studio.orgId';

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function OrgProvider({ children }: { children: ReactNode }): ReactNode {
  const { session } = useAuth();
  const [orgs, setOrgs] = useState<readonly Org[] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(readStored());

  const reload = useCallback(async () => {
    if (session === undefined || session === null) {
      setOrgs(undefined);
      return;
    }
    try {
      // `api<T>()` trusts its type param -- guard against a backend/routing
      // hiccup (e.g. a non-JSON response) resolving to `null` instead of [].
      setOrgs((await api<Org[] | null>('/api/orgs')) ?? []);
      setError(null);
    } catch (e) {
      setOrgs([]);
      setError(e instanceof ApiError ? e.message : 'could not load organisations');
    }
  }, [session]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const select = useCallback((orgId: string) => {
    setSelectedId(orgId);
    try {
      localStorage.setItem(STORAGE_KEY, orgId);
    } catch {
      /* ignore */
    }
  }, []);

  const currentOrg = useMemo(() => {
    if (orgs === undefined || orgs === null || orgs.length === 0) return undefined;
    return orgs.find((o) => o.id === selectedId) ?? orgs[0];
  }, [orgs, selectedId]);

  const value = useMemo<OrgState>(
    () => ({
      orgs,
      currentOrg,
      error,
      select,
      reload,
      create: async (name) => {
        try {
          const org = await api<Org>('/api/orgs', {
            method: 'POST',
            body: JSON.stringify({ name }),
          });
          await reload();
          select(org.id);
          return org;
        } catch (e) {
          setError(e instanceof ApiError ? e.message : 'could not create the organisation');
          throw e;
        }
      },
    }),
    [orgs, currentOrg, error, select, reload],
  );

  return <OrgContext value={value}>{children}</OrgContext>;
}

export function useOrg(): OrgState {
  const value = useContext(OrgContext);
  if (value === null) {
    throw new Error('useOrg must be used within <OrgProvider>');
  }
  return value;
}
