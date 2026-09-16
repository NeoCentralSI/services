# Worker Split

## Masalah Saat Ini

Bootstrap server menjalankan koneksi DB/Redis, mendaftarkan repeatable jobs, membuat worker, lalu membuka HTTP server. Pola ini aman untuk satu instance, tetapi berisiko ketika API discale menjadi lebih dari satu instance.

Risiko:

- Repeatable jobs bisa didaftarkan berkali-kali.
- Worker ikut hidup di semua API instance.
- Request HTTP dan background job berebut CPU/memory.
- Deploy API tidak bisa dipisah dari deploy worker.

## Target

Pisahkan proses:

- API process: hanya menerima HTTP request.
- Worker process: menjalankan BullMQ Worker dan scheduler.

## Struktur Target

```txt
src/
  app.js
  server.js              # API only
  worker.js              # worker + scheduler
  queues/
    maintenance.queue.js # queue definition and processor wiring
```

## Script Package Target

```json
{
  "scripts": {
    "start": "node src/server.js",
    "start:api": "node src/server.js",
    "start:worker": "node src/worker.js",
    "dev": "nodemon src/server.js",
    "dev:api": "nodemon src/server.js",
    "dev:worker": "nodemon src/worker.js"
  }
}
```

## Langkah Implementasi

1. Pindahkan pemanggilan scheduler dari `src/server.js` ke `src/worker.js`.
2. Pastikan `src/server.js` hanya:
   - load env
   - init DB/Redis
   - start Express app
3. Pastikan `src/worker.js`:
   - load env
   - init DB/Redis
   - register repeatable jobs
   - start BullMQ worker
4. Hindari side-effect worker saat import queue.
5. Pisahkan fungsi `scheduleAllMaintenanceJobs`.
6. Tambahkan graceful shutdown untuk API dan worker.

## Refactor Queue

Idealnya `maintenance.queue.js` tidak langsung membuat Worker saat di-import. Pisahkan menjadi:

```txt
src/queues/
  maintenance.queue.js          # Queue instance
  maintenance.scheduler.js      # schedule repeatable jobs
  maintenance.worker.js         # Worker processor
```

Minimal viable split:

- `maintenance.queue.js`: export queue dan scheduler functions.
- `maintenance.worker.js`: export `startMaintenanceWorker()`.
- `worker.js`: panggil scheduler dan `startMaintenanceWorker()`.

## Graceful Shutdown

API:

- stop menerima request baru
- close HTTP server
- disconnect Prisma
- disconnect Redis

Worker:

- close BullMQ worker
- close queue
- disconnect Prisma
- disconnect Redis

## Acceptance Criteria

- `pnpm start:api` tidak mendaftarkan job.
- `pnpm start:worker` mendaftarkan job dan memproses job.
- Menjalankan dua API instance tidak membuat duplicate processing.
- Menjalankan satu worker instance cukup untuk semua scheduled jobs.
- Log startup API dan worker berbeda jelas.

## Test Plan

- Start API saja: hit `/health`.
- Start worker saja: cek repeatable jobs terdaftar.
- Start API + worker: flow endpoint tetap jalan.
- Start dua API + satu worker: tidak ada duplicate reminder.
- Stop worker saat API hidup: API tetap melayani request.

