import prisma from "../../config/prisma.js";
import { ROLES } from "../../constants/roles.js";
import { formatAcademicYearLabel } from "../../helpers/academicYear.helper.js";
import { semesterLabel } from "../../helpers/supervisor-assignment.helper.js";
import { NotFoundError } from "../../utils/errors.js";
import { findLatestBatchOfThesis } from "../../repositories/thesis-proposal/supervisor-assignment.repository.js";
import { findStudentThesis } from "../../repositories/thesis-proposal/student-thesis.repository.js";
import { getFinalProposalState } from "./final-proposal.service.js";

const ROLE_ORDER = { [ROLES.PEMBIMBING_1]: 1, [ROLES.PEMBIMBING_2]: 2 };

/**
 * Sections 2–4 of Tugas Akhir > Proposal for the student: the thesis and its supervisors, the
 * status of Penetapan Pembimbing (no PDF: the batch file stays with the department), and the
 * final proposal of the current attempt.
 */
export async function getStudentProposalOverview(userId) {
  const student = await prisma.student.findUnique({ where: { id: userId }, select: { id: true } });
  if (!student) throw new NotFoundError("Data mahasiswa tidak ditemukan.");
  const thesis = await findStudentThesis(student.id);
  if (!thesis) return { thesis: null, assignment: null, finalProposal: await getFinalProposalState(null) };

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
    finalProposal: await getFinalProposalState(thesis),
  };
}
