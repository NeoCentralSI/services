/**
 * DEV TOOLS — Yudisium: period dates, participants (status with its attributes, requirement
 * items, exit survey, registration) and the student's CPL scores.
 * ⚠️ DELETE THIS DIRECTORY (services/devtools/) together with routes/devtools*.route.js.
 *
 * The module services are not changed. `recomputeParticipantEligibility` is called as exported.
 * The verification, CPL validation and repair steps of participant.service.js also notify the
 * student, so their writes are reproduced here (same columns, no notification) and checked by
 * `test/integration/fathur/devtools-yudisium.parity.test.js`:
 *   - document verification: item status, `requirementVerifiedAt` when every item is approved;
 *   - CPL validation and repair: score status `validated`, the repair documents and old score,
 *     `cplValidatedAt` when every active CPL is validated;
 *   - then the participant status from both (registered ↔ eligible).
 * The CPL follow-up recommendation of the GKM is stored by the module on the CPL score
 * (`recommendation_document_*`, `settlement_document_*`); the table
 * `yudisium_cpl_reccomendations` is used by no module service and is only cleared here.
 * DevTools never changes the student status (Aktif/Lulus).
 */
import prisma from "../../config/prisma.js";
import { ROLES } from "../../constants/roles.js";
import { ENTITY_TYPES } from "../auditLog.service.js";
import { recomputeParticipantEligibility } from "../yudisium/participant.service.js";
import {
  BadRequestError,
  ConflictError,
  DAY,
  HOUR,
  MINUTE,
  NotFoundError,
  findCurrentThesis,
  findLecturerWithRole,
  logDevtoolsChange,
  parseDateInput,
  removeFiles,
  requireStudent,
  revokeOfficialDocuments,
  wibParts,
  writeSamplePdf,
} from "./devtools-support.js";

export const PARTICIPANT_TARGETS = ["registered", "eligible", "appointed", "rejected", "finalized"];
export const PARTICIPANT_STATUS_LABELS = {
  registered: "Terdaftar",
  eligible: "Memenuhi Syarat",
  appointed: "Ditetapkan",
  rejected: "Ditolak",
  finalized: "Final",
};
export const PERIOD_STATUS_LABELS = { draft: "Draf", open: "Pendaftaran Dibuka", closed: "Pendaftaran Ditutup", ongoing: "Berlangsung Hari Ini", completed: "Selesai" };

const REQUIRED_SKS = 146;
const LOCKED_PARTICIPANT = ["appointed", "finalized", "rejected"];
const CPL_REPORT_STATUSES = ["eligible", "appointed", "finalized"];
const CERTIFICATE_STATUSES = ["appointed", "finalized"];
const TX_OPTIONS = { timeout: 60_000, maxWait: 10_000 };

/** The period status the modules show, from the dates (same rule as the yudisium services). */
export function derivePeriodStatus(item, now = new Date()) {
  const openDate = item.registrationOpenDate ? new Date(item.registrationOpenDate) : null;
  const closeDate = item.registrationCloseDate ? new Date(item.registrationCloseDate) : null;
  const eventDate = item.eventDate ? new Date(item.eventDate) : null;
  if (eventDate) {
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + DAY - 1);
    if (eventDate < todayStart) return "completed";
    if (eventDate <= todayEnd) return "ongoing";
  }
  if (!openDate || now < openDate) return "draft";
  if (closeDate && now > closeDate) return "closed";
  return "open";
}

// ─── Periods ───────────────────────────────────────────────────────────────────────────────

const PERIOD_SELECT = {
  id: true,
  name: true,
  registrationOpenDate: true,
  registrationCloseDate: true,
  eventDate: true,
  exitSurveyOpenDate: true,
  exitSurveyCloseDate: true,
  appointedAt: true,
  decreeUploadedAt: true,
  exitSurveyFormId: true,
  _count: { select: { participants: true, requirementItems: true } },
};

const mapPeriod = (row) => ({
  id: row.id,
  name: row.name,
  registrationOpenDate: row.registrationOpenDate,
  registrationCloseDate: row.registrationCloseDate,
  eventDate: row.eventDate,
  exitSurveyOpenDate: row.exitSurveyOpenDate,
  exitSurveyCloseDate: row.exitSurveyCloseDate,
  appointedAt: row.appointedAt,
  decreeUploadedAt: row.decreeUploadedAt,
  hasExitSurvey: !!row.exitSurveyFormId,
  participantCount: row._count?.participants ?? 0,
  requirementCount: row._count?.requirementItems ?? 0,
  status: derivePeriodStatus(row),
});

export async function listPeriods() {
  const rows = await prisma.yudisium.findMany({ select: PERIOD_SELECT, orderBy: [{ registrationOpenDate: "desc" }, { createdAt: "desc" }] });
  return rows.map(mapPeriod);
}

const PERIOD_DATE_FIELDS = ["registrationOpenDate", "registrationCloseDate", "eventDate", "exitSurveyOpenDate", "exitSurveyCloseDate"];

/** Consistent dates for a quick button, relative to `now`. */
export function periodPreset(preset, now = new Date()) {
  const today = wibParts(now).date;
  const dayFrom = (offset) => new Date(today.getTime() + offset * DAY);
  if (preset === "open") {
    const close = new Date(now.getTime() + 14 * DAY);
    return { registrationOpenDate: new Date(now.getTime() - HOUR), registrationCloseDate: close, eventDate: new Date(close.getTime() + 7 * DAY), exitSurveyOpenDate: dayFrom(0), exitSurveyCloseDate: dayFrom(14) };
  }
  if (preset === "close") {
    return { registrationOpenDate: new Date(now.getTime() - 14 * DAY), registrationCloseDate: new Date(now.getTime() - MINUTE), eventDate: new Date(now.getTime() + 7 * DAY), exitSurveyOpenDate: dayFrom(-14), exitSurveyCloseDate: dayFrom(-1) };
  }
  if (preset === "event") {
    return { registrationOpenDate: new Date(now.getTime() - 21 * DAY), registrationCloseDate: new Date(now.getTime() - 7 * DAY), eventDate: now, exitSurveyOpenDate: dayFrom(-21), exitSurveyCloseDate: dayFrom(-7) };
  }
  throw new BadRequestError("Pilihan tanggal cepat tidak dikenal.");
}

export function periodDatesFromInput(body = {}) {
  if (body.preset !== undefined) return periodPreset(body.preset);
  const data = {};
  for (const field of PERIOD_DATE_FIELDS) {
    if (body[field] === undefined) continue;
    const value = parseDateInput(body[field], "Tanggal");
    data[field] = value && field.startsWith("exitSurvey") ? wibParts(value).date : value;
  }
  if (Object.keys(data).length === 0) throw new BadRequestError("Tidak ada tanggal yang diubah.");
  return data;
}

export async function updatePeriodDates({ yudisiumId, body, actorUserId }) {
  const existing = await prisma.yudisium.findUnique({ where: { id: yudisiumId }, select: PERIOD_SELECT });
  if (!existing) throw new NotFoundError("Periode yudisium tidak ditemukan");
  const data = periodDatesFromInput(body);
  const merged = { ...existing, ...data };
  if (merged.registrationOpenDate && merged.registrationCloseDate && merged.registrationOpenDate > merged.registrationCloseDate) {
    throw new BadRequestError("Tanggal buka pendaftaran harus sebelum tanggal tutup.");
  }
  const updated = await prisma.yudisium.update({ where: { id: yudisiumId }, data, select: PERIOD_SELECT });
  const pick = (row) => Object.fromEntries(Object.keys(data).map((key) => [key, row[key]]));
  await logDevtoolsChange({
    actorUserId,
    entityType: ENTITY_TYPES.YUDISIUM,
    entityId: yudisiumId,
    operation: "dates",
    scope: "yudisium",
    oldValues: pick(existing),
    newValues: pick(updated),
  });
  return mapPeriod(updated);
}

// ─── Student view ──────────────────────────────────────────────────────────────────────────

async function academicContext(client, studentId) {
  const student = await requireStudent(studentId, client);
  const thesis = await findCurrentThesis(client, studentId);
  const defence = thesis
    ? await client.thesisDefence.findFirst({ where: { thesisId: thesis.id }, orderBy: { createdAt: "desc" }, select: { status: true, revisionFinalizedAt: true, revisionFinalizedBy: true } })
    : null;
  return { student, thesis, defence };
}

/** The academic requirements the yudisium module checks before the exit survey. */
function academicGaps(student, defence) {
  const passed = ["passed", "passed_with_revision"].includes(defence?.status);
  const revisionFinal = defence?.status !== "passed_with_revision" || (!!defence.revisionFinalizedAt && !!defence.revisionFinalizedBy);
  return {
    defence: !(passed && revisionFinal),
    sks: (student.sksCompleted ?? 0) < REQUIRED_SKS,
    courses: !(student.mandatoryCoursesCompleted && student.mkwuCompleted && student.internshipCompleted && student.kknCompleted),
  };
}

const PARTICIPANT_INCLUDE = {
  yudisium: {
    select: {
      ...PERIOD_SELECT,
      requirementItems: { orderBy: { order: "asc" }, select: { id: true, yudisiumRequirement: { select: { name: true } } } },
    },
  },
  yudisiumParticipantRequirements: { select: { yudisiumRequirementItemId: true, status: true, verifiedAt: true, filePath: true } },
  _count: { select: { exitSurveyAnswers: true, yudisiumCplRecommendations: true } },
};

async function cplTable(client, studentId) {
  const [cpls, scores] = await Promise.all([
    client.cpl.findMany({ where: { isActive: true }, orderBy: [{ displayOrder: "asc" }, { code: "asc" }], select: { id: true, code: true, description: true, minimalScore: true } }),
    client.studentCplScore.findMany({ where: { studentId } }),
  ]);
  const byCpl = new Map(scores.map((s) => [s.cplId, s]));
  return cpls.map((cpl) => {
    const score = byCpl.get(cpl.id);
    return {
      cplId: cpl.id,
      code: cpl.code,
      description: cpl.description,
      minimalScore: cpl.minimalScore,
      score: score?.score ?? null,
      oldScore: score?.oldCplScore ?? null,
      status: score?.status ?? null,
      passed: score ? score.score >= cpl.minimalScore : false,
      hasRecommendation: !!score?.recommendationDocumentPath,
      hasSettlement: !!score?.settlementDocumentPath,
      validatedAt: score?.validatedAt ?? null,
    };
  });
}

export async function getStudentYudisium(studentId) {
  const { student, thesis, defence } = await academicContext(prisma, studentId);
  const participants = thesis
    ? await prisma.yudisiumParticipant.findMany({ where: { thesisId: thesis.id }, include: PARTICIPANT_INCLUDE, orderBy: { createdAt: "desc" } })
    : [];
  const gaps = academicGaps(student, defence);
  return {
    student: { id: student.id, fullName: student.user?.fullName ?? "-", nim: student.user?.identityNumber ?? "-", sksCompleted: student.sksCompleted },
    thesis: thesis ? { id: thesis.id, title: thesis.title, status: thesis.status } : null,
    academic: { defencePassed: !gaps.defence, sksMet: !gaps.sks, coursesMet: !gaps.courses },
    participants: participants.map((p) => {
      const records = new Map(p.yudisiumParticipantRequirements.map((r) => [r.yudisiumRequirementItemId, r]));
      return {
        id: p.id,
        period: mapPeriod(p.yudisium),
        status: p.status,
        registeredAt: p.registeredAt,
        exitSurveySubmittedAt: p.exitSurveySubmittedAt,
        exitSurveyAnswers: p._count.exitSurveyAnswers,
        requirementVerifiedAt: p.requirementVerifiedAt,
        cplValidatedAt: p.cplValidatedAt,
        requirements: p.yudisium.requirementItems.map((item) => ({
          itemId: item.id,
          name: item.yudisiumRequirement?.name ?? "-",
          status: records.get(item.id)?.status ?? null,
          verifiedAt: records.get(item.id)?.verifiedAt ?? null,
        })),
      };
    }),
    cpl: await cplTable(prisma, studentId),
  };
}

// ─── Writes shared by the actions ──────────────────────────────────────────────────────────

const repairFolder = (studentId) => `uploads/yudisium/cpl-repair/${studentId}`;

async function sampleAnswers(tx, participant, formId) {
  const questions = await tx.exitSurveyQuestion.findMany({
    where: { exitSurveyFormId: formId },
    orderBy: [{ orderNumber: "asc" }],
    select: { id: true, questionType: true, options: { orderBy: { orderNumber: "asc" }, select: { id: true } } },
  });
  await tx.yudisiumParticipantExitSurveyAnswer.deleteMany({ where: { yudisiumParticipantId: participant.id } });
  const today = wibParts(new Date()).date;
  for (const question of questions) {
    const base = { yudisiumParticipantId: participant.id, exitSurveyFormId: formId, exitSurveyQuestionId: question.id };
    const type = question.questionType;
    const first = question.options[0]?.id ?? null;
    await tx.yudisiumParticipantExitSurveyAnswer.create({
      data: {
        ...base,
        exitSurveyOptionId: type === "single_choice" ? first : null,
        answerText: type === "short_answer" ? "Jawaban contoh" : type === "paragraph" ? "Jawaban contoh untuk uji coba exit survey." : null,
        answerNumber: type === "number" ? 4 : null,
        answerDate: type === "date" ? today : null,
      },
    });
    if (type === "multiple_choice") {
      for (const option of question.options.slice(0, 2)) {
        await tx.yudisiumParticipantExitSurveySelectedOption.create({ data: { ...base, exitSurveyOptionId: option.id } });
      }
    }
  }
  return questions.length;
}

async function fillExitSurvey(tx, participant, now) {
  const count = await sampleAnswers(tx, participant, participant.exitSurveyFormId);
  await tx.yudisiumParticipant.update({ where: { id: participant.id }, data: { exitSurveySubmittedAt: now } });
  return count;
}

async function ensureRequirementRecords(tx, participant, items, ctx, now) {
  const existing = new Set((await tx.yudisiumParticipantRequirement.findMany({ where: { yudisiumParticipantId: participant.id }, select: { yudisiumRequirementItemId: true } })).map((r) => r.yudisiumRequirementItemId));
  for (const item of items) {
    if (existing.has(item.id)) continue;
    const file = await writeSamplePdf(
      `uploads/yudisium/${participant.yudisiumId}/${participant.id}`,
      `req-${item.id}-devtools.pdf`,
      item.yudisiumRequirement?.name ?? "Dokumen persyaratan yudisium",
      [ctx.student.user?.fullName ?? "-", ctx.student.user?.identityNumber ?? "-"],
    );
    await tx.yudisiumParticipantRequirement.create({
      data: { yudisiumParticipantId: participant.id, yudisiumRequirementItemId: item.id, yudisiumId: participant.yudisiumId, ...file, submittedAt: now, status: "submitted" },
    });
  }
}

/** `requirementVerifiedAt` as the document verification sets it: when every item is approved. */
async function syncRequirementVerification(tx, participant, now) {
  const expected = await tx.yudisiumRequirementItem.count({ where: { yudisiumId: participant.yudisiumId } });
  const approved = await tx.yudisiumParticipantRequirement.count({ where: { yudisiumParticipantId: participant.id, status: "approved" } });
  const verified = expected > 0 && approved >= expected;
  await tx.yudisiumParticipant.update({ where: { id: participant.id }, data: { requirementVerifiedAt: verified ? now : null } });
  return verified;
}

async function setRequirementStatus(tx, participantId, itemIds, status, actorUserId, now) {
  await tx.yudisiumParticipantRequirement.updateMany({
    where: { yudisiumParticipantId: participantId, ...(itemIds ? { yudisiumRequirementItemId: { in: itemIds } } : {}) },
    data: status === "submitted"
      ? { status, verifiedBy: null, verifiedAt: null, notes: null }
      : { status, verifiedBy: actorUserId, verifiedAt: now, notes: status === "declined" ? "Ditolak lewat DevTools." : null },
  });
}

/** The CPL validation as the module stores it, then `cplValidatedAt` of the open participants. */
async function syncCplValidation(tx, studentId, now) {
  const [cpls, scores] = await Promise.all([
    tx.cpl.findMany({ where: { isActive: true }, select: { id: true } }),
    tx.studentCplScore.findMany({ where: { studentId }, select: { cplId: true, status: true, validatedAt: true, validatedBy: true } }),
  ]);
  const active = new Set(cpls.map((c) => c.id));
  const relevant = scores.filter((s) => active.has(s.cplId));
  const validated = (s) => s.status === "finalized" || s.status === "validated" || !!s.validatedBy || !!s.validatedAt;
  const allValidated = relevant.length > 0 && relevant.every(validated);
  const open = await tx.yudisiumParticipant.findMany({
    where: { thesis: { studentId }, registeredAt: { not: null }, status: { notIn: LOCKED_PARTICIPANT } },
    select: { id: true },
  });
  for (const participant of open) {
    await tx.yudisiumParticipant.update({ where: { id: participant.id }, data: { cplValidatedAt: allValidated ? now : null } });
    await recomputeParticipantEligibility(tx, participant.id);
  }
  return allValidated;
}

const RESET_VALIDATION = { status: "calculated", validatedAt: null, validatedBy: null };
const CLEAR_REPAIR = {
  oldCplScore: null,
  recommendationDocumentPath: null,
  recommendationDocumentName: null,
  recommendationDocumentMimeType: null,
  recommendationDocumentSize: null,
  settlementDocumentPath: null,
  settlementDocumentName: null,
  settlementDocumentMimeType: null,
  settlementDocumentSize: null,
};

async function recommendationColumns(studentId, cpl, kind) {
  const prefix = kind === "settlement" ? "set" : "rec";
  const title = kind === "settlement" ? `Bukti Penyelesaian ${cpl.code}` : `Surat Rekomendasi Tindak Lanjut ${cpl.code}`;
  const file = await writeSamplePdf(repairFolder(studentId), `${prefix}-${cpl.id}-devtools.pdf`, title, [cpl.description ?? ""]);
  const key = kind === "settlement" ? "settlement" : "recommendation";
  return {
    [`${key}DocumentPath`]: file.filePath,
    [`${key}DocumentName`]: file.fileName,
    [`${key}DocumentMimeType`]: file.mimeType,
    [`${key}DocumentSize`]: file.fileSize,
  };
}

/** The GKM repair of a CPL under its minimum: documents, old score kept, new score, validated. */
async function repairCpl(tx, studentId, cpl, score, validatorId, now) {
  const recommendation = score.recommendationDocumentPath ? {} : await recommendationColumns(studentId, cpl, "recommendation");
  const settlement = score.settlementDocumentPath ? {} : await recommendationColumns(studentId, cpl, "settlement");
  await tx.studentCplScore.update({
    where: { studentId_cplId: { studentId, cplId: cpl.id } },
    data: {
      ...recommendation,
      ...settlement,
      oldCplScore: score.oldCplScore ?? score.score,
      score: Math.max(score.score, cpl.minimalScore),
      status: "validated",
      validatedAt: now,
      validatedBy: validatorId,
    },
  });
}

/** Every active CPL has a score and is validated; a score under the minimum is repaired first. */
async function validateAllCpl(tx, studentId, now) {
  const validatorId = await findLecturerWithRole(tx, ROLES.GKM);
  const cpls = await tx.cpl.findMany({ where: { isActive: true }, select: { id: true, code: true, description: true, minimalScore: true } });
  for (const cpl of cpls) {
    let score = await tx.studentCplScore.findUnique({ where: { studentId_cplId: { studentId, cplId: cpl.id } } });
    if (!score) {
      score = await tx.studentCplScore.create({ data: { studentId, cplId: cpl.id, score: Math.min(100, Math.max(80, cpl.minimalScore + 10)), source: "manual", inputAt: now } });
    }
    if (score.status === "finalized") continue;
    if (score.score < cpl.minimalScore) await repairCpl(tx, studentId, cpl, score, validatorId, now);
    else if (score.status !== "validated") {
      await tx.studentCplScore.update({ where: { studentId_cplId: { studentId, cplId: cpl.id } }, data: { status: "validated", validatedAt: now, validatedBy: validatorId } });
    }
  }
}

// ─── Registration and removal ──────────────────────────────────────────────────────────────

async function participantContext(client, participantId) {
  const participant = await client.yudisiumParticipant.findUnique({
    where: { id: participantId },
    include: { yudisium: { select: { id: true, name: true, exitSurveyFormId: true, requirementItems: { select: { id: true, yudisiumRequirement: { select: { name: true } } } } } }, thesis: { select: { id: true, studentId: true } } },
  });
  if (!participant) throw new NotFoundError("Peserta yudisium tidak ditemukan");
  const student = await requireStudent(participant.thesis.studentId, client);
  return { participant, student, items: participant.yudisium.requirementItems };
}

export async function previewRegister({ studentId, yudisiumId }) {
  const { prerequisites, effects } = await planRegister(studentId, yudisiumId);
  return { prerequisites, effects };
}

async function planRegister(studentId, yudisiumId) {
  const { student, thesis, defence } = await academicContext(prisma, studentId);
  if (!thesis) throw new BadRequestError("Mahasiswa ini belum punya tugas akhir.");
  const period = await prisma.yudisium.findUnique({ where: { id: yudisiumId }, select: { id: true, name: true, exitSurveyFormId: true, _count: { select: { requirementItems: true } } } });
  if (!period) throw new NotFoundError("Periode yudisium tidak ditemukan");
  if (!period.exitSurveyFormId) throw new BadRequestError("Periode ini belum punya formulir exit survey.");
  const gaps = academicGaps(student, defence);
  if (gaps.defence) throw new BadRequestError("Mahasiswa ini belum lulus sidang atau revisi sidangnya belum final. Ubah status sidang dulu.");
  if (await prisma.yudisiumParticipant.findFirst({ where: { thesisId: thesis.id, yudisiumId } })) {
    throw new ConflictError("Mahasiswa ini sudah terdaftar di periode tersebut.");
  }
  const prerequisites = [];
  if (gaps.sks) prerequisites.push(`SKS selesai dinaikkan ke ${REQUIRED_SKS}`);
  if (gaps.courses) prerequisites.push("Ditandai lulus mata kuliah wajib, MKWU, kerja praktik, dan KKN");
  const effects = [
    `Terdaftar di ${period.name} dengan status Terdaftar`,
    "Exit survey diisi dengan jawaban contoh",
    `${period._count.requirementItems} dokumen persyaratan contoh diunggah (belum diverifikasi)`,
  ];
  return { student, thesis, period, gaps, prerequisites, effects };
}

export async function registerParticipant({ studentId, yudisiumId, actorUserId }) {
  const plan = await planRegister(studentId, yudisiumId);
  const now = new Date();
  const id = await prisma.$transaction(async (tx) => {
    const academic = {};
    if (plan.gaps.sks) academic.sksCompleted = REQUIRED_SKS;
    if (plan.gaps.courses) Object.assign(academic, { mandatoryCoursesCompleted: true, mkwuCompleted: true, internshipCompleted: true, kknCompleted: true });
    if (Object.keys(academic).length) await tx.student.update({ where: { id: studentId }, data: academic });
    const participant = await tx.yudisiumParticipant.create({
      data: { yudisiumId, thesisId: plan.thesis.id, exitSurveyFormId: plan.period.exitSurveyFormId, exitSurveySubmittedAt: now, registeredAt: now, status: "registered" },
    });
    await sampleAnswers(tx, participant, plan.period.exitSurveyFormId);
    const items = await tx.yudisiumRequirementItem.findMany({ where: { yudisiumId }, select: { id: true, yudisiumRequirement: { select: { name: true } } } });
    await ensureRequirementRecords(tx, participant, items, { student: plan.student }, now);
    await recomputeParticipantEligibility(tx, participant.id);
    return participant.id;
  }, TX_OPTIONS);
  await logDevtoolsChange({ actorUserId, entityType: ENTITY_TYPES.STUDENT, entityId: studentId, operation: "register", scope: "yudisium", details: [...plan.prerequisites, ...plan.effects] });
  return { id, prerequisites: plan.prerequisites, effects: plan.effects };
}

async function planRemove(participantId) {
  const ctx = await participantContext(prisma, participantId);
  const repaired = await prisma.studentCplScore.count({ where: { studentId: ctx.student.id, OR: [{ recommendationDocumentPath: { not: null } }, { oldCplScore: { not: null } }] } });
  const documents = await prisma.officialGeneratedDocument.count({ where: { sourceId: participantId, status: "current" } });
  const effects = [
    `Keikutsertaan di ${ctx.participant.yudisium.name} dihapus beserta dokumen persyaratan dan jawaban exit survey`,
    "Validasi CPL mahasiswa dibatalkan",
  ];
  if (repaired > 0) effects.push(`${repaired} rekomendasi CPL dihapus; nilai CPL kembali ke nilai sebelum perbaikan`);
  if (documents > 0) effects.push(`${documents} dokumen resmi akan dicabut`);
  return { ...ctx, effects };
}

export async function previewRemoveParticipant({ participantId }) {
  const { effects } = await planRemove(participantId);
  return { prerequisites: [], effects };
}

export async function removeParticipant({ participantId, actorUserId }) {
  const { participant, student, effects } = await planRemove(participantId);
  const files = [
    ...(await prisma.yudisiumParticipantRequirement.findMany({ where: { yudisiumParticipantId: participantId }, select: { filePath: true } })).map((r) => r.filePath),
  ];
  const scores = await prisma.studentCplScore.findMany({ where: { studentId: student.id } });
  files.push(...scores.flatMap((s) => [s.recommendationDocumentPath, s.settlementDocumentPath]));
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await revokeOfficialDocuments(tx, participantId, null, now);
    await tx.studentExitSurveyResponse.deleteMany({ where: { yudisiumId: participant.yudisiumId, thesisId: participant.thesisId } });
    await tx.yudisiumParticipant.delete({ where: { id: participantId } });
    for (const score of scores) {
      await tx.studentCplScore.update({
        where: { studentId_cplId: { studentId: student.id, cplId: score.cplId } },
        data: { ...RESET_VALIDATION, ...CLEAR_REPAIR, finalizedAt: null, score: score.oldCplScore ?? score.score },
      });
    }
  }, TX_OPTIONS);
  await removeFiles(files);
  await logDevtoolsChange({ actorUserId, entityType: ENTITY_TYPES.STUDENT, entityId: student.id, operation: "delete", scope: "yudisium", oldValues: { participantStatus: participant.status }, details: effects });
  return { effects };
}

// ─── Participant status ────────────────────────────────────────────────────────────────────

async function planParticipantStatus(participantId, target) {
  if (!PARTICIPANT_TARGETS.includes(target)) throw new BadRequestError("Status peserta tidak dikenal.");
  const ctx = await participantContext(prisma, participantId);
  const { participant } = ctx;
  if (participant.status === target) throw new BadRequestError(`Peserta sudah berstatus ${PARTICIPANT_STATUS_LABELS[target]}.`);
  const complete = (target) => ["eligible", "appointed", "finalized"].includes(target);
  const effects = [`Status peserta: ${PARTICIPANT_STATUS_LABELS[participant.status]} → ${PARTICIPANT_STATUS_LABELS[target]}`];
  const plan = { ...ctx, target, effects };

  plan.fillSurvey = !participant.exitSurveySubmittedAt;
  if (plan.fillSurvey) effects.push("Exit survey diisi dengan jawaban contoh");
  const records = await prisma.yudisiumParticipantRequirement.findMany({ where: { yudisiumParticipantId: participantId }, select: { status: true } });
  plan.addDocuments = ctx.items.length - records.length;
  if (plan.addDocuments > 0) effects.push(`${plan.addDocuments} dokumen persyaratan contoh diunggah`);

  if (complete(target)) {
    plan.verifyDocuments = !participant.requirementVerifiedAt || plan.addDocuments > 0 || records.some((r) => r.status !== "approved");
    plan.validateCpl = !participant.cplValidatedAt;
    if (plan.verifyDocuments) effects.push("Semua dokumen persyaratan ditandai terverifikasi");
    if (plan.validateCpl) {
      const cpls = await cplTable(prisma, ctx.student.id);
      const failing = cpls.filter((c) => c.score !== null && !c.passed && c.status !== "finalized").length;
      const missing = cpls.filter((c) => c.score === null).length;
      effects.push("Semua CPL divalidasi GKM");
      if (failing) effects.push(`${failing} CPL di bawah nilai minimal diperbaiki lewat rekomendasi tindak lanjut (nilai lama disimpan)`);
      if (missing) effects.push(`${missing} nilai CPL yang belum ada dibuat`);
    }
  } else {
    // Terdaftar and Ditolak: not both checks complete (Ditolak is a participant left registered at finalization).
    plan.unverifyDocuments = !!participant.requirementVerifiedAt && !!participant.cplValidatedAt;
    if (plan.unverifyDocuments) effects.push("Verifikasi dokumen persyaratan dibatalkan, agar tidak memenuhi kedua syarat");
  }
  plan.finalizeCpl = target === "finalized";
  plan.unfinalizeCpl = participant.status === "finalized" && target !== "finalized";
  if (plan.finalizeCpl) effects.push("Nilai CPL mahasiswa menjadi final", "Status mahasiswa tidak diubah (di aplikasi, unggah SK yudisium yang menjadikannya Lulus)");
  if (plan.unfinalizeCpl) effects.push("Nilai CPL kembali tervalidasi (tidak final)");

  const revokeKinds = [];
  if (!CERTIFICATE_STATUSES.includes(target)) revokeKinds.push("yudisium_learning_certificate");
  if (!CPL_REPORT_STATUSES.includes(target)) revokeKinds.push("yudisium_cpl_report");
  plan.revokeKinds = revokeKinds;
  plan.revokeCount = revokeKinds.length
    ? await prisma.officialGeneratedDocument.count({ where: { sourceId: participantId, status: "current", documentKind: { in: revokeKinds } } })
    : 0;
  if (plan.revokeCount > 0) effects.push(`${plan.revokeCount} dokumen resmi akan dicabut`);
  return plan;
}

export async function previewParticipantStatus({ participantId, target }) {
  const plan = await planParticipantStatus(participantId, target);
  return { prerequisites: [], effects: plan.effects };
}

export async function applyParticipantStatus({ participantId, target, actorUserId }) {
  const plan = await planParticipantStatus(participantId, target);
  const { participant, student } = plan;
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    if (!participant.registeredAt) await tx.yudisiumParticipant.update({ where: { id: participant.id }, data: { registeredAt: now } });
    if (plan.fillSurvey) await fillExitSurvey(tx, participant, now);
    await ensureRequirementRecords(tx, participant, plan.items, { student }, now);
    if (plan.unfinalizeCpl) {
      await tx.studentCplScore.updateMany({ where: { studentId: student.id, status: "finalized" }, data: { status: "validated", finalizedAt: null } });
    }
    // Open the participant for the module rules, then reach the target.
    await tx.yudisiumParticipant.update({ where: { id: participant.id }, data: { status: "registered" } });
    if (plan.unverifyDocuments) {
      await setRequirementStatus(tx, participant.id, null, "submitted", actorUserId, now);
      await syncRequirementVerification(tx, participant, now);
    }
    if (plan.verifyDocuments) {
      await setRequirementStatus(tx, participant.id, null, "approved", actorUserId, now);
      await syncRequirementVerification(tx, participant, now);
    }
    if (plan.validateCpl) {
      await validateAllCpl(tx, student.id, now);
      await syncCplValidation(tx, student.id, now);
    }
    await recomputeParticipantEligibility(tx, participant.id);
    if (!["registered", "eligible"].includes(target)) {
      await tx.yudisiumParticipant.update({ where: { id: participant.id }, data: { status: target } });
    }
    if (plan.finalizeCpl) {
      await tx.studentCplScore.updateMany({ where: { studentId: student.id, status: { not: "finalized" } }, data: { status: "finalized", finalizedAt: now } });
    }
    if (plan.revokeCount > 0) await revokeOfficialDocuments(tx, participant.id, plan.revokeKinds, now);
    const after = await tx.yudisiumParticipant.findUnique({ where: { id: participant.id }, select: { status: true } });
    if (after.status !== target) throw new ConflictError(`Status peserta menjadi ${PARTICIPANT_STATUS_LABELS[after.status]}, bukan ${PARTICIPANT_STATUS_LABELS[target]}.`);
  }, TX_OPTIONS);
  await logDevtoolsChange({
    actorUserId,
    entityType: ENTITY_TYPES.STUDENT,
    entityId: student.id,
    operation: "status",
    scope: "yudisium",
    oldValues: { participantStatus: participant.status },
    newValues: { participantStatus: target },
    details: plan.effects,
  });
  return { effects: plan.effects };
}

// ─── Requirement items and exit survey ─────────────────────────────────────────────────────

function assertOpenParticipant(participant) {
  if (LOCKED_PARTICIPANT.includes(participant.status)) {
    throw new BadRequestError("Item persyaratan hanya bisa diubah saat peserta Terdaftar atau Memenuhi Syarat. Ubah status peserta dulu.");
  }
}

export async function setRequirementItems({ participantId, itemId = null, action, actorUserId }) {
  if (!["approve", "decline"].includes(action)) throw new BadRequestError('Aksi harus "approve" atau "decline".');
  const { participant, student, items } = await participantContext(prisma, participantId);
  assertOpenParticipant(participant);
  const targets = itemId ? items.filter((i) => i.id === itemId) : items;
  if (itemId && targets.length === 0) throw new NotFoundError("Item persyaratan tidak ditemukan pada periode ini.");
  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    if (!participant.registeredAt) await tx.yudisiumParticipant.update({ where: { id: participant.id }, data: { registeredAt: now } });
    await ensureRequirementRecords(tx, participant, targets, { student }, now);
    await setRequirementStatus(tx, participant.id, targets.map((t) => t.id), action === "approve" ? "approved" : "declined", actorUserId, now);
    const verified = await syncRequirementVerification(tx, participant, now);
    const updated = await recomputeParticipantEligibility(tx, participant.id);
    return { requirementVerified: verified, participantStatus: updated?.status ?? participant.status };
  }, TX_OPTIONS);
  await logDevtoolsChange({
    actorUserId,
    entityType: ENTITY_TYPES.STUDENT,
    entityId: student.id,
    operation: "requirement",
    scope: "yudisium",
    newValues: { action, items: targets.map((t) => t.yudisiumRequirement?.name ?? t.id) },
  });
  return result;
}

export async function setExitSurvey({ participantId, action, actorUserId }) {
  if (!["fill", "clear"].includes(action)) throw new BadRequestError('Aksi harus "fill" atau "clear".');
  const { participant, student } = await participantContext(prisma, participantId);
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    if (action === "fill") {
      await fillExitSurvey(tx, participant, now);
    } else {
      await tx.yudisiumParticipantExitSurveyAnswer.deleteMany({ where: { yudisiumParticipantId: participant.id } });
      await tx.studentExitSurveyResponse.deleteMany({ where: { yudisiumId: participant.yudisiumId, thesisId: participant.thesisId } });
      await tx.yudisiumParticipant.update({ where: { id: participant.id }, data: { exitSurveySubmittedAt: null } });
    }
  }, TX_OPTIONS);
  await logDevtoolsChange({ actorUserId, entityType: ENTITY_TYPES.STUDENT, entityId: student.id, operation: "exit_survey", scope: "yudisium", newValues: { action } });
  return { exitSurveySubmitted: action === "fill" };
}

// ─── CPL ───────────────────────────────────────────────────────────────────────────────────

async function assertCplEditable(client, studentId) {
  const locked = await client.yudisiumParticipant.findFirst({ where: { thesis: { studentId }, status: { in: ["appointed", "finalized"] } }, select: { id: true } });
  if (locked) throw new BadRequestError("Mahasiswa ini sudah Ditetapkan atau Final di yudisium. Ubah status pesertanya dulu.");
}

async function requireCpl(client, cplId) {
  const cpl = await client.cpl.findUnique({ where: { id: cplId }, select: { id: true, code: true, description: true, minimalScore: true, isActive: true } });
  if (!cpl) throw new NotFoundError("CPL tidak ditemukan");
  return cpl;
}

function parseScore(value) {
  const score = Number(value);
  if (!Number.isFinite(score) || score < 0 || score > 100) throw new BadRequestError("Nilai CPL harus 0–100.");
  return Math.round(score);
}

/** Writes a CPL score; a changed score is no longer validated, and a passing one needs no repair. */
async function writeCplScore(tx, studentId, cpl, value, now) {
  const existing = await tx.studentCplScore.findUnique({ where: { studentId_cplId: { studentId, cplId: cpl.id } } });
  const passing = value >= cpl.minimalScore;
  if (!existing) {
    await tx.studentCplScore.create({ data: { studentId, cplId: cpl.id, score: value, source: "manual", inputAt: now } });
    return [];
  }
  if (existing.score === value) return [];
  await tx.studentCplScore.update({
    where: { studentId_cplId: { studentId, cplId: cpl.id } },
    data: { score: value, inputAt: now, ...RESET_VALIDATION, ...(passing ? CLEAR_REPAIR : {}) },
  });
  return passing ? [existing.recommendationDocumentPath, existing.settlementDocumentPath] : [];
}

async function cplWrite({ studentId, actorUserId, operation, details, write }) {
  await requireStudent(studentId);
  await assertCplEditable(prisma, studentId);
  const now = new Date();
  const files = await prisma.$transaction(async (tx) => {
    const removed = await write(tx, now);
    await syncCplValidation(tx, studentId, now);
    return removed ?? [];
  }, TX_OPTIONS);
  await removeFiles(files);
  await logDevtoolsChange({ actorUserId, entityType: ENTITY_TYPES.STUDENT, entityId: studentId, operation, scope: "cpl", newValues: details });
  return { cpl: await cplTable(prisma, studentId) };
}

export async function setCplScore({ studentId, cplId, score, actorUserId }) {
  const cpl = await requireCpl(prisma, cplId);
  const value = parseScore(score);
  return cplWrite({ studentId, actorUserId, operation: "cpl_score", details: { cpl: cpl.code, score: value }, write: (tx, now) => writeCplScore(tx, studentId, cpl, value, now) });
}

export async function setAllCplPassing({ studentId, actorUserId }) {
  return cplWrite({
    studentId,
    actorUserId,
    operation: "cpl_all_pass",
    details: { action: "Semua memenuhi" },
    write: async (tx, now) => {
      const cpls = await tx.cpl.findMany({ where: { isActive: true }, select: { id: true, code: true, minimalScore: true } });
      const removed = [];
      for (const cpl of cpls) {
        const existing = await tx.studentCplScore.findUnique({ where: { studentId_cplId: { studentId, cplId: cpl.id } } });
        if (existing?.status === "finalized") continue;
        if (!existing) removed.push(...(await writeCplScore(tx, studentId, cpl, Math.min(100, Math.max(80, cpl.minimalScore + 10)), now)));
        else if (existing.score < cpl.minimalScore) removed.push(...(await writeCplScore(tx, studentId, cpl, Math.min(100, cpl.minimalScore + 10), now)));
      }
      return removed;
    },
  });
}

export async function setOneCplFailing({ studentId, actorUserId }) {
  const cpls = await prisma.cpl.findMany({ where: { isActive: true }, orderBy: [{ displayOrder: "asc" }, { code: "asc" }], select: { id: true, code: true, minimalScore: true } });
  if (cpls.length === 0) throw new BadRequestError("Belum ada CPL aktif.");
  const [first, ...rest] = cpls;
  const value = Math.max(0, first.minimalScore - 10);
  return cplWrite({
    studentId,
    actorUserId,
    operation: "cpl_one_fail",
    details: { cpl: first.code, score: value },
    write: async (tx, now) => {
      for (const cpl of rest) {
        const existing = await tx.studentCplScore.findUnique({ where: { studentId_cplId: { studentId, cplId: cpl.id } } });
        if (!existing) await writeCplScore(tx, studentId, cpl, Math.min(100, Math.max(80, cpl.minimalScore + 10)), now);
      }
      const existing = await tx.studentCplScore.findUnique({ where: { studentId_cplId: { studentId, cplId: first.id } } });
      if (existing) {
        await tx.studentCplScore.update({ where: { studentId_cplId: { studentId, cplId: first.id } }, data: { score: value, inputAt: now, ...RESET_VALIDATION, ...CLEAR_REPAIR } });
        return [existing.recommendationDocumentPath, existing.settlementDocumentPath];
      }
      await writeCplScore(tx, studentId, first, value, now);
      return [];
    },
  });
}

/**
 * The GKM follow-up of a CPL under its minimum. `create`: the recommendation letter is attached
 * (the score stays under the minimum, not validated); `resolve`: the repair as the module saves
 * it (settlement document, old score kept, score at the minimum, validated); `delete`: both
 * documents removed and the score before the repair restored.
 */
export async function setCplRecommendation({ studentId, cplId, action, actorUserId }) {
  if (!["create", "resolve", "delete"].includes(action)) throw new BadRequestError('Aksi harus "create", "resolve", atau "delete".');
  const cpl = await requireCpl(prisma, cplId);
  const score = await prisma.studentCplScore.findUnique({ where: { studentId_cplId: { studentId, cplId } } });
  if (!score) throw new BadRequestError("Mahasiswa ini belum punya nilai untuk CPL tersebut.");
  if (score.status === "finalized") throw new BadRequestError("Nilai CPL ini sudah final.");
  if (action === "create") {
    if (score.score >= cpl.minimalScore) throw new BadRequestError("CPL ini sudah memenuhi nilai minimal; tidak perlu rekomendasi.");
    if (score.recommendationDocumentPath) throw new ConflictError("Rekomendasi CPL ini sudah ada.");
  }
  if (action === "resolve" && score.status === "validated" && score.oldCplScore !== null) throw new BadRequestError("Rekomendasi CPL ini sudah diselesaikan.");
  if (action === "resolve" && score.score >= cpl.minimalScore && !score.recommendationDocumentPath) {
    throw new BadRequestError("CPL ini sudah memenuhi nilai minimal; tidak ada yang perlu diselesaikan.");
  }
  if (action === "delete" && !score.recommendationDocumentPath && !score.settlementDocumentPath && score.oldCplScore === null) {
    throw new BadRequestError("CPL ini tidak punya rekomendasi.");
  }
  return cplWrite({
    studentId,
    actorUserId,
    operation: "cpl_recommendation",
    details: { cpl: cpl.code, action },
    write: async (tx, now) => {
      if (action === "create") {
        await tx.studentCplScore.update({ where: { studentId_cplId: { studentId, cplId } }, data: await recommendationColumns(studentId, cpl, "recommendation") });
        return [];
      }
      if (action === "resolve") {
        await repairCpl(tx, studentId, cpl, score, await findLecturerWithRole(tx, ROLES.GKM), now);
        return [];
      }
      await tx.studentCplScore.update({
        where: { studentId_cplId: { studentId, cplId } },
        data: { ...CLEAR_REPAIR, ...RESET_VALIDATION, score: score.oldCplScore ?? score.score },
      });
      return [score.recommendationDocumentPath, score.settlementDocumentPath];
    },
  });
}
