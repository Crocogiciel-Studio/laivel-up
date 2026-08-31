# Studio backend. Build context is the repo root (it is a workspace package that
# imports the core):
#   docker build -f packages/studio-server/Dockerfile -t laivel-up-studio-server .
#
# Needs a reachable Supabase project; see docker-compose.yml at the repo root.

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
COPY packages/core/ packages/core/
COPY packages/studio-server/ packages/studio-server/
RUN pnpm -C packages/core build \
 && pnpm -C packages/studio-server build \
 && pnpm prune --prod

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/package.json ./package.json
COPY --from=build /repo/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build /repo/packages/core/package.json ./packages/core/package.json
COPY --from=build /repo/packages/core/dist ./packages/core/dist
COPY --from=build /repo/packages/core/presets ./packages/core/presets
COPY --from=build /repo/packages/core/i18n ./packages/core/i18n
COPY --from=build /repo/packages/studio-server/package.json ./packages/studio-server/package.json
COPY --from=build /repo/packages/studio-server/dist ./packages/studio-server/dist
COPY --from=build /repo/packages/studio-server/node_modules ./packages/studio-server/node_modules
EXPOSE 8787
CMD ["node", "packages/studio-server/dist/main.js"]
