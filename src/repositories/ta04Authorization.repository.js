import prisma from "../config/prisma.js";
import { ROLES } from "../constants/roles.js";

/**
 * State minimum untuk membedakan booking pembimbing dari otorisasi bimbingan
 * proposal oleh TA-04. Booking tetap disimpan sebagai alokasi kuota, tetapi
 * bukan bukti bahwa bimbingan sudah boleh dimulai.
 */
export function findTa04GuidanceAuthorization(thesisId) {
  return prisma.thesis.findUnique({
    where: { id: thesisId },
    select: {
      id: true,
      isProposal: true,
      ta04AssignmentIssuedAt: true,
      thesisSupervisors: {
        where: {
          status: "active",
          role: { name: ROLES.PEMBIMBING_1 },
        },
        select: { id: true },
      },
      advisorRequests: {
        where: { status: "booking_approved" },
        select: { id: true },
      },
    },
  });
}
