# One image for the API and its maintenance commands (db-push, seed).
# Building only generates the Prisma client; it never touches the database.
FROM node:22-alpine
WORKDIR /app

RUN apk add --no-cache curl && npm install -g pnpm@10.23.0

# Dependencies first for layer caching. Dev dependencies stay: the Prisma CLI
# is needed by the db-push and seed commands.
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile || (yes | pnpm approve-builds && pnpm install --frozen-lockfile)
RUN ./node_modules/.bin/prisma generate

COPY src ./src
COPY scripts ./scripts
COPY ["Sample Laporan TA.pdf", "./"]
COPY docker-entrypoint.sh /usr/local/bin/neocentral

RUN chmod +x /usr/local/bin/neocentral \
  && mkdir -p uploads logs \
  && chown -R node:node /app

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

ENTRYPOINT ["neocentral"]
CMD ["start"]
