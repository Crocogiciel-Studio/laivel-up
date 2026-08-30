# Studio backend. Build context is the repo root (it is a workspace package that
# imports the core):
#   docker build -f ui/server/Dockerfile -t laivel-up-studio-server .
#
# Needs a reachable Supabase stack; see docker-compose.yml at the repo root.

FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsconfig.build.json ./
COPY ui/package.json ui/package.json
COPY ui/server/package.json ui/server/package.json
RUN pnpm install --frozen-lockfile
COPY src/ src/
COPY presets/ presets/
COPY i18n/ i18n/
COPY ui/server/ ui/server/
RUN pnpm build && pnpm -C ui/server build && pnpm prune --prod

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/package.json ./package.json
COPY --from=build /repo/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build /repo/dist ./dist
COPY --from=build /repo/presets ./presets
COPY --from=build /repo/i18n ./i18n
COPY --from=build /repo/ui/server/package.json ./ui/server/package.json
COPY --from=build /repo/ui/server/dist ./ui/server/dist
COPY --from=build /repo/ui/server/node_modules ./ui/server/node_modules
EXPOSE 8787
CMD ["node", "ui/server/dist/main.js"]
