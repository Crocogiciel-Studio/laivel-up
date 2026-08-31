# Build the single-file static viewer, then serve it with nginx.
# Build context is the repo root (the viewer is a pnpm workspace package):
#   docker build -f packages/viewer/Dockerfile -t laivel-up-viewer .
#   docker run --rm -p 8080:80 laivel-up-viewer
# Then open http://localhost:8080 and drop an evaluation.json.

FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json packages/core/package.json
COPY packages/viewer/package.json packages/viewer/package.json
COPY packages/studio-server/package.json packages/studio-server/package.json
COPY packages/studio-web/package.json packages/studio-web/package.json
COPY packages/studio-db/package.json packages/studio-db/package.json
RUN pnpm install --frozen-lockfile
COPY packages/core/presets/ packages/core/presets/
COPY packages/core/i18n/ packages/core/i18n/
COPY packages/viewer/ packages/viewer/
RUN pnpm -C packages/viewer run build

FROM nginx:1.27-alpine AS serve
COPY --from=build /repo/packages/viewer/dist/ /usr/share/nginx/html/
EXPOSE 80
