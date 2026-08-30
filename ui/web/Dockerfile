# Studio web app. Build context is the repo root (workspace package, depends on
# @laivel-up/ui):
#   docker build -f ui/web/Dockerfile \
#     --build-arg VITE_SUPABASE_URL=... --build-arg VITE_SUPABASE_ANON_KEY=... \
#     --build-arg VITE_API_URL=... -t laivel-up-studio-web .
#
# Vite bakes VITE_* at build time, so pass them as build args.

FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY ui/package.json ui/package.json
COPY ui/web/package.json ui/web/package.json
RUN pnpm install --frozen-lockfile --filter @laivel-up/studio-web...
COPY ui/ ui/
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_API_URL
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_API_URL=$VITE_API_URL
RUN pnpm -C ui/web run build

FROM nginx:1.27-alpine AS serve
COPY ui/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/ui/web/dist/ /usr/share/nginx/html/
EXPOSE 80
