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
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}
