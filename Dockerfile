# ── Stage 1: deps ──────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy lockfile + manifests first (better layer caching)
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma/

# Install production deps only
RUN pnpm install --frozen-lockfile --prod

# Generate Prisma client
RUN pnpm exec prisma generate

# ── Stage 2: prod image ────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

# Install curl for healthcheck
RUN apk add --no-cache curl

# Non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy built deps + generated client from stage 1
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma

# Copy source
COPY src ./src
COPY package.json ./

# Uploads directory (mounted as volume in production)
RUN mkdir -p uploads && chown -R appuser:appgroup /app

USER appuser

EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "src/server.js"]
