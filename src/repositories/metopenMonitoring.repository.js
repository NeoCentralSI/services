/**
 * Repository untuk Monitoring Koordinator Metopen.
 *
 * Bertanggung jawab atas QUERY layer:
 *  - List mahasiswa eligible Metopen (sumber: snapshot SIA `eligible_metopen=true`)
 *  - Latest attendance import + records (sumber operasional dari xlsx upload)
 *  - Latest advisor request per mahasiswa
 *  - ThesisParticipant aktif (P1 + P2) per thesis
 *  - ResearchMethodScore + detail (4 bucket: TA-03A presentasi/konten/respons +
 *    TA-03B struktur) per mahasiswa
 *
 * Tidak melakukan BUSINESS LOGIC; agregasi/klasifikasi dilakukan di service layer
 * (`metopenMonitoring.service.js`).
 *
 * Canon ref: §5.7 (75:25 TA-03), §5.7.3 (BR-28 attendance gate), §5.7.4 (4-bucket
 * mapping template SIA), §5.2 (advisor request lifecycle).
 */

import prisma from "../config/prisma.js";

const ATTENDANCE_RECORD_SELECT = {
  id: true,
  studentId: true,
  identityNumber: true,
  studentName: true,
  presentCount: true,
  absentCount: true,
  sickCount: true,
  permitCount: true,
  totalMeetings: true,
  attendancePercentage: true,
  isEligible: true,
};

const ATTENDANCE_IMPORT_SELECT = {
  id: true,
  academicYearId: true,
  classCode: true,
  courseName: true,
  semesterLabel: true,
  filterLabel: true,
  lecturerNames: true,
  thresholdPercent: true,
  totalRows: true,
  matchedRows: true,
  eligibleRows: true,
  ineligibleRows: true,
  autoZeroedCount: true,
  uploadedAt: true,
};

/**
 * Ambil daftar mahasiswa yang eligible Metopen berdasarkan snapshot SIA.
 *
 * Filter:
 *  - `student.eligibleMetopen = true` (sumber resmi SIA / devtools)
 *  - `student.status` boleh apa saja (mahasiswa drop/lulus tetap muncul di
 *    monitoring untuk transparansi historikal; UI bisa filter lebih lanjut)
 */
export function findEligibleMetopenStudents(client = prisma) {
  return client.student.findMany({
    where: { eligibleMetopen: true },
    select: {
      id: true,
      eligibleMetopen: true,
      metopenEligibilitySource: true,
      metopenEligibilityUpdatedAt: true,
      status: true,
      enrollmentYear: true,
      researchMethodCompleted: true,
      takingThesisCourse: true,
      user: {
        select: {
          id: true,
          fullName: true,
          identityNumber: true,
          email: true,
          avatarUrl: true,
        },
      },
    },
    orderBy: { user: { identityNumber: "asc" } },
  });
}

export function findLatestAttendanceImportWithRecords(client = prisma) {
  return client.metopenAttendanceImport.findFirst({
    orderBy: { uploadedAt: "desc" },
    select: {
      ...ATTENDANCE_IMPORT_SELECT,
      records: {
        select: ATTENDANCE_RECORD_SELECT,
        orderBy: [{ identityNumber: "asc" }],
      },
    },
  });
}

/**
 * Ambil advisor request terbaru per studentId.
 *
 * Strategi: fetch SEMUA request milik studentIds, sort `createdAt desc`,
 * konsumer melakukan dedupe by studentId (pakai first row sebagai latest).
 * Lebih sederhana dari window function di Prisma dan tetap performant untuk
 * <= 100 mahasiswa per kelas Metopen.
 */
export function findAdvisorRequestsByStudentIds(studentIds, client = prisma) {
  if (!Array.isArray(studentIds) || studentIds.length === 0) return [];
  return client.thesisAdvisorRequest.findMany({
    where: { studentId: { in: studentIds } },
    select: {
      id: true,
      studentId: true,
      lecturerId: true,
      thesisId: true,
      proposedTitle: true,
      status: true,
      routeType: true,
      requestType: true,
      acceptedOverNormal: true,
      forwardedToKadepAt: true,
      forwardedByLecturerId: true,
      withdrawnAt: true,
      createdAt: true,
      updatedAt: true,
      lecturer: {
        select: {
          id: true,
          user: { select: { id: true, fullName: true } },
        },
      },
      redirectTarget: {
        select: {
          id: true,
          user: { select: { id: true, fullName: true } },
        },
      },
    },
    // updatedAt prioritas (tahu mana baris terakhir di-mutasi servis), lalu
    // createdAt sebagai tiebreaker untuk row yang tidak pernah berubah.
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });
}

/**
 * Ambil supervisor aktif (P1 + P2) untuk setiap thesis yang dimiliki
 * studentIds. Filter `status = active` + role IN (Pembimbing 1, Pembimbing 2)
 * agar konsisten dengan canon §5.7.1 (P1 master + P2 cosign).
 */
export function findActiveSupervisorsByStudentIds(studentIds, client = prisma) {
  if (!Array.isArray(studentIds) || studentIds.length === 0) return [];
  return client.thesisParticipant.findMany({
    where: {
      status: "active",
      thesis: { studentId: { in: studentIds } },
      role: { name: { in: ["Pembimbing 1", "Pembimbing 2"] } },
    },
    select: {
      id: true,
      lecturerId: true,
      role: { select: { id: true, name: true } },
      lecturer: {
        select: {
          id: true,
          user: { select: { id: true, fullName: true } },
        },
      },
      thesis: {
        select: {
          id: true,
          studentId: true,
          title: true,
          proposalStatus: true,
          isProposal: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Ambil ResearchMethodScore + detail breakdown untuk semua thesis milik
 * studentIds. Service consumer akan dedupe via `buildScoreIndex` (mirror
 * logic `assessmentExport.service.buildScoreIndex`): finalize > recent.
 */
export function findResearchMethodScoresByStudentIds(studentIds, client = prisma) {
  if (!Array.isArray(studentIds) || studentIds.length === 0) return [];
  return client.researchMethodScore.findMany({
    where: { thesis: { studentId: { in: studentIds } } },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      thesisId: true,
      supervisorId: true,
      supervisorScore: true,
      lecturerId: true,
      lecturerScore: true,
      finalScore: true,
      isFinalized: true,
      finalizedAt: true,
      coSignedByLecturerId: true,
      coSignedAt: true,
      attendanceRecordId: true,
      attendanceAutoZeroedAt: true,
      attendanceAutoZeroReason: true,
      thesis: {
        select: {
          id: true,
          studentId: true,
          title: true,
          isProposal: true,
          proposalStatus: true,
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
