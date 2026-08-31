import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../supabase.js';

type OAuthProvider = 'github' | 'google';

interface AuthState {
  /** undefined while the initial session check is in flight. */
  readonly session: Session | null | undefined;
  /** `next` is an in-app path to land on after the OAuth round-trip (default `/`). */
  signIn(provider: OAuthProvider, next?: string): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): ReactNode {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setSession(data.session);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      session,
      signIn: async (provider, next = '/') => {
        // Router state does not survive the OAuth full-page reload, so the
        // destination rides in redirectTo.
        const dest = next.startsWith('/') ? next : '/';
        await supabase.auth.signInWithOAuth({
          provider,
          options: { redirectTo: `${window.location.origin}${dest}` },
        });
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [session],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (value === null) {
    throw new Error('useAuth must be used within <AuthProvider>');
  }
  return value;
}
