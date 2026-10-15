/**
 * Seeders: the audit log rows the app writes when a supervisor approves seminar or defence
 * readiness (milestone.service → logAudit), so a seeded approval shows its date on the
 * readiness cards like one given in the app (Lanjutan Paket E4). The constants mirror
 * AUDIT_ACTIONS / ENTITY_TYPES; a unit test keeps them equal.
 */
export const READINESS_APPROVED_ACTION = Object.freeze({
  seminar: "SEMINAR_READINESS_APPROVED",
  defence: "DEFENCE_READINESS_APPROVED",
});
export const THESIS_ENTITY = "THESIS";

const HOUR = 60 * 60 * 1000;

/**
 * One approval row per supervisor, Pembimbing 1 first; each row an hour after the previous,
 * the last one marked as the approval that completed readiness.
 *
 * @param {import("../../src/generated/prisma/index.js").PrismaClient} prisma
 * @param {{ thesisId: string, kind: "seminar" | "defence", approvedAt: Date,
 *   supervisors: { lecturerId: string, position: "pembimbing_1" | "pembimbing_2" }[] }} input
 */
export function readinessApprovalRows({ thesisId, kind, approvedAt, supervisors }) {
  const ordered = [...supervisors].sort((a, b) => a.position.localeCompare(b.position));
  return ordered.map((supervisor, index) => ({
    userId: supervisor.lecturerId,
    action: READINESS_APPROVED_ACTION[kind],
    entity: THESIS_ENTITY,
    entityId: thesisId,
    changes: {
      oldValues: null,
      newValues: { supervisorRole: supervisor.position, isFullyApproved: index === ordered.length - 1, notes: null },
      metadata: null,
    },
    createdAt: new Date(approvedAt.getTime() + index * HOUR),
  }));
}

export async function seedReadinessApprovals(prisma, input) {
  const rows = readinessApprovalRows(input);
  if (rows.length > 0) await prisma.auditLog.createMany({ data: rows });
  return rows.length;
}
