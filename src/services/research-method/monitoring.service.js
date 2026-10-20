import prisma from "../../config/prisma.js";
import { RESEARCH_METHOD_RESULT } from "../../constants/research-method.js";
import { SUPERVISOR_ROLES } from "../../constants/roles.js";
import { THESIS_PHASE } from "../../constants/thesisStatus.js";
import { formatAcademicYearLabel, resolveOperationalAcademicYear } from "../../helpers/academicYear.helper.js";
import { NotFoundError } from "../../utils/errors.js";
import { minimumScoreOf } from "./assessment.service.js";

/**
 * Metode Penelitian > Monitoring Kelas: every student of the semester's class (the flag says they
 * take Metode Penelitian, or they have an assessment attempt in the semester) and how far each one
 * is: supervisor request, Penetapan Pembimbing, proposal guidance, final proposal, both sent scores
 * and the result. A pass starts the research phase at once. Drafts are never shown.
 */
export async function getClassMonitoring(academicYearId = null) {
  const operational = await resolveOperationalAcademicYear();
  const year = await prisma.academicYear.findUnique({ where: { id: academicYearId || operational?.id || "-" } });
  if (!year) throw new NotFoundError("Periode akademik tidak ditemukan.");

  const [snapshots, attempts] = await Promise.all([
    prisma.studentAcademicYearSnapshot.findMany({ where: { academicYearId: year.id, eligibleResearchMethod: true }, select: { studentId: true } }),
    prisma.researchMethodAssessment.findMany({
      where: { academicYearId: year.id },
      select: {
        id: true,
        thesisId: true,
        proposalFilePath: true,
        proposalSubmittedAt: true,
        supervisorScore: true,
        coordinatorScore: true,
        finalScore: true,
        isFinalized: true,
        result: true,
        supervisor: { select: { user: { select: { fullName: true } } } },
        coordinator: { select: { user: { select: { fullName: true } } } },
        thesis: { select: { studentId: true } },
      },
    }),
  ]);
  const studentIds = [...new Set([...snapshots.map((s) => s.studentId), ...attempts.map((a) => a.thesis.studentId)])];
  if (studentIds.length === 0) {
    return { academicYear: { id: year.id, label: formatAcademicYearLabel(year) }, minimumScore: minimumScoreOf(year), summary: summarize([]), rows: [] };
  }

  const [students, requests] = await Promise.all([
    prisma.student.findMany({
      where: { id: { in: studentIds } },
      select: {
        id: true,
        status: true,
        user: { select: { fullName: true, identityNumber: true } },
        thesis: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            title: true,
            status: true,
            supervisorAssignedAt: true,
            thesisSupervisors: {
              where: { status: "active", role: { name: { in: SUPERVISOR_ROLES } } },
              select: { role: { select: { name: true } }, lecturer: { select: { user: { select: { fullName: true } } } } },
            },
            _count: { select: { thesisGuidances: { where: { phase: THESIS_PHASE.PROPOSAL, status: "completed" } } } },
          },
        },
      },
    }),
    prisma.thesisSupervisorRequest.findMany({
      where: { studentId: { in: studentIds }, academicYearId: year.id },
      orderBy: { createdAt: "desc" },
      select: { studentId: true, status: true, route: true },
    }),
  ]);
  const requestOf = new Map();
  for (const r of requests) if (!requestOf.has(r.studentId)) requestOf.set(r.studentId, r);
  const attemptOf = new Map(attempts.map((a) => [a.thesis.studentId, a]));

  const rows = students
    .map((student) => {
      const thesis = student.thesis[0] ?? null;
      const attempt = attemptOf.get(student.id) ?? null;
      const request = requestOf.get(student.id) ?? null;
      return {
        studentId: student.id,
        fullName: student.user?.fullName ?? null,
        identityNumber: student.user?.identityNumber ?? null,
        thesis: thesis
          ? {
              id: thesis.id,
              title: thesis.title,
              status: thesis.status,
              supervisorAssignedAt: thesis.supervisorAssignedAt,
              supervisors: thesis.thesisSupervisors.map((s) => ({ fullName: s.lecturer?.user?.fullName ?? null, role: s.role?.name ?? null })),
              proposalGuidances: thesis._count.thesisGuidances,
            }
          : null,
        request: request ? { status: request.status, route: request.route } : null,
        assessment: attempt
          ? {
              id: attempt.id,
              finalProposalAt: attempt.proposalFilePath ? attempt.proposalSubmittedAt : null,
              supervisorScore: attempt.supervisorScore,
              coordinatorScore: attempt.coordinatorScore,
              finalScore: attempt.finalScore,
              isFinalized: attempt.isFinalized,
              result: attempt.result,
              supervisorName: attempt.supervisorScore != null ? attempt.supervisor?.user?.fullName ?? null : null,
              coordinatorName: attempt.coordinatorScore != null ? attempt.coordinator?.user?.fullName ?? null : null,
            }
          : null,
      };
    })
    .sort((a, b) => String(a.identityNumber).localeCompare(String(b.identityNumber), "en", { numeric: true }));

  return { academicYear: { id: year.id, label: formatAcademicYearLabel(year) }, minimumScore: minimumScoreOf(year), summary: summarize(rows), rows };
}

/**
 * The two charts of the page: the stages in order (Peserta, Punya Pembimbing, Ditetapkan, Proposal
 * Final, Dinilai, Mulai Penelitian) and the results (Mulai Penelitian, Tidak Lulus, Belum Dinilai).
 */
export function summarize(rows) {
  const finalized = rows.filter((r) => r.assessment?.isFinalized).length;
  return {
    total: rows.length,
    withSupervisor: rows.filter((r) => (r.thesis?.supervisors ?? []).length > 0).length,
    assigned: rows.filter((r) => r.thesis?.supervisorAssignedAt).length,
    finalProposal: rows.filter((r) => r.assessment?.finalProposalAt).length,
    finalized,
    passed: rows.filter((r) => r.assessment?.result === RESEARCH_METHOD_RESULT.PASSED).length,
    failed: rows.filter((r) => r.assessment?.isFinalized && r.assessment?.result === RESEARCH_METHOD_RESULT.FAILED).length,
    notFinalized: rows.length - finalized,
  };
}
