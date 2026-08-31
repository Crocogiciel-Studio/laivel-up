import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider.js';

export function RequireAuth({ children }: { children: ReactNode }): ReactNode {
  const { session } = useAuth();
  const location = useLocation();

  if (session === undefined) {
    return <div className="centered muted">Checking session…</div>;
  }
  if (session === null) {
    // Carry the intended path in the query — router state is lost across the
    // OAuth reload.
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return children;
}
