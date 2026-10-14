import prisma from "../config/prisma.js";
import { THESIS_PHASE, THESIS_STATUS, currentPhaseOf } from "../constants/thesisStatus.js";
import { isRepeatingProposal } from "../repositories/thesis-guidance-evaluation.repository.js";

/** Why proposal-phase guidance and milestones are still closed (K27, plan 6). */
export const PROPOSAL_NOT_ASSIGNED_REASON =
  "Bimbingan dan milestone fase proposal terbuka setelah Ketua Departemen menerbitkan Penetapan Pembimbing.";


/**
 * Proposal-phase writes (K27): open once Penetapan Pembimbing fills `supervisor_assigned_at`,
 * except for a thesis sent back to the proposal by a guidance evaluation (E5, Paket E rule kept).
 * @param {{ id: string, status: string, supervisorAssignedAt?: Date | null }} thesis
 * @returns {Promise<{ open: boolean, repeating: boolean }>}
 */
export async function getProposalPhaseAccess(thesis) {
  if (thesis?.status !== THESIS_STATUS.PROPOSAL) return { open: false, repeating: false };
  let assignedAt = thesis.supervisorAssignedAt;
  if (assignedAt === undefined) {
    const row = await prisma.thesis.findUnique({ where: { id: thesis.id }, select: { supervisorAssignedAt: true } });
    assignedAt = row?.supervisorAssignedAt ?? null;
  }
  const repeating = await isRepeatingProposal(thesis.id);
  return { open: !repeating && Boolean(assignedAt), repeating };
}

/**
 * Sessions and milestones of one phase (10.7: "Proposal: 3 sesi · Penelitian: 5 dari 8 sesi").
 * Counts for seminar and readiness keep using `TA_PHASE` (K7); this is for display only.
 */
export async function countPhaseActivity(thesisId, phase, client = prisma) {
  const [guidances, milestones] = await Promise.all([
    client.thesisGuidance.groupBy({ by: ["status"], where: { thesisId, phase, status: { not: "deleted" } }, _count: { _all: true } }),
    client.thesisMilestone.groupBy({ by: ["status"], where: { thesisId, phase, status: { not: "deleted" } }, _count: { _all: true } }),
  ]);
  const sum = (rows) => rows.reduce((n, row) => n + row._count._all, 0);
  const completed = (rows) => rows.filter((row) => row.status === "completed").reduce((n, row) => n + row._count._all, 0);
  return {
    guidances: { total: sum(guidances), completed: completed(guidances) },
    milestones: { total: sum(milestones), completed: completed(milestones) },
  };
}

/** Both phases at once, plus whether the proposal phase is writable now. */
export async function getPhaseSummary(thesis, client = prisma) {
  const [proposal, research, access] = await Promise.all([
    countPhaseActivity(thesis.id, THESIS_PHASE.PROPOSAL, client),
    countPhaseActivity(thesis.id, THESIS_PHASE.RESEARCH, client),
    getProposalPhaseAccess(thesis),
  ]);
  return {
    currentPhase: currentPhaseOf(thesis.status),
    supervisorAssignedAt: thesis.supervisorAssignedAt ?? null,
    proposalPhaseOpen: access.open,
    phases: { proposal, research },
  };
}
