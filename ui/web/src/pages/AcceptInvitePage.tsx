import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useOrg } from '../org/OrgProvider.js';
import { ApiError } from '../api/client.js';
import { acceptInvite } from '../org/orgApi.js';

export function AcceptInvitePage(): ReactNode {
  const { token } = useParams<{ token: string }>();
  const { reload, select } = useOrg();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'working' | 'ok' | string>('working');

  useEffect(() => {
    if (token === undefined) return;
    let active = true;
    acceptInvite(token)
      .then(async ({ orgId }) => {
        if (!active) return;
        await reload();
        select(orgId);
        setStatus('ok');
        setTimeout(() => navigate('/'), 800);
      })
      .catch((e: unknown) => {
        if (active) setStatus(e instanceof ApiError ? e.message : 'could not accept the invite');
      });
    return () => {
      active = false;
    };
  }, [token, reload, select, navigate]);

  return (
    <div className="centered">
      <div className="card login">
        <h1>Join organisation</h1>
        {status === 'working' && <p className="muted">Accepting the invite…</p>}
        {status === 'ok' && <p>You're in. Taking you to the app…</p>}
        {status !== 'working' && status !== 'ok' && (
          <>
            <p className="error">{status}</p>
            <Link to="/">Back to the app</Link>
          </>
        )}
      </div>
    </div>
  );
}
