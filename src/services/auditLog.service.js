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
  USER_UPDATED: "USER_UPDATED",
  USER_ROLES_UPDATED: "USER_ROLES_UPDATED",
  USER_ACTIVATION_CHANGED: "USER_ACTIVATION_CHANGED",
  USERS_IMPORTED: "USERS_IMPORTED",
  STUDENT_STATUS_CHANGED: "STUDENT_STATUS_CHANGED",
  STUDENT_ACADEMIC_UPDATED: "STUDENT_ACADEMIC_UPDATED",
  LECTURER_UPDATED: "LECTURER_UPDATED",
  ACADEMIC_YEAR_CREATED: "ACADEMIC_YEAR_CREATED",
  ACADEMIC_YEAR_UPDATED: "ACADEMIC_YEAR_UPDATED",
  SUPERVISION_LIMIT_UPDATED: "SUPERVISION_LIMIT_UPDATED",
  RESEARCH_METHOD_ASSESSMENT_SUBMITTED: "RESEARCH_METHOD_ASSESSMENT_SUBMITTED",
  RESEARCH_METHOD_PROMOTED: "RESEARCH_METHOD_PROMOTED",
  FINAL_PROPOSAL_SUBMITTED: "FINAL_PROPOSAL_SUBMITTED",
  PROPOSAL_REVISION_SUBMITTED: "PROPOSAL_REVISION_SUBMITTED",
  PROPOSAL_REVISION_APPROVED: "PROPOSAL_REVISION_APPROVED",
  PROPOSAL_REVISION_REVISION_REQUESTED: "PROPOSAL_REVISION_REVISION_REQUESTED",
  SUPERVISOR_REQUEST_TIME_OVERRIDDEN: "SUPERVISOR_REQUEST_TIME_OVERRIDDEN",
  // Semester flags set by the Admin, or handed back to SIA
  STUDENT_PERIOD_FLAGS_SET: "STUDENT_PERIOD_FLAGS_SET",
  STUDENT_PERIOD_FLAGS_FOLLOW_SIA: "STUDENT_PERIOD_FLAGS_FOLLOW_SIA",
  // Bulk import of semester flags, with the row counts
  STUDENT_PERIOD_FLAGS_IMPORTED: "STUDENT_PERIOD_FLAGS_IMPORTED",
  // CPMK, assessment criteria, rubrics and minimum scores of the proposal and TA master data
  ASSESSMENT_MASTER_CHANGED: "ASSESSMENT_MASTER_CHANGED",
};

/**
 * Sensitive actions shown on the Log Aktivitas page: account and master data changes, and the
 * decisions of the Ketua Departemen. Routine student activity (sessions, milestones, readiness)
 * stays in the table but is not listed.
 */
export const ACTIVITY_LOG_ACTIONS = [
  AUDIT_ACTIONS.USER_CREATED,
  AUDIT_ACTIONS.USER_UPDATED,
  AUDIT_ACTIONS.USER_ROLES_UPDATED,
  AUDIT_ACTIONS.USER_ACTIVATION_CHANGED,
  AUDIT_ACTIONS.USERS_IMPORTED,
  AUDIT_ACTIONS.STUDENT_STATUS_CHANGED,
  AUDIT_ACTIONS.STUDENT_ACADEMIC_UPDATED,
  AUDIT_ACTIONS.STUDENT_PERIOD_FLAGS_SET,
  AUDIT_ACTIONS.STUDENT_PERIOD_FLAGS_FOLLOW_SIA,
  AUDIT_ACTIONS.STUDENT_PERIOD_FLAGS_IMPORTED,
  AUDIT_ACTIONS.LECTURER_UPDATED,
  AUDIT_ACTIONS.THESIS_CREATED,
  AUDIT_ACTIONS.THESIS_UPDATED,
  AUDIT_ACTIONS.THESIS_STATUS_CHANGED,
  AUDIT_ACTIONS.THESIS_DELETED,
  AUDIT_ACTIONS.ACADEMIC_YEAR_CREATED,
  AUDIT_ACTIONS.ACADEMIC_YEAR_UPDATED,
  AUDIT_ACTIONS.SUPERVISION_LIMIT_UPDATED,
  AUDIT_ACTIONS.ASSESSMENT_MASTER_CHANGED,
  AUDIT_ACTIONS.SUPERVISOR_ASSIGNMENT_ISSUED,
  AUDIT_ACTIONS.SUPERVISOR_REQUEST_KADEP_APPROVED,
  AUDIT_ACTIONS.SUPERVISOR_REQUEST_KADEP_REJECTED,
  AUDIT_ACTIONS.SUPERVISOR_REQUEST_KADEP_REDIRECTED,
  AUDIT_ACTIONS.SUPERVISOR_REQUEST_KADEP_REVISION_REQUESTED,
  AUDIT_ACTIONS.CHANGE_REQUEST_APPROVED,
  AUDIT_ACTIONS.CHANGE_REQUEST_REJECTED,
  AUDIT_ACTIONS.GUIDANCE_EVALUATION_APPROVED,
  AUDIT_ACTIONS.GUIDANCE_EVALUATION_REJECTED,
];

export const ENTITY_TYPES = {
  THESIS: "THESIS",
  THESIS_SUPERVISOR_REQUEST: "THESIS_SUPERVISOR_REQUEST",
  SUPERVISOR_ASSIGNMENT_BATCH: "SUPERVISOR_ASSIGNMENT_BATCH",
  RESEARCH_METHOD_ASSESSMENT: "RESEARCH_METHOD_ASSESSMENT",
  THESIS_PROPOSAL_REVISION: "THESIS_PROPOSAL_REVISION",
  THESIS_CHANGE_REQUEST: "THESIS_CHANGE_REQUEST",
  THESIS_GUIDANCE: "THESIS_GUIDANCE",
  THESIS_GUIDANCE_EVALUATION: "THESIS_GUIDANCE_EVALUATION",
  THESIS_MILESTONE: "THESIS_MILESTONE",
  // Request Pembimbing 2 (modul TA) — record internal berbasis Notification,
  // dibedakan dari Pengajuan Pembimbing (thesis_supervisor_requests) agar audit trail akurat.
  SUPERVISOR2_REQUEST: "SUPERVISOR2_REQUEST",
  USER: "USER",
  STUDENT: "STUDENT",
  LECTURER: "LECTURER",
  ACADEMIC_YEAR: "ACADEMIC_YEAR",
  SUPERVISION_QUOTA: "SUPERVISION_QUOTA",
  CPMK: "CPMK",
  ASSESSMENT_CRITERIA: "ASSESSMENT_CRITERIA",
  ASSESSMENT_RUBRIC: "ASSESSMENT_RUBRIC",
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

const USER_ENTITIES = ["USER", "STUDENT", "LECTURER"];
const THESIS_ENTITIES = ["THESIS"];

function parseDate(value, endOfDay = false) {
  if (!value) return null;
  const text = String(value);
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}+07:00` : text);
  return Number.isNaN(date.getTime()) ? null : date;
}

const userLabel = (user) => (user ? [user.fullName, user.identityNumber].filter(Boolean).join(" · ") : null);
const semesterLabel = (year) => (year ? `${year.year} ${year.semester === "genap" ? "Genap" : "Ganjil"}` : null);

/** Display name of each logged object, looked up in batches. */
async function resolveObjectLabels(rows, client) {
  const ids = (entities) => [...new Set(rows.filter((r) => entities.includes(r.entity) && r.entityId).map((r) => r.entityId))];
  const userIds = ids(USER_ENTITIES);
  const thesisIds = ids(THESIS_ENTITIES);
  const yearIds = ids(["ACADEMIC_YEAR"]);
  const requestIds = ids(["THESIS_SUPERVISOR_REQUEST"]);
  const changeIds = ids(["THESIS_CHANGE_REQUEST"]);
  const evaluationIds = ids(["THESIS_GUIDANCE_EVALUATION"]);
  const thesisSelect = { id: true, title: true, student: { select: { user: { select: { fullName: true, identityNumber: true } } } } };
  const [users, theses, years, requests, changes, evaluations] = await Promise.all([
    userIds.length ? client.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true, identityNumber: true } }) : [],
    thesisIds.length ? client.thesis.findMany({ where: { id: { in: thesisIds } }, select: thesisSelect }) : [],
    yearIds.length ? client.academicYear.findMany({ where: { id: { in: yearIds } }, select: { id: true, year: true, semester: true } }) : [],
    requestIds.length
      ? client.thesisSupervisorRequest.findMany({ where: { id: { in: requestIds } }, select: { id: true, student: { select: { user: { select: { fullName: true, identityNumber: true } } } } } })
      : [],
    changeIds.length ? client.thesisChangeRequest.findMany({ where: { id: { in: changeIds } }, select: { id: true, thesis: { select: thesisSelect } } }) : [],
    evaluationIds.length ? client.thesisGuidanceEvaluation.findMany({ where: { id: { in: evaluationIds } }, select: { id: true, thesis: { select: thesisSelect } } }) : [],
  ]);
  const thesisLabel = (thesis) => (thesis ? userLabel(thesis.student?.user) ?? thesis.title ?? null : null);
  const labels = new Map();
  users.forEach((u) => labels.set(u.id, userLabel(u)));
  theses.forEach((t) => labels.set(t.id, thesisLabel(t)));
  years.forEach((y) => labels.set(y.id, semesterLabel(y)));
  requests.forEach((r) => labels.set(r.id, userLabel(r.student?.user)));
  changes.forEach((c) => labels.set(c.id, thesisLabel(c.thesis)));
  evaluations.forEach((e) => labels.set(e.id, thesisLabel(e.thesis)));
  return (row) => {
    const stored = row.changes?.metadata?.objectLabel;
    if (stored) return stored;
    if (row.entityId && labels.get(row.entityId)) return labels.get(row.entityId);
    const values = row.changes?.newValues ?? row.changes?.oldValues ?? {};
    return values?.name ?? values?.title ?? values?.code ?? null;
  };
}

/** Users and theses whose name, NIM/NIP, email or title matches the search text. */
async function findSearchMatches(search, client) {
  const text = String(search ?? "").trim();
  if (!text) return null;
  const [users, theses] = await Promise.all([
    client.user.findMany({
      where: { OR: [{ fullName: { contains: text } }, { identityNumber: { contains: text } }, { email: { contains: text } }] },
      select: { id: true },
      take: 500,
    }),
    client.thesis.findMany({
      where: { OR: [{ title: { contains: text } }, { student: { user: { fullName: { contains: text } } } }, { student: { user: { identityNumber: { contains: text } } } }] },
      select: { id: true },
      take: 500,
    }),
  ]);
  return { userIds: users.map((u) => u.id), thesisIds: theses.map((t) => t.id) };
}

/**
 * Log Aktivitas: the sensitive actions in `audit_logs`, newest first, paginated on the server.
 * Filters: action, entity (object type), search (actor or object), and a date range
 * (`YYYY-MM-DD`, Asia/Jakarta days).
 */
export async function listActivityLogs(
  { page = 1, pageSize = 20, action = null, entity = null, search = "", dateFrom = null, dateTo = null } = {},
  client = prisma,
) {
  const take = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
  const currentPage = Math.max(Number(page) || 1, 1);
  const skip = (currentPage - 1) * take;

  const and = [
    { action: action && ACTIVITY_LOG_ACTIONS.includes(action) ? action : { in: ACTIVITY_LOG_ACTIONS } },
  ];
  if (entity) and.push({ entity });
  const from = parseDate(dateFrom);
  const to = parseDate(dateTo, true);
  if (from || to) and.push({ createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } });
  const matches = await findSearchMatches(search, client);
  if (matches) {
    const objectIds = [...matches.userIds, ...matches.thesisIds];
    and.push({
      OR: [
        ...(matches.userIds.length ? [{ userId: { in: matches.userIds } }] : []),
        ...(objectIds.length ? [{ entityId: { in: objectIds } }] : []),
        { entityId: { equals: "__none__" } },
      ],
    });
  }
  const where = { AND: and };

  const [rows, total] = await Promise.all([
    client.auditLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take,
      select: { id: true, userId: true, action: true, entity: true, entityId: true, changes: true, createdAt: true },
    }),
    client.auditLog.count({ where }),
  ]);

  const userIds = [...new Set(rows.map((row) => row.userId).filter(Boolean))];
  const actors = userIds.length
    ? await client.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true, email: true, identityNumber: true } })
    : [];
  const actorById = new Map(actors.map((actor) => [actor.id, actor]));
  const objectLabelOf = await resolveObjectLabels(rows, client);

  return {
    logs: rows.map((row) => ({
      id: row.id,
      action: row.action,
      entity: row.entity,
      entityId: row.entityId,
      objectLabel: objectLabelOf(row),
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
    meta: { page: currentPage, pageSize: take, total, totalPages: Math.max(1, Math.ceil(total / take)) },
  };
}

/** Kept for existing callers. */
export const listAdminAuditLogs = listActivityLogs;

export default {
  logAudit,
  listActivityLogs,
  listAdminAuditLogs,
  AUDIT_ACTIONS,
  ACTIVITY_LOG_ACTIONS,
  ENTITY_TYPES,
};
