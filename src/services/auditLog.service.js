import prisma from "../config/prisma.js";

export const AUDIT_ACTIONS = {
  CHANGE_REQUEST_APPROVED: "CHANGE_REQUEST_APPROVED",
  CHANGE_REQUEST_CANCELLED: "CHANGE_REQUEST_CANCELLED",
  CHANGE_REQUEST_CREATED: "CHANGE_REQUEST_CREATED",
  CHANGE_REQUEST_REJECTED: "CHANGE_REQUEST_REJECTED",
  CHANGE_REQUEST_REVIEWED: "CHANGE_REQUEST_REVIEWED",
  DEFENCE_READINESS_APPROVED: "DEFENCE_READINESS_APPROVED",
  DEFENCE_READINESS_REVOKED: "DEFENCE_READINESS_REVOKED",
  DEFENCE_READINESS_REQUESTED: "DEFENCE_READINESS_REQUESTED",
  GUIDANCE_EVALUATION_SUBMITTED: "GUIDANCE_EVALUATION_SUBMITTED",
  GUIDANCE_EVALUATION_APPROVED: "GUIDANCE_EVALUATION_APPROVED",
  GUIDANCE_EVALUATION_REJECTED: "GUIDANCE_EVALUATION_REJECTED",
  GUIDANCE_REQUESTED: "GUIDANCE_REQUESTED",
  GUIDANCE_REJECTED: "GUIDANCE_REJECTED",
  GUIDANCE_CANCELLED: "GUIDANCE_CANCELLED",
  GUIDANCE_RESCHEDULED: "GUIDANCE_RESCHEDULED",
  GUIDANCE_SCHEDULE_OVERRIDDEN: "GUIDANCE_SCHEDULE_OVERRIDDEN",
  GUIDANCE_SUMMARY_REJECTED: "GUIDANCE_SUMMARY_REJECTED",
  MILESTONE_CREATED: "MILESTONE_CREATED",
  MILESTONE_FEEDBACK_ADDED: "MILESTONE_FEEDBACK_ADDED",
  MILESTONE_REVISION_REQUESTED: "MILESTONE_REVISION_REQUESTED",
  MILESTONE_SUBMITTED: "MILESTONE_SUBMITTED",
  MILESTONE_VALIDATED: "MILESTONE_VALIDATED",
  SUPERVISOR_ASSIGNMENT_ISSUED: "SUPERVISOR_ASSIGNMENT_ISSUED",
  SUPERVISOR_REQUEST_ACCEPTED: "SUPERVISOR_REQUEST_ACCEPTED",
  SUPERVISOR_REQUEST_CANCELLED: "SUPERVISOR_REQUEST_CANCELLED",
  SUPERVISOR_REQUEST_CREATED: "SUPERVISOR_REQUEST_CREATED",
  SUPERVISOR_REQUEST_FORWARDED_TO_KADEP: "SUPERVISOR_REQUEST_FORWARDED_TO_KADEP",
  SUPERVISOR_REQUEST_KADEP_APPROVED: "SUPERVISOR_REQUEST_KADEP_APPROVED",
  SUPERVISOR_REQUEST_KADEP_REDIRECTED: "SUPERVISOR_REQUEST_KADEP_REDIRECTED",
  SUPERVISOR_REQUEST_KADEP_REJECTED: "SUPERVISOR_REQUEST_KADEP_REJECTED",
  SUPERVISOR_REQUEST_KADEP_REVISION_REQUESTED: "SUPERVISOR_REQUEST_KADEP_REVISION_REQUESTED",
  SUPERVISOR_REQUEST_REJECTED: "SUPERVISOR_REQUEST_REJECTED",
  SUPERVISOR_REQUEST_REVIEWED: "SUPERVISOR_REQUEST_REVIEWED",
  SUPERVISOR_REQUEST_WITHDRAWN: "SUPERVISOR_REQUEST_WITHDRAWN",
  SEMINAR_READINESS_APPROVED: "SEMINAR_READINESS_APPROVED",
  SEMINAR_READINESS_REQUESTED: "SEMINAR_READINESS_REQUESTED",
  SEMINAR_READINESS_REVOKED: "SEMINAR_READINESS_REVOKED",
  THESIS_CREATED: "THESIS_CREATED",
  THESIS_DELETED: "THESIS_DELETED",
  THESIS_STATUS_CHANGED: "THESIS_STATUS_CHANGED",
  THESIS_UPDATED: "THESIS_UPDATED",
  USER_CREATED: "USER_CREATED",
  USER_ROLES_UPDATED: "USER_ROLES_UPDATED",
  ACADEMIC_YEAR_CREATED: "ACADEMIC_YEAR_CREATED",
  ACADEMIC_YEAR_UPDATED: "ACADEMIC_YEAR_UPDATED",
  SUPERVISION_LIMIT_UPDATED: "SUPERVISION_LIMIT_UPDATED",
  RESEARCH_METHOD_ATTENDANCE_IMPORTED: "RESEARCH_METHOD_ATTENDANCE_IMPORTED",
  RESEARCH_METHOD_ASSESSMENT_SUBMITTED: "RESEARCH_METHOD_ASSESSMENT_SUBMITTED",
  RESEARCH_METHOD_PROMOTED: "RESEARCH_METHOD_PROMOTED",
  FINAL_PROPOSAL_SUBMITTED: "FINAL_PROPOSAL_SUBMITTED",
  PROPOSAL_REVISION_SUBMITTED: "PROPOSAL_REVISION_SUBMITTED",
  PROPOSAL_REVISION_APPROVED: "PROPOSAL_REVISION_APPROVED",
  PROPOSAL_REVISION_REVISION_REQUESTED: "PROPOSAL_REVISION_REVISION_REQUESTED",
  SUPERVISOR_REQUEST_TIME_OVERRIDDEN: "SUPERVISOR_REQUEST_TIME_OVERRIDDEN",
};

/** Admin authorization mutations that the Admin read-surface lists by default. */
export const ADMIN_AUDIT_ACTIONS = [
  AUDIT_ACTIONS.USER_CREATED,
  AUDIT_ACTIONS.USER_ROLES_UPDATED,
  AUDIT_ACTIONS.ACADEMIC_YEAR_CREATED,
  AUDIT_ACTIONS.ACADEMIC_YEAR_UPDATED,
  AUDIT_ACTIONS.SUPERVISION_LIMIT_UPDATED,
];

export const ENTITY_TYPES = {
  THESIS: "THESIS",
  THESIS_SUPERVISOR_REQUEST: "THESIS_SUPERVISOR_REQUEST",
  SUPERVISOR_ASSIGNMENT_BATCH: "SUPERVISOR_ASSIGNMENT_BATCH",
  RESEARCH_METHOD_ASSESSMENT: "RESEARCH_METHOD_ASSESSMENT",
  RESEARCH_METHOD_ATTENDANCE_IMPORT: "RESEARCH_METHOD_ATTENDANCE_IMPORT",
  THESIS_PROPOSAL_REVISION: "THESIS_PROPOSAL_REVISION",
  THESIS_CHANGE_REQUEST: "THESIS_CHANGE_REQUEST",
  THESIS_GUIDANCE: "THESIS_GUIDANCE",
  THESIS_GUIDANCE_EVALUATION: "THESIS_GUIDANCE_EVALUATION",
  THESIS_MILESTONE: "THESIS_MILESTONE",
  // Request Pembimbing 2 (modul TA) — record internal berbasis Notification,
  // dibedakan dari Pengajuan Pembimbing (thesis_supervisor_requests) agar audit trail akurat.
  SUPERVISOR2_REQUEST: "SUPERVISOR2_REQUEST",
  USER: "USER",
  ACADEMIC_YEAR: "ACADEMIC_YEAR",
  SUPERVISION_QUOTA: "SUPERVISION_QUOTA",
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
