import prisma from "../config/prisma.js";

const ATTENDANCE_IMPORT_SELECT = {
  id: true,
  academicYearId: true,
  academicYear: {
    select: { id: true, year: true, semester: true, startDate: true, endDate: true },
  },
  classCode: true,
  courseName: true,
  semesterLabel: true,
  thresholdPercent: true,
  uploadedAt: true,
  totalRows: true,
  matchedRows: true,
  eligibleRows: true,
  ineligibleRows: true,
  records: {
    select: {
      id: true,
      studentId: true,
      identityNumber: true,
      studentName: true,
      presentCount: true,
      totalMeetings: true,
      attendancePercentage: true,
      isEligible: true,
    },
    orderBy: [{ identityNumber: "asc" }],
  },
};

export function findLatestAttendanceImportForExport(academicYearId, client = prisma) {
  return client.metopenAttendanceImport.findFirst({
    where: { academicYearId },
    orderBy: { uploadedAt: "desc" },
    select: ATTENDANCE_IMPORT_SELECT,
  });
}

export function findAttendanceImportForExport(importId, client = prisma) {
  return client.metopenAttendanceImport.findUnique({
    where: { id: importId },
    select: ATTENDANCE_IMPORT_SELECT,
  });
}

/**
 * Fetch every ResearchMethodScore row of an academic period, together with the
 * per-criteria detail, the parent thesis, and the student identity needed to
 * render an SIA row. Used by the SIA export untuk mengubah skor dari rubrik
 * granular menjadi bucket kolom template.
 *
 * Scope-nya periode (bukan daftar peserta presensi) karena daftar peserta
 * export adalah union presensi + mahasiswa bernilai: mahasiswa yang punya
 * nilai TA-03 tetapi tidak muncul di berkas presensi tetap wajib terekspor,
 * kalau tidak nilai final yang imutabel (BR-21) tidak pernah sampai ke SIA.
 *
 * Caller bertanggung jawab memilih score terkini per mahasiswa (satu mahasiswa
 * bisa punya >1 thesis) — urutan `updatedAt desc` dipertahankan untuk itu.
 */
export function findResearchMethodScoresForPeriodExport(academicYearId, client = prisma) {
  if (!academicYearId) return [];
  return client.researchMethodScore.findMany({
    where: {
      thesis: { academicYearId },
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      thesisId: true,
      supervisorScore: true,
      lecturerScore: true,
      finalScore: true,
      isFinalized: true,
      attendanceRecordId: true,
      attendanceAutoZeroedAt: true,
      attendanceAutoZeroReason: true,
      periodClosedAt: true,
      periodClosedReason: true,
      thesis: {
        select: {
          id: true,
          studentId: true,
          student: {
            select: {
              user: { select: { identityNumber: true, fullName: true } },
            },
          },
        },
      },
      researchMethodScoreDetails: {
        select: {
          score: true,
          criteria: {
            select: {
              id: true,
              name: true,
              role: true,
              maxScore: true,
              metopenCpmk: { select: { code: true } },
            },
          },
        },
      },
    },
  });
}

/**
 * Konfigurasi rubrik Metopen (CPMK + kriteria) untuk satu tahun akademik.
 *
 * Sumber bobot kolom template SIA dan identitas kriteria per kolom. Canon v3.3
 * §5.7 menetapkan komposisi TA-03 konfigurabel, jadi export tidak boleh
 * mematok bobot 20/40/25/15 sebagai literal maupun mengenali kriteria lewat
 * pencocokan substring kode/nama.
 *
 * `orderBy: { code: "asc" }` memberi urutan CPMK yang deterministik (CPMK-01,
 * CPMK-02, CPMK-03 atau CP-5 IK05-01..03) sehingga kolom template dipetakan
 * lewat ordinal + role, bukan lewat isi string.
 */
export function findMetopenRubricConfigForExport(academicYearId, client = prisma) {
  if (!academicYearId) return [];
  return client.metopenCpmk.findMany({
    where: { academicYearId },
    orderBy: { code: "asc" },
    select: {
      id: true,
      code: true,
      description: true,
      metopenAssessmentCriterias: {
        select: {
          id: true,
          name: true,
          role: true,
          maxScore: true,
          displayOrder: true,
        },
        orderBy: [{ role: "asc" }, { displayOrder: "asc" }],
      },
    },
  });
}
