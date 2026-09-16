# Backend Refactor Plan

Dokumen ini adalah rencana refactor backend tanpa rewrite besar. Targetnya menjaga endpoint existing tetap kompatibel, sambil menaikkan kualitas operasional backend: worker terpisah, storage bucket, TypeScript bertahap, dokumentasi API, modularisasi domain, dan hardening deploy.

## Keputusan Arsitektur

- Tetap memakai Express sebagai framework utama.
- Tidak migrasi ke microservice Go untuk fase ini.
- Tidak migrasi ke NestJS untuk fase ini.
- Migrasi TypeScript dilakukan incremental tanpa mengubah kontrak response.
- Worker dan scheduler dipisah dari API server.
- Upload file tetap memakai filesystem lokal, tetapi dirapikan lewat storage abstraction modular dengan kompresi otomatis, metadata konsisten, dan akses file yang terpusat.
- API contract didokumentasikan dengan OpenAPI sebelum refactor endpoint besar.

## Dokumen

1. [Roadmap](./01-roadmap.md)
2. [Worker Split](./02-worker-split.md)
3. [Modular Compressed Storage](./03-modular-compressed-storage.md)
4. [TypeScript Migration](./04-typescript-migration.md)
5. [OpenAPI Documentation](./05-openapi.md)
6. [Domain Modularization](./06-domain-modularization.md)
7. [Testing Strategy](./07-testing-strategy.md)
8. [Deployment Plan](./08-deployment-plan.md)
9. [Risk Register](./09-risk-register.md)

## Prinsip Kerja

- Refactor harus kecil, bertahap, dan bisa di-rollback.
- Endpoint frontend tidak boleh berubah tanpa migration note.
- Business flow utama harus tetap jalan: auth, bimbingan TA, seminar, sidang, magang, yudisium, dokumen, notifikasi.
- Perubahan infrastruktur dilakukan di belakang interface/service layer, bukan langsung di controller.
- Setiap fase selesai harus punya hasil verifikasi minimal: unit test, integration test, manual smoke test, atau checklist deploy.

## Urutan Prioritas

1. Pisahkan API server dan worker.
2. Buat storage abstraction lokal dengan kompresi otomatis.
3. Migrasi endpoint upload penting ke storage service.
4. Dokumentasikan API dengan OpenAPI per modul.
5. Mulai TypeScript incremental dari file baru dan layer low-risk.
6. Modularisasi domain secara bertahap.
7. Audit query, pagination, index, dan report/export.

## Definisi Selesai

Refactor dianggap selesai untuk fase ini jika:

- API server bisa jalan tanpa mendaftarkan scheduler/worker.
- Worker bisa dijalankan sebagai proses terpisah.
- Upload/download file punya `storage.service` sebagai satu pintu.
- File upload baru tersimpan dengan struktur path konsisten dan metadata kompresi.
- Endpoint kritikal terdokumentasi di OpenAPI.
- TypeScript bisa dipakai untuk file baru tanpa memaksa rewrite semua file lama.
- Deploy production bisa menjalankan API dan worker secara terpisah.
