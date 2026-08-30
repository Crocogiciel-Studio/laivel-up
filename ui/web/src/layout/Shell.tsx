import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.js';
import { api } from '../api/client.js';

const NAV = [
  { to: '/profiles', label: 'Profiles' },
  { to: '/grids', label: 'Grids' },
  { to: '/runs', label: 'Runs' },
] as const;

type Health = 'ok' | 'unreachable' | 'checking';

export function Shell(): ReactNode {
  const { session, signOut } = useAuth();
  const [health, setHealth] = useState<Health>('checking');

  useEffect(() => {
    let active = true;
    api<{ ok: boolean }>('/health')
      .then((r) => {
        if (active) setHealth(r.ok ? 'ok' : 'unreachable');
      })
      .catch(() => {
        if (active) setHealth('unreachable');
      });
    return () => {
      active = false;
    };
  }, []);

  const email = session?.user.email ?? session?.user.id ?? '';

  return (
    <div className="shell">
      <header>
        <span className="brand">LAIVEL UP</span>
        <nav>
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <span className="spacer" />
        <span className={`api-status ${health}`} title={`backend: ${health}`}>
          backend {health === 'ok' ? '●' : '○'}
        </span>
        <span className="muted small">{email}</span>
        <button type="button" className="secondary" onClick={() => void signOut()}>
          Sign out
        </button>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
