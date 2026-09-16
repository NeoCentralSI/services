# Domain Modularization

## Tujuan

Membuat struktur backend lebih mudah dijaga tanpa memecah ke microservice. Ini disebut modular monolith: satu deployable backend, tetapi batas domain lebih jelas.

## Masalah Saat Ini

Struktur saat ini sudah layered, tetapi file domain tersebar:

- `routes`
- `controllers`
- `services`
- `repositories`
- `validators`

Saat domain makin besar, developer harus bolak-balik banyak folder.

## Target Struktur

```txt
src/modules/
  auth/
    auth.route.ts
    auth.controller.ts
    auth.service.ts
    auth.validator.ts
  master-data/
  thesis-guidance/
  thesis-exam/
  internship/
  yudisium/
  documents/
  notification/
```

## Prinsip Migrasi

- Jangan pindahkan semua sekaligus.
- Modul baru masuk struktur baru.
- File lama dipindah saat ada pekerjaan terkait.
- Route public tetap sama.
- Import compatibility boleh dipakai sementara.

## Mapping Domain

Auth:

- `/auth`
- Microsoft auth
- JWT, refresh token, profile basic

Master Data:

- `/adminfeatures`
- `/master-data-ta`
- `/topics`
- `/science-groups`
- `/lecturer-availabilities`
- `/sia`

Thesis Guidance:

- `/thesisGuidance`
- `/milestones`
- `/thesis-change-requests`
- `/kadep-transfers`

Thesis Exam:

- `/thesis-seminars`
- `/thesis-defences`
- `/seminar-rubrics`
- `/defence-rubrics`
- `/cpls`
- `/cpmks`

Internship:

- `/insternship/*`

Yudisium:

- `/yudisiums/*`

Documents:

- `/documents`
- `/sop`
- upload/download helpers
- PDF/DOCX generation helpers

Notification:

- `/notification`
- FCM
- notification repository/service

Calendar:

- `/calendar`
- `/outlook-calendar`

## Boundary Rules

- Controller hanya memanggil service domainnya.
- Service boleh memanggil repository domain sendiri.
- Cross-domain call harus lewat service publik yang eksplisit.
- Jangan import repository domain lain langsung dari service.
- Shared utility harus benar-benar generic.

## Shared Layer

```txt
src/shared/
  config/
  db/
  errors/
  http/
  validation/
  storage/
  queue/
```

## Acceptance Criteria

- Domain baru bisa dibuat tanpa menambah file di banyak folder root.
- Endpoint lama tetap aktif.
- Tidak ada circular dependency baru.
- Boundary cross-domain terdokumentasi.

