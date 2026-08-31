import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider.js';

export function LoginPage(): ReactNode {
  const { session, signIn } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  if (session === undefined) {
    return <div className="centered muted">Checking session…</div>;
  }
  if (session !== null) {
    return <Navigate to={from} replace />;
  }

  return (
    <div className="centered">
      <div className="card login">
        <h1>LAIVEL UP studio</h1>
        <p className="muted">Sign in to build grids and evaluate developers.</p>
        <button type="button" onClick={() => void signIn('github')}>
          Continue with GitHub
        </button>
        <button type="button" className="secondary" onClick={() => void signIn('google')}>
          Continue with Google
        </button>
        <p className="muted small">
          Providers must be enabled in the Supabase project (Authentication → Providers).
        </p>
      </div>
    </div>
  );
}
