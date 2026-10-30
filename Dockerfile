# syntax=docker/dockerfile:1
# Production images, one Dockerfile with two targets:
#   web    — Next.js standalone server on :3000
#   worker — background worker (checks, audits, emails, PDF reports) with headless Chromium;
#            the same image runs `prisma migrate deploy` before each deploy
# docker-compose.prod.yml wires them together (README → Deploy).

ARG NODE_IMAGE=node:24-bookworm-slim

FROM ${NODE_IMAGE} AS base
# Prisma's schema engine needs OpenSSL.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
# postinstall runs `prisma generate`; the config only needs a well-formed URL at this point.
RUN DATABASE_URL=postgresql://build@localhost/build npm ci

FROM deps AS build
COPY . .
# lib/db.ts and lib/auth.ts read the environment on import, which `next build` does while collecting routes.
# Placeholders satisfy lib/env.ts; real values arrive at runtime (none of these end up in the output).
RUN DATABASE_URL=postgresql://build@localhost/build \
  BETTER_AUTH_SECRET=build-placeholder-not-a-real-secret-000000 \
  BETTER_AUTH_URL=http://build-placeholder.invalid \
  EMAIL_FROM=build-placeholder@example.invalid \
  npm run build

FROM base AS web
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 STORAGE_DIR=/data/storage
RUN mkdir -p /data/storage && chown node:node /data/storage
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "server.js"]

FROM deps AS worker
ENV NODE_ENV=production STORAGE_DIR=/data/storage PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npx playwright install --with-deps chromium \
  && rm -rf /var/lib/apt/lists/* \
  && npm prune --omit=dev \
  && mkdir -p /data/storage && chown node:node /data/storage
COPY tsconfig.json ./
COPY lib ./lib
COPY worker ./worker
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.WORKER_HEALTH_PORT || 3001) + '/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
# Variables come from the container environment; there is no .env file in the image.
CMD ["node_modules/.bin/tsx", "worker/index.ts"]
