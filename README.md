## Backend API — Node.js, Express, Prisma, Redis

Modern, modular backend service built with Express (ESM), Prisma (MySQL), and Redis. It uses a clean layered architecture (routes → controllers → services → repositories), centralized error handling, environment-driven config, and dynamic route auto-loading.

> Note: Some folders are scaffolded (controllers, services, repositories, queues, jobs, mailer) and ready for your implementation.

---

## Tech stack

- Runtime: Node.js (ESM modules)
- Web framework: Express 5
- ORM: Prisma (MySQL)
- Cache/queue: Redis (node-redis client)
- Dev tooling: nodemon

---

## Project structure

```
src/
	app.js                 # Express app: middleware + dynamic route loader
	server.js              # App bootstrap: ensures DB/Redis ready before listen
	config/
		env.js               # Loads and validates environment variables
		db.js                # initConnections() → DB + Redis health checks
		prisma.js            # PrismaClient wired to generated client output
		redis.js             # Redis client + connectivity check
		mailer.js            # (scaffold) SMTP/mailer config
	middlewares/
		error.middleware.js  # Centralized error handler (JSON format)
		auth.middleware.js   # (scaffold) Auth/JWT middleware
		validation.middleware.js # (scaffold) Request validation
	routes/
		*.route.js           # Dynamic route auto-loading (see Conventions)
	controllers/           # (scaffold) Handle HTTP layer
	services/              # (scaffold) Business logic
	repositories/          # (scaffold) Data access via Prisma
	queues/                # (scaffold) Queue definitions (e.g., notification)
	jobs/                  # (scaffold) Schedulers/workers
	utils/                 # Logger, templates, date utils, etc.
	generated/
		prisma/              # Prisma generated client (custom output)
prisma/
	schema.prisma          # Prisma schema (MySQL)
package.json             # type: module, scripts
jsconfig.json            # Path aliases for editor/IDE
```

---

## Environment variables

Create a .env file in the project root. Required keys are marked with “required”.

```env
# App
NODE_ENV=development
PORT=3000
BASE_URL=http://localhost:3000

# Database (Prisma)
DATABASE_URL=mysql://USER:PASSWORD@HOST:PORT/DB_NAME   # required

# Redis
REDIS_URL=redis://localhost:6379

# SMTP / Email (scaffolded, optional for now)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=

# Auth
JWT_SECRET=replace_me                                   # required
JWT_EXPIRES_IN=7d
REFRESH_TOKEN_SECRET=replace_me                         # required
REFRESH_TOKEN_EXPIRES_IN=30d
ACADEMIC_API_TOKEN=dev-academic-token                  # simple token guard for academic info clone
SIA_BASE_URL=http://localhost:4000                     # SIA dummy service base URL
SIA_API_TOKEN=dev-sia-token                            # token header for SIA service
SIA_FETCH_TIMEOUT=10000                                # ms
SIA_CHUNK_SIZE=200                                     # per-batch processing size
ENABLE_SIA_CRON=false                                  # enable scheduled SIA sync (if wired)

# Cron / Jobs (scaffolded)
CRON_TIME_NOTIFY=0 * * * *
ENABLE_CRON=false

# Logging
LOG_LEVEL=debug
LOG_TO_FILE=false

# Meta
APP_NAME=Backend API
APP_OWNER=Orang Sigma
```

env.js will exit the process if any required variable is missing.

---

## Database (Prisma)

- Prisma client is generated to a custom path configured in `prisma/schema.prisma`:

	```prisma
	generator client {
		provider = "prisma-client-js"
		output   = "../src/generated/prisma"
	}
	```

- The code imports the generated client directly (not `@prisma/client`):
	- `src/config/prisma.js` → `import generated from "../generated/prisma/index.js";`

- Typical Prisma workflow:

```powershell
# Install deps
pnpm install

# Apply schema changes (create dev DB migrations)
npx prisma migrate dev

# (Re)generate client if schema changed
npx prisma generate
```

---

## Running the app

```powershell
# Recommended (pnpm lockfile is present)
pnpm install
pnpm run dev

# Or with npm
npm install
npm run dev
```

On startup:
- .env is loaded
- `initConnections()` checks DB and Redis
- Dynamic routes are loaded from `src/routes/*.route.js`
- Server listens on `http://localhost:PORT`

---

## Running with Docker

`docker-compose.yml` runs the backend with MySQL, Redis, Gotenberg, and phpMyAdmin.

```bash
cp .env.example .env            # fill in the values
docker compose up -d --build
```

Inside Compose, `DATABASE_URL`, `REDIS_URL`, and `GOTENBERG_URL` point to the Compose services automatically. Building and starting never change the database schema; that is done with explicit commands:

| Command | Purpose |
|---|---|
| `docker compose run --rm backend db-push` | Apply `prisma/schema.prisma` (refuses changes that would lose data) |
| `docker compose run --rm backend seed` | All seeders, including demo data (`password123` accounts) |
| `docker compose run --rm backend reset --yes` | Drop all tables, push the schema, run all seeders |
| `docker compose run --rm backend node scripts/<file>.js` | Run any other script |

First install: `up -d --build`, then `db-push`, then `seed`.
Update: `git pull`, `up -d --build`, and `db-push` when the schema changed.

Ports bind to `127.0.0.1`:
- API on `3000`;
- phpMyAdmin on `8085`;
- MySQL on `3306`.

They can be changed in `.env`. Open phpMyAdmin from another machine with `ssh -L 8085:127.0.0.1:8085 user@server`.

Data lives in the volumes:
- `db-data`;
- `uploads-data`;
- `redis-data`.

`docker compose down -v` deletes them.

SIA: set `SIA_BASE_URL` to the SIA address. For dummy-SIA on the same machine, use `http://host.docker.internal:4000`. Leave it empty to skip synchronization.

---

## Conventions and patterns

### Dynamic route loading

- Any file ending with `.route.js` inside `src/routes/` will be loaded automatically.
- Each route file must `export default` an Express router instance.

Minimal example for a user route (`src/routes/user.route.js`):

```js
import express from "express";
const router = express.Router();

router.get("/", (req, res) => {
	res.json({ message: "Users endpoint" });
});

export default router;
```

This route will be mounted at `/user`.

### Layered architecture

- Controller: parse/validate request, call service, shape response
- Service: business logic and orchestration
- Repository: DB access via Prisma

Example wiring (conceptual):

```
user.route.js → user.controller.js → user.service.js → user.repository.js → prisma
```

### Error handling

- Use `next(err)` to delegate to `error.middleware.js`.
- Responses are standardized JSON with `success, status, message, timestamp, path`.

---

## Redis

- `src/config/redis.js` initializes a singleton Redis client and provides `checkRedisConnection()` used during startup.
- Use `import redisClient from "../config/redis.js"` wherever you need Redis operations.

---

## Emails (scaffold)

- `src/config/mailer.js` is reserved for configuring an SMTP transporter (e.g., nodemailer). Environment keys are already present in `.env`.

---

## Background jobs and queues (scaffold)

- `src/queues/` and `src/jobs/` are prepared for workers and schedulers (e.g., sending notifications).
- `ENABLE_CRON` and `CRON_TIME_NOTIFY` are provided in `.env`.

---

## Windows/ESM note (dynamic imports)

- The app uses ESM and dynamic imports to load routes. On Windows, absolute paths must be converted to `file://` URLs. This project handles it internally via `pathToFileURL`.

---

## Troubleshooting

- Prisma module not found: `.prisma/client/default`
	- Cause: Using `@prisma/client` while client is generated to a custom path.
	- Fix: Import from `src/generated/prisma/index.js` (already configured in `src/config/prisma.js`). Ensure you run `npx prisma generate` after schema changes.

- ESM URL scheme on Windows: `ERR_UNSUPPORTED_ESM_URL_SCHEME`
	- Cause: Dynamic importing with a raw `C:\...` path.
	- Fix: The project already converts paths to `file://` URLs for route imports.

- Env validation exits on start
	- Ensure required keys in `.env`: `DATABASE_URL`, `JWT_SECRET`, `REFRESH_TOKEN_SECRET`.

- DB/Redis connection failures
	- Confirm `DATABASE_URL` and `REDIS_URL` are reachable from your machine.

---

## Scripts

```json
{
	"scripts": {
		"start": "node src/server.js",
		"dev": "nodemon src/server.js"
	}
}
```

---

## License

ISC (update as needed).
