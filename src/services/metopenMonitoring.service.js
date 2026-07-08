/**
 * Service: Monitoring Koordinator Metopen.
 *
 * Tujuan: memberikan tampilan terpadu progress per mahasiswa Metopen sehingga
 * Koordinator dapat memantau:
 *   1. Status pencarian dosen pembimbing (Belum, Pending, Pending KaDep,
 *      Booking, Active Official, Rejected, Withdrawn) + Pembimbing 1 + Pembimbing 2.
 *   2. Rincian nilai TA-03 sesuai layout xlsx download SIA — 4 bucket:
 *      Presentasi 20 + Konten 40 + Struktur 25 + Respons 15 = 100.
 *
 * Sumber primer: `student.eligibleMetopen=true` di snapshot SIA. Bukan
 * `metopen_attendance_records`, karena attendance import bisa belum diupload
 * atau sumber datanya sama-sama SIA (canon §5.7.3 BR-28).
 *
 * Untuk konsumen UI, response mengandung dua kategori baris:
 *   - `students[]`     → mahasiswa eligible Metopen (SIA snapshot) dengan
 *                         enrichment attendance/advisor/score
 *   - `unmatchedRecords[]` → baris di import presensi yang identityNumber-nya
 *                             TIDAK match student manapun di DB (anomali yang
 *                             perlu di-clarify Koordinator)
 *
 * Canon ref: §5.2 advisor lifecycle, §5.7 75:25, §5.7.4 4-bucket SIA template,
 * §5.7.3 BR-28 attendance gate.
 */

import * as repo from "../repositories/metopenMonitoring.repository.js";
import { __test as exportInternals } from "./assessmentExport.service.js";
import { ADVISOR_REQUEST_STATUS } from "../constants/advisorRequestStatus.js";
import { ROLES } from "../constants/roles.js";

const { BUCKETS, classifyDetail } = exportInternals;

// Mapping canonical status enum → label Indonesia + kategori UX.
// "none" adalah pseudo-status untuk mahasiswa yang BELUM pernah submit
// advisor request.
const ADVISOR_STATUS_DISPLAY = Object.freeze({
  none: { label: "Belum mencari pembimbing", category: "no_advisor" },
  [ADVISOR_REQUEST_STATUS.PENDING]: { label: "Menunggu respon dosen", category: "pending_review" },
  [ADVISOR_REQUEST_STATUS.UNDER_REVIEW]: { label: "Sedang ditinjau dosen", category: "pending_review" },
  [ADVISOR_REQUEST_STATUS.PENDING_KADEP]: { label: "Menunggu validasi KaDep", category: "pending_kadep" },
  [ADVISOR_REQUEST_STATUS.BOOKING_APPROVED]: { label: "Booking pembimbing", category: "active_pre_ta04" },
  [ADVISOR_REQUEST_STATUS.ACTIVE_OFFICIAL]: { label: "Beban aktif TA", category: "active_official" },
  [ADVISOR_REQUEST_STATUS.RELEASED]: { label: "Booking dilepas", category: "released" },
  [ADVISOR_REQUEST_STATUS.REVISION_REQUESTED]: { label: "Revisi TA-02 oleh KaDep", category: "revision" },
  [ADVISOR_REQUEST_STATUS.REJECTED_BY_DOSEN]: { label: "Ditolak dosen", category: "rejected" },
  [ADVISOR_REQUEST_STATUS.REJECTED_BY_KADEP]: { label: "Ditolak KaDep", category: "rejected" },
  [ADVISOR_REQUEST_STATUS.REDIRECTED]: { label: "Dialihkan ke dosen lain", category: "active_pre_ta04" },
  [ADVISOR_REQUEST_STATUS.WITHDRAWN]: { label: "Ditarik mahasiswa", category: "withdrawn" },
  [ADVISOR_REQUEST_STATUS.CANCELED]: { label: "Dibatalkan", category: "withdrawn" },
  [ADVISOR_REQUEST_STATUS.CLOSED]: { label: "Ditutup", category: "withdrawn" },
  // Legacy values yang masih bisa muncul di rows historis (canon §5.2 Tahap 1).
  [ADVISOR_REQUEST_STATUS.APPROVED]: { label: "Disetujui (legacy)", category: "active_pre_ta04" },
  [ADVISOR_REQUEST_STATUS.OVERRIDE_APPROVED]: { label: "Disetujui overquota (legacy)", category: "active_pre_ta04" },
  [ADVISOR_REQUEST_STATUS.ASSIGNED]: { label: "Aktif (legacy)", category: "active_official" },
  [ADVISOR_REQUEST_STATUS.ESCALATED]: { label: "Eskalasi (legacy)", category: "pending_kadep" },
  [ADVISOR_REQUEST_STATUS.REJECTED]: { label: "Ditolak (legacy)", category: "rejected" },
});

const ROUTE_LABEL = Object.freeze({
  normal: "Normal (TA-01)",
  escalated: "Escalated (Path C)",
  dept: "Departemen (TA-02)",
});

/**
 * Pilih advisor request terbaru per studentId dari list yang sudah ter-sort
 * `updatedAt desc, createdAt desc`. Cukup ambil yang pertama muncul per
 * studentId (first-wins).
 */
function indexLatestAdvisorRequest(advisorRequests) {
  const byStudent = new Map();
  for (const req of advisorRequests) {
    if (!byStudent.has(req.studentId)) {
      byStudent.set(req.studentId, req);
    }
  }
  return byStudent;
}

/**
 * Group supervisor per studentId, terpisahkan oleh role. Per spesifikasi
 * SIMPTA, satu thesis aktif punya paling banyak 1 P1 + 1 P2 (BR-20).
 * Jika ditemukan duplikasi role, ambil yang terakhir di-create (defensive).
 */
function indexSupervisorsByStudent(supervisors) {
  const byStudent = new Map();
  for (const sup of supervisors) {
    const studentId = sup.thesis?.studentId;
    if (!studentId) continue;
    const bucket = byStudent.get(studentId) ?? { pembimbing1: null, pembimbing2: null };
    const roleName = sup.role?.name;
    if (roleName === ROLES.PEMBIMBING_1) {
      bucket.pembimbing1 = sup;
    } else if (roleName === ROLES.PEMBIMBING_2) {
      bucket.pembimbing2 = sup;
    }
    byStudent.set(studentId, bucket);
  }
  return byStudent;
}

/**
 * Pilih ResearchMethodScore "terkini per mahasiswa". Identik dengan logic
 * `assessmentExport.service.buildScoreIndex`: utamakan baris finalized,
 * kemudian yang paling baru di-update.
 */
function indexLatestScoreByStudent(scores) {
  const byStudent = new Map();
  for (const score of scores) {
    const studentId = score.thesis?.studentId;
    if (!studentId) continue;
    const existing = byStudent.get(studentId);
    if (!existing) {
      byStudent.set(studentId, score);
      continue;
    }
    if (!existing.isFinalized && score.isFinalized) {
      byStudent.set(studentId, score);
    }
  }
  return byStudent;
}

/**
 * Index attendance record by identityNumber + by studentId untuk lookup
 * ganda. Mahasiswa yang ada di import + match student DB akan muncul di
 * keduanya; mahasiswa yang unmatched hanya muncul di lookup by identity.
 */
function indexAttendanceRecords(records) {
  const byStudentId = new Map();
  const byIdentity = new Map();
  for (const record of records) {
    if (record.studentId) byStudentId.set(record.studentId, record);
    if (record.identityNumber) byIdentity.set(record.identityNumber, record);
  }
  return { byStudentId, byIdentity };
}

/**
 * Klasifikasikan kelengkapan nilai untuk konsumen UI (badge/filter).
 *
 *   - "auto_zero"        → BR-28: attendance < 75% → semua bucket = 0, finalized
 *   - "published"        → isFinalized=true + finalScore != null + bukan auto_zero
 *   - "complete_pending" → TA-03A + TA-03B sudah ada nilai, belum publish
 *   - "partial_ta03a"    → hanya TA-03A submitted (supervisorScore != null)
 *   - "partial_ta03b"    → hanya TA-03B submitted (lecturerScore != null)
 *   - "none"             → belum ada nilai sama sekali
 */
function classifyScoreCompleteness(score) {
  if (!score) return "none";
  if (score.attendanceAutoZeroedAt) return "auto_zero";
  if (score.isFinalized && score.finalScore != null) return "published";

  const hasSupervisor = score.supervisorScore != null;
  const hasLecturer = score.lecturerScore != null;
  if (hasSupervisor && hasLecturer) return "complete_pending";
  if (hasSupervisor) return "partial_ta03a";
  if (hasLecturer) return "partial_ta03b";
  return "none";
}

/**
 * Aggregasi nilai detail jadi 4 bucket sesuai template SIA. Reuse
 * `classifyDetail` dari `assessmentExport.service` agar mapping konsisten
 * dengan xlsx download (avoid drift).
 */
function aggregateScoreBuckets(score) {
  const buckets = {
    [BUCKETS.PRESENTASI]: null,
    [BUCKETS.PROPOSAL_KONTEN]: null,
    [BUCKETS.PROPOSAL_STRUKTUR]: null,
    [BUCKETS.KEMAMPUAN_RESPON]: null,
  };
  if (!score) return buckets;

  const isAutoZero = Boolean(score.attendanceAutoZeroedAt);
  if (isAutoZero) {
    return {
      [BUCKETS.PRESENTASI]: 0,
      [BUCKETS.PROPOSAL_KONTEN]: 0,
      [BUCKETS.PROPOSAL_STRUKTUR]: 0,
      [BUCKETS.KEMAMPUAN_RESPON]: 0,
    };
  }

  for (const detail of score.researchMethodScoreDetails ?? []) {
    const bucket = classifyDetail(detail);
    if (!bucket) continue;
    buckets[bucket] = (buckets[bucket] ?? 0) + (detail.score ?? 0);
  }
  return buckets;
}

function serializeAttendance(record) {
  if (!record) return null;
  return {
    recordId: record.id,
    presentCount: record.presentCount,
    absentCount: record.absentCount,
    sickCount: record.sickCount,
    permitCount: record.permitCount,
    totalMeetings: record.totalMeetings,
    attendancePercentage: record.attendancePercentage,
    isEligible: record.isEligible,
  };
}

function serializeAdvisorRequest(req) {
  if (!req) {
    return {
      status: "none",
      statusLabel: ADVISOR_STATUS_DISPLAY.none.label,
      statusCategory: ADVISOR_STATUS_DISPLAY.none.category,
      routeType: null,
      routeLabel: null,
      requestType: null,
      proposedTitle: null,
      targetLecturerId: null,
      targetLecturerName: null,
      acceptedOverNormal: false,
      forwardedToKadepAt: null,
      withdrawnAt: null,
      lastUpdatedAt: null,
    };
  }
  const display = ADVISOR_STATUS_DISPLAY[req.status] ?? {
    label: req.status,
    category: "other",
  };
  const hasEarlyTa04 =
    req.status === ADVISOR_REQUEST_STATUS.BOOKING_APPROVED &&
    req.thesis?.ta04AssignmentIssuedAt != null;
  const statusLabel = hasEarlyTa04 ? "TA-04 terbit, masih booking" : display.label;
  return {
    status: req.status,
    statusLabel,
    statusCategory: display.category,
    routeType: req.routeType,
    routeLabel: req.routeType ? ROUTE_LABEL[req.routeType] ?? req.routeType : null,
    requestType: req.requestType,
    proposedTitle: req.proposedTitle,
    targetLecturerId: req.lecturer?.id ?? req.redirectTarget?.id ?? null,
    targetLecturerName:
      req.redirectTarget?.user?.fullName ?? req.lecturer?.user?.fullName ?? null,
    acceptedOverNormal: Boolean(req.acceptedOverNormal),
    forwardedToKadepAt: req.forwardedToKadepAt ?? null,
    withdrawnAt: req.withdrawnAt ?? null,
    releasedAt: req.releasedAt ?? null,
    releaseReason: req.releaseReason ?? null,
    ta04AssignmentIssuedAt: req.thesis?.ta04AssignmentIssuedAt ?? null,
    lastUpdatedAt: req.updatedAt ?? req.createdAt ?? null,
  };
}

function serializeSupervisors(bucket) {
  const empty = { lecturerId: null, fullName: null };
  if (!bucket) return { pembimbing1: empty, pembimbing2: empty };

  const toPayload = (sup) => {
    if (!sup) return empty;
    return {
      lecturerId: sup.lecturerId,
      fullName: sup.lecturer?.user?.fullName ?? null,
    };
  };
  return {
    pembimbing1: toPayload(bucket.pembimbing1),
    pembimbing2: toPayload(bucket.pembimbing2),
  };
}

function serializeScore(score) {
  if (!score) {
    return {
      researchMethodScoreId: null,
      thesisId: null,
      thesisTitle: null,
      presentasi: null,
      proposalKonten: null,
      proposalStruktur: null,
      kemampuanRespon: null,
      supervisorScore: null,
      lecturerScore: null,
      finalScore: null,
      isFinalized: false,
      finalizedAt: null,
      coSignedAt: null,
      attendanceAutoZeroedAt: null,
      attendanceAutoZeroReason: null,
      completeness: "none",
    };
  }
  const buckets = aggregateScoreBuckets(score);
  return {
    researchMethodScoreId: score.id,
    thesisId: score.thesisId,
    thesisTitle: score.thesis?.title ?? null,
    presentasi: buckets[BUCKETS.PRESENTASI],
    proposalKonten: buckets[BUCKETS.PROPOSAL_KONTEN],
    proposalStruktur: buckets[BUCKETS.PROPOSAL_STRUKTUR],
    kemampuanRespon: buckets[BUCKETS.KEMAMPUAN_RESPON],
    supervisorScore: score.supervisorScore,
    lecturerScore: score.lecturerScore,
    finalScore: score.finalScore,
    isFinalized: Boolean(score.isFinalized),
    finalizedAt: score.finalizedAt ?? null,
    coSignedAt: score.coSignedAt ?? null,
    attendanceAutoZeroedAt: score.attendanceAutoZeroedAt ?? null,
    attendanceAutoZeroReason: score.attendanceAutoZeroReason ?? null,
    completeness: classifyScoreCompleteness(score),
  };
}

/**
 * Build payload utama untuk Koordinator. Lihat module docstring di atas
 * untuk semantic field.
 */
export async function getMetopenMonitoring(options = {}) {
  const client = options.client ?? undefined;

  const [students, attendanceImport] = await Promise.all([
    repo.findEligibleMetopenStudents(client),
    repo.findLatestAttendanceImportWithRecords(client),
  ]);

  const studentIds = students.map((s) => s.id);
  const [advisorRequests, supervisors, scores] = await Promise.all([
    repo.findAdvisorRequestsByStudentIds(studentIds, client),
    repo.findActiveSupervisorsByStudentIds(studentIds, client),
    repo.findResearchMethodScoresByStudentIds(studentIds, client),
  ]);

  const advisorByStudent = indexLatestAdvisorRequest(advisorRequests);
  const supervisorByStudent = indexSupervisorsByStudent(supervisors);
  const scoreByStudent = indexLatestScoreByStudent(scores);
  const attendance = indexAttendanceRecords(attendanceImport?.records ?? []);

  // Build student rows (eligible SIA sebagai sumber primer).
  const studentRows = students.map((student, index) => {
    const attendanceRecord =
      attendance.byStudentId.get(student.id) ??
      attendance.byIdentity.get(student.user?.identityNumber) ??
      null;
    return {
      rowNumber: index + 1,
      studentId: student.id,
      identityNumber: student.user?.identityNumber ?? null,
      fullName: student.user?.fullName ?? null,
      email: student.user?.email ?? null,
      avatarUrl: student.user?.avatarUrl ?? null,
      enrollmentYear: student.enrollmentYear ?? null,
      studentStatus: student.status,
      researchMethodCompleted: Boolean(student.researchMethodCompleted),
      takingThesisCourse:
        student.takingThesisCourse === null ? null : Boolean(student.takingThesisCourse),
      eligibleMetopen: Boolean(student.eligibleMetopen),
      eligibilitySource: student.metopenEligibilitySource ?? null,
      eligibilityUpdatedAt: student.metopenEligibilityUpdatedAt ?? null,
      isMatched: true,
      isInImport: Boolean(attendanceRecord),
      attendance: serializeAttendance(attendanceRecord),
      advisorRequest: serializeAdvisorRequest(advisorByStudent.get(student.id)),
      supervisors: serializeSupervisors(supervisorByStudent.get(student.id)),
      score: serializeScore(scoreByStudent.get(student.id)),
    };
  });

  // Unmatched: rows di import yang studentId=null (NIM tidak match student DB).
  const unmatchedRecords = (attendanceImport?.records ?? [])
    .filter((record) => record.studentId == null)
    .map((record, index) => ({
      rowNumber: studentRows.length + index + 1,
      identityNumber: record.identityNumber,
      fullName: record.studentName,
      isMatched: false,
      isInImport: true,
      attendance: serializeAttendance(record),
      // Tidak ada advisor/supervisor/score karena studentId tidak teridentifikasi.
      advisorRequest: serializeAdvisorRequest(null),
      supervisors: serializeSupervisors(null),
      score: serializeScore(null),
    }));

  // Summary statistik untuk header UI (jumlah agregat).
  const stats = buildSummaryStats(studentRows, unmatchedRecords);

  return {
    attendanceImport: attendanceImport
      ? {
          id: attendanceImport.id,
          academicYearId: attendanceImport.academicYearId,
          classCode: attendanceImport.classCode,
          courseName: attendanceImport.courseName,
          semesterLabel: attendanceImport.semesterLabel,
          filterLabel: attendanceImport.filterLabel,
          lecturerNames: attendanceImport.lecturerNames,
          thresholdPercent: attendanceImport.thresholdPercent,
          totalRows: attendanceImport.totalRows,
          matchedRows: attendanceImport.matchedRows,
          eligibleRows: attendanceImport.eligibleRows,
          ineligibleRows: attendanceImport.ineligibleRows,
          autoZeroedCount: attendanceImport.autoZeroedCount,
          uploadedAt: attendanceImport.uploadedAt,
        }
      : null,
    stats,
    students: studentRows,
    unmatchedRecords,
  };
}

function buildSummaryStats(studentRows, unmatchedRecords) {
  const stats = {
    totalEligibleSia: studentRows.length,
    totalInImport: studentRows.filter((r) => r.isInImport).length,
    missingFromImport: studentRows.filter((r) => !r.isInImport).length,
    unmatchedInImport: unmatchedRecords.length,
    attendanceEligible: 0,
    attendanceIneligible: 0,
    advisorByCategory: {
      no_advisor: 0,
      pending_review: 0,
      pending_kadep: 0,
      active_pre_ta04: 0,
      active_official: 0,
      released: 0,
      revision: 0,
      rejected: 0,
      withdrawn: 0,
      other: 0,
    },
    scoreByCompleteness: {
      none: 0,
      partial_ta03a: 0,
      partial_ta03b: 0,
      complete_pending: 0,
      published: 0,
      auto_zero: 0,
    },
  };

  for (const row of studentRows) {
    if (row.attendance?.isEligible === true) stats.attendanceEligible += 1;
    else if (row.attendance?.isEligible === false) stats.attendanceIneligible += 1;

    const cat = row.advisorRequest?.statusCategory ?? "other";
    stats.advisorByCategory[cat] = (stats.advisorByCategory[cat] ?? 0) + 1;

    const completeness = row.score?.completeness ?? "none";
    stats.scoreByCompleteness[completeness] =
      (stats.scoreByCompleteness[completeness] ?? 0) + 1;
  }

  return stats;
}

// Internal helpers exported untuk unit test isolasi (avoid double-mocking).
export const __test = {
  ADVISOR_STATUS_DISPLAY,
  ROUTE_LABEL,
  indexLatestAdvisorRequest,
  indexSupervisorsByStudent,
  indexLatestScoreByStudent,
  indexAttendanceRecords,
  classifyScoreCompleteness,
  aggregateScoreBuckets,
  serializeAttendance,
  serializeAdvisorRequest,
  serializeSupervisors,
  serializeScore,
  buildSummaryStats,
};
