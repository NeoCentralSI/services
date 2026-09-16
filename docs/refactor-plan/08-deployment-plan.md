# Deployment Plan

## Target Deployment

Backend dijalankan sebagai beberapa proses:

- API server
- worker
- Redis
- MySQL
- filesystem lokal untuk uploads

## Docker Compose Target

Service target:

```txt
api
worker
mysql
redis
```

API:

- command: `pnpm start:api`
- expose HTTP port
- tidak menjalankan scheduler

Worker:

- command: `pnpm start:worker`
- tidak expose HTTP port
- menjalankan scheduler dan BullMQ worker

## Environment Target

API dan worker berbagi:

- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `REFRESH_TOKEN_SECRET`
- `FCM_*`
- `STORAGE_ROOT`
- `STORAGE_COMPRESS_ENABLED`

API only:

- `PORT`
- `CORS_*`
- `BASE_URL`

Worker only:

- `*_CRON`
- `*_TZ`
- `WORKER_CONCURRENCY`

## Health Check

API:

- `/health`
- cek uptime, env, DB status opsional, Redis status opsional

Worker:

- log readiness
- optional lightweight health server di port internal jika dibutuhkan
- atau healthcheck command yang memeriksa Redis connection

## Rollout Strategy

1. Deploy API lama + worker lama seperti sekarang.
2. Deploy API baru tanpa scheduler di staging.
3. Deploy worker baru di staging.
4. Validasi repeatable jobs.
5. Deploy API baru production.
6. Deploy worker baru production.
7. Pastikan hanya satu worker scheduler aktif.

## Rollback

Jika worker baru gagal:

- Stop worker baru.
- Jalankan mode lama sementara.
- Jangan migrasi database pada fase worker split.

Jika storage modular baru gagal:

- Matikan kompresi dengan `STORAGE_COMPRESS_ENABLED=false`.
- Pastikan file lama masih bisa dibaca dari `uploads`.
- Jangan hapus file lama sebelum migrasi tervalidasi.

## Acceptance Criteria

- API bisa discale lebih dari satu instance.
- Worker bisa dijalankan satu instance terpisah.
- Storage lokal bisa dikonfigurasi via env.
- Kompresi file bisa dimatikan via env saat incident.
- Rollback tidak membutuhkan perubahan frontend.
