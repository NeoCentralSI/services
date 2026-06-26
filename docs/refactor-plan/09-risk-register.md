# Risk Register

## R1 - Endpoint Response Berubah

Risiko:

- Frontend error karena shape response berubah.

Mitigasi:

- Buat OpenAPI baseline.
- Jangan ubah response saat refactor internal.
- Tambahkan regression smoke test.

## R2 - Duplicate Scheduled Job

Risiko:

- Reminder terkirim berkali-kali.
- Status update berjalan ganda.

Mitigasi:

- Pisah worker dari API.
- Hanya worker yang register repeatable jobs.
- Jalankan satu scheduler instance.

## R3 - File Hilang Saat Migrasi Storage Modular

Risiko:

- File lama di `uploads` tidak terbaca.
- Storage key baru tidak cocok dengan metadata database.

Mitigasi:

- Local fallback.
- Jangan hapus `uploads` lama.
- Simpan `storageKey`, `originalName`, `mimeType`, `sizeOriginal`, `sizeStored`.
- Buat script migrasi terpisah dan idempotent.

## R4 - Auth File Private Bocor

Risiko:

- Dokumen TA/yudisium bisa diakses tanpa izin.

Mitigasi:

- Private file lewat auth proxy atau signed URL pendek.
- Jangan expose bucket public untuk file private.
- Pertahankan access middleware existing untuk thesis file.

## R5 - TypeScript Migration Terlalu Besar

Risiko:

- Banyak file berubah, bug baru, timeline molor.

Mitigasi:

- Mixed JS/TS.
- File baru dulu.
- Migrasi low-risk layer dulu.
- Tidak rewrite domain besar sekaligus.

## R6 - Query Prisma Menjadi Bottleneck

Risiko:

- Dashboard/report lambat saat data besar.

Mitigasi:

- Pagination wajib.
- Index database.
- Audit query include relasi.
- Export berat dipindah ke job jika perlu.

## R7 - Kompresi Merusak File

Risiko:

- File berubah sehingga validasi hash/tanda tangan tidak cocok.
- PDF/DOCX rusak akibat proses kompresi agresif.

Mitigasi:

- Kompres hanya tipe file yang aman.
- Hitung hash setelah file final disimpan.
- Jangan kompres dokumen yang sudah ditandatangani atau dipakai untuk public verification.
- Jika hasil kompresi lebih besar atau gagal divalidasi, pakai file original.

## R8 - Worker Membutuhkan Observability

Risiko:

- Job gagal diam-diam.

Mitigasi:

- Log job start/completed/failed.
- Simpan failure reason.
- Tambahkan alert sederhana atau dashboard BullMQ jika dibutuhkan.
