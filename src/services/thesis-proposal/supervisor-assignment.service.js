import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

import prisma from "../../config/prisma.js";
import { ROLES } from "../../constants/roles.js";
import { ACCEPTED_STATUSES, ASSIGNMENT_BATCH_STATUS, SUPERVISOR_REQUEST_STATUS } from "../../constants/thesis-proposal.js";
import { formatAcademicYearLabel, resolveOperationalAcademicYear } from "../../helpers/academicYear.helper.js";
import {
  assignmentPdfFileName,
  buildAssignmentCohort,
  renderAssignmentPdf,
  semesterLabel,
} from "../../helpers/supervisor-assignment.helper.js";
import { assignmentBatchDir, removeFile, storeFile } from "../../helpers/thesis-proposal-file.helper.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../utils/errors.js";
import { AUDIT_ACTIONS, ENTITY_TYPES, logAudit } from "../auditLog.service.js";
import { createNotificationEventForUsers } from "../notification.service.js";
import * as repo from "../../repositories/thesis-proposal/supervisor-assignment.repository.js";
import { findActiveUserIdsByRole, userHasAnyActiveRole } from "../../repositories/thesis-proposal/supervisor-request.repository.js";

/**
 * Penetapan Pembimbing (formulir TA-04): one batch per period issued by the Head of Department.
 * The batch PDF is the frozen record of titles and supervisors (10.4); members only point at the
 * thesis. Issuing fills `thesis.supervisor_assigned_at` once (no reservation layer) and opens
 * proposal guidance and the final proposal.
 */

const EMPTY_COHORT = "Tidak ada mahasiswa dengan pengajuan pembimbing yang disetujui pada periode ini.";

async function resolveYear(academicYearId) {
  const year = academicYearId
    ? await prisma.academicYear.findUnique({ where: { id: academicYearId } })
    : await resolveOperationalAcademicYear();
  if (!year) throw new NotFoundError("Tahun ajaran tidak ditemukan.");
  return year;
}

/** Whether a stored batch still matches the cohort (same hash and same members, R17). */
export function isBatchCurrent(batch, cohort, thesisIds) {
  if (!batch || batch.cohortHash !== cohort.cohortHash) return false;
  const members = new Set(batch.members.map((member) => member.thesisId));
  return members.size === thesisIds.length && thesisIds.every((id) => members.has(id));
}

function batchDto(batch) {
  if (!batch) return null;
  return {
    id: batch.id,
    version: batch.version,
    status: batch.status,
    generatedAt: batch.generatedAt,
    generatedBy: batch.generatedBy ?? null,
    fileName: batch.fileName,
    fileSize: batch.fileSize,
    memberCount: batch._count?.members ?? batch.members?.length ?? 0,
    fileUrl: `/thesis-proposals/supervisor-assignments/batches/${batch.id}/file`,
  };
}

/**
 * The period's cohort, the current batch, and whether it must be issued again (Kadep, Sekdep,
 * Admin). Each row says whether that thesis is already in the current batch.
 */
export async function getAssignmentOverview(academicYearId = null) {
  return buildOverview(await resolveYear(academicYearId));
}

async function buildOverview(year) {
  const [theses, current, batches] = await Promise.all([
    repo.findCohortTheses(year.id),
    repo.findCurrentBatch(year.id),
    repo.findBatches(year.id),
  ]);
  const cohort = buildAssignmentCohort(theses);
  const thesisIds = theses.map((thesis) => thesis.id);
  const inBatch = new Set((current?.members ?? []).map((member) => member.thesisId));
  const byId = new Map(theses.map((thesis) => [thesis.id, thesis]));
  const upToDate = isBatchCurrent(current, cohort, thesisIds);

  return {
    academicYear: { id: year.id, semester: year.semester, year: year.year, label: formatAcademicYearLabel(year), isActive: year.isActive },
    entries: cohort.entries.map((entry) => {
      const thesis = byId.get(entry.thesisId);
      return {
        ...entry,
        // The board joins the cohort with the requests by student
        studentId: thesis?.student?.id ?? null,
        requestId: thesis?.requestId ?? null,
        // the same names as `supervisorNames`, kept apart so the page can format each lecturer
        supervisors: (thesis?.thesisSupervisors ?? [])
          .map((row) => ({ lecturerId: row.lecturerId, fullName: row.lecturer?.user?.fullName ?? null, role: row.role?.name ?? null }))
          .sort((a, b) => String(a.role).localeCompare(String(b.role))),
        supervisorAssignedAt: thesis?.supervisorAssignedAt ?? null,
        inCurrentBatch: inBatch.has(entry.thesisId),
      };
    }),
    currentBatch: batchDto(current),
    batches: batches.map(batchDto),
    upToDate,
    needsIssue: cohort.entries.length > 0 && !upToDate,
    newCount: cohort.entries.filter((entry) => !inBatch.has(entry.thesisId)).length,
  };
}

async function loadCohort(year) {
  const theses = await repo.findCohortTheses(year.id);
  if (theses.length === 0) throw new BadRequestError(EMPTY_COHORT);
  return { theses, cohort: buildAssignmentCohort(theses) };
}

/** PDF of the current cohort, before issuing (Kadep and Admin, any time). */
export async function previewAssignmentPdf(academicYearId = null) {
  const year = await resolveYear(academicYearId);
  const { cohort } = await loadCohort(year);
  const kadep = await repo.findActiveUserByRole(ROLES.KETUA_DEPARTEMEN);
  const buffer = await renderAssignmentPdf({ academicYear: year, entries: cohort.entries, kadep });
  return { buffer, fileName: `Pratinjau-${assignmentPdfFileName(year, "baru")}` };
}

/**
 * Issue the period's Penetapan Pembimbing (R17). An unchanged cohort issues nothing new; a
 * changed one creates the next version and supersedes the previous. Accepted requests become
 * `assigned`; each member's `supervisor_assigned_at` is set the first time.
 */
export async function issueAssignment(academicYearId, kadepUserId) {
  const year = await resolveYear(academicYearId);
  const { theses, cohort } = await loadCohort(year);
  const thesisIds = theses.map((thesis) => thesis.id);
  const current = await repo.findCurrentBatch(year.id);
  if (isBatchCurrent(current, cohort, thesisIds)) {
    return { ...(await buildOverview(year)), alreadyIssued: true };
  }

  const kadep = await repo.findActiveUserByRole(ROLES.KETUA_DEPARTEMEN);
  const now = new Date();
  const version = (current?.version ?? (await prisma.thesisSupervisorAssignmentBatch.count({ where: { academicYearId: year.id } }))) + 1;
  const batchId = randomUUID();
  const buffer = await renderAssignmentPdf({ academicYear: year, entries: cohort.entries, kadep, now });
  const stored = await storeFile({
    relDir: assignmentBatchDir(batchId),
    file: { buffer, originalname: assignmentPdfFileName(year, version), mimetype: "application/pdf" },
    now,
  });

  let newlyAssigned = [];
  try {
    newlyAssigned = await prisma.$transaction(async (tx) => {
      await tx.thesisSupervisorAssignmentBatch.updateMany({
        where: { academicYearId: year.id, status: ASSIGNMENT_BATCH_STATUS.CURRENT },
        data: { status: ASSIGNMENT_BATCH_STATUS.SUPERSEDED },
      });
      await tx.thesisSupervisorAssignmentBatch.create({
        data: {
          id: batchId,
          academicYearId: year.id,
          version,
          status: ASSIGNMENT_BATCH_STATUS.CURRENT,
          cohortHash: cohort.cohortHash,
          generatedByUserId: kadepUserId,
          generatedAt: now,
          ...stored,
          members: { create: thesisIds.map((thesisId) => ({ thesisId })) },
        },
      });
      await tx.thesisSupervisorRequest.updateMany({
        where: { id: { in: theses.map((thesis) => thesis.requestId) }, status: { in: ACCEPTED_STATUSES } },
        data: { status: SUPERVISOR_REQUEST_STATUS.ASSIGNED },
      });
      const fresh = theses.filter((thesis) => !thesis.supervisorAssignedAt).map((thesis) => thesis.id);
      if (fresh.length > 0) {
        await tx.thesis.updateMany({ where: { id: { in: fresh } }, data: { supervisorAssignedAt: now } });
      }
      return fresh;
    });
  } catch (error) {
    await removeFile(stored.filePath);
    throw error;
  }

  await logAudit({
    actorUserId: kadepUserId,
    action: AUDIT_ACTIONS.SUPERVISOR_ASSIGNMENT_ISSUED,
    entityType: ENTITY_TYPES.SUPERVISOR_ASSIGNMENT_BATCH,
    entityId: batchId,
    newValues: { academicYearId: year.id, version, members: thesisIds.length },
    metadata: { newlyAssigned: newlyAssigned.length, cohortHash: cohort.cohortHash },
  });

  // R15: students of the batch; the PDF stays with the department (they see the status only).
  const studentIds = theses.map((thesis) => thesis.student?.id).filter(Boolean);
  try {
    await createNotificationEventForUsers(
      studentIds,
      {
        title: "Pembimbing Ditetapkan",
        message: `Ketua Departemen menetapkan pembimbing Anda untuk ${semesterLabel(year)}. Bimbingan proposal dan pengajuan proposal final kini terbuka.`,
        type: "supervisor_assignment_issued",
        data: { academicYearId: year.id, batchId, route: "/tugas-akhir/proposal" },
      },
      { push: true },
    );
  } catch (error) {
    console.error("[supervisor-assignment] notifikasi gagal dikirim:", error?.message ?? error);
  }

  return { ...(await buildOverview(year)), alreadyIssued: false, newlyAssigned: newlyAssigned.length };
}

/**
 * The stored PDF of a batch. Kadep and Admin may open any version; Sekdep only the current batch
 * of a period whose batch is complete (R17, kept from the old module).
 */
export async function getBatchFile(batchId, userId) {
  const batch = await repo.findBatchById(batchId);
  if (!batch) throw new NotFoundError("Penetapan Pembimbing tidak ditemukan.");
  const isKadepOrAdmin = await userHasAnyActiveRole(userId, [ROLES.KETUA_DEPARTEMEN, ROLES.ADMIN]);
  if (!isKadepOrAdmin) {
    const isSekdep = await userHasAnyActiveRole(userId, [ROLES.SEKRETARIS_DEPARTEMEN]);
    if (!isSekdep) throw new ForbiddenError("Anda tidak memiliki akses ke berkas ini.");
    const overview = await getAssignmentOverview(batch.academicYearId);
    if (batch.status !== ASSIGNMENT_BATCH_STATUS.CURRENT || !overview.upToDate) {
      throw new BadRequestError("Penetapan Pembimbing periode ini belum diperbarui. Berkas bisa diunduh setelah Ketua Departemen menerbitkan versi terbaru.");
    }
  }
  const absolute = path.resolve(process.cwd(), batch.filePath);
  try {
    return { buffer: await fs.readFile(absolute), fileName: batch.fileName, mimeType: batch.mimeType };
  } catch {
    throw new NotFoundError("Berkas Penetapan Pembimbing tidak ditemukan di server.");
  }
}

/** Reminder for the Head of Department: accepted requests not yet in a batch (renamed old job). */
export async function findPeriodsWaitingForAssignment() {
  const rows = await prisma.thesisSupervisorRequest.groupBy({
    by: ["academicYearId"],
    where: { status: { in: ACCEPTED_STATUSES }, thesis: { supervisorAssignedAt: null } },
    _count: { _all: true },
  });
  return rows
    .filter((row) => row.academicYearId)
    .map((row) => ({ academicYearId: row.academicYearId, waiting: row._count._all }));
}

export { findActiveUserIdsByRole };
