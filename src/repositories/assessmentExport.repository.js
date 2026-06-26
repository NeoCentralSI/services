import prisma from "../config/prisma.js";

const ATTENDANCE_IMPORT_SELECT = {
  id: true,
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

export function findLatestAttendanceImportForExport(client = prisma) {
  return client.metopenAttendanceImport.findFirst({
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
 * Fetch ResearchMethodScore rows for the supplied list of student ids, together
 * with the per-criteria detail and the parent thesis. Used by the SIA export
 * untuk mengubah skor dari rubrik granular menjadi bucket kolom template.
 *
 * BR-28 (canon v2.2 §5.7.x): Hanya thesis yang masih dalam scope SIMPTA aktif
 * (final proposal sudah masuk, mahasiswa aktif, status thesis belum closed)
 * yang relevan untuk export TA-03. Untuk simplifikasi, query ini meminta semua
 * score rows milik mahasiswa target — caller bertanggung jawab memilih score
 * terkini per mahasiswa.
 */
export function findResearchMethodScoresForStudentExport(studentIds, client = prisma) {
  if (!Array.isArray(studentIds) || studentIds.length === 0) return [];
  return client.researchMethodScore.findMany({
    where: {
      thesis: { studentId: { in: studentIds } },
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
      thesis: {
        select: {
          id: true,
          studentId: true,
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
              cpmk: { select: { code: true } },
            },
          },
        },
      },
    },
  });
}
