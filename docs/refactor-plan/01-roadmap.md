# Roadmap Refactor

## Tujuan

Meningkatkan maintainability, deployability, dan scalability backend tanpa rewrite framework. Fokus fase ini adalah mengurangi risiko operasional yang paling besar: scheduler ganda, upload lokal, minimnya kontrak API, dan kode JavaScript yang makin sulit dijaga.

## Estimasi Waktu

Estimasi untuk kerja fokus:

- Worker split: 1-3 hari.
- Storage abstraction lokal: 2-3 hari.
- Kompresi otomatis dan migrasi endpoint upload utama: 3-6 hari.
- OpenAPI baseline: 3-5 hari.
- TypeScript incremental setup: 2-4 hari.
- Modularisasi domain tahap awal: 5-10 hari.
- Testing dan deploy hardening: 3-7 hari.

Total realistis: 3-4 minggu untuk refactor yang rapi. Bisa dipotong menjadi 1-2 minggu jika hanya mengambil worker split dan storage modular dasar.

## Phase 0 - Baseline

Output:

- Inventaris endpoint aktif.
- Inventaris endpoint upload/download.
- Inventaris background jobs.
- Snapshot test command yang bisa dijalankan.
- Catatan environment variable yang dipakai.

Checklist:

- Catat route auto-loaded dari `src/routes/*.route.js`.
- Catat subroute `insternship`, `thesisGuidance`, dan `milestones`.
- Catat static path uploads di `src/app.js`.
- Catat scheduler di `src/server.js` dan `src/queues/maintenance.queue.js`.
- Pastikan `.env.example` mewakili config baru nanti.

## Phase 1 - Worker Split

Output:

- `src/api.js` atau tetap `src/server.js` hanya menjalankan HTTP server.
- `src/worker.js` menjalankan BullMQ worker dan scheduler.
- Script package baru:
  - `start:api`
  - `start:worker`
  - `dev:api`
  - `dev:worker`

Kriteria selesai:

- API bisa start tanpa mendaftarkan repeatable job.
- Worker bisa start tanpa membuka HTTP port.
- Repeatable job tidak didaftarkan ganda saat API discale lebih dari satu instance.

## Phase 2 - Modular Local Storage

Output:

- `src/services/storage/storage.service.js`
- `src/services/storage/local-storage.service.js`
- `src/services/storage/compression.service.js`
- Interface fungsi:
  - `putObject`
  - `getObjectStream`
  - `deleteObject`
  - `exists`
  - `resolvePath`
  - `getFileInfo`

Kriteria selesai:

- Upload baru tidak langsung menulis ke `uploads` dari controller.
- File dikompresi otomatis sesuai tipe file yang didukung.
- Local storage tetap kompatibel untuk development dan production sederhana.
- Metadata dokumen tetap tersimpan di database.

## Phase 3 - Upload Endpoint Migration

Output:

- Endpoint upload utama memakai storage service.
- Naming file dan folder distandarkan.
- Cleanup file lama dan temp file lebih aman.
- Middleware upload tetap tipis dan tidak menyimpan logic domain.

Kriteria selesai:

- Upload TA, seminar/sidang, yudisium, magang, SOP, dan avatar bisa dimigrasi bertahap.
- File lama masih bisa dibaca.
- Compression result tercatat dalam metadata jika ukuran berubah.

## Phase 4 - OpenAPI Baseline

Output:

- `docs/openapi/openapi.yaml`
- Spec awal untuk endpoint utama:
  - auth
  - documents
  - notification
  - thesis guidance
  - thesis seminars
  - thesis defences
  - internship
  - yudisium

Kriteria selesai:

- Frontend bisa melihat contract endpoint.
- Response umum distandarkan di dokumentasi.
- Breaking change harus dicatat sebelum implementasi.

## Phase 5 - TypeScript Incremental

Output:

- `tsconfig.json`
- Build/runtime strategy untuk mixed JS/TS.
- Type declaration untuk `req.user`.
- File baru mulai ditulis sebagai `.ts`.

Kriteria selesai:

- File JS lama tetap berjalan.
- File TS baru bisa dijalankan dan dites.
- Tidak ada rewrite massal.

## Phase 6 - Domain Modularization

Output target bertahap:

```txt
src/modules/
  auth/
  master-data/
  thesis-guidance/
  thesis-exam/
  internship/
  yudisium/
  documents/
  notification/
```

Kriteria selesai:

- Domain baru masuk `modules`.
- Domain lama dipindahkan hanya saat disentuh.
- Import path tidak dibuat terlalu dalam.
- Boundary antar domain lebih jelas.

## Phase 7 - Performance and Deploy Hardening

Output:

- Pagination default untuk list besar.
- Index database untuk query filter/sort penting.
- Worker concurrency jelas.
- Health endpoint lebih informatif.
- Docker compose/API-worker split.

Kriteria selesai:

- Bisa deploy API dan worker sebagai service terpisah.
- Bisa scale API tanpa scheduler ganda.
- Report/export berat tidak memblok request utama terlalu lama.
