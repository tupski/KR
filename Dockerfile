# Multi-stage Dockerfile for KR (Kakaramaroom) Self-Hosted App
# Node.js 24.20.0 LTS

# ── Stage 1: Build Frontend SPA ──
FROM node:24-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Stage 2: Production Dependencies ──
FROM node:24-alpine AS deps
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# ── Stage 3: Runner ──
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV STORAGE_DRIVER=local
ENV LOCAL_STORAGE_PATH=/app/storage

# Non-root user setup
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    mkdir -p /app/storage && \
    chown -R nodejs:nodejs /app/storage

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY server ./server
COPY package.json ./

USER nodejs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/health || exit 1

CMD ["node", "server/index.js"]
