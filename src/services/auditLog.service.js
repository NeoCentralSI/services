import prisma from "../config/prisma.js";

export const AUDIT_ACTIONS = {
  CHANGE_REQUEST_APPROVED: "CHANGE_REQUEST_APPROVED",
  CHANGE_REQUEST_CREATED: "CHANGE_REQUEST_CREATED",
  CHANGE_REQUEST_REJECTED: "CHANGE_REQUEST_REJECTED",
  CHANGE_REQUEST_REVIEWED: "CHANGE_REQUEST_REVIEWED",
  DEFENCE_READINESS_APPROVED: "DEFENCE_READINESS_APPROVED",
  DEFENCE_READINESS_REVOKED: "DEFENCE_READINESS_REVOKED",
  DEFENCE_REQUESTED: "DEFENCE_REQUESTED",
  GUIDANCE_REQUESTED: "GUIDANCE_REQUESTED",
  MILESTONE_CREATED: "MILESTONE_CREATED",
  MILESTONE_REVISION_REQUESTED: "MILESTONE_REVISION_REQUESTED",
  MILESTONE_SUBMITTED: "MILESTONE_SUBMITTED",
  MILESTONE_VALIDATED: "MILESTONE_VALIDATED",
  REQUEST_ADVISOR_ACCEPTED: "REQUEST_ADVISOR_ACCEPTED",
  REQUEST_ADVISOR_CANCELLED: "REQUEST_ADVISOR_CANCELLED",
  REQUEST_ADVISOR_CREATED: "REQUEST_ADVISOR_CREATED",
  REQUEST_ADVISOR_ESCALATED_TO_KADEP: "REQUEST_ADVISOR_ESCALATED_TO_KADEP",
  REQUEST_ADVISOR_KADEP_APPROVED: "REQUEST_ADVISOR_KADEP_APPROVED",
  REQUEST_ADVISOR_KADEP_REVISION_REQUESTED: "REQUEST_ADVISOR_KADEP_REVISION_REQUESTED",
  REQUEST_ADVISOR_KADEP_REJECTED: "REQUEST_ADVISOR_KADEP_REJECTED",
  REQUEST_ADVISOR_PROMOTED_TO_ACTIVE: "REQUEST_ADVISOR_PROMOTED_TO_ACTIVE",
  REQUEST_ADVISOR_RELEASED: "REQUEST_ADVISOR_RELEASED",
  REQUEST_ADVISOR_REJECTED: "REQUEST_ADVISOR_REJECTED",
  SEMINAR_READINESS_APPROVED: "SEMINAR_READINESS_APPROVED",
  SEMINAR_READINESS_REVOKED: "SEMINAR_READINESS_REVOKED",
  THESIS_CREATED: "THESIS_CREATED",
  THESIS_DELETED: "THESIS_DELETED",
  THESIS_STATUS_CHANGED: "THESIS_STATUS_CHANGED",
  THESIS_UPDATED: "THESIS_UPDATED",
  USER_CREATED: "USER_CREATED",
  USER_ROLES_UPDATED: "USER_ROLES_UPDATED",
  ACADEMIC_YEAR_CREATED: "ACADEMIC_YEAR_CREATED",
  ACADEMIC_YEAR_UPDATED: "ACADEMIC_YEAR_UPDATED",
  QUOTA_DEFAULT_UPDATED: "QUOTA_DEFAULT_UPDATED",
  QUOTA_LECTURER_UPDATED: "QUOTA_LECTURER_UPDATED",
};

/** Admin authorization mutations that the Admin read-surface lists by default. */
export const ADMIN_AUDIT_ACTIONS = [
  AUDIT_ACTIONS.USER_CREATED,
  AUDIT_ACTIONS.USER_ROLES_UPDATED,
  AUDIT_ACTIONS.ACADEMIC_YEAR_CREATED,
  AUDIT_ACTIONS.ACADEMIC_YEAR_UPDATED,
  AUDIT_ACTIONS.QUOTA_DEFAULT_UPDATED,
  AUDIT_ACTIONS.QUOTA_LECTURER_UPDATED,
];

export const ENTITY_TYPES = {
  THESIS: "THESIS",
  THESIS_ADVISOR_REQUEST: "THESIS_ADVISOR_REQUEST",
  THESIS_CHANGE_REQUEST: "THESIS_CHANGE_REQUEST",
  THESIS_GUIDANCE: "THESIS_GUIDANCE",
  THESIS_MILESTONE: "THESIS_MILESTONE",
  // Request Pembimbing 2 (modul TA) — record internal berbasis Notification,
  // dibedakan dari ThesisAdvisorRequest (TA-01/TA-02) agar audit trail akurat.
  SUPERVISOR2_REQUEST: "SUPERVISOR2_REQUEST",
  USER: "USER",
  ACADEMIC_YEAR: "ACADEMIC_YEAR",
  SUPERVISION_QUOTA: "SUPERVISION_QUOTA",
  SUPERVISION_QUOTA_DEFAULT: "SUPERVISION_QUOTA_DEFAULT",
};

export async function logAudit({
  actorUserId = null,
  action,
  entityType,
  entityId = null,
  oldValues = null,
  newValues = null,
  metadata = null,
  ipAddress = null,
  userAgent = null,
} = {}) {
  if (!action || !entityType) return null;

  try {
    return await prisma.auditLog.create({
      data: {
        userId: actorUserId,
        action,
        entity: entityType,
        entityId,
        changes:
          oldValues != null || newValues != null || metadata != null
            ? {
                oldValues: oldValues ?? null,
                newValues: newValues ?? null,
                metadata: metadata ?? null,
              }
            : null,
        ipAddress,
        userAgent,
      },
    });
  } catch (error) {
    console.error("[AuditLog] Failed to persist audit log:", error?.message || error);
    return null;
  }
}

export async function listAdminAuditLogs({
  page = 1,
  pageSize = 20,
  action = null,
  entity = null,
} = {}) {
  const take = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
  const currentPage = Math.max(Number(page) || 1, 1);
  const skip = (currentPage - 1) * take;

  const where = {
    action:
      action && ADMIN_AUDIT_ACTIONS.includes(action)
        ? action
        : { in: ADMIN_AUDIT_ACTIONS },
    ...(entity ? { entity } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      select: {
        id: true,
        userId: true,
        action: true,
        entity: true,
        entityId: true,
        changes: true,
        createdAt: true,
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  const userIds = [...new Set(rows.map((row) => row.userId).filter(Boolean))];
  const actors = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, fullName: true, email: true, identityNumber: true },
      })
    : [];
  const actorById = new Map(actors.map((actor) => [actor.id, actor]));

  return {
    logs: rows.map((row) => ({
      id: row.id,
      action: row.action,
      entity: row.entity,
      entityId: row.entityId,
      changes: row.changes,
      createdAt: row.createdAt,
      actor: row.userId
        ? {
            id: row.userId,
            fullName: actorById.get(row.userId)?.fullName ?? null,
            email: actorById.get(row.userId)?.email ?? null,
            identityNumber: actorById.get(row.userId)?.identityNumber ?? null,
          }
        : null,
    })),
    meta: {
      page: currentPage,
      pageSize: take,
      total,
      totalPages: Math.max(1, Math.ceil(total / take)),
    },
  };
}

export default {
  logAudit,
  listAdminAuditLogs,
  AUDIT_ACTIONS,
  ADMIN_AUDIT_ACTIONS,
  ENTITY_TYPES,
};
