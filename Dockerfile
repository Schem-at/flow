# syntax=docker/dockerfile:1
#
# Production images for the Flow editor (github.com/Nano112/flow), used by the
# Schemati platform in *coupled* mode. Two targets share one Bun/Turbo install:
#
#   target: client  -> static Vite build served by Caddy (the editor SPA).
#                      Caddy also reverse-proxies /api -> the Laravel app, the
#                      prod equivalent of the dev Vite proxy (coupled mode).
#   target: server  -> headless Polymerase execution engine (Hono + Bun).
#
# Build context is the submodule root (./flow), so the whole Bun workspace
# (client, server, shared, packages/*) is available to Turbo.

############################################################
# Shared base: install the whole workspace once.
############################################################
FROM oven/bun:1 AS base
WORKDIR /app
COPY . .
# Frozen install for reproducibility; fall back if the lockfile drifted.
RUN bun install --frozen-lockfile || bun install

############################################################
# Client build -> static Vite bundle.
# VITE_* are *build-time* and baked into the bundle, so the schemati site URL
# and feature flags must be supplied as build args, not runtime env. Turbo
# forwards VITE_* into the client build (see turbo.json `env`).
############################################################
FROM base AS client-build
ARG VITE_SCHEMATI_URL=https://schemat.io
ARG VITE_SERVER_URL=
ARG VITE_FEATURE_SCHEMATI_NODES=true
ARG VITE_FEATURE_MODULES=true
ARG VITE_FEATURE_API_EXECUTION=false
ENV VITE_SCHEMATI_URL=$VITE_SCHEMATI_URL \
    VITE_SERVER_URL=$VITE_SERVER_URL \
    VITE_FEATURE_SCHEMATI_NODES=$VITE_FEATURE_SCHEMATI_NODES \
    VITE_FEATURE_MODULES=$VITE_FEATURE_MODULES \
    VITE_FEATURE_API_EXECUTION=$VITE_FEATURE_API_EXECUTION
RUN bunx turbo build --filter=client

############################################################
# Client runtime: Caddy serves the SPA + proxies /api -> Laravel.
############################################################
FROM caddy:2-alpine AS client
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=client-build /app/client/dist /srv
EXPOSE 80

############################################################
# Server build: compile the workspace deps the server imports
# (matches the dev flow-server command).
############################################################
FROM base AS server-build
RUN bunx turbo build --filter=@flow/core --filter=@flow/synthase --filter=shared

############################################################
# Server runtime: Bun runs the TypeScript entry directly.
############################################################
FROM oven/bun:1 AS server
WORKDIR /app
COPY --from=server-build /app /app
WORKDIR /app/server
ENV PORT=3001 \
    DATABASE_PATH=/app/server/data/polymerase.db
EXPOSE 3001
CMD ["bun", "run", "src/index.ts"]
