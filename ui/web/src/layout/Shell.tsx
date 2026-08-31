import { useEffect, useState } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.js';
import { useOrg } from '../org/OrgProvider.js';
import { api } from '../api/client.js';

const NAV = [
  { to: '/profiles', label: 'Profiles' },
  { to: '/grids', label: 'Grids' },
  { to: '/runs', label: 'Runs' },
] as const;

type Health = 'ok' | 'unreachable' | 'checking';

function OrgSwitcher(): ReactNode {
  const { orgs, currentOrg, error, select, create } = useOrg();

  if (error !== null) {
    return <span className="error small">{error}</span>;
  }
  if (orgs === undefined) {
    return <span className="muted small">loading orgs…</span>;
  }

  const onNew = (): void => {
    const name = window.prompt('New organisation name');
    if (name !== null && name.trim() !== '') {
      void create(name.trim());
    }
  };
  const onChange = (e: ChangeEvent<HTMLSelectElement>): void => {
    select(e.target.value);
  };

  return (
    <span className="org">
      {orgs.length > 1 ? (
        <select value={currentOrg?.id ?? ''} onChange={onChange}>
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      ) : (
        <span className="org-name">{currentOrg?.name ?? 'no org'}</span>
      )}
      <button type="button" className="secondary small" onClick={onNew}>
        + org
      </button>
      <NavLink to="/org" className="org-settings" title="Organisation settings">
        ⚙
      </NavLink>
    </span>
  );
}

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
        <OrgSwitcher />
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
