import prisma from "../../config/prisma.js";
import { ROLES } from "../../constants/roles.js";
import { OPEN_THESIS_STATUSES } from "../../constants/thesisStatus.js";
import { formatAcademicYearLabel } from "../../helpers/academicYear.helper.js";
import { semesterLabel } from "../../helpers/supervisor-assignment.helper.js";
import { NotFoundError } from "../../utils/errors.js";
import { findLatestBatchOfThesis } from "../../repositories/thesis-proposal/supervisor-assignment.repository.js";

const ROLE_ORDER = { [ROLES.PEMBIMBING_1]: 1, [ROLES.PEMBIMBING_2]: 2 };

/** The thesis a student's Proposal page is about: the open one, else the latest. */
export function findStudentThesis(studentId, client = prisma) {
  const select = {
    id: true,
    title: true,
    status: true,
    startDate: true,
    supervisorAssignedAt: true,
    academicYear: { select: { id: true, semester: true, year: true } },
    thesisTopic: { select: { id: true, name: true } },
    thesisSupervisors: {
      where: { status: "active" },
      select: { lecturerId: true, role: { select: { name: true } }, lecturer: { select: { user: { select: { fullName: true, identityNumber: true } } } } },
    },
  };
  return client.thesis
    .findFirst({ where: { studentId, status: { in: OPEN_THESIS_STATUSES } }, select, orderBy: { createdAt: "desc" } })
    .then((open) => open ?? client.thesis.findFirst({ where: { studentId }, select, orderBy: { createdAt: "desc" } }));
}

/**
 * Sections 2–4 of Tugas Akhir > Proposal for the student: the thesis and its supervisors, and
 * the status of Penetapan Pembimbing (no PDF: the batch file stays with the department).
 */
export async function getStudentProposalOverview(userId) {
  const student = await prisma.student.findUnique({ where: { id: userId }, select: { id: true } });
  if (!student) throw new NotFoundError("Data mahasiswa tidak ditemukan.");
  const thesis = await findStudentThesis(student.id);
  if (!thesis) return { thesis: null, assignment: null };

  const supervisors = thesis.thesisSupervisors
    .map((row) => ({
      lecturerId: row.lecturerId,
      fullName: row.lecturer?.user?.fullName ?? null,
      identityNumber: row.lecturer?.user?.identityNumber ?? null,
      role: row.role?.name ?? null,
    }))
    .sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9));
  const batch = thesis.supervisorAssignedAt ? await findLatestBatchOfThesis(thesis.id) : null;

  let waitingReason = null;
  if (!supervisors.some((s) => s.role === ROLES.PEMBIMBING_1)) {
    waitingReason = "Belum ada dosen pembimbing. Ajukan pembimbing di bagian Pengajuan Pembimbing.";
  } else if (!thesis.supervisorAssignedAt) {
    waitingReason = "Pengajuan Anda sudah disetujui. Bimbingan proposal dan proposal final terbuka setelah Ketua Departemen menerbitkan Penetapan Pembimbing.";
  }

  return {
    thesis: {
      id: thesis.id,
      title: thesis.title,
      status: thesis.status,
      startDate: thesis.startDate,
      topic: thesis.thesisTopic ?? null,
      academicYear: thesis.academicYear ? { ...thesis.academicYear, label: formatAcademicYearLabel(thesis.academicYear) } : null,
      supervisors,
    },
    assignment: {
      assigned: Boolean(thesis.supervisorAssignedAt),
      assignedAt: thesis.supervisorAssignedAt,
      semesterLabel: batch?.academicYear ? semesterLabel(batch.academicYear) : null,
      version: batch?.version ?? null,
      waitingReason,
    },
  };
}
