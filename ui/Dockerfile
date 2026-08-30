# Build the single-file static viewer, then serve it with nginx.
# Build context is the repo root (the viewer is a pnpm workspace package):
#   docker build -f ui/Dockerfile -t laivel-up-ui .
#   docker run --rm -p 8080:80 laivel-up-ui
# Then open http://localhost:8080 and drop an evaluation.json.

FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY ui/package.json ui/package.json
RUN pnpm install --frozen-lockfile
COPY ui/ ui/
RUN pnpm -C ui run build

FROM nginx:1.27-alpine AS serve
COPY --from=build /repo/ui/dist/ /usr/share/nginx/html/
EXPOSE 80
