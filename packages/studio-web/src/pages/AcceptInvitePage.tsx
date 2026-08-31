import { useEffect, useRef, useState } from 'react';
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
  const attempted = useRef<string | null>(null);

  useEffect(() => {
    if (token === undefined) return;
    // accept_invite() is single-use. Fire it exactly once per token: the ref
    // guard survives StrictMode's remount and any `reload`/`session` identity
    // change, and the response is applied whenever it lands (no `active` flag —
    // that would discard the first effect's result after StrictMode's cleanup).
    if (attempted.current === token) return;
    attempted.current = token;

    acceptInvite(token)
      .then(async ({ orgId }) => {
        await reload();
        select(orgId);
        setStatus('ok');
        setTimeout(() => navigate('/'), 800);
      })
      .catch((e: unknown) => {
        setStatus(e instanceof ApiError ? e.message : 'could not accept the invite');
      });
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
