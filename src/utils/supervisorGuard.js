/**
 * Supervisor Guard Utilities
 *
 * Reusable assertions for ThesisSupervisors integrity.
 * All functions accept a Prisma client (tx or prisma) so they work
 * both inside and outside transactions.
 */
import { BadRequestError } from "./errors.js";

/**
 * Assert that no active ThesisSupervisors record exists for (thesisId, roleId).
 * Throws BadRequestError if a duplicate active role is found.
 *
 * @param {object} tx - Prisma client or transaction client
 * @param {string} thesisId
 * @param {string} roleId
 * @param {string} roleName - Human-readable role name for the error message
 */
export async function assertNoActiveDuplicateRole(tx, thesisId, roleId, roleName = "pembimbing") {
  const existing = await tx.thesisParticipant.findFirst({
    where: {
      thesisId,
      status: "active",
      OR: [
        { roleId },
        ...(roleName ? [{ role: { name: roleName } }] : []),
      ],
    },
    select: {
      id: true,
      lecturer: { select: { user: { select: { fullName: true } } } },
    },
  });

  if (existing) {
    const name = existing.lecturer?.user?.fullName ?? "dosen lain";
    throw new BadRequestError(
      `Mahasiswa ini sudah memiliki ${roleName} (${name}). Penggantian pembimbing formal tidak difasilitasi pada release aktif SIMPTA ini.`
    );
  }
}

/**
 * Assert that a lecturer is not already assigned to the same thesis in any role.
 * Prevents the same person from being both Pembimbing 1 and 2 on the same thesis.
 *
 * @param {object} tx - Prisma client or transaction client
 * @param {string} thesisId
 * @param {string} lecturerId
 */
export async function assertLecturerNotAlreadyAssigned(tx, thesisId, lecturerId) {
  const existing = await tx.thesisParticipant.findFirst({
    where: { thesisId, lecturerId, status: "active" },
    select: {
      id: true,
      role: { select: { name: true } },
    },
  });

  if (existing) {
    const roleName = existing.role?.name ?? "pembimbing";
    throw new BadRequestError(
      `Dosen ini sudah terdaftar sebagai ${roleName} untuk mahasiswa tersebut.`
    );
  }
}
