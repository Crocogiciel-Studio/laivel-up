# Studio web app

The SPA a Lead Tech signs into. Part of the grid & profile studio — see
[`docs/studio.md`](../../docs/studio.md), epic
[#54](https://github.com/Crocogiciel-Studio/laivel-up/issues/54), issue
[#57](https://github.com/Crocogiciel-Studio/laivel-up/issues/57).

React + Vite + React Router. Auth is Supabase OAuth, client-side; **all data
goes through the backend** (`ui/server`) — the browser never queries Postgres
directly.

## Shape

| Path | State |
| --- | --- |
| `/login` | GitHub / Google OAuth, then back to the app |
| `/profiles` | placeholder — form editor lands in #58 |
| `/grids` | placeholder — drag-and-drop builder lands in #59 |
| `/runs` | placeholder — run + history lands in #60 |

- `auth/AuthProvider` holds the Supabase session and exposes `signIn` / `signOut`.
- `auth/RequireAuth` gates the shell; an unauthenticated visitor is sent to `/login`.
- `org/OrgProvider` loads the user's orgs, tracks the current one (localStorage),
  and creates new ones. The shell shows a switcher when there is more than one.
- `layout/Shell` is the nav + header, and pings the backend `/health`.
- `api/client` attaches the session's access token to every `/api/*` call.

## Config

`VITE_*` vars, read from the repo-root `.env` (`vite.config.ts` `envDir`) and
**baked at build time**. See `.env.example`:

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — the Supabase project
- `VITE_API_URL` — the backend, as the browser reaches it (default `http://localhost:8787`)

## Develop

```
pnpm install
cp .env.example .env          # fill the VITE_* values (and the server's)
pnpm -C ui/server dev         # backend on :8787
pnpm -C ui/web dev            # app on :5173
```

Add `http://127.0.0.1:5173` to the project's redirect allow-list (dashboard:
Authentication → URL Configuration) and enable a provider (Authentication →
Providers).

## Container

```
docker build -f ui/web/Dockerfile \
  --build-arg VITE_SUPABASE_URL=... --build-arg VITE_SUPABASE_ANON_KEY=... \
  --build-arg VITE_API_URL=... -t laivel-up-studio-web .
```

`docker compose up --build` builds both tiers from the repo-root `.env`.
