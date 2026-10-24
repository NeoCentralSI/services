/**
 * DEV TOOLS — Seminar Hasil and Sidang TA: move a seminar or defence to any status, with every
 * attribute that status carries, so the result equals the one reached through the modules.
 * ⚠️ DELETE THIS DIRECTORY (services/devtools/) together with routes/devtools*.route.js.
 *
 * The module services are not changed. What they export is called:
 *   - `completeThesisFromDefence` / `reopenThesisFromDefence` (thesis Selesai ↔ Penelitian);
 *   - `initiateRevisionItems` of both revision services (revision items from the examiner notes).
 * The rest of the result side effects live inside unexported code or inside service functions
 * that also notify; they are reproduced here and checked against the module path by
 * `test/integration/fathur/devtools-final-stages.parity.test.js`:
 *   - result: status, final score, `resultFinalizedAt/By`, examiner scores submitted;
 *   - Tidak Lulus: `seminarReady` / `defenceReady` of every supervisor back to false;
 *   - defence result: average, supervisor score, final score, grade;
 *   - revision approval and finalization (`revisionFinalizedAt/By`).
 * DevTools sends no notification: `announceThesisLifecycle` is not called.
 */
import prisma from "../../config/prisma.js";
import { ROLES } from "../../constants/roles.js";
import { getActiveAcademicYear } from "../../helpers/academicYear.helper.js";
import { mapScoreToGrade } from "../../utils/score.util.js";
import { computeEffectiveStatus } from "../../utils/seminarStatus.util.js";
import { computeEffectiveDefenceStatus } from "../../utils/defenceStatus.util.js";
import * as seminarExaminerRepo from "../../repositories/thesis-seminar/examiner.repository.js";
import * as defenceExaminerRepo from "../../repositories/thesis-defence/examiner.repository.js";
import { initiateRevisionItems as initiateSeminarRevisionItems } from "../thesis-seminar/revision.service.js";
import { initiateRevisionItems as initiateDefenceRevisionItems } from "../thesis-defence/revision.service.js";
import { completeThesisFromDefence, reopenThesisFromDefence } from "../thesisLifecycle.service.js";
import { AUDIT_ACTIONS, ENTITY_TYPES } from "../auditLog.service.js";
import { ENV } from "../../config/env.js";
import {
  BadRequestError,
  ConflictError,
  DAY,
  HOUR,
  MINUTE,
  NotFoundError,
  calendarDate,
  calendarText,
  clockText,
  clockValue,
  countCurrentOfficialDocuments,
  eventStart,
  findCurrentThesis,
  findLecturerWithRole,
  logDevtoolsChange,
  removeFiles,
  requireStudent,
  revokeOfficialDocuments,
  scheduleAround,
  writeSamplePdf,
} from "./devtools-support.js";

export const EVENT_STAGES = ["registered", "verified", "examiner_assigned", "scheduled"];
export const EVENT_RESULTS = ["passed", "passed_with_revision", "failed"];
export const EVENT_TARGETS = [...EVENT_STAGES, ...EVENT_RESULTS];

const STAGE_INDEX = { registered: 0, verified: 1, examiner_assigned: 2, scheduled: 3, passed: 4, passed_with_revision: 4, failed: 4, cancelled: -1 };

export const EVENT_STATUS_LABELS = {
  registered: "Terdaftar",
  verified: "Terverifikasi",
  examiner_assigned: "Penguji Ditetapkan",
  scheduled: "Terjadwal",
  ongoing: "Sedang Berlangsung",
  passed: "Lulus",
  passed_with_revision: "Lulus dengan Revisi",
  failed: "Tidak Lulus",
  cancelled: "Dibatalkan",
};

const DEFAULT_REVISION_NOTE = "Perbaiki penulisan dan lengkapi pembahasan sesuai catatan penguji.";
const MIN_SEMINAR_GUIDANCES = 8;
const MIN_DEFENCE_SKS = 142;

const KINDS = {
  seminar: {
    label: "Seminar Hasil",
    model: "thesisSeminar",
    examinerModel: "thesisSeminarExaminer",
    examinerFk: "thesisSeminarId",
    detailModel: "thesisSeminarExaminerAssessmentDetail",
    detailFk: "thesisSeminarExaminerId",
    revisionModel: "thesisSeminarRevision",
    revisionExaminer: "seminarExaminer",
    revisionFk: "seminarExaminerId",
    requirementModel: "thesisSeminarRequirement",
    requirementDocModel: "thesisSeminarRequirementDocument",
    requirementDocFk: "thesisSeminarId",
    requirementFk: "thesisSeminarRequirementId",
    readyFlag: "seminarReady",
    readyAction: AUDIT_ACTIONS.SEMINAR_READINESS_APPROVED,
    minExaminers: 1,
    folder: "seminar",
    room: "Ruang Seminar SI",
    resultDocuments: ["seminar_assessment_result"],
    scheduleDocuments: ["seminar_invitation", "seminar_audience_list"],
    effectiveStatus: computeEffectiveStatus,
    initiateRevisionItems: initiateSeminarRevisionItems,
  },
  defence: {
    label: "Sidang TA",
    model: "thesisDefence",
    examinerModel: "thesisDefenceExaminer",
    examinerFk: "thesisDefenceId",
    detailModel: "thesisDefenceExaminerAssessmentDetail",
    detailFk: "thesisDefenceExaminerId",
    revisionModel: "thesisDefenceRevision",
    revisionExaminer: "defenceExaminer",
    revisionFk: "defenceExaminerId",
    requirementModel: "thesisDefenceRequirement",
    requirementDocModel: "thesisDefenceRequirementDocument",
    requirementDocFk: "thesisDefenceId",
    requirementFk: "thesisDefenceRequirementId",
    readyFlag: "defenceReady",
    readyAction: AUDIT_ACTIONS.DEFENCE_READINESS_APPROVED,
    minExaminers: 2,
    folder: "defence",
    room: "Ruang Sidang SI",
    resultDocuments: ["defence_assessment_result"],
    scheduleDocuments: ["defence_invitation"],
    effectiveStatus: computeEffectiveDefenceStatus,
    initiateRevisionItems: initiateDefenceRevisionItems,
  },
};

export function kindConfig(kind) {
  const config = KINDS[kind];
  if (!config) throw new BadRequestError("Jenis harus seminar atau defence.");
  return config;
}

const noun = (kind) => (kind === "seminar" ? "seminar" : "sidang");

// ─── Loading ───────────────────────────────────────────────────────────────────────────────

async function loadThesisContext(client, studentId) {
  const student = await requireStudent(studentId, client);
  const thesis = await findCurrentThesis(client, studentId);
  if (!thesis) throw new BadRequestError("Mahasiswa ini belum punya tugas akhir.");
  const supervisors = await client.thesisSupervisors.findMany({
    where: { thesisId: thesis.id },
    select: { id: true, lecturerId: true, status: true, seminarReady: true, defenceReady: true, role: { select: { name: true } }, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const [seminars, defences, participants] = await Promise.all([
    client.thesisSeminar.findMany({ where: { thesisId: thesis.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, status: true, revisionFinalizedAt: true } }),
    client.thesisDefence.findMany({ where: { thesisId: thesis.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, status: true, revisionFinalizedAt: true } }),
    client.yudisiumParticipant.count({ where: { thesisId: thesis.id } }),
  ]);
  return { student, thesis, supervisors, seminars, defences, hasYudisium: participants > 0 };
}

const EVENT_INCLUDE = {
  room: { select: { id: true, name: true } },
  examiners: {
    orderBy: [{ order: "asc" }, { assignedAt: "asc" }],
    select: {
      id: true,
      lecturerId: true,
      order: true,
      availabilityStatus: true,
      assessmentScore: true,
      assessmentSubmittedAt: true,
      revisionNotes: true,
      lecturer: { select: { user: { select: { fullName: true } } } },
    },
  },
};

function loadEvent(client, kind, id) {
  return client[kindConfig(kind).model].findUnique({ where: { id }, include: EVENT_INCLUDE });
}

const primarySupervisor = (supervisors) =>
  supervisors.find((s) => s.status === "active" && s.role?.name === ROLES.PEMBIMBING_1) ??
  supervisors.find((s) => s.status === "active") ??
  supervisors[0] ??
  null;

const isPassedEvent = (event) =>
  !!event && (event.status === "passed" || (event.status === "passed_with_revision" && !!event.revisionFinalizedAt));

// ─── Guards ────────────────────────────────────────────────────────────────────────────────

/** Why the seminar or defence of this thesis cannot be moved back, failed or deleted. */
export function orderGuard(kind, ctx) {
  if (kind === "seminar" && ctx.defences.length > 0) {
    return "Mahasiswa ini sudah punya sidang. Hapus sidang mahasiswa ini terlebih dahulu.";
  }
  if (kind === "defence" && ctx.hasYudisium) {
    return "Mahasiswa ini sudah terdaftar di yudisium. Hapus mahasiswa ini dari periode yudisium terlebih dahulu.";
  }
  return null;
}

// ─── Assessment configuration and scores ───────────────────────────────────────────────────

async function assessmentConfig(client, kind, eventId) {
  const docs = eventId
    ? await client[kindConfig(kind).requirementDocModel].findMany({
      where: { [kindConfig(kind).requirementDocFk]: eventId },
      select: { requirement: { select: { academicYearId: true } } },
    })
    : [];
  const academicYearId = docs.map((d) => d.requirement?.academicYearId).find(Boolean) ?? (await getActiveAcademicYear())?.id ?? null;
  if (!academicYearId) throw new BadRequestError("Tahun ajaran aktif belum tersedia.");

  if (kind === "seminar") {
    const [cpmks, minimum] = await Promise.all([
      seminarExaminerRepo.findSeminarAssessmentCpmks(academicYearId),
      seminarExaminerRepo.findSeminarMinimumScore(academicYearId),
    ]);
    const examinerCriteria = cpmks.flatMap((c) => c.thesisSeminarAssessmentCriterias || []);
    if (examinerCriteria.length === 0) throw new BadRequestError("Rubrik penilaian seminar semester ini belum dikonfigurasi.");
    if (minimum === null) throw new BadRequestError("Nilai minimum kelulusan seminar semester ini belum dikonfigurasi.");
    return { academicYearId, minimum: Number(minimum), examinerCriteria, supervisorCriteria: [] };
  }
  const [examinerCpmks, supervisorCpmks, minimum] = await Promise.all([
    defenceExaminerRepo.findDefenceAssessmentCpmks(academicYearId, "examiner"),
    defenceExaminerRepo.findDefenceAssessmentCpmks(academicYearId, "supervisor"),
    defenceExaminerRepo.findDefenceMinimumScore(academicYearId),
  ]);
  const examinerCriteria = examinerCpmks.flatMap((c) => c.assessmentCriterias || []);
  const supervisorCriteria = supervisorCpmks.flatMap((c) => c.assessmentCriterias || []);
  if (examinerCriteria.length === 0 || supervisorCriteria.length === 0) {
    throw new BadRequestError("Rubrik penilaian sidang semester ini belum dikonfigurasi.");
  }
  if (minimum === null || minimum === undefined) throw new BadRequestError("Nilai minimum kelulusan sidang semester ini belum dikonfigurasi.");
  return { academicYearId, minimum: Number(minimum), examinerCriteria, supervisorCriteria };
}

const sumMax = (criteria) => criteria.reduce((sum, c) => sum + (c.maxScore || 0), 0);

function scoreSheet(criteria, ratio) {
  const scores = criteria.map((c) => ({
    assessmentCriteriaId: c.id,
    score: Math.max(0, Math.min(c.maxScore || 0, Math.round((c.maxScore || 0) * ratio))),
  }));
  return { scores, total: scores.reduce((sum, s) => sum + s.score, 0) };
}

/** Final score as the module computes it: seminar = examiner average; defence = average + supervisor. */
function finalOf(kind, examinerTotals, supervisorTotal) {
  const average = examinerTotals.reduce((s, v) => s + v, 0) / examinerTotals.length;
  return kind === "seminar" ? average : average + (supervisorTotal ?? 0);
}

/**
 * Score sheets whose final score gives `target` under the minimum score: a pass lands around
 * 82% of the maximum (above the minimum), a fail fifteen points under the minimum.
 */
export function generateScores(kind, config, examinerCount, target) {
  const maxTotal = sumMax(config.examinerCriteria) + sumMax(config.supervisorCriteria);
  const passes = target !== "failed";
  let ratio = passes ? Math.max(0.82, Math.min(1, (config.minimum + 5) / maxTotal)) : Math.max(0, (config.minimum - 15) / maxTotal);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const examiners = Array.from({ length: examinerCount }, (_, index) => scoreSheet(config.examinerCriteria, Math.min(1, ratio + (index === 0 ? 0.02 : 0))));
    const supervisor = kind === "defence" ? scoreSheet(config.supervisorCriteria, ratio) : null;
    const final = finalOf(kind, examiners.map((e) => e.total), supervisor?.total);
    if (passes ? final >= config.minimum : final < config.minimum) return { examiners, supervisor, final };
    ratio = passes ? Math.min(1, ratio + 0.03) : Math.max(0, ratio - 0.05);
  }
  throw new BadRequestError(
    passes
      ? "Nilai maksimum rubrik tidak mencapai nilai minimum kelulusan; hasil Lulus tidak bisa dibuat."
      : "Nilai minimum kelulusan 0; hasil Tidak Lulus tidak bisa dibuat.",
  );
}

// ─── Overview ──────────────────────────────────────────────────────────────────────────────

async function eventCard(client, kind, row) {
  if (!row) return null;
  const config = kindConfig(kind);
  const event = await loadEvent(client, kind, row.id);
  const revisions = await client[config.revisionModel].findMany({
    where: { [config.revisionExaminer]: { [config.examinerFk]: event.id } },
    select: { supervisorApprovedAt: true },
  });
  return {
    id: event.id,
    status: event.status,
    displayStatus: config.effectiveStatus(event.status, event.date, event.startTime, event.endTime),
    registeredAt: event.registeredAt,
    date: calendarText(event.date),
    startTime: clockText(event.startTime),
    endTime: clockText(event.endTime),
    room: event.room?.name ?? (event.meetingLink ? "Daring" : null),
    examiners: event.examiners.map((e) => ({
      id: e.id,
      name: e.lecturer?.user?.fullName ?? "-",
      order: e.order,
      availabilityStatus: e.availabilityStatus,
      score: e.assessmentScore,
      submitted: !!e.assessmentSubmittedAt,
    })),
    finalScore: event.finalScore ?? null,
    supervisorScore: kind === "defence" ? event.supervisorScore ?? null : undefined,
    supervisorSubmitted: kind === "defence" ? !!event.supervisorAssessmentSubmittedAt : undefined,
    grade: kind === "defence" ? event.grade ?? null : undefined,
    resultFinalizedAt: event.resultFinalizedAt,
    revision: {
      total: revisions.length,
      approved: revisions.filter((r) => r.supervisorApprovedAt).length,
      finalizedAt: event.revisionFinalizedAt,
    },
    officialDocuments: await countCurrentOfficialDocuments(client, event.id),
  };
}

export async function getFinalStagesOverview(studentId) {
  const student = await requireStudent(studentId);
  const thesis = await findCurrentThesis(prisma, studentId);
  if (!thesis) {
    return { student: studentSummary(student), thesis: null, seminar: null, defence: null, guards: { seminar: null, defence: null }, history: { seminar: 0, defence: 0 } };
  }
  const ctx = await loadThesisContext(prisma, studentId);
  return {
    student: studentSummary(student),
    thesis: { id: thesis.id, title: thesis.title, status: thesis.status },
    seminar: await eventCard(prisma, "seminar", ctx.seminars[0]),
    defence: await eventCard(prisma, "defence", ctx.defences[0]),
    history: { seminar: Math.max(ctx.seminars.length - 1, 0), defence: Math.max(ctx.defences.length - 1, 0) },
    guards: { seminar: orderGuard("seminar", ctx), defence: orderGuard("defence", ctx) },
    supervisors: ctx.supervisors.filter((s) => s.status === "active").map((s) => ({ role: s.role?.name, seminarReady: s.seminarReady, defenceReady: s.defenceReady })),
  };
}

const studentSummary = (student) => ({
  id: student.id,
  fullName: student.user?.fullName ?? "-",
  nim: student.user?.identityNumber ?? "-",
  sksCompleted: student.sksCompleted,
  researchMethodCompleted: student.researchMethodCompleted,
});

// ─── Planning ──────────────────────────────────────────────────────────────────────────────

/**
 * What a status change does, decided once and used both for the preview and for the write.
 * `mode`: "change" moves the current seminar/defence; "create" starts a new one at `target`.
 */
async function planEvent(client, { kind, studentId, target, mode }) {
  const config = kindConfig(kind);
  if (!EVENT_TARGETS.includes(target)) throw new BadRequestError("Status tujuan tidak dikenal.");
  const ctx = await loadThesisContext(client, studentId);
  const rows = kind === "seminar" ? ctx.seminars : ctx.defences;
  const latest = rows[0] ?? null;
  const guard = orderGuard(kind, ctx);
  const plan = { kind, mode, target, ctx, prerequisites: [], effects: [], nested: null };

  if (mode === "create") {
    if (latest && !["failed", "cancelled"].includes(latest.status)) {
      throw new ConflictError(`Mahasiswa ini masih punya ${noun(kind)} yang berjalan. Ubah statusnya, atau hapus dulu.`);
    }
    if (kind === "seminar" && guard) throw new ConflictError(guard);
    if (kind === "defence" && ctx.hasYudisium) throw new ConflictError(guard);
    plan.current = null;
    plan.fromIndex = -1;
    await planPrerequisites(client, plan);
  } else {
    if (!latest) throw new NotFoundError(`Mahasiswa ini belum punya ${noun(kind)}. Pakai tombol Buat ${noun(kind)}.`);
    if (latest.status === target) throw new BadRequestError(`${config.label} sudah berstatus ${EVENT_STATUS_LABELS[target]}.`);
    if (guard) throw new ConflictError(guard);
    if (latest.status === "cancelled") throw new BadRequestError(`${config.label} ini dibatalkan. Buat ${noun(kind)} baru.`);
    plan.current = await loadEvent(client, kind, latest.id);
    plan.fromIndex = STAGE_INDEX[plan.current.status];
  }

  const toIndex = STAGE_INDEX[target];
  const current = plan.current;
  const fromResult = current && EVENT_RESULTS.includes(current.status);
  const toResult = EVENT_RESULTS.includes(target);
  plan.toIndex = toIndex;
  plan.clearResult = !!fromResult;
  plan.clearSchedule = !!current && plan.fromIndex >= 3 && toIndex < 3;
  plan.clearExaminers = !!current && plan.fromIndex >= 2 && toIndex < 2;
  plan.unverifyDocuments = !!current && plan.fromIndex >= 1 && toIndex < 1;

  // Official documents of the previous result (and of the schedule when it is removed).
  const revokeKinds = [...(plan.clearResult ? config.resultDocuments : []), ...(plan.clearSchedule ? config.scheduleDocuments : [])];
  plan.revokeKinds = revokeKinds;
  plan.revokeCount = current && revokeKinds.length ? await countCurrentOfficialDocuments(client, current.id, revokeKinds) : 0;

  const start = current ? eventStart(current.date, current.startTime) : null;
  plan.setsSchedule = toIndex >= 3 && (!start || (toResult && start > new Date()));
  if (toResult) {
    plan.assessment = await assessmentConfig(client, kind, current?.id ?? null);
    plan.scores = await planScores(client, kind, plan, target);
  }

  // Supervisor approval: reset by a fail, restored when the attempt is running again.
  const readyNow = ctx.supervisors.length > 0 && ctx.supervisors.every((s) => s[config.readyFlag]);
  plan.readiness = target === "failed" ? (readyNow || mode === "create" ? "reset" : null) : (!readyNow && mode === "change" ? "restore" : null);

  // The thesis of a defence.
  if (kind === "defence") {
    const finishedBefore = isPassedEvent(current);
    if (target === "passed") plan.thesisEffect = ctx.thesis.status === "completed" ? null : "complete";
    else if (finishedBefore || ctx.thesis.status === "completed") plan.thesisEffect = "reopen";
    else plan.thesisEffect = null;
  }
  describePlan(plan);
  return plan;
}

/** Scores for a result: kept when they already give that result, otherwise filled in. */
async function planScores(client, kind, plan, target) {
  const config = plan.assessment;
  const examiners = (plan.current?.examiners ?? []).filter((e) => e.availabilityStatus !== "unavailable");
  const count = examinerTarget(kind, examiners.length);
  const scored = examiners.length >= kindConfig(kind).minExaminers && examiners.every((e) => e.assessmentScore !== null);
  const supervisorScore = kind === "defence" ? plan.current?.supervisorScore ?? null : null;
  if (scored && (kind === "seminar" || supervisorScore !== null)) {
    const final = finalOf(kind, examiners.map((e) => e.assessmentScore), supervisorScore);
    const consistent = target === "failed" ? final < config.minimum : final >= config.minimum;
    if (consistent) return { keep: true, final };
  }
  return { keep: false, generated: generateScores(kind, config, count, target), refilled: scored };
}

/** What a new seminar or defence needs first, filled in automatically. */
async function planPrerequisites(client, plan) {
  const { kind, ctx } = plan;
  if (ctx.thesis.status === "proposal") throw new BadRequestError("Tugas akhir mahasiswa ini belum masuk fase Penelitian.");
  if (kind === "seminar") {
    const [guidances, attendance, milestones] = await Promise.all([
      client.thesisGuidance.count({ where: { thesisId: ctx.thesis.id, status: "completed", phase: "research" } }),
      client.thesisSeminarAudience.count({ where: { studentId: ctx.student.id, approvedAt: { not: null } } }),
      client.thesisMilestone.findMany({ where: { thesisId: ctx.thesis.id, phase: "research" }, select: { id: true, status: true } }),
    ]);
    const minAttendance = ENV.SEMINAR_MIN_KEHADIRAN;
    plan.missing = {
      guidances: Math.max(MIN_SEMINAR_GUIDANCES - guidances, 0),
      attendance: Math.max(minAttendance - attendance, 0),
      researchMethod: !ctx.student.researchMethodCompleted,
      milestones: milestones.length === 0 ? "create" : milestones.some((m) => m.status !== "completed") ? "complete" : null,
      readiness: !(ctx.supervisors.length > 0 && ctx.supervisors.every((s) => s.seminarReady)),
    };
    if (plan.missing.guidances) plan.prerequisites.push(`${plan.missing.guidances} sesi bimbingan selesai ditambahkan (syarat ${MIN_SEMINAR_GUIDANCES} sesi)`);
    if (plan.missing.milestones === "create") plan.prerequisites.push("Milestone penelitian dibuat dan ditandai selesai");
    if (plan.missing.milestones === "complete") plan.prerequisites.push("Milestone penelitian yang belum selesai ditandai selesai");
    if (plan.missing.attendance) {
      const sources = await client.thesisSeminar.count({
        where: { status: { in: EVENT_RESULTS }, thesis: { studentId: { not: ctx.student.id } }, audiences: { none: { studentId: ctx.student.id } } },
      });
      if (sources < plan.missing.attendance) {
        throw new BadRequestError(`Kehadiran seminar kurang ${plan.missing.attendance}, tetapi hanya ada ${sources} seminar selesai yang bisa dipakai.`);
      }
      plan.prerequisites.push(`${plan.missing.attendance} kehadiran seminar ditambahkan dari seminar yang sudah selesai (syarat ${minAttendance})`);
    }
    if (plan.missing.researchMethod) plan.prerequisites.push("Ditandai lulus mata kuliah Metode Penelitian");
    if (plan.missing.readiness) plan.prerequisites.push("Semua pembimbing menyetujui kesiapan seminar");
    return;
  }

  // Defence: a passed seminar with its revision final, 142 SKS, approval of every supervisor.
  const seminar = ctx.seminars[0] ?? null;
  if (!isPassedEvent(seminar)) {
    if (seminar?.status === "passed_with_revision") {
      plan.nested = { type: "approveSeminarRevisions", seminarId: seminar.id };
      plan.prerequisites.push("Semua revisi seminar disetujui dan difinalkan");
    } else if (seminar && !["failed", "cancelled"].includes(seminar.status)) {
      plan.nested = { type: "seminar", plan: await planEvent(client, { kind: "seminar", studentId: ctx.student.id, target: "passed", mode: "change" }) };
      plan.prerequisites.push("Seminar Hasil diubah ke Lulus", ...plan.nested.plan.effects.map((e) => `  ${e}`));
    } else {
      plan.nested = { type: "seminar", plan: await planEvent(client, { kind: "seminar", studentId: ctx.student.id, target: "passed", mode: "create" }) };
      plan.prerequisites.push("Seminar Hasil dibuat dengan status Lulus", ...[...plan.nested.plan.prerequisites, ...plan.nested.plan.effects].map((e) => `  ${e}`));
    }
  }
  plan.missing = {
    sks: (ctx.student.sksCompleted ?? 0) < MIN_DEFENCE_SKS,
    readiness: !(ctx.supervisors.length > 0 && ctx.supervisors.every((s) => s.defenceReady)),
  };
  if (plan.missing.sks) plan.prerequisites.push(`SKS selesai dinaikkan ke ${MIN_DEFENCE_SKS}`);
  if (plan.missing.readiness) plan.prerequisites.push("Semua pembimbing menyetujui kesiapan sidang");
}

function describePlan(plan) {
  const { kind, target, current } = plan;
  const config = kindConfig(kind);
  const effects = plan.effects;
  const reach = (index) => plan.toIndex >= index && plan.fromIndex < index;
  const label = EVENT_STATUS_LABELS[target];

  if (plan.mode === "create") effects.push(`${config.label} baru dibuat dengan status ${label}`);
  else effects.push(`Status ${config.label}: ${EVENT_STATUS_LABELS[current.status]} → ${label}`);

  if (plan.mode === "create") effects.push("Dokumen persyaratan contoh diunggah");
  if (reach(1)) effects.push("Dokumen persyaratan ditandai terverifikasi");
  if (reach(2)) effects.push(`Penguji ditetapkan dan bersedia (minimal ${kind === "defence" ? 2 : 1} dosen, bukan pembimbing)`);
  if (plan.setsSchedule) {
    effects.push(EVENT_RESULTS.includes(target) ? "Jadwal diisi hari ini, sudah dimulai (pelaksanaan dianggap sudah berlangsung)" : "Jadwal dan ruangan diisi (besok pukul 09.00–11.00)");
  }
  if (plan.unverifyDocuments) effects.push("Verifikasi dokumen persyaratan dibatalkan");
  if (plan.clearExaminers) effects.push("Penguji beserta nilainya dihapus");
  if (plan.clearSchedule) effects.push(kind === "seminar" ? "Jadwal, ruangan, dan audiens dihapus" : "Jadwal dan ruangan dihapus");
  if (plan.clearResult) {
    effects.push("Hasil, waktu penetapan hasil, dan revisi dihapus");
    if (!plan.clearExaminers && !EVENT_RESULTS.includes(target)) {
      effects.push(kind === "defence" ? "Nilai penguji dan pembimbing kembali menjadi draf (nilainya tetap)" : "Nilai penguji kembali menjadi draf (nilainya tetap)");
    }
  }
  if (EVENT_RESULTS.includes(target)) {
    const scores = plan.scores;
    const who = kind === "defence" ? "Nilai penguji dan pembimbing" : "Nilai penguji";
    if (scores.keep) effects.push(`${who} yang ada dipakai (nilai akhir ${round(scores.final)})`);
    else effects.push(`${who} ${scores.refilled ? "diisi ulang agar sesuai hasil" : "diisi otomatis"} (nilai akhir ${round(scores.generated.final)}, minimum ${plan.assessment.minimum})`);
    effects.push("Waktu penetapan hasil diisi");
    if (target === "passed_with_revision") effects.push("Item revisi dibuat dari catatan penguji, belum selesai");
  }
  if (plan.readiness === "reset") effects.push(`Persetujuan pembimbing direset; mahasiswa harus meminta persetujuan lagi lalu mendaftar ulang`);
  if (plan.readiness === "restore") effects.push("Persetujuan pembimbing dipulihkan");
  if (target === "failed") effects.push(`${config.label} ini menjadi riwayat`);
  if (plan.thesisEffect === "complete") effects.push("TA akan menjadi Selesai");
  if (plan.thesisEffect === "reopen") effects.push("TA kembali ke Penelitian");
  if (plan.revokeCount > 0) effects.push(`${plan.revokeCount} dokumen resmi akan dicabut`);
  if (EVENT_RESULTS.includes(target)) effects.push("Dokumen resmi hasil terbit saat diunduh, seperti biasa");
}

const round = (n) => Math.round(n * 100) / 100;

/** Examiners an attempt ends up with: the ones it has (at least the module minimum), else two. */
const examinerTarget = (kind, current) => (current > 0 ? Math.max(current, kindConfig(kind).minExaminers) : 2);

// ─── Writing ───────────────────────────────────────────────────────────────────────────────

function readinessRows(kind, thesisId, supervisors, now, actorUserId) {
  const ordered = supervisors
    .filter((s) => s.status === "active")
    .map((s) => ({ ...s, position: s.role?.name === ROLES.PEMBIMBING_2 ? "pembimbing_2" : "pembimbing_1" }))
    .sort((a, b) => a.position.localeCompare(b.position));
  return ordered.map((s, index) => ({
    userId: s.lecturerId,
    action: kindConfig(kind).readyAction,
    entity: ENTITY_TYPES.THESIS,
    entityId: thesisId,
    changes: {
      oldValues: null,
      newValues: { supervisorRole: s.position, isFullyApproved: index === ordered.length - 1, notes: null },
      metadata: { source: "devtools", actorUserId },
    },
    createdAt: new Date(now.getTime() + index * 1000),
  }));
}

async function setReadiness(tx, kind, ctx, value, now, actorUserId) {
  const flag = kindConfig(kind).readyFlag;
  await tx.thesisSupervisors.updateMany({ where: { thesisId: ctx.thesis.id }, data: { [flag]: value } });
  if (value) await tx.auditLog.createMany({ data: readinessRows(kind, ctx.thesis.id, ctx.supervisors, now, actorUserId) });
}

async function ensureSeminarPrerequisites(tx, plan, now, actorUserId) {
  const { ctx, missing } = plan;
  const p1 = primarySupervisor(ctx.supervisors);
  for (let i = 0; i < missing.guidances; i += 1) {
    const at = new Date(now.getTime() - (missing.guidances - i + 1) * 7 * DAY);
    await tx.thesisGuidance.create({
      data: {
        thesisId: ctx.thesis.id,
        supervisorId: p1.lecturerId,
        requestedDate: new Date(at.getTime() - 2 * DAY),
        approvedDate: at,
        duration: 60,
        studentNotes: "Bimbingan kemajuan penelitian (data uji DevTools).",
        sessionSummary: "Ringkasan bimbingan (data uji DevTools).",
        summarySubmittedAt: at,
        completedAt: at,
        status: "completed",
        phase: "research",
      },
    });
  }
  if (missing.milestones === "create") {
    const titles = ["BAB I - Pendahuluan", "BAB II - Tinjauan Pustaka", "BAB III - Metodologi", "BAB IV - Hasil dan Pembahasan", "BAB V - Penutup"];
    for (const [index, title] of titles.entries()) {
      await tx.thesisMilestone.create({
        data: { thesisId: ctx.thesis.id, title, orderIndex: index + 1, phase: "research", status: "completed", progressPercentage: 100, completedAt: now, validatedAt: now },
      });
    }
  } else if (missing.milestones === "complete") {
    await tx.thesisMilestone.updateMany({
      where: { thesisId: ctx.thesis.id, phase: "research", status: { not: "completed" } },
      data: { status: "completed", progressPercentage: 100, completedAt: now, validatedAt: now },
    });
  }
  if (missing.attendance) {
    const sources = await tx.thesisSeminar.findMany({
      where: { status: { in: EVENT_RESULTS }, thesis: { studentId: { not: ctx.student.id } }, audiences: { none: { studentId: ctx.student.id } } },
      orderBy: [{ date: "desc" }, { id: "asc" }],
      take: missing.attendance,
      select: { id: true, thesisId: true, date: true, thesis: { select: { thesisSupervisors: { select: { id: true }, take: 1 } } } },
    });
    for (const seminar of sources) {
      const at = seminar.date ?? now;
      await tx.thesisSeminarAudience.create({
        data: {
          thesisSeminarId: seminar.id,
          thesisId: seminar.thesisId,
          studentId: ctx.student.id,
          registeredAt: at,
          approvedAt: at,
          approvedBy: seminar.thesis?.thesisSupervisors?.[0]?.id ?? null,
        },
      });
    }
  }
  if (missing.researchMethod) await tx.student.update({ where: { id: ctx.student.id }, data: { researchMethodCompleted: true } });
  if (missing.readiness) await setReadiness(tx, "seminar", ctx, true, now, actorUserId);
}

async function ensureDefencePrerequisites(tx, plan, now, actorUserId) {
  const { ctx, missing } = plan;
  if (plan.nested?.type === "seminar") await executePlan(tx, plan.nested.plan, now, actorUserId);
  if (plan.nested?.type === "approveSeminarRevisions") await approveRevisionsWrite(tx, "seminar", plan.nested.seminarId, ctx, now, actorUserId);
  if (missing.sks) await tx.student.update({ where: { id: ctx.student.id }, data: { sksCompleted: MIN_DEFENCE_SKS } });
  if (missing.readiness) await setReadiness(tx, "defence", ctx, true, now, actorUserId);
}

async function requirementDocuments(tx, kind, event, ctx, approved, now, actorUserId) {
  const config = kindConfig(kind);
  const year = await getActiveAcademicYear(tx);
  const requirements = year
    ? await tx[config.requirementModel].findMany({ where: { academicYearId: year.id }, orderBy: { displayOrder: "asc" } })
    : [];
  const existing = await tx[config.requirementDocModel].findMany({ where: { [config.requirementDocFk]: event.id } });
  const have = new Set(existing.map((d) => d[config.requirementFk]));
  for (const requirement of requirements) {
    if (have.has(requirement.id)) continue;
    const file = await writeSamplePdf(
      `uploads/thesis/${ctx.thesis.id}/${config.folder}/${event.id}`,
      `requirement-${requirement.id}-devtools.pdf`,
      requirement.name,
      [ctx.student.user?.fullName ?? "-", ctx.student.user?.identityNumber ?? "-"],
    );
    await tx[config.requirementDocModel].create({
      data: { [config.requirementDocFk]: event.id, [config.requirementFk]: requirement.id, ...file, submittedAt: now, status: "submitted" },
    });
  }
  if (approved) {
    await tx[config.requirementDocModel].updateMany({
      where: { [config.requirementDocFk]: event.id },
      data: { status: "approved", verifiedBy: actorUserId, verifiedAt: now, notes: null },
    });
  }
}

async function ensureExaminers(tx, kind, event, ctx, now) {
  const config = kindConfig(kind);
  const rows = await tx[config.examinerModel].findMany({ where: { [config.examinerFk]: event.id } });
  const active = rows.filter((r) => r.availabilityStatus !== "unavailable");
  await tx[config.examinerModel].updateMany({
    where: { [config.examinerFk]: event.id, availabilityStatus: "pending" },
    data: { availabilityStatus: "available", respondedAt: now },
  });
  const needed = examinerTarget(kind, active.length) - active.length;
  if (needed <= 0) return;
  const exclude = [...ctx.supervisors.map((s) => s.lecturerId), ...rows.map((r) => r.lecturerId)];
  const candidates = await tx.lecturer.findMany({
    where: { id: { notIn: exclude }, user: { userHasRoles: { some: { status: "active", role: { name: ROLES.PENGUJI } } } } },
    orderBy: { user: { fullName: "asc" } },
    take: needed,
    select: { id: true },
  });
  if (candidates.length < needed) throw new BadRequestError("Dosen berperan Penguji yang bukan pembimbing tidak cukup.");
  const assignedBy = await findLecturerWithRole(tx, ROLES.KETUA_DEPARTEMEN);
  let order = rows.reduce((max, r) => Math.max(max, r.order), 0);
  for (const lecturer of candidates) {
    order += 1;
    await tx[config.examinerModel].create({
      data: { [config.examinerFk]: event.id, lecturerId: lecturer.id, assignedBy, order, assignedAt: now, availabilityStatus: "available", respondedAt: now },
    });
  }
}

async function ensureSchedule(tx, kind, event, forResult, now) {
  const config = kindConfig(kind);
  const start = eventStart(event.date, event.startTime);
  const data = {};
  if (!start || (forResult && start > now)) {
    Object.assign(data, forResult ? scheduleAround(now, -2 * HOUR, 2 * HOUR - 5 * MINUTE) : scheduleAround(new Date(now.getTime() + DAY), 0, 0));
    if (!forResult) Object.assign(data, { startTime: clockValue("09:00"), endTime: clockValue("11:00") });
  }
  if (!event.roomId && !event.meetingLink) {
    const room = (await tx.room.findFirst({ where: { name: config.room } })) ?? (await tx.room.findFirst({ orderBy: { name: "asc" } }));
    if (room) data.roomId = room.id;
  }
  if (!event.scheduledAt) data.scheduledAt = now;
  if (Object.keys(data).length) await tx[config.model].update({ where: { id: event.id }, data });
}

async function writeScores(tx, kind, plan, event, now) {
  const config = kindConfig(kind);
  const examiners = (await tx[config.examinerModel].findMany({ where: { [config.examinerFk]: event.id, availabilityStatus: "available" }, orderBy: { order: "asc" } }));
  const needsNotes = plan.target === "passed_with_revision";
  if (plan.scores.keep) {
    for (const examiner of examiners) {
      await tx[config.examinerModel].update({
        where: { id: examiner.id },
        data: { assessmentSubmittedAt: examiner.assessmentSubmittedAt ?? now, ...(needsNotes && !examiner.revisionNotes ? { revisionNotes: DEFAULT_REVISION_NOTE } : {}) },
      });
    }
    if (kind === "defence" && !event.supervisorAssessmentSubmittedAt) {
      await tx.thesisDefence.update({ where: { id: event.id }, data: { supervisorAssessmentSubmittedAt: now } });
    }
    return;
  }
  const generated = plan.scores.generated;
  for (const [index, examiner] of examiners.entries()) {
    const sheet = generated.examiners[index] ?? generated.examiners[0];
    await tx[config.detailModel].deleteMany({ where: { [config.detailFk]: examiner.id } });
    await tx[config.detailModel].createMany({ data: sheet.scores.map((s) => ({ [config.detailFk]: examiner.id, ...s })) });
    await tx[config.examinerModel].update({
      where: { id: examiner.id },
      data: {
        assessmentScore: sheet.total,
        assessmentSubmittedAt: now,
        revisionNotes: needsNotes ? examiner.revisionNotes || DEFAULT_REVISION_NOTE : examiner.revisionNotes,
      },
    });
  }
  if (kind === "defence") {
    await tx.thesisDefenceSupervisorAssessmentDetail.deleteMany({ where: { thesisDefenceId: event.id } });
    await tx.thesisDefenceSupervisorAssessmentDetail.createMany({ data: generated.supervisor.scores.map((s) => ({ thesisDefenceId: event.id, ...s })) });
    await tx.thesisDefence.update({
      where: { id: event.id },
      data: { supervisorScore: generated.supervisor.total, supervisorAssessmentSubmittedAt: now, supervisorNotes: event.supervisorNotes ?? null },
    });
  }
}

/** The result columns, computed from the stored scores the way the finalization does. */
async function writeResult(tx, kind, plan, event, now) {
  const p1 = primarySupervisor(plan.ctx.supervisors);
  const config = kindConfig(kind);
  const examiners = await tx[config.examinerModel].findMany({ where: { [config.examinerFk]: event.id, availabilityStatus: "available" } });
  const average = examiners.reduce((s, e) => s + (e.assessmentScore || 0), 0) / examiners.length;
  if (kind === "seminar") {
    await tx.thesisSeminar.update({
      where: { id: event.id },
      data: { status: plan.target, finalScore: average, resultFinalizedAt: now, resultFinalizedBy: p1?.id ?? null },
    });
    return;
  }
  const row = await tx.thesisDefence.findUnique({ where: { id: event.id }, select: { supervisorScore: true } });
  const supervisorScore = row.supervisorScore || 0;
  const finalScore = average + supervisorScore;
  await tx.thesisDefence.update({
    where: { id: event.id },
    data: {
      status: plan.target,
      examinerAverageScore: average,
      supervisorScore,
      finalScore,
      grade: mapScoreToGrade(finalScore),
      resultFinalizedAt: now,
      resultFinalizedBy: p1?.id ?? null,
    },
  });
}

async function clearResultWrite(tx, kind, event) {
  const config = kindConfig(kind);
  await tx[config.revisionModel].deleteMany({ where: { [config.revisionExaminer]: { [config.examinerFk]: event.id } } });
  await tx[config.examinerModel].updateMany({ where: { [config.examinerFk]: event.id }, data: { assessmentSubmittedAt: null } });
  const data = { finalScore: null, resultFinalizedAt: null, resultFinalizedBy: null, revisionFinalizedAt: null, revisionFinalizedBy: null };
  if (kind === "defence") Object.assign(data, { examinerAverageScore: null, grade: null, supervisorAssessmentSubmittedAt: null });
  await tx[config.model].update({ where: { id: event.id }, data });
}

async function executePlan(tx, plan, now, actorUserId) {
  const { kind, ctx, target } = plan;
  const config = kindConfig(kind);
  if (plan.mode === "create") {
    if (kind === "seminar") await ensureSeminarPrerequisites(tx, plan, now, actorUserId);
    else await ensureDefencePrerequisites(tx, plan, now, actorUserId);
  }
  let event = plan.current
    ? await tx[config.model].findUnique({ where: { id: plan.current.id } })
    : await tx[config.model].create({ data: { thesisId: ctx.thesis.id, status: "registered", registeredAt: now } });

  // Back to an earlier stage: remove what the later stages added.
  if (plan.clearResult) await clearResultWrite(tx, kind, event);
  if (plan.revokeCount > 0) await revokeOfficialDocuments(tx, event.id, plan.revokeKinds, now);
  if (plan.clearSchedule) {
    if (kind === "seminar") await tx.thesisSeminarAudience.deleteMany({ where: { thesisSeminarId: event.id } });
    await tx[config.model].update({ where: { id: event.id }, data: { date: null, startTime: null, endTime: null, roomId: null, meetingLink: null, scheduledAt: null } });
  }
  if (plan.clearExaminers) await tx[config.examinerModel].deleteMany({ where: { [config.examinerFk]: event.id } });
  if (plan.unverifyDocuments) {
    await tx[config.requirementDocModel].updateMany({
      where: { [config.requirementDocFk]: event.id },
      data: { status: "submitted", verifiedBy: null, verifiedAt: null, notes: null },
    });
    await tx[config.model].update({ where: { id: event.id }, data: { verifiedAt: null } });
  }

  // Forward: fill what the target stage needs.
  const toIndex = plan.toIndex;
  if (!event.registeredAt) await tx[config.model].update({ where: { id: event.id }, data: { registeredAt: now } });
  await requirementDocuments(tx, kind, event, ctx, toIndex >= 1, now, actorUserId);
  if (toIndex >= 1 && !event.verifiedAt) await tx[config.model].update({ where: { id: event.id }, data: { verifiedAt: now } });
  if (toIndex >= 2) await ensureExaminers(tx, kind, event, ctx, now);
  event = await tx[config.model].findUnique({ where: { id: event.id } });
  if (toIndex >= 3) await ensureSchedule(tx, kind, event, EVENT_RESULTS.includes(target), now);
  event = await tx[config.model].findUnique({ where: { id: event.id } });

  if (EVENT_RESULTS.includes(target)) {
    await writeScores(tx, kind, plan, event, now);
    await writeResult(tx, kind, plan, event, now);
  } else {
    await tx[config.model].update({ where: { id: event.id }, data: { status: target } });
  }

  if (plan.readiness === "reset") await tx.thesisSupervisors.updateMany({ where: { thesisId: ctx.thesis.id }, data: { [config.readyFlag]: false } });
  if (plan.readiness === "restore") await setReadiness(tx, kind, ctx, true, now, actorUserId);

  if (plan.thesisEffect === "complete") await completeThesisFromDefence(tx, ctx.thesis.id, { defenceId: event.id, actorUserId, now });
  if (plan.thesisEffect === "reopen") {
    await reopenThesisFromDefence(tx, ctx.thesis.id, { defenceId: event.id, actorUserId, reason: "status sidang diubah lewat DevTools.", now });
  }
  plan.eventId = event.id;
  return event.id;
}

// ─── Public actions ────────────────────────────────────────────────────────────────────────

const TX_OPTIONS = { timeout: 60_000, maxWait: 10_000 };

export async function previewEventStatus({ kind, studentId, target, mode = "change" }) {
  const plan = await planEvent(prisma, { kind, studentId, target, mode });
  return { prerequisites: plan.prerequisites, effects: plan.effects };
}

export async function applyEventStatus({ kind, studentId, target, mode = "change", actorUserId }) {
  const now = new Date();
  const plan = await planEvent(prisma, { kind, studentId, target, mode });
  const before = plan.current?.status ?? null;
  const eventId = await prisma.$transaction((tx) => executePlan(tx, plan, now, actorUserId), TX_OPTIONS);
  // Revision items from the examiner notes, as the finalization does after its write.
  if (target === "passed_with_revision") await kindConfig(kind).initiateRevisionItems(eventId);
  if (plan.nested?.type === "seminar" && plan.nested.plan.target === "passed_with_revision") {
    await KINDS.seminar.initiateRevisionItems(plan.nested.plan.eventId);
  }
  await logDevtoolsChange({
    actorUserId,
    entityType: ENTITY_TYPES.THESIS,
    entityId: plan.ctx.thesis.id,
    operation: mode === "create" ? "create" : "status",
    scope: kind,
    oldValues: { eventStatus: before },
    newValues: { eventStatus: target },
    details: [...plan.prerequisites, ...plan.effects],
  });
  return { id: eventId, prerequisites: plan.prerequisites, effects: plan.effects };
}

/** Approves every revision item and finalizes the revision; for a defence the thesis becomes Selesai. */
async function approveRevisionsWrite(tx, kind, eventId, ctx, now, actorUserId) {
  const config = kindConfig(kind);
  const p1 = primarySupervisor(ctx.supervisors);
  let revisions = await tx[config.revisionModel].findMany({ where: { [config.revisionExaminer]: { [config.examinerFk]: eventId } } });
  if (revisions.length === 0) {
    // The module finalizes only with at least one item: one from the first examiner.
    const examiner = await tx[config.examinerModel].findFirst({ where: { [config.examinerFk]: eventId, availabilityStatus: "available" }, orderBy: { order: "asc" } });
    if (examiner) {
      await tx[config.revisionModel].create({ data: { [config.revisionFk]: examiner.id, description: examiner.revisionNotes || DEFAULT_REVISION_NOTE, revisionAction: "" } });
      revisions = await tx[config.revisionModel].findMany({ where: { [config.revisionExaminer]: { [config.examinerFk]: eventId } } });
    }
  }
  for (const revision of revisions.filter((r) => !r.supervisorApprovedAt)) {
    await tx[config.revisionModel].update({
      where: { id: revision.id },
      data: {
        revisionAction: revision.revisionAction || "Sudah diperbaiki sesuai catatan penguji.",
        studentSubmittedAt: revision.studentSubmittedAt ?? now,
        supervisorApprovedAt: now,
        approvedBy: p1?.id ?? null,
      },
    });
  }
  await tx[config.model].update({ where: { id: eventId }, data: { revisionFinalizedAt: now, revisionFinalizedBy: p1?.id ?? null } });
  if (kind === "defence") await completeThesisFromDefence(tx, ctx.thesis.id, { defenceId: eventId, actorUserId, now });
}

export async function previewApproveRevisions({ kind, studentId }) {
  const { event } = await revisionTarget(kind, studentId);
  const config = kindConfig(kind);
  const total = await prisma[config.revisionModel].count({ where: { [config.revisionExaminer]: { [config.examinerFk]: event.id } } });
  const effects = [`${total || "Item"} revisi disetujui pembimbing`, "Revisi difinalkan"];
  if (kind === "defence") effects.push("TA akan menjadi Selesai");
  return { prerequisites: [], effects };
}

async function revisionTarget(kind, studentId) {
  const config = kindConfig(kind);
  const ctx = await loadThesisContext(prisma, studentId);
  const latest = (kind === "seminar" ? ctx.seminars : ctx.defences)[0];
  if (!latest) throw new NotFoundError(`Mahasiswa ini belum punya ${noun(kind)}.`);
  if (latest.status !== "passed_with_revision") throw new BadRequestError(`${config.label} tidak berstatus Lulus dengan Revisi.`);
  if (latest.revisionFinalizedAt) throw new BadRequestError("Revisi sudah difinalkan.");
  return { ctx, event: latest };
}

export async function approveAllRevisions({ kind, studentId, actorUserId }) {
  const { ctx, event } = await revisionTarget(kind, studentId);
  await kindConfig(kind).initiateRevisionItems(event.id);
  const preview = await previewApproveRevisions({ kind, studentId });
  await prisma.$transaction((tx) => approveRevisionsWrite(tx, kind, event.id, ctx, new Date(), actorUserId), TX_OPTIONS);
  await logDevtoolsChange({
    actorUserId,
    entityType: ENTITY_TYPES.THESIS,
    entityId: ctx.thesis.id,
    operation: "approve_revisions",
    scope: kind,
    details: preview.effects,
  });
  return preview;
}

async function planDelete(kind, studentId) {
  const config = kindConfig(kind);
  const ctx = await loadThesisContext(prisma, studentId);
  const latest = (kind === "seminar" ? ctx.seminars : ctx.defences)[0];
  if (!latest) throw new NotFoundError(`Mahasiswa ini belum punya ${noun(kind)}.`);
  const guard = orderGuard(kind, ctx);
  if (guard) throw new ConflictError(guard);
  const documents = await countCurrentOfficialDocuments(prisma, latest.id);
  const effects = [
    `${config.label} (${EVENT_STATUS_LABELS[latest.status]}) dihapus beserta dokumen persyaratan, penguji, nilai, ${kind === "seminar" ? "audiens, " : ""}revisi, dan berkas unggahannya`,
    "Bimbingan dan persetujuan pembimbing tetap ada",
  ];
  const reopens = kind === "defence" && ctx.thesis.status === "completed" && isPassedEvent(latest);
  if (reopens) effects.push("TA kembali ke Penelitian");
  if (documents > 0) effects.push(`${documents} dokumen resmi akan dicabut`);
  effects.push(ctx.seminars.length + ctx.defences.length > 1 && (kind === "seminar" ? ctx.seminars : ctx.defences).length > 1
    ? `Percobaan ${noun(kind)} sebelumnya menjadi yang terbaru`
    : `Mahasiswa kembali ke keadaan belum mendaftar ${noun(kind)}`);
  return { ctx, event: latest, effects, reopens };
}

export async function previewDeleteEvent({ kind, studentId }) {
  const { effects } = await planDelete(kind, studentId);
  return { prerequisites: [], effects };
}

export async function deleteEvent({ kind, studentId, actorUserId }) {
  const config = kindConfig(kind);
  const { ctx, event, effects, reopens } = await planDelete(kind, studentId);
  const files = (await prisma[config.requirementDocModel].findMany({ where: { [config.requirementDocFk]: event.id }, select: { filePath: true } })).map((d) => d.filePath);
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await revokeOfficialDocuments(tx, event.id, null, now);
    if (reopens) await reopenThesisFromDefence(tx, ctx.thesis.id, { defenceId: event.id, actorUserId, reason: "sidang dihapus lewat DevTools.", now });
    await tx[config.model].delete({ where: { id: event.id } });
  }, TX_OPTIONS);
  await removeFiles(files);
  await logDevtoolsChange({
    actorUserId,
    entityType: ENTITY_TYPES.THESIS,
    entityId: ctx.thesis.id,
    operation: "delete",
    scope: kind,
    oldValues: { eventStatus: event.status },
    details: effects,
  });
  return { effects };
}

// ─── Schedule ──────────────────────────────────────────────────────────────────────────────

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** New schedule columns from explicit values or a preset (`now`, `past`, `tomorrow`). */
export function scheduleFromInput(body, current, now = new Date()) {
  const startText = clockText(current.startTime) ?? "09:00";
  const endText = clockText(current.endTime) ?? "11:00";
  const day = (offset) => {
    const base = scheduleAround(now, offset * DAY, 0).date;
    return base;
  };
  if (body.preset === "now") return scheduleAround(now, -5 * MINUTE, 2 * HOUR + 5 * MINUTE);
  if (body.preset === "past") return { date: day(-1), startTime: clockValue(startText), endTime: clockValue(endText) };
  if (body.preset === "tomorrow") return { date: day(1), startTime: clockValue(startText), endTime: clockValue(endText) };
  if (body.preset !== undefined) throw new BadRequestError("Pilihan jadwal cepat tidak dikenal.");

  const date = body.date ?? calendarText(current.date);
  const startTime = body.startTime ?? startText;
  const endTime = body.endTime ?? endText;
  if (!DATE.test(String(date)) || Number.isNaN(calendarDate(date).getTime())) throw new BadRequestError("Tanggal harus berformat YYYY-MM-DD.");
  if (!CLOCK.test(String(startTime)) || !CLOCK.test(String(endTime))) throw new BadRequestError("Jam harus berformat HH:mm.");
  if (startTime >= endTime) throw new BadRequestError("Jam mulai harus sebelum jam selesai.");
  return { date: calendarDate(date), startTime: clockValue(startTime), endTime: clockValue(endTime) };
}

export async function updateEventSchedule({ kind, eventId, body, actorUserId }) {
  const config = kindConfig(kind);
  const event = await prisma[config.model].findUnique({ where: { id: eventId }, select: { id: true, thesisId: true, status: true, date: true, startTime: true, endTime: true } });
  if (!event) throw new NotFoundError(`${config.label} tidak ditemukan.`);
  if (!event.date) throw new BadRequestError(`${config.label} ini belum punya jadwal. Ubah statusnya ke Terjadwal dulu.`);
  const data = scheduleFromInput(body ?? {}, event);
  const updated = await prisma[config.model].update({ where: { id: eventId }, data, select: { id: true, status: true, date: true, startTime: true, endTime: true } });
  const show = (row) => ({ date: calendarText(row.date), startTime: clockText(row.startTime), endTime: clockText(row.endTime) });
  await logDevtoolsChange({
    actorUserId,
    entityType: ENTITY_TYPES.THESIS,
    entityId: event.thesisId,
    operation: "schedule",
    scope: kind,
    oldValues: show(event),
    newValues: show(updated),
  });
  return {
    ...show(updated),
    status: updated.status,
    displayStatus: config.effectiveStatus(updated.status, updated.date, updated.startTime, updated.endTime),
  };
}
