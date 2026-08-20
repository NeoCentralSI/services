import { ForbiddenError, NotFoundError } from "../utils/errors.js";
import * as ta04AuthorizationRepository from "../repositories/ta04Authorization.repository.js";

export const TA04_GUIDANCE_GATE_MESSAGE =
  "Booking pembimbing sudah disetujui, tetapi Formulir TA-04 belum difinalisasi KaDep. Bimbingan proposal yang tercatat sistem baru dapat dimulai setelah TA-04 terbit.";

export async function getTa04GuidanceAuthorization(thesisId) {
  const thesis = await ta04AuthorizationRepository.findTa04GuidanceAuthorization(thesisId);
  if (!thesis) throw new NotFoundError("Tugas akhir tidak ditemukan");

  const hasActiveP1 = thesis.thesisSupervisors.length > 0;
  const hasBookedSupervisor = hasActiveP1 && thesis.advisorRequests.length > 0;
  const ta04Issued = Boolean(thesis.ta04AssignmentIssuedAt);
  const hasOfficialSupervisor = hasActiveP1 && ta04Issued;
  return {
    hasBookedSupervisor,
    ta04Issued,
    hasOfficialSupervisor,
    guidanceGateOpen: hasOfficialSupervisor,
    guidanceGateReason: hasOfficialSupervisor
      ? null
      : hasBookedSupervisor
        ? TA04_GUIDANCE_GATE_MESSAGE
        : "Bimbingan proposal belum dapat dimulai karena booking pembimbing belum disetujui.",
  };
}

/**
 * Logbook phase is derived from the thesis, never from the client body.
 * A Metopel thesis (`isProposal !== false` and proposal not accepted) stays
 * `proposal` so `phase=thesis` cannot skip the TA-04 gate.
 */
export function deriveGuidancePhaseFromThesis(thesis) {
  if (!thesis) return "proposal";
  if (thesis.proposalStatus === "accepted" || thesis.isProposal === false) {
    return "thesis";
  }
  return "proposal";
}

export async function assertTa04GuidanceAuthorized(thesisId) {
  const authorization = await getTa04GuidanceAuthorization(thesisId);
  if (!authorization.guidanceGateOpen) {
    throw new ForbiddenError(
      authorization.guidanceGateReason ?? "Bimbingan proposal belum memiliki pembimbing yang ditetapkan.",
    );
  }
  return authorization;
}
