import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '../auth/AuthProvider.js';
import { api } from '../api/client.js';

export interface Org {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
}

interface OrgState {
  /** undefined while loading. */
  readonly orgs: readonly Org[] | undefined;
  readonly currentOrg: Org | undefined;
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
  const [selectedId, setSelectedId] = useState<string | null>(readStored());

  const reload = useCallback(async () => {
    if (session === undefined || session === null) {
      setOrgs(undefined);
      return;
    }
    setOrgs(await api<Org[]>('/api/orgs'));
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
    if (orgs === undefined || orgs.length === 0) return undefined;
    return orgs.find((o) => o.id === selectedId) ?? orgs[0];
  }, [orgs, selectedId]);

  const value = useMemo<OrgState>(
    () => ({
      orgs,
      currentOrg,
      select,
      reload,
      create: async (name) => {
        const org = await api<Org>('/api/orgs', {
          method: 'POST',
          body: JSON.stringify({ name }),
        });
        await reload();
        select(org.id);
        return org;
      },
    }),
    [orgs, currentOrg, select, reload],
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
