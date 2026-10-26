# Sinkronisasi SIA di NeoCentral

NeoCentral **hanya membaca** SIA. SIA menyediakan satu rute, `GET /students`, berisi rekam akademik semester berjalan. Kontrak lengkap (bentuk respons, tabel kolom, aturan nilai, kode galat, pagination) ada di [README dummy-SIA](../../../dummy-SIA/README.md). Dokumen ini menjelaskan apa yang dilakukan backend dengan data itu.

## Berkas

| Berkas | Isi |
|---|---|
| `src/services/sia.client.js` | `fetchAcademicRecords()`: satu-satunya pembaca SIA. Mengikuti pagination (`?page=&pageSize=500`), mengulang 3 kali dengan jeda, batas waktu `SIA_FETCH_TIMEOUT` per permintaan. Dengan `SIA_MOCK=true` membaca `src/test/fixtures/sia-students.json` (bentuk sama persis dengan respons dummy-SIA). |
| `src/services/sia.normalize.js` | `normalizeSiaResponse()`/`normalizeSiaStudent()`: satu-satunya tempat yang membaca nama kolom SIA. Semua langkah sinkronisasi memakai rekam hasil normalisasi. Bila SIA asli berbeda bentuk, cukup berkas ini yang diubah. |
| `src/constants/siaCourses.js` | Kode mata kuliah yang menentukan penanda semester: Metode Penelitian `IF4001`, Tugas Akhir `IF5001`. Bila kode tidak dikenal, nama mata kuliah menjadi cadangan (`Metode/Metodologi Penelitian`, `Tugas Akhir`/`Skripsi`). |
| `src/services/sia.sync.job.js` | `runSiaSync()`: langkah-langkah di bawah. |

## Kapan berjalan

- **Manual**: Admin menekan **Sinkronkan SIA** di Data Mahasiswa (`POST /sia/sync`).
- **Terjadwal**: antrean maintenance (`sia-sync`) setiap hari, bila `ENABLE_CRON` aktif.
- **`SIA_BASE_URL` kosong**: sinkronisasi terjadwal dilewati dengan satu baris log (`Sinkronisasi SIA dilewati: SIA_BASE_URL kosong`), tanpa galat dan tanpa menyimpan apa pun. Tombol dan `POST /sia/sync` menolak dengan pesan "Sinkronisasi SIA belum tersedia."

## Langkah

Tiap mahasiswa dicocokkan dengan **NIM** (`users.identityNumber`). NIM yang tidak ada di NeoCentral dihitung "tidak ditemukan" dan dilewati. Kegagalan satu mahasiswa dicatat dan mahasiswa berikutnya tetap diproses.

1. **Data akademik dan IPK** → `students`: `sksCompleted`, `currentSemester`, `enrollmentYear`, `gpa`, `mandatoryCoursesCompleted`, `mkwuCompleted`, `internshipCompleted`, `kknCompleted`, `researchMethodCompleted`. Kolom yang tidak dikirim SIA dibiarkan. Arti kolom tidak berubah (dipakai juga oleh KP). Predikat kelulusan Yudisium memakai `gpa` ini.
2. **Status mahasiswa** lewat `applyStudentStatusChange` (K40), sumber `sia`: `aktif`→Aktif, `cuti`→Cuti (TA dijeda), `lulus`→Lulus, `mengundurkan_diri`→Mengundurkan Diri, `drop_out`→Drop Out (TA Gagal). Efeknya sama dengan perubahan oleh Admin, termasuk log aktivitas dan notifikasi.
3. **Penanda semester** (`student_academic_year_snapshots`: "Mengambil Metode Penelitian", "Mengambil Tugas Akhir") dari `currentCourses`. Hanya ditulis bila `period` SIA sama dengan tahun ajaran aktif NeoCentral; bila berbeda, penanda dilewati dan dihitung di ringkasan, sementara data lain tetap masuk. Penanda yang diisi Admin (sumber `admin`) tidak ditimpa (K36) sampai Admin memilih **Ikuti Data SIA**.
4. **Nilai CPL** → `student_cpl_scores` (sumber `SIA`), berdasarkan `cplCode` pada kurikulum angkatan mahasiswa. Nilai yang diisi manual atau sudah diproses tidak ditimpa; data yang lebih lama dari yang tersimpan dilewati. `description` opsional; bila dikirim harus sama dengan deskripsi CPL.

Promosi tahap TA tidak dilakukan di sini; sinkronisasi hanya menulis data.

## Data manual

| Data | Penanda manual | Perilaku |
|---|---|---|
| Penanda semester | sumber `admin` | dipertahankan |
| Nilai CPL | sumber bukan `SIA` atau status bukan `calculated` | dipertahankan |
| IPK, status mahasiswa | tidak ada penanda manual (keputusan K45) | **nilai SIA berlaku** pada sinkronisasi berikutnya; perubahan Admin akan tertimpa |

## Ringkasan

Hasil disimpan di Redis (`GET /sia/sync/status`), dikembalikan oleh `POST /sia/sync`, dan ditampilkan di Data Mahasiswa: `fetched` (dibaca), `notFound` (tidak ditemukan), `statusChanged`, `gpaChanged`, `periodFlagsCreated`/`periodFlagsUpdated`/`periodFlagsKeptAdmin`, `periodFlagsSkipped` + `periodMismatch` (periode berbeda), `failedStudents`, `cpl*`, `error`.
