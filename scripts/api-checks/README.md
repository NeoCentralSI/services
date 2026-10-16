# Pemeriksaan API (Paket E dan Paket P)

Skrip di folder ini mengirim permintaan HTTP ke backend yang sedang berjalan, seperti yang dikirim frontend, lalu mencocokkan jawabannya dengan data seed. Skrip-skrip ini dipakai untuk memverifikasi Paket E, Paket P, dan lanjutannya. Hampir semuanya **mengubah data**, jadi setiap skrip dijalankan pada database yang baru dibangun ulang dan di-seed.

| Skrip | Isi | Seed |
|---|---|---|
| `p1-api.mjs` | P1: permukaan yang berubah tetap bekerja pada skema baru | tujuh seeder |
| `p2-api.mjs` | P2: Pengajuan Pembimbing (dua jalur, atas kuota, tarik/batal) dan Batas Bimbingan | tujuh seeder |
| `p3-api.mjs` | P3: Penetapan Pembimbing (versi, akses per peran, PDF) | tujuh seeder |
| `p4-api.mjs` | P4: bimbingan dan milestone fase proposal, proposal final, template proposal | tujuh seeder |
| `p5-api.mjs` | P5: presensi, Penilaian Proposal, kelulusan/naik, ekspor, Monitoring Kelas | tujuh seeder |
| `p6-api.mjs` | P6: SIA hanya dibaca, DevTools tab Proposal, alamat lama, data mahasiswa per semester | tujuh seeder + dummy-SIA |
| `p7-api.mjs` | Lanjutan: TA yang mengulang proposal kembali ke Penelitian lewat proposal revisi | tujuh seeder |
| `e2e.mjs` | Paket E: skenario API `PANDUAN_UJI_MANUAL_ALUR_TA.md` (DevTools, aktivitas, kesiapan, perubahan TA, evaluasi, overview) | tujuh seeder |
| `e3-api.mjs` | Paket E3: Monitoring per semester (baca-saja) | **enam** seeder (tanpa `seed-thesis-proposal-flow.js`) |
| `e3-ready-api.mjs` | Paket E3: kartu "Siap Mendaftar" seminar/sidang berubah saat kesiapan disetujui atau dibatalkan (menulis persetujuan) | enam seeder |
| `e4-api.mjs` | Paket E4: pembimbing yang diganti (1.1), kesiapan setelah lulus (3.2/3.3), daftar Evaluasi dosen (4.3), Peringatkan oleh Sekdep/GKM (8), bimbingan TA yang dihentikan (7); Lanjutan: halaman Perubahan dan Evaluasi lebih dari 100 baris (menyisipkan lalu menghapus 120 baris uji), tanggal persetujuan kesiapan dari seed, bimbingan TA Selesai, nama di pesan peringatan, pesan 404 berbahasa Indonesia | tujuh seeder |
| `e5-api.mjs` | Paket E5: Permohonan sebagai kotak masuk persetujuan dosen (dua jenis baris, urutan prioritas, filter, badge), Perubahan dan Evaluasi milik Ketua Departemen (urutan prioritas, 403 untuk pembimbing), urutan tabel Monitoring Seminar Hasil/Sidang, aksi Mahasiswa Bimbingan (penanda pengajuan berjalan, kelayakan Ajukan Perubahan dan Alihkan) dan alur Alihkan → pembimbing baru → Ketua Departemen | tujuh seeder |
| `e6-api.mjs` | Paket E6: aturan perubahan judul per tahap (K34: seminar/sidang berproses, setelah seminar, setelah hasil sidang, TA Selesai), judul `ta_lulus_seminar` berubah setelah seminar dan tampil di detail seminar, Jenis Permohonan, beban dosen di pemilih, endpoint `…/lecturer` dan `…/department` dihapus | tujuh seeder |
| `lib-api.mjs` | Pembantu bersama: login per akun, panggilan JSON/multipart, pencatat PASS/FAIL | — |
| `run-all.sh` | Menjalankan semuanya, masing-masing setelah bangun ulang dan seed | — |

Tujuh seeder: `seed-master`, `seed-thesis-topics`, `seed-milestone-templates`, `seed-guidance-milestone`, `seed-thesis-research-flow`, `seed-thesis-monitoring`, `seed-thesis-proposal-flow` (urutan di `PANDUAN_UJI_MANUAL_ALUR_PROPOSAL.md` bagian 1). Enam seeder: tanpa yang terakhir.

## Prasyarat

1. MySQL lokal dengan `DATABASE_URL` di `app/backend/.env` menunjuk ke database lokal (`central`). `run-all.sh` menolak membangun ulang database yang bukan `localhost`.
2. Backend berjalan: `pnpm dev` di `app/backend` (`http://localhost:3000`; port lain lewat `BASE=http://localhost:3100`). Setelah skema berubah, jalankan `npx prisma generate` dan hidupkan ulang backend.
3. Untuk `p6-api.mjs`: dummy-SIA berjalan (`npm run dev` di `app/dummy-SIA`, port 4000), dan `SIA_BASE_URL`/`SIA_API_TOKEN` di `.env` backend menunjuk ke sana.

## Menjalankan

Dari `app/backend`:

```bash
scripts/api-checks/run-all.sh            # p1 … p7, e2e, e3, e3r, e4, e5, e6 — masing-masing setelah bangun ulang + seed
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
