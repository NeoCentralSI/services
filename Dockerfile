# ── Stage 1: deps ──────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app

# Note: using npm instead of pnpm to avoid strict build scripts rules

# Install build tools for native dependencies (bcrypt, etc.)
RUN apk add --no-cache python3 make g++

COPY package.json ./
COPY prisma ./prisma/

# Install ALL deps (devDeps needed for prisma CLI)
RUN npm install

# Generate Prisma client using binary directly (avoids pnpm exec issues)
RUN ./node_modules/.bin/prisma generate

# Strip devDependencies before copying to runner
RUN npm prune --omit=dev

# ── Stage 2: prod image ────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

RUN apk add --no-cache curl

# Non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy pruned node_modules + generated Prisma client
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
# Generated client lives in src/generated/prisma (custom output in schema.prisma)
COPY --from=deps /app/src/generated ./src/generated

# Copy source
COPY src ./src
COPY package.json ./

RUN mkdir -p uploads && chown -R appuser:appgroup /app

USER appuser
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "src/server.js"]
