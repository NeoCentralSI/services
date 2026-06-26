# Dokumentasi Tabel Schema Prisma Internship

Sumber: `services/prisma/schema.prisma.internship`

Catatan:
- Kolom yang ditulis adalah kolom fisik database dari setiap `model`.
- Field relasi virtual Prisma seperti `documents Document[]` atau `user User` tidak ditulis sebagai kolom, tetapi kolom foreign key-nya tetap dicatat.
- Nama kolom mengikuti nama database dari `@map(...)` jika tersedia.
- Kolom `Keterangan` menjelaskan kegunaan kolom dalam sistem.

## `users` (`User`)

| Jenis | Nama Kolom | Tipe data | Keterangan |
|---|---|---|---|
| PK | `id` | `String` | Menyimpan identitas unik setiap pengguna. |
| Kolom | `full_name` | `String` | Menyimpan nama lengkap pengguna. |
| Unique | `identity_number` | `String` | Menyimpan nomor identitas pengguna seperti NIM, NIP, atau nomor identitas lain. |
| Kolom | `identity_type` | `IdentityType` | Menentukan jenis nomor identitas pengguna. |
| Unique | `email` | `String?` | Menyimpan alamat email pengguna untuk login dan komunikasi sistem. |
| Kolom | `password` | `String?` | Menyimpan kata sandi pengguna untuk autentikasi akun lokal. |
| Kolom | `phone_number` | `String?` | Menyimpan nomor telepon pengguna yang dapat dihubungi. |
| Kolom | `isVerified` | `Boolean` | Menandai apakah akun pengguna sudah diverifikasi. |
| Kolom | `token` | `String? @db.Text` | Menyimpan token sementara untuk proses autentikasi atau verifikasi. |
| Kolom | `refresh_token` | `String? @db.Text` | Menyimpan token untuk memperbarui sesi login pengguna. |
| Kolom | `oauth_provider` | `String?` | Menyimpan nama penyedia login eksternal yang digunakan pengguna. |
| Kolom | `oauth_id` | `String?` | Menyimpan identitas pengguna dari penyedia login eksternal. |
| Kolom | `oauth_refresh_token` | `String? @db.Text` | Menyimpan token pembaruan dari penyedia login eksternal. |
| Kolom | `avatarUrl` | `String?` | Menyimpan URL foto profil pengguna. |
| Kolom | `createdAt` | `DateTime` | Menyimpan waktu saat data pengguna dibuat. |
| Kolom | `updatedAt` | `DateTime` | Menyimpan waktu terakhir data pengguna diperbarui. |

## `user_roles` (`UserRole`)

| Jenis | Nama Kolom | Tipe data | Keterangan |
|---|---|---|---|
| PK | `id` | `String` | Menyimpan identitas unik setiap role. |
| Kolom | `name` | `String` | Menyimpan nama role yang dapat dimiliki pengguna. |

## `user_has_roles` (`UserHasRole`)

| Jenis | Nama Kolom | Tipe data | Keterangan |
|---|---|---|---|
| PK, FK | `user_id` | `String` | Menghubungkan data role dengan pengguna pemilik role. |
| PK, FK | `role_id` | `String` | Menghubungkan pengguna dengan role yang dimiliki. |
| Kolom | `status` | `RoleStatus` | Menyimpan status aktif atau tidak aktif role pengguna. |

## `students` (`Student`)

| Jenis | Nama Kolom | Tipe data | Keterangan |
|---|---|---|---|
| PK, FK | `user_id` | `String` | Menghubungkan data mahasiswa dengan akun pengguna. |
| Kolom | `student_status` | `StudentStatus` | Menyimpan status akademik mahasiswa. |
| Kolom | `enrollment_year` | `Int?` | Menyimpan tahun angkatan mahasiswa. |
| Kolom | `skscompleted` | `Int` | Menyimpan jumlah SKS yang telah diselesaikan mahasiswa. |
| Kolom | `mandatory_courses_completed` | `Boolean` | Menandai apakah mata kuliah wajib sudah diselesaikan. |
| Kolom | `mkwu_completed` | `Boolean` | Menandai apakah mata kuliah wajib umum sudah diselesaikan. |
| Kolom | `internship_completed` | `Boolean` | Menandai apakah mahasiswa sudah menyelesaikan kerja praktik. |
| Kolom | `kkn_completed` | `Boolean` | Menandai apakah mahasiswa sudah menyelesaikan KKN. |
| Kolom | `research_method_completed` | `Boolean` | Menandai apakah mahasiswa sudah menyelesaikan mata kuliah metodologi penelitian. |
| Kolom | `current_semester` | `Int?` | Menyimpan semester aktif mahasiswa. |
| Kolom | `created_at` | `DateTime` | Menyimpan waktu saat data mahasiswa dibuat. |
| Kolom | `updated_at` | `DateTime` | Menyimpan waktu terakhir data mahasiswa diperbarui. |

## `lecturers` (`Lecturer`)

| Jenis | Nama Kolom | Tipe data | Keterangan |
|---|---|---|---|
| PK, FK | `user_id` | `String` | Menghubungkan data dosen dengan akun pengguna. |
| FK | `science_group_id` | `String?` | Menghubungkan dosen dengan kelompok keilmuan. |
| Kolom | `data` | `Json?` | Menyimpan informasi tambahan dosen dalam format fleksibel. |
| Kolom | `created_at` | `DateTime` | Menyimpan waktu saat data dosen dibuat. |
| Kolom | `updated_at` | `DateTime` | Menyimpan waktu terakhir data dosen diperbarui. |

## `science_groups` (`ScienceGroup`)

| Jenis | Nama Kolom | Tipe data | Keterangan |
|---|---|---|---|
| PK | `id` | `String` | Menyimpan identitas unik kelompok keilmuan. |
| Kolom | `name` | `String` | Menyimpan nama kelompok keilmuan. |
| Kolom | `created_at` | `DateTime` | Menyimpan waktu saat data kelompok keilmuan dibuat. |
| Kolom | `updated_at` | `DateTime` | Menyimpan waktu terakhir data kelompok keilmuan diperbarui. |

## `academic_years` (`AcademicYear`)

| Jenis | Nama Kolom | Tipe data | Keterangan |
|---|---|---|---|
| PK | `id` | `String` | Menyimpan identitas unik tahun akademik. |
| Kolom | `semester` | `Semester` | Menyimpan semester pada tahun akademik. |
| Kolom | `year` | `String? @db.VarChar(20)` | Menyimpan label tahun akademik. |
| Kolom | `start_date` | `DateTime?` | Menyimpan tanggal mulai tahun akademik. |
| Kolom | `end_date` | `DateTime?` | Menyimpan tanggal selesai tahun akademik. |
| Kolom | `is_active` | `Boolean` | Menandai tahun akademik yang sedang aktif digunakan. |
| Kolom | `created_at` | `DateTime` | Menyimpan waktu saat data tahun akademik dibuat. |
| Kolom | `updated_at` | `DateTime` | Menyimpan waktu terakhir data tahun akademik diperbarui. |

## `rooms` (`Room`)

| Jenis | Nama Kolom | Tipe data | Keterangan |
|---|---|---|---|
| PK | `id` | `String` | Menyimpan identitas unik ruangan. |
| Kolom | `name` | `String` | Menyimpan nama ruangan. |
| Kolom | `location` | `String? @db.VarChar(255)` | Menyimpan lokasi ruangan. |
| Kolom | `capacity` | `Int?` | Menyimpan kapasitas peserta ruangan. |
| Kolom | `created_at` | `DateTime` | Menyimpan waktu saat data ruangan dibuat. |
| Kolom | `updated_at` | `DateTime` | Menyimpan waktu terakhir data ruangan diperbarui. |

## `documents` (`Document`)

| Jenis | Nama Kolom | Tipe data | Keterangan |
|---|---|---|---|
| PK | `id` | `String` | Menyimpan identitas unik dokumen. |
| FK | `user_id` | `String?` | Menghubungkan dokumen dengan pengguna pemilik atau pengunggah dokumen. |
| FK | `document_type_id` | `String?` | Menghubungkan dokumen dengan jenis dokumen. |
| Kolom | `file_path` | `String?` | Menyimpan lokasi penyimpanan file dokumen. |
| Kolom | `file_name` | `String?` | Menyimpan nama file dokumen. |
| Kolom | `file_hash` | `String? @db.VarChar(255)` | Menyimpan hash file untuk validasi atau pengecekan duplikasi dokumen. |
| Kolom | `created_at` | `DateTime` | Menyimpan waktu saat data dokumen dibuat. |
| Kolom | `updated_at` | `DateTime` | Menyimpan waktu terakhir data dokumen diperbarui. |

## `document_types` (`DocumentType`)

| Jenis | Nama Kolom | Tipe data | Keterangan |
|---|---|---|---|
| PK | `id` | `String` | Menyimpan identitas unik jenis dokumen. |
| Kolom | `name` | `String?` | Menyimpan nama jenis dokumen. |
| Kolom | `created_at` | `DateTime` | Menyimpan waktu saat data jenis dokumen dibuat. |
| Kolom | `updated_at` | `DateTime` | Menyimpan waktu terakhir data jenis dokumen diperbarui. |

## `document_templates` (`DocumentTemplate`)

| Jenis | Nama Kolom | Tipe data | Keterangan |
|---|---|---|---|
| PK | `id` | `String` | Menyimpan identitas unik template dokumen. |
| Unique | `name` | `String` | Menyimpan nama unik template dokumen. |
| Kolom | `type` | `String` | Menyimpan tipe format template dokumen. |
| Kolom | `content` | `String? @db.LongText` | Menyimpan isi template dokumen. |
| Kolom | `file_path` | `String? @db.VarChar(255)` | Menyimpan lokasi file template dokumen. |
| Kolom | `created_at` | `DateTime` | Menyimpan waktu saat data template dokumen dibuat. |
| Kolom | `updated_at` | `DateTime` | Menyimpan waktu terakhir data template dokumen diperbarui. |

## `companies` (`Company`)

| Jenis | Nama Kolom | Tipe data | Keterangan |
|---|---|---|---|
| PK | `id` | `String` | Menyimpan identitas unik perusahaan. |
| Kolom | `company_name` | `String` | Menyimpan nama perusahaan tujuan kerja praktik. |
| Kolom | `company_address` | `String` | Menyimpan alamat perusahaan tujuan kerja praktik. |
| Kolom | `alasan` | `String? @db.Text` | Menyimpan alasan pengajuan, penolakan, atau perubahan status perusahaan. |
| Kolom | `status` | `CompanyStatus` | Menyimpan status perusahaan dalam proses pengajuan kerja praktik. |
| Kolom | `created_at` | `DateTime` | Menyimpan waktu saat data perusahaan dibuat. |
| Kolom | `updated_at` | `DateTime` | Menyimpan waktu terakhir data perusahaan diperbarui. |

## `internship_proposals` (`InternshipProposal`)

| Jenis | Nama Kolom | Tipe data | Keterangan |
|---|---|---|---|
| PK | `id` | `String` | Menyimpan identitas unik pengajuan kerja praktik. |
| FK | `coordinator_id` | `String` | Menghubungkan pengajuan dengan mahasiswa koordinator kelompok. |
| FK | `proposal_document_id` | `String` | Menghubungkan pengajuan dengan dokumen proposal kerja praktik. |
| FK | `academic_year_id` | `String` | Menghubungkan pengajuan dengan tahun akademik pelaksanaan. |
| FK | `target_company_id` | `String` | Menghubungkan pengajuan dengan perusahaan tujuan. |
| Kolom | `status` | `InternshipProposalStatus` | Menyimpan status proses pengajuan kerja praktik. |
| Kolom | `proposal_sekdep_notes` | `String? @db.Text` | Menyimpan catatan sekdep terkait verifikasi proposal. |
| Kolom | `proposed_start_date` | `DateTime @db.Date` | Menyimpan tanggal mulai kerja praktik yang diajukan. |
| Kolom | `proposed_end_date` | `DateTime @db.Date` | Menyimpan tanggal selesai kerja praktik yang diajukan. |
| Unique | `app_letter_doc_number` | `String?` | Menyimpan nomor unik surat permohonan kerja praktik. |
| Kolom | `app_letter_date_issued` | `DateTime? @db.Date` | Menyimpan tanggal penerbitan surat permohonan kerja praktik. |
| Kolom | `start_date_planned` | `DateTime? @db.Date` | Menyimpan tanggal mulai rencana yang tercantum pada surat permohonan. |
| Kolom | `end_date_planned` | `DateTime? @db.Date` | Menyimpan tanggal selesai rencana yang tercantum pada surat permohonan. |
| FK | `app_letter_doc_id` | `String?` | Menghubungkan pengajuan dengan file surat permohonan kerja praktik. |
| FK | `app_letter_signed_by_id` | `String?` | Menghubungkan surat permohonan dengan dosen penandatangan. |
| FK | `app_letter_signed_as_role_id` | `String?` | Menghubungkan surat permohonan dengan jabatan penandatangan. |
| FK | `company_response_doc_id` | `String?` | Menghubungkan pengajuan dengan dokumen balasan perusahaan. |
| Kolom | `company_response_notes` | `String? @db.Text` | Menyimpan catatan hasil balasan perusahaan. |
| Unique | `assign_letter_doc_number` | `String?` | Menyimpan nomor unik surat tugas kerja praktik. |
| Kolom | `assign_letter_date_issued` | `DateTime? @db.Date` | Menyimpan tanggal penerbitan surat tugas kerja praktik. |
| Kolom | `start_date_actual` | `DateTime? @db.Date` | Menyimpan tanggal mulai kerja praktik berdasarkan surat tugas atau balasan perusahaan. |
| Kolom | `end_date_actual` | `DateTime? @db.Date` | Menyimpan tanggal selesai kerja praktik berdasarkan surat tugas atau balasan perusahaan. |
| FK | `assign_letter_doc_id` | `String?` | Menghubungkan pengajuan dengan file surat tugas kerja praktik. |
| FK | `assign_letter_signed_by_id` | `String?` | Menghubungkan surat tugas dengan dosen penandatangan. |
| FK | `assign_letter_signed_as_role_id` | `String?` | Menghubungkan surat tugas dengan jabatan penandatangan. |
| Kolom | `created_at` | `DateTime` | Menyimpan waktu saat data pengajuan dibuat. |
| Kolom | `updated_at` | `DateTime` | Menyimpan waktu terakhir data pengajuan diperbarui. |

## `internship_supervisor_letters` (`InternshipSupervisorLetter`)

| Jenis | Nama Kolom | Tipe data | Keterangan |
|---|---|---|---|
| PK | `id` | `String` | Menyimpan identitas unik surat tugas pembimbing kerja praktik. |
| Unique | `document_number` | `String` | Menyimpan nomor unik surat tugas pembimbing kerja praktik. |
| Kolom | `date_issued` | `DateTime @db.Date` | Menyimpan tanggal penerbitan surat tugas pembimbing. |
| Kolom | `start_date` | `DateTime @db.Date` | Menyimpan tanggal mulai periode pembimbingan. |
| Kolom | `end_date` | `DateTime @db.Date` | Menyimpan tanggal selesai periode pembimbingan. |
| FK | `supervisor_id` | `String` | Menghubungkan surat dengan dosen pembimbing yang ditugaskan. |
| FK | `document_id` | `String?` | Menghubungkan surat tugas pembimbing dengan file dokumennya. |
| FK | `signed_by_id` | `String?` | Menghubungkan surat tugas pembimbing dengan pengguna penandatangan. |
| FK | `signed_as_role_id` | `String?` | Menghubungkan surat tugas pembimbing dengan jabatan penandatangan. |
| Kolom | `created_at` | `DateTime` | Menyimpan waktu saat data surat tugas pembimbing dibuat. |
| Kolom | `updated_at` | `DateTime` | Menyimpan waktu terakhir data surat tugas pembimbing diperbarui. |

## `internships` (`Internship`)

| Jenis | Nama Kolom | Tipe data | Keterangan |
|---|---|---|---|
| PK | `id` | `String` | Menyimpan identitas unik pelaksanaan kerja praktik mahasiswa. |
| FK | `student_id` | `String` | Menghubungkan pelaksanaan kerja praktik dengan mahasiswa peserta. |
| FK | `proposal_id` | `String` | Menghubungkan pelaksanaan kerja praktik dengan pengajuan yang disetujui. |
| FK | `supervisor_id` | `String?` | Menghubungkan pelaksanaan kerja praktik dengan dosen pembimbing. |
| Kolom | `field_supervisor_name` | `String?` | Menyimpan nama pembimbing lapangan dari perusahaan. |
| Kolom | `field_supervisor_email` | `String?` | Menyimpan email pembimbing lapangan dari perusahaan. |
| Kolom | `unit_section` | `String?` | Menyimpan unit atau bagian tempat mahasiswa melaksanakan kerja praktik. |
| Kolom | `actual_start_date` | `DateTime? @db.Date` | Menyimpan tanggal mulai aktual kerja praktik mahasiswa. |
| Kolom | `actual_end_date` | `DateTime? @db.Date` | Menyimpan tanggal selesai aktual kerja praktik mahasiswa. |
| Kolom | `status` | `InternshipActiveStatus` | Menyimpan status pelaksanaan kerja praktik mahasiswa. |
| Kolom | `is_logbook_locked` | `Boolean` | Menandai apakah logbook kerja praktik sudah dikunci. |
| Kolom | `logbook_locked_at` | `DateTime?` | Menyimpan waktu saat logbook dikunci. |
| Kolom | `created_at` | `DateTime` | Menyimpan waktu saat data pelaksanaan kerja praktik dibuat. |
| Kolom | `updated_at` | `DateTime` | Menyimpan waktu terakhir data pelaksanaan kerja praktik diperbarui. |
| FK | `sup_letter_id` | `String?` | Menghubungkan kerja praktik dengan surat tugas pembimbing. |
| Kolom | `report_title` | `String?` | Menyimpan judul laporan akhir kerja praktik. |
| FK | `report_document_id` | `String?` | Menghubungkan kerja praktik dengan file laporan akhir. |
| Kolom | `report_status` | `InternshipReportStatus?` | Menyimpan status verifikasi laporan akhir. |
| Kolom | `report_notes` | `String? @db.Text` | Menyimpan catatan revisi atau verifikasi laporan akhir. |
| Kolom | `report_uploaded_at` | `DateTime?` | Menyimpan waktu unggah laporan akhir. |
| FK | `report_feedback_document_id` | `String?` | Menghubungkan kerja praktik dengan file umpan balik laporan. |
| Kolom | `lecturer_assessment_status` | `InternshipAssessmentStatus?` | Menyimpan status penilaian oleh dosen pembimbing. |
| Kolom | `field_assessment_status` | `InternshipAssessmentStatus?` | Menyimpan status penilaian oleh pembimbing lapangan. |
| Kolom | `field_assessment_notes` | `String? @db.Text` | Menyimpan catatan terkait penilaian pembimbing lapangan. |
| FK | `field_assessment_doc_id` | `String?` | Menghubungkan kerja praktik dengan dokumen penilaian pembimbing lapangan. |
| FK | `completion_certificate_doc_id` | `String?` | Menghubungkan kerja praktik dengan dokumen surat keterangan selesai. |
| Kolom | `completion_certificate_status` | `InternshipReportStatus?` | Menyimpan status verifikasi surat keterangan selesai. |
| Kolom | `completion_certificate_notes` | `String? @db.Text` | Menyimpan catatan verifikasi surat keterangan selesai. |
| FK | `company_receipt_doc_id` | `String?` | Menghubungkan kerja praktik dengan dokumen tanda terima dari perusahaan. |
| Kolom | `company_receipt_status` | `InternshipReportStatus?` | Menyimpan status verifikasi tanda terima perusahaan. |
| Kolom | `company_receipt_notes` | `String? @db.Text` | Menyimpan catatan verifikasi tanda terima perusahaan. |
| FK | `logbook_document_id` | `String?` | Menghubungkan kerja praktik dengan file logbook. |
| Kolom | `logbook_document_status` | `InternshipReportStatus?` | Menyimpan status verifikasi file logbook. |
| Kolom | `logbook_document_notes` | `String? @db.Text` | Menyimpan catatan verifikasi file logbook. |
| FK | `company_report_doc_id` | `String?` | Menghubungkan kerja praktik dengan dokumen laporan dari perusahaan. |
| Kolom | `company_report_status` | `InternshipReportStatus?` | Menyimpan status verifikasi laporan dari perusahaan. |
| Kolom | `company_report_notes` | `String? @db.Text` | Menyimpan catatan verifikasi laporan dari perusahaan. |
| Kolom | `field_assessment_submitted_at` | `DateTime?` | Menyimpan waktu penilaian pembimbing lapangan dikirim. |
| Kolom | `field_assessment_signature_hash` | `String? @db.VarChar(255)` | Menyimpan hash tanda tangan penilaian pembimbing lapangan. |
| Kolom | `logbook_field_signature_hash` | `String? @db.VarChar(255)` | Menyimpan hash tanda tangan pembimbing lapangan pada logbook. |
| Kolom | `logbook_field_signed_at` | `DateTime?` | Menyimpan waktu logbook ditandatangani pembimbing lapangan. |
| Kolom | `final_numeric_score` | `Float?` | Menyimpan nilai akhir numerik kerja praktik. |
| Kolom | `final_grade` | `String? @db.VarChar(10)` | Menyimpan nilai akhir huruf kerja praktik. |

## `internship_logbooks` (`InternshipLogbook`)

| Jenis | Nama Kolom | Tipe data | Keterangan |
|---|---|---|---|
| PK | `id` | `String` | Menyimpan identitas unik catatan logbook. |
| FK | `internship_id` | `String` | Menghubungkan catatan logbook dengan pelaksanaan kerja praktik. |
| Kolom | `activity_date` | `DateTime @db.Date` | Menyimpan tanggal aktivitas kerja praktik. |
| Kolom | `activity_description` | `String @db.Text` | Menyimpan uraian aktivitas kerja praktik mahasiswa. |
| Kolom | `created_at` | `DateTime` | Menyimpan waktu saat catatan logbook dibuat. |
| Kolom | `updated_at` | `DateTime` | Menyimpan waktu terakhir catatan logbook diperbarui. |

## `internship_guidance_questions` (`InternshipGuidanceQuestion`)

| Jenis | Nama Kolom | Tipe data | Keterangan |
|---|---|---|---|
| PK | `id` | `String` | Menyimpan identitas unik pertanyaan bimbingan mahasiswa. |
| Kolom | `week_number` | `Int` | Menentukan minggu bimbingan untuk pertanyaan. |
| Kolom | `question_text` | `String @db.Text` | Menyimpan isi pertanyaan bimbingan untuk mahasiswa. |
| Kolom | `order_index` | `Int` | Menentukan urutan tampil pertanyaan bimbingan. |
| FK | `academic_year_id` | `String` | Menghubungkan pertanyaan bimbingan dengan tahun akademik. |
| Kolom | `created_at` | `DateTime` | Menyimpan waktu saat pertanyaan bimbingan dibuat. |
| Kolom | `updated_at` | `DateTime` | Menyimpan waktu terakhir pertanyaan bimbingan diperbarui. |

## `internship_guidance_lecturer_criteria` (`InternshipGuidanceLecturerCriteria`)

| Jenis | Nama Kolom | Tipe data | Keterangan |
|---|---|---|---|
| PK | `id` | `String` | Menyimpan identitas unik kriteria evaluasi bimbingan dosen. |
| Kolom | `criteria_name` | `String` | Menyimpan nama kriteria evaluasi bimbingan. |
| Kolom | `week_number` | `Int` | Menentukan minggu bimbingan untuk kriteria evaluasi. |
| Kolom | `input_type` | `InternshipGuidanceInputType` | Menentukan bentuk isian evaluasi dosen. |
| Kolom | `order_index` | `Int` | Menentukan urutan tampil kriteria evaluasi. |
| FK | `academic_year_id` | `String` | Menghubungkan kriteria evaluasi dengan tahun akademik. |
| Kolom | `created_at` | `DateTime` | Menyimpan waktu saat kriteria evaluasi dibuat. |
| Kolom | `updated_at` | `DateTime` | Menyimpan waktu terakhir kriteria evaluasi diperbarui. |

## `internship_guidance_lecturer_criteria_options` (`InternshipGuidanceLecturerCriteriaOption`)

| Jenis | Nama Kolom | Tipe data | Keterangan |
|---|---|---|---|
| PK | `id` | `String` | Menyimpan identitas unik opsi kriteria evaluasi. |
| FK | `criteria_id` | `String` | Menghubungkan opsi dengan kriteria evaluasi dosen. |
| Kolom | `option_text` | `String` | Menyimpan teks pilihan jawaban untuk kriteria evaluasi. |
| Kolom | `order_index` | `Int` | Menentukan urutan tampil opsi jawaban. |
| Kolom | `created_at` | `DateTime` | Menyimpan waktu saat opsi kriteria dibuat. |
| Kolom | `updated_at` | `DateTime` | Menyimpan waktu terakhir opsi kriteria diperbarui. |

## `internship_guidance_sessions` (`InternshipGuidanceSession`)

| Jenis | Nama Kolom | Tipe data | Keterangan |
|---|---|---|---|
| PK | `id` | `String` | Menyimpan identitas unik sesi bimbingan kerja praktik. |
| FK | `internship_id` | `String` | Menghubungkan sesi bimbingan dengan pelaksanaan kerja praktik. |
| Kolom | `week_number` | `Int` | Menyimpan minggu ke berapa sesi bimbingan dilakukan. |
| Kolom | `status` | `InternshipGuidanceSessionStatus` | Menyimpan status pengajuan atau persetujuan sesi bimbingan. |
| Kolom | `submission_date` | `DateTime? @db.Date` | Menyimpan tanggal pengiriman sesi bimbingan oleh mahasiswa. |
| Kolom | `approved_at` | `DateTime?` | Menyimpan waktu saat sesi bimbingan disetujui dosen. |
| Kolom | `created_at` | `DateTime` | Menyimpan waktu saat sesi bimbingan dibuat. |
| Kolom | `updated_at` | `DateTime` | Menyimpan waktu terakhir sesi bimbingan diperbarui. |

## `internship_guidance_student_answers` (`InternshipGuidanceStudentAnswer`)

| Jenis | Nama Kolom | Tipe data | Keterangan |
|---|---|---|---|
| PK, FK | `guidance_session_id` | `String` | Menghubungkan jawaban mahasiswa dengan sesi bimbingan. |
| PK, FK | `question_id` | `String` | Menghubungkan jawaban mahasiswa dengan pertanyaan bimbingan. |
| PK | `week_number` | `Int` | Menyimpan minggu bimbingan dari jawaban mahasiswa. |
| Kolom | `answer_text` | `String @db.Text` | Menyimpan isi jawaban mahasiswa. |
| Kolom | `created_at` | `DateTime` | Menyimpan waktu saat jawaban mahasiswa dibuat. |
| Kolom | `updated_at` | `DateTime` | Menyimpan waktu terakhir jawaban mahasiswa diperbarui. |

## `internship_guidance_lecturer_answers` (`InternshipGuidanceLecturerAnswer`)

| Jenis | Nama Kolom | Tipe data | Keterangan |
|---|---|---|---|
| PK, FK | `guidance_session_id` | `String` | Menghubungkan jawaban dosen dengan sesi bimbingan. |
| PK, FK | `criteria_id` | `String` | Menghubungkan jawaban dosen dengan kriteria evaluasi. |
| PK | `week_number` | `Int` | Menyimpan minggu bimbingan dari jawaban dosen. |
| Kolom | `evaluation_value` | `String?` | Menyimpan nilai atau pilihan evaluasi dosen. |
| Kolom | `answer_text` | `String? @db.Text` | Menyimpan catatan atau jawaban teks dari dosen. |
| Kolom | `created_at` | `DateTime` | Menyimpan waktu saat jawaban dosen dibuat. |
| Kolom | `updated_at` | `DateTime` | Menyimpan waktu terakhir jawaban dosen diperbarui. |

## `internship_seminars` (`InternshipSeminar`)

| Jenis | Nama Kolom | Tipe data | Keterangan |
|---|---|---|---|
| PK | `id` | `String` | Menyimpan identitas unik seminar kerja praktik. |
| FK | `internship_id` | `String` | Menghubungkan seminar dengan pelaksanaan kerja praktik. |
| FK | `room_id` | `String` | Menghubungkan seminar dengan ruangan pelaksanaan. |
| Kolom | `seminar_date` | `DateTime @db.Date` | Menyimpan tanggal pelaksanaan seminar. |
| Kolom | `start_time` | `DateTime @db.Time(0)` | Menyimpan jam mulai seminar. |
| Kolom | `end_time` | `DateTime @db.Time(0)` | Menyimpan jam selesai seminar. |
| Kolom | `link_meeting` | `String?` | Menyimpan tautan meeting untuk seminar daring atau hybrid. |
| FK | `moderator_student_id` | `String` | Menghubungkan seminar dengan mahasiswa moderator. |
| Kolom | `status` | `InternshipSeminarStatus` | Menyimpan status pengajuan dan pelaksanaan seminar. |
| FK | `approved_by` | `String?` | Menghubungkan seminar dengan pengguna yang menyetujui jadwal. |
| Kolom | `supervisor_notes` | `String? @db.Text` | Menyimpan catatan dosen pembimbing terkait seminar. |
| FK | `berita_acara_document_id` | `String?` | Menghubungkan seminar dengan dokumen berita acara. |
| Kolom | `created_at` | `DateTime` | Menyimpan waktu saat data seminar dibuat. |
| Kolom | `updated_at` | `DateTime` | Menyimpan waktu terakhir data seminar diperbarui. |

## `internship_seminar_audiences` (`InternshipSeminarAudience`)

| Jenis | Nama Kolom | Tipe data | Keterangan |
|---|---|---|---|
| PK, FK | `seminar_id` | `String` | Menghubungkan data audiens dengan seminar kerja praktik. |
| PK, FK | `student_id` | `String` | Menghubungkan data audiens dengan mahasiswa peserta seminar. |
| Kolom | `status` | `InternshipSeminarAudienceStatus` | Menyimpan status validasi kehadiran audiens seminar. |
| Kolom | `validated_at` | `DateTime?` | Menyimpan waktu validasi kehadiran audiens. |
| Kolom | `created_at` | `DateTime` | Menyimpan waktu saat data audiens seminar dibuat. |
| Kolom | `updated_at` | `DateTime` | Menyimpan waktu terakhir data audiens seminar diperbarui. |

## `internship_cpmks` (`InternshipCpmk`)

| Jenis | Nama Kolom | Tipe data | Keterangan |
|---|---|---|---|
| PK | `id` | `String` | Menyimpan identitas unik CPMK kerja praktik. |
| Kolom | `code` | `String` | Menyimpan kode CPMK kerja praktik. |
| Kolom | `name` | `String @db.Text` | Menyimpan nama atau deskripsi CPMK kerja praktik. |
| Kolom | `weight` | `Float` | Menyimpan bobot penilaian CPMK. |
| Kolom | `assessor_type` | `String @db.VarChar(20)` | Menentukan pihak penilai untuk CPMK. |
| FK | `academic_year_id` | `String` | Menghubungkan CPMK dengan tahun akademik. |
| Kolom | `created_at` | `DateTime` | Menyimpan waktu saat data CPMK dibuat. |
| Kolom | `updated_at` | `DateTime` | Menyimpan waktu terakhir data CPMK diperbarui. |

## `internship_assessment_rubrics` (`InternshipAssessmentRubric`)

| Jenis | Nama Kolom | Tipe data | Keterangan |
|---|---|---|---|
| PK | `id` | `String` | Menyimpan identitas unik rubrik penilaian. |
| FK | `cpmk_id` | `String` | Menghubungkan rubrik dengan CPMK yang dinilai. |
| Kolom | `level_name` | `String` | Menyimpan nama level penilaian rubrik. |
| Kolom | `rubric_level_description` | `String @db.Text` | Menyimpan deskripsi kriteria pada level rubrik. |
| Kolom | `min_score` | `Float` | Menyimpan batas nilai minimum untuk level rubrik. |
| Kolom | `max_score` | `Float` | Menyimpan batas nilai maksimum untuk level rubrik. |
| Kolom | `created_at` | `DateTime` | Menyimpan waktu saat data rubrik dibuat. |
| Kolom | `updated_at` | `DateTime` | Menyimpan waktu terakhir data rubrik diperbarui. |

## `internship_lecturer_scores` (`InternshipLecturerScore`)

| Jenis | Nama Kolom | Tipe data | Keterangan |
|---|---|---|---|
| PK, FK | `internship_id` | `String` | Menghubungkan nilai dosen dengan pelaksanaan kerja praktik. |
| PK, FK | `chosen_rubric_id` | `String` | Menghubungkan nilai dosen dengan rubrik yang dipilih. |
| Kolom | `score` | `Float` | Menyimpan nilai yang diberikan dosen pembimbing. |
| Kolom | `created_at` | `DateTime` | Menyimpan waktu saat nilai dosen dibuat. |
| Kolom | `updated_at` | `DateTime` | Menyimpan waktu terakhir nilai dosen diperbarui. |

## `internship_field_scores` (`InternshipFieldScore`)

| Jenis | Nama Kolom | Tipe data | Keterangan |
|---|---|---|---|
| PK, FK | `internship_id` | `String` | Menghubungkan nilai lapangan dengan pelaksanaan kerja praktik. |
| PK, FK | `chosen_rubric_id` | `String` | Menghubungkan nilai lapangan dengan rubrik yang dipilih. |
| Kolom | `score` | `Float` | Menyimpan nilai yang diberikan pembimbing lapangan. |
| Kolom | `created_at` | `DateTime` | Menyimpan waktu saat nilai lapangan dibuat. |
| Kolom | `updated_at` | `DateTime` | Menyimpan waktu terakhir nilai lapangan diperbarui. |

## `field_assessment_tokens` (`FieldAssessmentToken`)

| Jenis | Nama Kolom | Tipe data | Keterangan |
|---|---|---|---|
| PK | `id` | `String` | Menyimpan identitas unik token penilaian lapangan. |
| FK | `internship_id` | `String` | Menghubungkan token dengan pelaksanaan kerja praktik. |
| Unique | `token` | `String @db.VarChar(255)` | Menyimpan token akses penilaian untuk pembimbing lapangan. |
| Kolom | `pin` | `String? @db.VarChar(6)` | Menyimpan PIN tambahan untuk verifikasi akses penilaian. |
| Kolom | `expires_at` | `DateTime` | Menyimpan waktu kedaluwarsa token penilaian. |
| Kolom | `is_used` | `Boolean` | Menandai apakah token penilaian sudah digunakan. |
| Kolom | `used_at` | `DateTime?` | Menyimpan waktu saat token penilaian digunakan. |
| Kolom | `created_at` | `DateTime` | Menyimpan waktu saat token penilaian dibuat. |
| Kolom | `updated_at` | `DateTime` | Menyimpan waktu terakhir token penilaian diperbarui. |

## `internship_holidays` (`InternshipHoliday`)

| Jenis | Nama Kolom | Tipe data | Keterangan |
|---|---|---|---|
| PK | `id` | `String` | Menyimpan identitas unik hari libur kerja praktik. |
| Unique | `holiday_date` | `DateTime @db.Date` | Menyimpan tanggal hari libur yang digunakan dalam perhitungan kerja praktik. |
| Kolom | `name` | `String?` | Menyimpan nama atau keterangan hari libur. |
| Kolom | `created_at` | `DateTime` | Menyimpan waktu saat data hari libur dibuat. |
| Kolom | `updated_at` | `DateTime` | Menyimpan waktu terakhir data hari libur diperbarui. |
