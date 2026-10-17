/**
 * Evaluasi Bimbingan (formulir TA-17).
 *
 * The Pembimbing 1 evaluates a thesis that is in `research` and has not passed its results
 * seminar, when the supervision clock reaches a stage:
 *
 *   six months           Lanjut Bimbingan | Peringatan dan Perpanjangan 1 Bulan
 *   extension ended      Lanjut Bimbingan | Mengulang Proposal
 *   one year             Lanjut Bimbingan (notes required) | Dihentikan
 *
 * "Lanjut Bimbingan" is recorded at once. Every other recommendation waits for the Ketua
 * Departemen, who approves (the consequence is applied in the same transaction) or rejects
 * (nothing happens and the Pembimbing 1 may fill a new evaluation). There is no cron: what
 * is due is derived from the supervision clock when it is read.
 */
import prisma from "../config/prisma.js";
import * as repo from "../repositories/thesis-guidance-evaluation.repository.js";
import { ROLES, isPembimbing1, isPembimbing2 } from "../constants/roles.js";
import { pageAcrossGroups, pageMeta, pageWindow, priorityGroups } from "../helpers/priority-paging.helper.js";
import { THESIS_STATUS, THESIS_TERMINATION_REASON } from "../constants/thesisStatus.js";
import {
  EVALUATION_DUE_LABELS,
  GUIDANCE_EVALUATION_RECOMMENDATION_LABELS,
  GUIDANCE_EVALUATION_TYPE_LABELS,
  THESIS_STATUS_LABELS,
} from "../constants/thesisLabels.js";
import {
  EVALUATION_RECOMMENDATION,
  EVALUATION_STAGES,
  EVALUATION_STATUS,
  EVALUATION_STATUS_PRIORITY,
  EVALUATION_VIEW_STATUS,
  OBSERVATION_KEYS,
} from "../constants/thesis-guidance-evaluation.js";
import { EVALUATION_DUE, hasPassedSeminar, summarizeThesisProgress } from "../helpers/thesis-progress.helper.js";
import { formatAcademicYearLabel } from "../helpers/academicYear.helper.js";
import { formatDateTimeWib } from "../utils/date.util.js";
import { AUDIT_ACTIONS, ENTITY_TYPES } from "./auditLog.service.js";
import { THESIS_COMPLETED_EVALUATION_NOTE, changeThesisStatus, returnThesisToProposal } from "./thesisLifecycle.service.js";
import { createNotificationsForUsers } from "./notification.service.js";
import { sendFcmToUsers } from "./push.service.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../utils/errors.js";

const OBSERVATION_COLUMNS = Object.freeze({
  noGuidance: "observedNoGuidance",
  noProgress: "observedNoProgress",
  noResponse: "observedNoResponse",
  noRevision: "observedNoRevision",
});

const person = (user) => (user ? { id: user.id, name: user.fullName ?? null, identityNumber: user.identityNumber ?? null } : null);

function addOneMonth(date) {
  const result = new Date(date.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

/** Stage a stored evaluation belongs to, for labels. */
function stageOf(evaluation) {
  if (evaluation.evaluationType === EVALUATION_DUE.ONE_YEAR) return EVALUATION_DUE.ONE_YEAR;
  return evaluation.isFollowUp ? EVALUATION_DUE.EXTENSION_FOLLOW_UP : EVALUATION_DUE.SIX_MONTH;
}

function toDto(evaluation) {
  const decided = evaluation.status !== EVALUATION_STATUS.PENDING;
  const byKadep = decided && evaluation.recommendation !== EVALUATION_RECOMMENDATION.CONTINUE;
  return {
    id: evaluation.id,
    thesisId: evaluation.thesisId,
    student: person(evaluation.thesis?.student?.user),
    thesisTitle: evaluation.thesis?.title ?? null,
    supervisor: person(evaluation.thesisSupervisor?.lecturer?.user),
    evaluationType: evaluation.evaluationType,
    stage: stageOf(evaluation),
    recommendation: evaluation.recommendation,
    status: evaluation.status,
    // "Lanjut Bimbingan" is recorded without the Ketua Departemen.
    requiresKadep: evaluation.recommendation !== EVALUATION_RECOMMENDATION.CONTINUE,
    observations: Object.fromEntries(OBSERVATION_KEYS.map((key) => [key, !!evaluation[OBSERVATION_COLUMNS[key]]])),
    notes: evaluation.notes ?? null,
    basis: {
      guidanceCount: evaluation.guidanceCount ?? 0,
      supervisionStartedAt: evaluation.supervisionStartedAt ?? null,
      elapsedDays: evaluation.elapsedDays ?? null,
    },
    extensionUntil: evaluation.extensionUntil ?? null,
    decision: byKadep
      ? {
        by: person(evaluation.kadepApprover),
        notes: evaluation.kadepNotes ?? null,
        at: evaluation.kadepApprovedAt ?? null,
        // Lanjutan Paket E7: closed by the system when the thesis became Selesai (status stays rejected).
        closedBySystem: !evaluation.kadepApprovedBy && evaluation.kadepNotes === THESIS_COMPLETED_EVALUATION_NOTE,
      }
      : null,
    createdAt: evaluation.createdAt,
  };
}

/** Role of the user on a thesis: `student`, `pembimbing_1`, `pembimbing_2`, or null. */
function viewerRoleOn(thesis, userId) {
  if (thesis.student?.user?.id === userId || thesis.studentId === userId) return "student";
  const relation = thesis.thesisSupervisors.find((s) => s.lecturerId === userId);
  if (!relation) return null;
  if (isPembimbing1(relation.role?.name)) return "pembimbing_1";
  if (isPembimbing2(relation.role?.name)) return "pembimbing_2";
  return null;
}

/**
 * Why "Isi Evaluasi" is not available now, or null when it is. The same check runs again on
 * submission (K14).
 */
function getSubmitBlockReason(thesis, clock, { viewerRole, hasPending }) {
  if (viewerRole !== "pembimbing_1") return "Evaluasi bimbingan diisi oleh Pembimbing 1.";
  if (thesis.status !== THESIS_STATUS.RESEARCH) {
    return `Evaluasi bimbingan hanya untuk tugas akhir berstatus "${THESIS_STATUS_LABELS.research}". Status saat ini: "${THESIS_STATUS_LABELS[thesis.status] ?? "-"}".`;
  }
  if (hasPassedSeminar(thesis)) return "Evaluasi bimbingan hanya untuk tugas akhir yang belum lulus seminar hasil.";
  if (hasPending) return "Masih ada evaluasi yang menunggu keputusan Ketua Departemen.";
  if (clock.evaluationDue) return null;
  if (!clock.startedAt) return "Tanggal mulai bimbingan belum diisi.";

  const now = Date.now();
  if (clock.extensionUntil && now <= clock.extensionUntil.getTime()) {
    return `Belum waktunya: perpanjangan berlaku sampai ${formatDateTimeWib(clock.extensionUntil)}. Tindak lanjut dapat diisi setelahnya.`;
  }
  if (now < clock.sixMonthAt.getTime()) {
    return `Belum waktunya: evaluasi 6 bulan dapat diisi mulai ${formatDateTimeWib(clock.sixMonthAt)}.`;
  }
  if (now < clock.oneYearAt.getTime()) {
    return `Evaluasi untuk tahap ini sudah tercatat. Evaluasi 1 tahun dapat diisi mulai ${formatDateTimeWib(clock.oneYearAt)}.`;
  }
  return "Evaluasi 1 tahun sudah tercatat.";
}

// ── Reading ──────────────────────────────────────────────────────────────────────────

/**
 * What a thesis page shows about guidance evaluations: the basis (filled automatically,
 * read-only), what is due, whether the Pembimbing 1 may fill one now and why not, the
 * evaluation waiting for a decision, the history, and the running academic warning.
 * `thesisId` omitted = the caller's own thesis.
 */
export async function getEvaluationContext(userId, thesisId = null, { asDepartment = false } = {}) {
  const targetId = thesisId ?? (await repo.findStudentThesisId(userId));
  if (!targetId) {
    return { thesis: null, viewerRole: "student", stage: null, canSubmit: false, blockReason: "Anda belum memiliki tugas akhir.", openEvaluation: null, history: [], academicWarning: null, basis: null, allowedRecommendations: [] };
  }
  const thesis = await repo.findThesisForEvaluation(targetId);
  if (!thesis) throw new NotFoundError("Tugas akhir tidak ditemukan.");

  const viewerRole = viewerRoleOn(thesis, userId) ?? (asDepartment ? "department" : null);
  if (!viewerRole) throw new ForbiddenError("Anda tidak memiliki akses ke tugas akhir ini.");

  const [evaluations, guidanceCount] = await Promise.all([repo.findByThesisId(thesis.id), repo.countCompletedGuidances(thesis.id)]);
  const progress = summarizeThesisProgress({ ...thesis, thesisGuidanceEvaluations: evaluations });
  const clock = progress.supervisionClock;
  const open = evaluations.find((evaluation) => evaluation.status === EVALUATION_STATUS.PENDING) ?? null;
  const blockReason = getSubmitBlockReason(thesis, clock, { viewerRole, hasPending: !!open });
  const stage = clock.evaluationDue;

  return {
    thesis: {
      id: thesis.id,
      title: thesis.title,
      status: thesis.status,
      student: person(thesis.student?.user),
    },
    viewerRole,
    // Basis of the evaluation: filled by the system, read-only in the form.
    basis: {
      guidanceCount,
      supervisionStartedAt: clock.startedAt,
      elapsedDays: clock.elapsedDays,
      elapsedLabel: clock.elapsedLabel,
      startSemester: thesis.academicYear ? formatAcademicYearLabel(thesis.academicYear) : null,
      activityLevel: progress.activityLevel,
    },
    supervisionClock: clock,
    stage,
    allowedRecommendations: stage ? EVALUATION_STAGES[stage].recommendations : [],
    canSubmit: !blockReason,
    blockReason,
    openEvaluation: open ? toDto(open) : null,
    history: evaluations.filter((evaluation) => evaluation.status !== EVALUATION_STATUS.PENDING).map(toDto),
    // Running while the extension granted by the six-month evaluation has no follow-up yet.
    academicWarning:
      thesis.status === THESIS_STATUS.RESEARCH && clock.extensionUntil
        ? { extensionUntil: clock.extensionUntil, followUpDue: stage === EVALUATION_DUE.EXTENSION_FOLLOW_UP }
        : null,
  };
}

// ── Tugas Akhir > Evaluasi (Lanjutan Paket E4, Paket E5) ─────────────────────────────

function evaluationSearchWhere(keyword) {
  if (!keyword) return {};
  return { thesis: { student: { user: { OR: [{ fullName: { contains: keyword } }, { identityNumber: { contains: keyword } }] } } } };
}

const CONTINUE = EVALUATION_RECOMMENDATION.CONTINUE;
/** Conditions of each row status of the Ketua Departemen's table. */
const EVALUATION_VIEW_WHERE = Object.freeze({
  [EVALUATION_VIEW_STATUS.AWAITING_DECISION]: { status: EVALUATION_STATUS.PENDING },
  [EVALUATION_VIEW_STATUS.APPROVED]: { status: EVALUATION_STATUS.APPROVED, recommendation: { not: CONTINUE } },
  [EVALUATION_VIEW_STATUS.REJECTED]: { status: EVALUATION_STATUS.REJECTED },
  [EVALUATION_VIEW_STATUS.RECORDED]: { recommendation: CONTINUE, status: { not: EVALUATION_STATUS.PENDING } },
});
const NEWEST = Object.freeze([{ createdAt: "desc" }, { id: "desc" }]);

/** The status a row shows: waiting for the decision, decided, or recorded ("Lanjut Bimbingan"). */
export function evaluationViewStatusOf(evaluation) {
  if (evaluation.status === EVALUATION_STATUS.PENDING) return EVALUATION_VIEW_STATUS.AWAITING_DECISION;
  if (evaluation.recommendation === CONTINUE) return EVALUATION_VIEW_STATUS.RECORDED;
  return evaluation.status;
}

/**
 * Tugas Akhir > Evaluasi (Ketua Departemen, Paket E5): every guidance evaluation, "Semua" by
 * default and sorted by `EVALUATION_STATUS_PRIORITY` on the server (waiting for the decision
 * first, newest first inside a group); the Status filter and the search by name or NIM narrow
 * it. Supervisors fill evaluations from Mahasiswa Bimbingan and have no Evaluasi page. No row
 * limit: each group is paged by the database.
 */
export async function listInbox(userId, { status = null, search = "", page = 1, pageSize = 10 } = {}) {
  const window = pageWindow({ page, pageSize });
  const keyword = String(search ?? "").trim();
  const only = Object.hasOwn(EVALUATION_STATUS_PRIORITY, status) ? status : null;
  const groups = priorityGroups(EVALUATION_STATUS_PRIORITY, only).map((members) => ({
    key: members.join("+"),
    where: { AND: [{ OR: members.map((member) => EVALUATION_VIEW_WHERE[member]) }, evaluationSearchWhere(keyword)] },
    orderBy: NEWEST,
  }));
  const [paged, awaitingDecision] = await Promise.all([
    pageAcrossGroups(groups, window, {
      count: (where) => repo.countEvaluations(where),
      find: (where, orderBy, part) => repo.findEvaluationPage(where, orderBy, part),
    }),
    repo.countEvaluations(EVALUATION_VIEW_WHERE[EVALUATION_VIEW_STATUS.AWAITING_DECISION]),
  ]);
  return {
    data: paged.rows.map(({ row }) => ({ ...toDto(row), viewStatus: evaluationViewStatusOf(row) })),
    meta: pageMeta(window, paged.total),
    counts: { awaitingDecision },
  };
}

export function countPending() {
  return repo.countPending();
}

// ── Notifications ────────────────────────────────────────────────────────────────────

async function notify(userIds, title, message, data = {}) {
  const targets = [...new Set((userIds ?? []).filter(Boolean))];
  if (targets.length === 0) return;
  await createNotificationsForUsers(targets, { title, message });
  sendFcmToUsers(targets, { title, body: message, data: { type: "thesis_guidance_evaluation", ...data } }).catch((error) =>
    console.error("[FCM] Error sending guidance evaluation notification:", error?.message || error),
  );
}

const stageLabel = (evaluation) =>
  evaluation.isFollowUp ? "Tindak Lanjut Evaluasi 6 Bulan" : GUIDANCE_EVALUATION_TYPE_LABELS[evaluation.evaluationType];

// ── Writing ──────────────────────────────────────────────────────────────────────────

/**
 * Pembimbing 1 fills an evaluation. The stage and the evaluation type come from the
 * supervision clock, never from the client. "Lanjut Bimbingan" is recorded at once; the
 * other recommendations wait for the Ketua Departemen.
 */
export async function submitEvaluation(userId, input) {
  const { thesisId, recommendation, observations = {}, notes } = input;
  const cleanNotes = String(notes ?? "").trim();

  const created = await prisma.$transaction(async (tx) => {
    const thesis = await repo.findThesisForEvaluation(thesisId, tx);
    if (!thesis) throw new NotFoundError("Tugas akhir tidak ditemukan.");
    const viewerRole = viewerRoleOn(thesis, userId);
    if (!viewerRole || viewerRole === "student") throw new ForbiddenError("Anda bukan pembimbing aktif tugas akhir ini.");

    const evaluations = await repo.findByThesisId(thesis.id, tx);
    const clock = summarizeThesisProgress({ ...thesis, thesisGuidanceEvaluations: evaluations }).supervisionClock;
    const hasPending = evaluations.some((evaluation) => evaluation.status === EVALUATION_STATUS.PENDING);
    const blockReason = getSubmitBlockReason(thesis, clock, { viewerRole, hasPending });
    if (blockReason) {
      if (viewerRole !== "pembimbing_1") throw new ForbiddenError(blockReason);
      throw new BadRequestError(blockReason);
    }

    const stage = clock.evaluationDue;
    if (input.stage && input.stage !== stage) {
      throw new BadRequestError(`Tahap evaluasi sudah berubah menjadi "${EVALUATION_DUE_LABELS[stage]}". Muat ulang halaman lalu isi kembali.`);
    }
    const rule = EVALUATION_STAGES[stage];
    if (!rule.recommendations.includes(recommendation)) {
      const allowed = rule.recommendations.map((value) => `"${GUIDANCE_EVALUATION_RECOMMENDATION_LABELS[value]}"`).join(" atau ");
      throw new BadRequestError(`Keputusan untuk tahap ini harus ${allowed}.`);
    }
    if (stage === EVALUATION_DUE.ONE_YEAR && recommendation === EVALUATION_RECOMMENDATION.CONTINUE && !cleanNotes) {
      throw new BadRequestError("Catatan wajib diisi untuk melanjutkan bimbingan pada evaluasi 1 tahun.");
    }

    const relation = thesis.thesisSupervisors.find((s) => s.lecturerId === userId);
    const immediate = recommendation === EVALUATION_RECOMMENDATION.CONTINUE;
    const row = await tx.thesisGuidanceEvaluation.create({
      data: {
        thesisId: thesis.id,
        thesisSupervisorId: relation.id,
        evaluationType: rule.evaluationType,
        isFollowUp: rule.isFollowUp,
        ...Object.fromEntries(OBSERVATION_KEYS.map((key) => [OBSERVATION_COLUMNS[key], !!observations[key]])),
        notes: cleanNotes || null,
        guidanceCount: await repo.countCompletedGuidances(thesis.id, tx),
        supervisionStartedAt: clock.startedAt,
        elapsedDays: clock.elapsedDays,
        recommendation,
        status: immediate ? EVALUATION_STATUS.APPROVED : EVALUATION_STATUS.PENDING,
      },
      select: { id: true },
    });
    await tx.auditLog.create({
      data: {
        userId,
        action: AUDIT_ACTIONS.GUIDANCE_EVALUATION_SUBMITTED,
        entity: ENTITY_TYPES.THESIS_GUIDANCE_EVALUATION,
        entityId: row.id,
        changes: { oldValues: null, newValues: { thesisId: thesis.id, stage, recommendation, recordedAtOnce: immediate }, metadata: null },
      },
    });
    return { id: row.id, thesis };
  });

  const evaluation = await repo.findById(created.id);
  const studentName = created.thesis.student?.user?.fullName ?? "mahasiswa";
  const others = created.thesis.thesisSupervisors.map((s) => s.lecturerId).filter((id) => id !== userId);
  const decisionLabel = GUIDANCE_EVALUATION_RECOMMENDATION_LABELS[recommendation];
  const data = { evaluationId: created.id, thesisId };
  if (evaluation.status === EVALUATION_STATUS.PENDING) {
    const kadep = (await repo.findUsersByActiveRole(ROLES.KETUA_DEPARTEMEN)).map((user) => user.id);
    await notify(kadep, "Evaluasi Bimbingan", `${stageLabel(evaluation)} untuk ${studentName} (${decisionLabel}) menunggu keputusan Ketua Departemen.`, data);
    await notify([created.thesis.student?.user?.id, ...others], "Evaluasi Bimbingan", `${stageLabel(evaluation)} untuk ${studentName} telah diisi dengan keputusan pembimbing "${decisionLabel}" dan menunggu keputusan Ketua Departemen.`, data);
  } else {
    await notify([created.thesis.student?.user?.id, ...others], "Evaluasi Bimbingan", `${stageLabel(evaluation)} untuk ${studentName} tercatat: ${decisionLabel}.`, data);
  }
  return toDto(evaluation);
}

/**
 * The consequence of an approved recommendation, in the caller's transaction:
 * - extension: one month from the decision, and the student receives an academic warning;
 * - repeat the proposal: research -> proposal (see `returnThesisToProposal`);
 * - termination: status `failed` with reason `supervision_evaluation`, supervisors
 *   released and open sessions cancelled (K21).
 */
async function applyApprovedEvaluation(tx, evaluation, userId, now) {
  if (evaluation.recommendation === EVALUATION_RECOMMENDATION.EXTEND_1_MONTH) {
    const extensionUntil = addOneMonth(now);
    await tx.thesisGuidanceEvaluation.update({ where: { id: evaluation.id }, data: { extensionUntil } });
    return { extensionUntil };
  }
  const thesis = await tx.thesis.findUnique({ where: { id: evaluation.thesisId } });
  if (!thesis) throw new NotFoundError("Tugas akhir tidak ditemukan.");
  if (thesis.status !== THESIS_STATUS.RESEARCH) {
    throw new BadRequestError(
      `Keputusan evaluasi tidak dapat diterapkan: tugas akhir berstatus "${THESIS_STATUS_LABELS[thesis.status] ?? "-"}". Tolak evaluasi ini.`,
    );
  }
  if (evaluation.recommendation === EVALUATION_RECOMMENDATION.REVISE_PROPOSAL) {
    return returnThesisToProposal(tx, thesis, { actorUserId: userId, evaluationId: evaluation.id, now });
  }
  if (evaluation.recommendation === EVALUATION_RECOMMENDATION.TERMINATE_SUPERVISION) {
    return changeThesisStatus(tx, thesis, THESIS_STATUS.FAILED, {
      actorUserId: userId,
      terminationReason: THESIS_TERMINATION_REASON.SUPERVISION_EVALUATION,
      terminationNote: evaluation.notes ?? null,
      now,
    });
  }
  return {};
}

/** The Ketua Departemen approves (and the consequence is applied) or rejects an evaluation. */
export async function decideAsKadep(userId, evaluationId, { approve, notes }) {
  const reason = String(notes ?? "").trim();
  if (!approve && !reason) throw new BadRequestError("Catatan wajib diisi saat menolak evaluasi.");

  await prisma.$transaction(async (tx) => {
    const evaluation = await repo.findById(evaluationId, tx);
    if (!evaluation) throw new NotFoundError("Evaluasi bimbingan tidak ditemukan.");
    if (evaluation.status !== EVALUATION_STATUS.PENDING) throw new BadRequestError("Evaluasi ini sudah diputuskan.");

    const now = new Date();
    await tx.thesisGuidanceEvaluation.update({
      where: { id: evaluationId },
      data: {
        status: approve ? EVALUATION_STATUS.APPROVED : EVALUATION_STATUS.REJECTED,
        kadepApprovedBy: userId,
        kadepApprovedAt: now,
        kadepNotes: reason || null,
      },
    });
    const effects = approve ? await applyApprovedEvaluation(tx, evaluation, userId, now) : {};
    await tx.auditLog.create({
      data: {
        userId,
        action: approve ? AUDIT_ACTIONS.GUIDANCE_EVALUATION_APPROVED : AUDIT_ACTIONS.GUIDANCE_EVALUATION_REJECTED,
        entity: ENTITY_TYPES.THESIS_GUIDANCE_EVALUATION,
        entityId: evaluationId,
        changes: {
          oldValues: { status: EVALUATION_STATUS.PENDING },
          newValues: { status: approve ? EVALUATION_STATUS.APPROVED : EVALUATION_STATUS.REJECTED, notes: reason || null },
          metadata: {
            recommendation: evaluation.recommendation,
            extensionUntil: effects?.extensionUntil ?? null,
            cancelledGuidances: effects?.cancelledGuidances ?? 0,
          },
        },
      },
    });
  });

  const evaluation = await repo.findById(evaluationId);
  const studentUserId = evaluation.thesis?.student?.user?.id;
  const studentName = evaluation.thesis?.student?.user?.fullName ?? "mahasiswa";
  const decisionLabel = GUIDANCE_EVALUATION_RECOMMENDATION_LABELS[evaluation.recommendation];
  const data = { evaluationId, thesisId: evaluation.thesisId };
  // Supervisors as they were when the evaluation was filled (a termination releases them).
  const supervisors = await prisma.thesisSupervisors.findMany({ where: { thesisId: evaluation.thesisId }, select: { lecturerId: true } });
  const lecturerIds = supervisors.map((s) => s.lecturerId).filter((id) => id !== userId);

  if (!approve) {
    await notify([studentUserId, ...lecturerIds], "Evaluasi Bimbingan Ditolak", `${stageLabel(evaluation)} untuk ${studentName} (${decisionLabel}) ditolak Ketua Departemen. Catatan: ${reason}`, data);
  } else if (evaluation.recommendation === EVALUATION_RECOMMENDATION.EXTEND_1_MONTH) {
    await notify([studentUserId], "Peringatan Akademik", `Berdasarkan evaluasi bimbingan 6 bulan, Anda menerima peringatan akademik dan perpanjangan masa bimbingan sampai ${formatDateTimeWib(evaluation.extensionUntil)}. Tingkatkan kemajuan tugas akhir Anda sebelum batas itu.`, data);
    await notify(lecturerIds, "Evaluasi Bimbingan Disetujui", `Peringatan dan perpanjangan 1 bulan untuk ${studentName} disetujui. Batas perpanjangan: ${formatDateTimeWib(evaluation.extensionUntil)}.`, data);
  } else {
    const consequence =
      evaluation.recommendation === EVALUATION_RECOMMENDATION.REVISE_PROPOSAL
        ? "Tugas akhir kembali ke tahap proposal. Unggah proposal revisi di Tugas Akhir > Proposal; bimbingan dan milestone terbuka lagi setelah Pembimbing 1 menyetujuinya."
        : "Tugas akhir dihentikan.";
    await notify([studentUserId, ...lecturerIds], "Evaluasi Bimbingan Disetujui", `${stageLabel(evaluation)} untuk ${studentName} disetujui Ketua Departemen: ${decisionLabel}. ${consequence}`, data);
  }
  return toDto(evaluation);
}
