# Studio web app. Build context is the repo root (workspace package, depends on
# @laivel-up/ui):
#   docker build -f packages/studio-web/Dockerfile \
#     --build-arg VITE_SUPABASE_URL=... --build-arg VITE_SUPABASE_ANON_KEY=... \
#     --build-arg VITE_API_URL=... -t laivel-up-studio-web .
#
# Vite bakes VITE_* at build time, so pass them as build args.

FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json packages/core/package.json
COPY packages/viewer/package.json packages/viewer/package.json
COPY packages/studio-server/package.json packages/studio-server/package.json
COPY packages/studio-web/package.json packages/studio-web/package.json
COPY packages/studio-db/package.json packages/studio-db/package.json
RUN pnpm install --frozen-lockfile --filter @laivel-up/studio-web...
COPY packages/core/ packages/core/
COPY packages/viewer/ packages/viewer/
COPY packages/studio-web/ packages/studio-web/
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_API_URL
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_API_URL=$VITE_API_URL
RUN pnpm -C packages/core build && pnpm -C packages/studio-web run build

FROM nginx:1.27-alpine AS serve
COPY packages/studio-web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/packages/studio-web/dist/ /usr/share/nginx/html/
EXPOSE 80
