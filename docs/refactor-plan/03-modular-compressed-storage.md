# Modular Compressed Storage

## Keputusan

Storage tetap memakai filesystem lokal. Bucket seperti S3/MinIO tidak dijadikan target fase ini karena terlalu besar untuk kebutuhan saat ini. Yang dibutuhkan sekarang adalah storage lokal yang lebih rapi, modular, aman, dan otomatis mengompresi file yang memungkinkan.

## Masalah Saat Ini

File upload tersebar di folder `uploads` dan sebagian logic file berada di middleware/controller/service domain.

Risiko:

- Struktur path tidak konsisten antar domain.
- Sulit tahu file mana milik fitur apa.
- File besar bisa membengkakkan storage.
- Cleanup file gagal upload/temp file tidak terpusat.
- Validasi akses file mudah tersebar.
- Migrasi storage di masa depan akan lebih sulit jika logic terus tersebar.

## Target

Semua operasi file melewati storage service lokal.

Target utama:

- Path file konsisten.
- Kompresi otomatis untuk file yang didukung.
- Metadata file tersimpan rapi.
- Controller tidak tahu detail path fisik.
- Akses file private tetap lewat middleware/endpoint terproteksi.
- Sistem masih sederhana dan cocok untuk deployment satu server.

## Struktur Target

```txt
src/services/storage/
  storage.service.js
  local-storage.service.js
  compression.service.js
  storage-key.util.js
  file-metadata.util.js
```

## Interface Target

```js
await storage.saveFile({
  namespace,
  ownerId,
  file,
  allowedMimeTypes,
  compress: true,
});

await storage.getFile({ storageKey });
await storage.deleteFile({ storageKey });
await storage.exists({ storageKey });
await storage.resolvePath({ storageKey });
await storage.getFileInfo({ storageKey });
```

## Metadata Target

Setiap file sebaiknya punya metadata minimal:

```js
{
  storageKey,
  originalName,
  storedName,
  mimeType,
  sizeOriginal,
  sizeStored,
  compressionApplied,
  compressionRatio,
  checksum,
  uploadedBy,
  createdAt
}
```

Metadata bisa disimpan di tabel existing jika sudah ada kolom yang cukup, atau ditambahkan bertahap pada tabel dokumen masing-masing.

## Struktur Path Target

Gunakan path stabil dan tidak bergantung sepenuhnya pada nama file asli.

Contoh:

```txt
uploads/
  thesis/
    {thesisId}/seminar/{seminarId}/documents/{documentTypeId}/{uuid}.pdf
    {thesisId}/defence/{defenceId}/documents/{documentTypeId}/{uuid}.pdf
  yudisium/
    {yudisiumId}/participants/{participantId}/requirements/{requirementId}/{uuid}.pdf
  internship/
    {internshipId}/logbooks/{weekNumber}/{uuid}.pdf
    {internshipId}/reports/{uuid}.pdf
  profile/
    {userId}/avatar/{uuid}.jpg
  sop/
    {category}/{uuid}.pdf
  temp/
```

## Kompresi Otomatis

Kompresi dilakukan berdasarkan tipe file.

Prioritas:

- Image: JPEG/PNG/WebP, kompres ukuran dan kualitas.
- PDF: optimasi ringan jika tooling tersedia.
- DOCX/XLSX: tidak perlu dikompresi ulang karena format sudah zip-based.
- ZIP: tidak dikompresi ulang.

Aturan:

- Jangan kompres jika hasilnya lebih besar dari file awal.
- Simpan file original hanya jika diperlukan audit atau rollback.
- Kompresi tidak boleh merusak file yang butuh tanda tangan/validasi hash.
- File untuk public verification hash harus diperlakukan hati-hati: hash dihitung setelah file final disimpan.

## Library Kandidat

Image compression:

- `sharp` jika ingin hasil terbaik.
- Alternatif lebih ringan bisa dipilih jika dependency native bermasalah.

PDF optimization:

- Gunakan pendekatan konservatif.
- Jika tidak ada tooling stabil, cukup validasi ukuran dan simpan tanpa kompresi.

Checksum:

- Node `crypto` untuk SHA-256.

## Environment Variable

```env
STORAGE_ROOT=uploads
STORAGE_COMPRESS_ENABLED=true
STORAGE_IMAGE_MAX_WIDTH=1920
STORAGE_IMAGE_QUALITY=82
STORAGE_KEEP_ORIGINAL=false
STORAGE_MAX_FILE_SIZE_MB=25
```

## Endpoint Terdampak

Prioritas tinggi:

- `/documents/upload`
- `/documents/:id`
- `/thesis-seminars/:id/documents`
- `/thesis-defences/:id/documents`
- `/yudisiums/student/requirements/upload`
- `/sop`

Prioritas sedang:

- `/profile/avatar`
- `/insternship/activity/*`
- `/insternship/sekdep/templates`
- `/insternship/field-assessment/*`

## Migration Strategy

Fase 1:

- Buat storage service tanpa mengubah endpoint.
- Local save tetap ke `uploads`.
- File baru mulai memakai `storageKey`.

Fase 2:

- Migrasi endpoint dokumen TA/seminar/sidang.
- Tambahkan kompresi image/avatar.
- Tambahkan checksum dan metadata ukuran.

Fase 3:

- Migrasi yudisium, SOP, dan magang.
- Tambahkan cleanup temp file.
- Rapikan static/protected file serving.

Fase 4:

- Audit file lama.
- Buat script migrasi metadata jika diperlukan.
- Tambahkan laporan storage usage per domain jika berguna.

## Private vs Public File

Private:

- thesis document
- yudisium requirement
- seminar/defence assessment result
- internal report

Public/semipublic:

- internship verification letter
- seminar minutes verification
- SOP public

Aturan:

- Private file harus lewat auth middleware atau endpoint download terproteksi.
- Public file tetap boleh di-serve langsung jika memang aman.
- Jangan expose path fisik internal dalam response jika tidak perlu.

## Acceptance Criteria

- Upload baru melewati `storage.service`.
- File tersimpan dengan `storageKey` konsisten.
- Kompresi otomatis berjalan untuk image yang didukung.
- Jika kompresi gagal, upload tetap bisa fallback ke file original dengan log yang jelas.
- File private tidak bisa diakses tanpa auth.
- File lama tetap bisa dibaca.

