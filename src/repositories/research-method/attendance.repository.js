import prisma from "../../config/prisma.js";
import { SUPERVISOR_ROLES } from "../../constants/roles.js";
import { CLOSED_THESIS_STATUSES } from "../../constants/thesisStatus.js";

const IMPORT_INCLUDE = {
  academicYear: { select: { id: true, semester: true, year: true } },
  uploadedBy: { select: { id: true, fullName: true } },
};

export function normalizeIdentity(value) {
  return String(value ?? "").replace(/\s+/g, "").trim();
}

export function findAcademicYear(id, client = prisma) {
  return client.academicYear.findUnique({ where: { id } });
}

/** The import in force for a period: the latest upload (R19). */
export function findLatestImport(academicYearId, client = prisma) {
  return client.researchMethodAttendanceImport.findFirst({
    where: { academicYearId },
    include: IMPORT_INCLUDE,
    orderBy: { uploadedAt: "desc" },
  });
}

export function findImports(academicYearId, client = prisma) {
  return client.researchMethodAttendanceImport.findMany({
    where: { academicYearId },
    include: IMPORT_INCLUDE,
    orderBy: { uploadedAt: "desc" },
  });
}

export function findImportById(id, client = prisma) {
  return client.researchMethodAttendanceImport.findUnique({ where: { id }, include: IMPORT_INCLUDE });
}

export function findRecords(importId, where = {}, client = prisma) {
  return client.researchMethodAttendanceRecord.findMany({
    where: { importId, ...where },
    include: { student: { select: { id: true, user: { select: { fullName: true } } } } },
    orderBy: { identityNumber: "asc" },
  });
}

export function findStudentsByIdentityNumbers(identityNumbers, client = prisma) {
  if (identityNumbers.length === 0) return [];
  return client.student.findMany({
    where: { user: { identityNumber: { in: identityNumbers } } },
    select: { id: true, user: { select: { fullName: true, identityNumber: true } } },
  });
}

/**
 * A student's row in an import, by student id or NIM; a row matched only by NIM gets its
 * student id filled (rule kept from the old module).
 */
export async function findRecordForStudent(importId, student, client = prisma) {
  const nim = student?.user?.identityNumber ? normalizeIdentity(student.user.identityNumber) : null;
  const record = await client.researchMethodAttendanceRecord.findFirst({
    where: { importId, OR: [{ studentId: student.id }, ...(nim ? [{ identityNumber: nim }] : [])] },
  });
  if (record && !record.studentId) {
    return client.researchMethodAttendanceRecord.update({ where: { id: record.id }, data: { studentId: student.id } });
  }
  return record;
}

export function createImport({ importData, records }, client = prisma) {
  return client.$transaction(async (tx) => {
    const created = await tx.researchMethodAttendanceImport.create({ data: importData });
    if (records.length > 0) {
      await tx.researchMethodAttendanceRecord.createMany({ data: records.map((r) => ({ ...r, importId: created.id })) });
    }
    return created;
  });
}

export function updateImportCounts(id, data, client = prisma) {
  return client.researchMethodAttendanceImport.update({ where: { id }, data, include: IMPORT_INCLUDE });
}

/**
 * Attempts of a period that attendance decides about: the final proposal is in, the student is
 * active and the thesis is still open (rule kept: after the final proposal exists).
 */
export function findScoreableAttempts(academicYearId, studentIds, client = prisma) {
  if (studentIds.length === 0) return [];
  return client.researchMethodAssessment.findMany({
    where: {
      academicYearId,
      proposalFilePath: { not: null },
      thesis: { studentId: { in: studentIds }, status: { notIn: CLOSED_THESIS_STATUSES }, student: { status: "active" } },
    },
    select: {
      id: true,
      thesisId: true,
      isFinalized: true,
      attendanceAutoZeroedAt: true,
      thesis: { select: { id: true, title: true, status: true, studentId: true } },
    },
  });
}

/** Attempt with the fields attendance rules read and write. */
export function findAttemptForAttendance(id, client = prisma) {
  return client.researchMethodAssessment.findUnique({
    where: { id },
    select: {
      id: true,
      academicYearId: true,
      proposalFilePath: true,
      isFinalized: true,
      attendanceAutoZeroedAt: true,
      thesis: {
        select: {
          id: true,
          title: true,
          status: true,
          student: { select: { id: true, user: { select: { identityNumber: true, fullName: true } } } },
        },
      },
    },
  });
}

/**
 * Score 0 for both assessors, final and failed (R19). Idempotent: an attempt already set to 0
 * keeps its first record; a finalized attempt is skipped or blocked.
 */
export function autoZeroAttempt({ assessmentId, actorUserId, attendanceRecordId, reason, skipFinalized }, client = prisma) {
  return client.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM research_method_assessments WHERE id = ${assessmentId} FOR UPDATE`;
    const existing = await tx.researchMethodAssessment.findUnique({ where: { id: assessmentId } });
    if (!existing) return { missing: true };
    if (existing.attendanceAutoZeroedAt) return { alreadyAutoZeroed: true, assessment: existing };
    if (existing.isFinalized) return skipFinalized ? { skipped: true, assessment: existing } : { blockedFinalized: true, assessment: existing };
    const now = new Date();
    await tx.researchMethodSupervisorAssessmentDetail.deleteMany({ where: { assessmentId } });
    await tx.researchMethodCoordinatorAssessmentDetail.deleteMany({ where: { assessmentId } });
    const assessment = await tx.researchMethodAssessment.update({
      where: { id: assessmentId },
      data: {
        supervisorId: null,
        supervisorScore: 0,
        supervisorScoredAt: null,
        coordinatorId: null,
        coordinatorScore: 0,
        coordinatorScoredAt: null,
        finalScore: 0,
        isFinalized: true,
        finalizedBy: actorUserId ?? null,
        finalizedAt: now,
        result: "failed",
        attendanceRecordId,
        attendanceAutoZeroedAt: now,
        attendanceAutoZeroReason: reason,
      },
    });
    return { applied: true, assessment };
  });
}

/** A corrected upload that meets the threshold reopens an automatic 0 (proposal phase only). */
export function clearAutoZero(items, client = prisma) {
  if (items.length === 0) return [];
  return client.$transaction(
    items.map((item) =>
      client.researchMethodAssessment.update({
        where: { id: item.assessmentId },
        data: {
          supervisorScore: null,
          coordinatorScore: null,
          finalScore: null,
          isFinalized: false,
          finalizedBy: null,
          finalizedAt: null,
          result: null,
          attendanceRecordId: item.attendanceRecordId,
          attendanceAutoZeroedAt: null,
          attendanceAutoZeroReason: null,
        },
      }),
    ),
  );
}

export function linkAttendanceRecord(assessmentId, attendanceRecordId, client = prisma) {
  return client.researchMethodAssessment.update({ where: { id: assessmentId }, data: { attendanceRecordId } });
}

/** Student, active supervisors of a thesis: who hears about an automatic 0. */
export function findNotificationTargets(thesisId, client = prisma) {
  return client.thesis.findUnique({
    where: { id: thesisId },
    select: {
      title: true,
      student: { select: { id: true, user: { select: { fullName: true } } } },
      thesisSupervisors: {
        where: { status: "active", role: { name: { in: SUPERVISOR_ROLES } } },
        select: { lecturerId: true },
      },
    },
  });
}
