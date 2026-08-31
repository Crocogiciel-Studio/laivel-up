# Studio web app

The SPA a Lead Tech signs into. Part of the grid & profile studio — see
[`docs/studio.md`](../../docs/studio.md) (part of the
[documentation corpus](../../docs/README.md)), epic
[#54](https://github.com/Crocogiciel-Studio/laivel-up/issues/54).

React + Vite + React Router. Auth is Supabase OAuth, client-side; **all data
goes through the backend** (`packages/studio-server`) — the browser never
queries Postgres directly.

## Shape

| Path | Does |
| --- | --- |
| `/login` | GitHub / Google OAuth, then back to the app |
| `/profiles` | list, create, edit a developer profile; clone a seeded template |
| `/grids` | the drag-and-drop grid builder; clone a seeded template |
| `/runs` | pick a grid + one or more profiles, run them in a batch, browse history per developer, compare over time |
| `/org` | roster, invites, roles |

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
pnpm -C packages/studio-server dev   # backend on :8787
pnpm -C packages/studio-web dev      # app on :5173
```

Add `http://127.0.0.1:5173` to the project's redirect allow-list (dashboard:
Authentication → URL Configuration) and enable a provider (Authentication →
Providers).

## Container

```
docker build -f packages/studio-web/Dockerfile \
  --build-arg VITE_SUPABASE_URL=... --build-arg VITE_SUPABASE_ANON_KEY=... \
  --build-arg VITE_API_URL=... -t laivel-up-studio-web .
```

`docker compose up --build` builds both tiers from the repo-root `.env`.
