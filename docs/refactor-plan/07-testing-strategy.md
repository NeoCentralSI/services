# Testing Strategy

## Tujuan

Menjaga refactor tidak merusak flow utama. Karena endpoint sudah banyak, test harus diprioritaskan berdasarkan risiko, bukan mengejar coverage angka saja.

## Level Test

Unit test:

- service pure logic
- validator
- storage driver
- job logic

Integration test:

- auth flow
- upload/download dokumen
- bimbingan request/approval
- seminar scheduling
- sidang assessment
- internship registration
- yudisium requirement upload

Smoke test:

- health endpoint
- login
- list endpoint utama
- upload kecil
- worker start

## Test Prioritas

P0:

- `/auth/login`
- `/auth/me`
- `/documents/upload`
- protected file access
- worker scheduler start
- notification FCM register/unregister

P1:

- thesis guidance request/approve/reject
- milestone progress/readiness
- seminar document upload/validate
- defence assessment/finalize
- internship proposal submit/approve
- yudisium requirement upload/validate

P2:

- report/export
- import Excel/CSV
- public verification hash
- calendar/outlook integration

## Worker Test

Test yang perlu ada:

- scheduler tidak error saat mendaftarkan job.
- worker memproses job sesuai `job.name`.
- job unknown tidak crash.
- job bisa di-run manual di test mode.

## Storage Test

Local driver:

- upload object
- download object
- delete object
- signed URL fallback jika local

S3/MinIO driver:

- upload object
- get signed URL
- delete object
- handle missing object

## Regression Checklist Manual

Setelah refactor worker:

- API start.
- Worker start.
- `/health` OK.
- Login OK.
- Notifikasi masih terbaca.
- Job reminder tidak duplicate.

Setelah refactor storage:

- Upload dokumen TA OK.
- Download/view dokumen TA OK.
- Upload yudisium requirement OK.
- Upload SOP OK.
- Avatar upload/delete OK.
- File private tidak bisa diakses tanpa token.

## Acceptance Criteria

- Test existing tetap pass atau kegagalan terdokumentasi.
- Flow P0 punya minimal integration/smoke test.
- Refactor storage punya unit test driver.
- Worker split punya smoke test start API dan worker.

