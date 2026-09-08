# syntax=docker/dockerfile:1
# =============================================================================
# KR App — production image
# Node.js 24.20.0 LTS (pinned), multi-stage, non-root, no secrets baked in.
# =============================================================================

# ── Stage 1: build the Vite SPA ───────────────────────────────────────────────
FROM node:24.20.0-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# Build-time only public vars may be passed via --build-arg; no secrets here.
RUN npm run build

# ── Stage 2: install production dependencies ─────────────────────────────────
FROM node:24.20.0-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# ── Stage 3: runtime ─────────────────────────────────────────────────────────
FROM node:24.20.0-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    STORAGE_DRIVER=local \
    LOCAL_STORAGE_PATH=/app/storage

# wget (busybox) is present in alpine and used by HEALTHCHECK.
RUN addgroup -g 1001 -S nodejs \
 && adduser -S krapp -u 1001 -G nodejs \
 && mkdir -p /app/storage \
 && chown -R krapp:nodejs /app/storage

COPY --from=deps --chown=krapp:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=krapp:nodejs /app/dist ./dist
COPY --chown=krapp:nodejs package.json ./
COPY --chown=krapp:nodejs server ./server

USER krapp

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/health || exit 1

# node forwards SIGTERM by default when it is PID 1; Fastify closes gracefully.
CMD ["node", "server/index.js"]
