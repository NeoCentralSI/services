import prisma from "../config/prisma.js";
import { ADVISOR_REQUEST_STATUS } from "../constants/advisorRequestStatus.js";

/**
 * Bukti pernah menempuh Metopel (riwayat). Bukan predikat arsip modul.
 * Arsip = `studentHasOfficialMetopenArchive` (`active_official` / thesis sudah
 * keluar fase proposal lewat promosi).
 */
export async function studentHasTakenMetopen(studentId, { client = prisma } = {}) {
  if (!studentId) return false;
  const [score, ta04, request] = await Promise.all([
    client.researchMethodScore.findFirst({
      where: { thesis: { studentId } },
      select: { id: true },
    }),
    client.thesis.findFirst({
      where: { studentId, ta04AssignmentIssuedAt: { not: null } },
      select: { id: true },
    }),
    client.thesisAdvisorRequest.findFirst({
      where: {
        studentId,
        status: {
          in: [
            ADVISOR_REQUEST_STATUS.BOOKING_APPROVED,
            ADVISOR_REQUEST_STATUS.RELEASED,
            ADVISOR_REQUEST_STATUS.ACTIVE_OFFICIAL,
          ],
        },
      },
      select: { id: true },
    }),
  ]);
  return Boolean(score || ta04 || request);
}

/**
 * Mode arsip Metopel: mahasiswa sudah sah naik TA di NeoCentral.
 * Gagal tutup periode / auto-zero / booking released + KRS TA SIA true
 * tidak mengunci modul (eksepsi + mengulang).
 */
export async function studentHasOfficialMetopenArchive(studentId, { client = prisma } = {}) {
  if (!studentId) return false;
  const [officialRequest, promotedThesis] = await Promise.all([
    client.thesisAdvisorRequest.findFirst({
      where: {
        studentId,
        status: ADVISOR_REQUEST_STATUS.ACTIVE_OFFICIAL,
      },
      select: { id: true },
    }),
    client.thesis.findFirst({
      where: {
        studentId,
        OR: [
          { isProposal: false },
          { activePromotedAt: { not: null } },
        ],
      },
      select: { id: true },
    }),
  ]);
  return Boolean(officialRequest || promotedThesis);
}
