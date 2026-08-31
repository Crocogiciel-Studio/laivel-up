# Deploying the studio to Vercel

One Vercel project serves both tiers from one domain: `packages/studio-web`
as the static build, `api/[...path].ts` as a serverless function wrapping
`packages/studio-server`'s Fastify app. Same Supabase project as
[local setup](studio.md#running) — Vercel only replaces where the two
processes run, not what they talk to.

## Why one function, not a per-route split

Vercel's own routing gives any file under `api/` the whole `/api/*` path
space, unrewritten — a request to `/api/orgs` reaches
`api/[...path].ts` with `req.url` still `/api/orgs`. The Fastify app
inside does its own routing exactly as it does locally; nothing about its
~30 routes needed splitting into separate functions.

`/health` is the one path outside `/api/`, kept for local dev — a plain
`api/*.ts` file can't own a path outside its own prefix without a rewrite
that changes what the function receives, so the deployed check is at
`/api/health` instead. `packages/studio-server/src/app.ts` registers both
(see [`packages/studio-server/README.md`](../packages/studio-server/README.md)
for the full route table); the `/api/health` alias is exempt from the
bearer-token hook the same way `/health` is.

## Project settings

- **Root Directory**: the repo root (default) — do **not** point it at
  `packages/studio-web`, the build needs the whole workspace.
- **Framework Preset**: "Other" (a custom `buildCommand` and
  `outputDirectory` are already in [`vercel.json`](../vercel.json)).
- **Install Command**: leave the default — Vercel detects `pnpm-lock.yaml`
  and runs `pnpm install`.

## Environment variables (Project Settings → Environment Variables)

| Variable | Value |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | same project as local — Project Settings → API in the Supabase dashboard |
| `STUDIO_SITE_URL` | your deployed URL, e.g. `https://<project>.vercel.app` |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | the same project, again (baked into the browser bundle) |
| `VITE_API_URL` | `""` (empty) — front and back are the same origin now, so a relative `/api/...` fetch is correct; the local default (`http://localhost:8787`) would be wrong here |

Set `VITE_API_URL` explicitly to an empty string — if it's left unset instead,
the deployed app silently falls back to `http://localhost:8787` and every
API call the browser makes fails against the visitor's own machine (check
the Network tab for that host if sign-in or any page stays blank).

`HOST` / `PORT` (used by `pnpm -C packages/studio-server dev`'s `.listen()`)
don't apply to a serverless function and can be left unset.

## Supabase: add the deployed URL

**Authentication → URL Configuration**: add your Vercel URL to the redirect
allow-list, the same step [local setup](studio.md#running) has you do for
`http://127.0.0.1:5173`. A Vercel **preview** deployment gets its own
per-branch URL — front and back are still served from that one preview URL
together, so nothing else needs a per-preview entry, but sign-in on a
preview only works once *that* URL is also in the allow-list.

## Verify

```bash
curl https://<project>.vercel.app/api/health   # {"ok":true}
```

Then open the app and sign in — the rest is the same studio described in
[Studio overview](studio.md).
