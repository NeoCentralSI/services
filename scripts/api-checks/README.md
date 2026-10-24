# Pemeriksaan API

Skrip di folder ini mengirim permintaan HTTP ke backend yang sedang berjalan, seperti yang dikirim frontend, lalu mencocokkan jawabannya dengan data seed. Skrip-skrip ini memverifikasi alur tugas akhir dan alur proposal. Hampir semuanya **mengubah data**, jadi setiap skrip dijalankan pada database yang baru dibangun ulang dan di-seed.

| Skrip | Isi | Seed |
|---|---|---|
| `p1-api.mjs` | Permukaan API yang berubah bersama skema proposal tetap bekerja | sembilan seeder |
| `p2-api.mjs` | Pengajuan Pembimbing (dua jalur, atas kuota, tarik/batal) dan Batas Bimbingan | sembilan seeder |
| `p3-api.mjs` | Penetapan Pembimbing (versi, akses per peran, PDF) | sembilan seeder |
| `p4-api.mjs` | Bimbingan dan milestone fase proposal, proposal final, template proposal | sembilan seeder |
| `p5-api.mjs` | Penilaian Proposal (draf, urutan bebas, nilai pertama Pembimbing 2 mengunci), lulus langsung Penelitian di transaksi nilai kedua, tidak lulus tetap Proposal, kunci CPMK/rubrik/nilai minimum, Penilaian hanya koordinator, syarat mata kuliah untuk Seminar Hasil, mengulang, ekspor, Monitoring Kelas; rute presensi dan proses kelulusan sudah tidak ada | sembilan seeder |
| `p6-api.mjs` | SIA hanya dibaca, DevTools tab Proposal, alamat lama, data mahasiswa per semester | sembilan seeder + dummy-SIA |
| `p7-api.mjs` | TA yang mengulang proposal kembali ke Penelitian lewat proposal revisi | sembilan seeder |
| `p8-api.mjs` | Angka yang terlihat pada hari seed (katalog, antrean Kadep, susunan Penetapan, template, CPMK dan bobot, ringkasan grafik Monitoring Kelas, yang lulus sudah Penelitian), Batas Bimbingan hanya Kadep/Sekdep, template milestone proposal hanya oleh Sekdep, koordinator 403 (urutan, aktif, hapus), CPMK/rubrik ditulis Sekdep saja, Salin Template dari periode lain, nilai minimum per periode, template milestone di dua fase (proposal umum, lalu template topik setelah proposal lulus) | sembilan seeder |
| `p9-api.mjs` | Penetapan satu tabel per semester (baris per mahasiswa, menunggu di atas, semester lampau baca saja), Pembimbing 2 ke dosen penuh sebagai Jenis di Permohonan lalu baris Penetapan, penanda per semester oleh Admin (403 untuk Sekdep/Kadep) yang dipertahankan sinkronisasi sampai Ikuti Data SIA, pesan mahasiswa tanpa istilah teknis, katalog dengan topik bimbingan (tanpa topik yang ditawarkan), nilai bagian percobaan final, batas semester hanya oleh Kadep (Sekdep 403, batas umum tetap Sekdep), Impor Keikutsertaan (templat, endpoint pratinjau sudah tidak ada, impor langsung bersumber Admin dengan nama yang tidak cocok dilewati, impor ulang idempoten, NIM tidak dikenal, baris tidak valid, Sekdep 403, tidak ditimpa sinkronisasi, log audit) | sembilan seeder |
| `p9r-api.mjs` | Langkah uji Penetapan Pembimbing dijalankan berurutan lewat API, untuk angka yang bergantung pada langkah sebelumnya (beban Ullya 8, Terbitkan Penetapan (5 baru), 11 mahasiswa di versi 2, versi 3 setelah Pembimbing 2) | sembilan seeder |
| `e2e.mjs` | Skenario API alur tugas akhir (DevTools, aktivitas, kesiapan, perubahan TA, evaluasi, overview) | sembilan seeder |
| `e3-api.mjs` | Monitoring per semester (baca-saja) | **tujuh** seeder (tanpa `seed-thesis-proposal-flow.js`) |
| `e3-ready-api.mjs` | Kartu "Siap Mendaftar" seminar/sidang berubah saat kesiapan disetujui atau dibatalkan (menulis persetujuan) | tujuh seeder |
| `e4-api.mjs` | Pembimbing yang diganti, kesiapan setelah lulus, daftar Evaluasi dosen, Peringatkan oleh Sekdep/GKM, bimbingan TA yang dihentikan, halaman Perubahan dan Evaluasi lebih dari 100 baris (menyisipkan lalu menghapus 120 baris uji), tanggal persetujuan kesiapan dari seed, bimbingan TA Selesai, nama di pesan peringatan, pesan 404 berbahasa Indonesia | sembilan seeder |
| `e5-api.mjs` | Permohonan sebagai kotak masuk persetujuan dosen (dua jenis baris, urutan prioritas, filter, badge), Perubahan dan Evaluasi milik Ketua Departemen (urutan prioritas, 403 untuk pembimbing), urutan tabel Monitoring Seminar Hasil/Sidang, aksi Mahasiswa Bimbingan (penanda pengajuan berjalan, kelayakan Ajukan Perubahan dan Alihkan) dan alur Alihkan → pembimbing baru → Ketua Departemen | sembilan seeder |
| `e6-api.mjs` | Aturan perubahan judul per tahap (seminar/sidang berproses, setelah seminar, setelah hasil sidang, TA Selesai), judul `ta_lulus_seminar` berubah setelah seminar dan tampil di detail seminar, Jenis Permohonan, beban dosen di pemilih, endpoint `…/lecturer` dan `…/department` dihapus | sembilan seeder |
| `e7-api.mjs` | Sidang lulus tanpa revisi → TA Selesai (bimbingan terbuka, perubahan yang menunggu dan evaluasi yang menunggu Ketua Departemen ditutup; beban pembimbing turun satu; notifikasi), lulus dengan revisi tetap Penelitian sampai revisi difinalkan, batal finalisasi → kembali Penelitian, tidak lulus tetap Penelitian, halaman sidang/seminar/Overview/riwayat bimbingan/Yudisium untuk TA Selesai, data seed, sidang lulus dibatalkan Admin → kembali Penelitian. Sidang yang sudah berlangsung disiapkan lewat Prisma (tanpa API untuk itu); sisanya lewat API. Juga: nilai minimum kelulusan dari seed, batalkan persetujuan item revisi setelah final ditolak, catatan evaluasi yang ditutup sistem di tabel Evaluasi | sembilan seeder |
| `n1-api.mjs` | Status mahasiswa sebagai satu-satunya sumber cuti dan berhenti studi (Cuti → TA dijeda dengan penanda di Bimbingan dosen, Monitoring, Data TA, beban, detail dosen; Aktif → dilanjutkan; Drop Out → TA Gagal, beban turun, notifikasi; akun uji Drop Out dari seed), aturan akun Admin (peran dan aktivasi akun sendiri, Admin tidak digabung peran lain di form, buat, dan impor), Log Aktivitas (akses Admin/Kadep/Sekdep, dosen dan mahasiswa 403, terbaru di atas, cari, filter tindakan, rentang tanggal, aktivitas rutin tidak tampil) | sembilan seeder |
| `n2-api.mjs` | Filter Data Mahasiswa (status, program termasuk keduanya, kombinasi dengan cari dan urutan, sebelum pagination) dan Data Dosen (kelompok keilmuan), log perubahan kriteria Seminar Hasil, Penetapan Pembimbing sebagai dokumen resmi (token dan QR versi terbit, unduhan berkas yang sama dengan hash sesuai, verifikasi publik, pratinjau tidak tercatat, penerbitan ulang membuat versi lama diganti) | sembilan seeder |
| `f1-api.mjs` | Akun demo `ta_demo_…` (Seminar Hasil, Sidang TA, Yudisium) berada di keadaan yang dijanjikan menurut pemeriksa syarat aplikasi (overview mahasiswa, form penilaian penguji/pembimbing, revisi, syarat yudisium, filter program); DevTools: akses hanya Admin dan hanya di bawah `/devtools`, jadwal (Besok, Mulai sekarang, Sudah lewat, tanggal bebas), status seminar dan sidang beserta efek sampingnya dari sisi mahasiswa, pembimbing, dan Admin (revisi, persetujuan pembimbing, TA Selesai/kembali Penelitian, dokumen resmi dicabut), buat dan hapus seminar/sidang, penjaga urutan, tanggal periode yudisium, status peserta, daftar/hapus dari periode, rekomendasi dan nilai CPL, tanpa notifikasi | sembilan seeder |
| `lib-api.mjs` | Pembantu bersama: login per akun, panggilan JSON/multipart, pencatat PASS/FAIL | — |
| `run-all.sh` | Menjalankan semuanya, masing-masing setelah bangun ulang dan seed | — |

Sembilan seeder, dalam urutan ini: `seed-master`, `seed-thesis-topics`, `seed-thesis-rubrics`, `seed-milestone-templates`, `seed-guidance-milestone`, `seed-thesis-research-flow`, `seed-thesis-monitoring`, `seed-thesis-proposal-flow`, `seed-thesis-final-stages`. `seed-thesis-rubrics` membutuhkan tahun akademik dari `seed-master`; ia mengisi CPMK dan rubrik seminar/sidang serta nilai minimum kelulusan seminar dan sidang semester berjalan (65), sehingga hasil seminar dan sidang bisa ditetapkan. Tujuh seeder: tanpa dua yang terakhir. `seed-thesis-final-stages` membutuhkan rubrik dan nilai minimum dari `seed-thesis-rubrics`; ia menambah syarat dokumen seminar dan sidang semester berjalan, CPL, persyaratan dan exit survey yudisium, satu periode yudisium yang pendaftarannya dibuka saat seed dijalankan, dan sembilan akun `ta_demo_…`.

## Prasyarat

1. MySQL lokal dengan `DATABASE_URL` di `app/backend/.env` menunjuk ke database lokal (`central`). `run-all.sh` menolak membangun ulang database yang bukan `localhost`.
2. Backend berjalan: `pnpm dev` di `app/backend` (`http://localhost:3000`; port lain lewat `BASE=http://localhost:3100`). Setelah skema berubah, jalankan `npx prisma generate` dan hidupkan ulang backend.
3. Untuk `p6-api.mjs`: dummy-SIA berjalan (`npm run dev` di `app/dummy-SIA`, port 4000), dan `SIA_BASE_URL`/`SIA_API_TOKEN` di `.env` backend menunjuk ke sana.

## Menjalankan

Dari `app/backend`:

```bash
scripts/api-checks/run-all.sh            # p1 … p9, p9r, e2e, e3, e3r, e4, e5, e6, e7, n1, n2, f1 — masing-masing setelah bangun ulang + seed
scripts/api-checks/run-all.sh p4 p7      # hanya yang disebut
```

`run-all.sh` menjalankan `npx prisma db push --force-reset --skip-generate` lalu seeder yang sesuai sebelum tiap skrip. Perintah itu **menghapus semua data** di database lokal. Untuk menjalankan satu skrip pada data yang ada (misalnya setelah seed manual):

```bash
node scripts/api-checks/p7-api.mjs
```

Prisma menolak `--force-reset` yang dipanggil agen AI tanpa persetujuan Anda; di terminal Anda sendiri perintah itu berjalan biasa.

## Membaca hasil

- Satu baris per pemeriksaan: `PASS [bagian] label :: nilai yang terlihat` atau `FAIL …`. Nilai di belakang `::` adalah data yang benar-benar dijawab backend, untuk melacak kegagalan.
- Baris terakhir: `N pemeriksaan, X lulus, Y gagal`, diikuti daftar `GAGAL bagian | label`.
- Kode keluar 0 bila semuanya lulus, 1 bila ada yang gagal. `run-all.sh` mencetak ringkasan per skrip dan menyimpan log lengkap di `${API_CHECKS_LOG_DIR:-/tmp/neocentral-api-checks}`.
- Angka yang diperiksa adalah angka hari seed. Tanggal seed relatif terhadap hari seeder dijalankan, jadi jalankan skrip segera setelah seed.

## Rahasia

Skrip tidak menyimpan token atau rahasia. Token akses diperoleh lewat login saat skrip berjalan dan hanya disimpan di memori. Kata sandi yang dipakai adalah kata sandi akun seed (`password123`, sama dengan di panduan uji). `p6-api.mjs` membaca `SIA_API_TOKEN` dari `.env` saat berjalan dan tidak mencetaknya.
