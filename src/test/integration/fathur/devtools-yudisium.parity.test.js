/**
 * DevTools reaches the same yudisium participant state as the module path: one participant goes
 * through the module services (Admin approves every document, the GKM validates every CPL and
 * repairs the one under its minimum), the other is moved to "Memenuhi Syarat" by DevTools. The
 * columns those steps change are compared. Runs on a real database.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import prisma from "../../../config/prisma.js";

vi.mock("../../../services/notification.service.js", () => ({
  createNotificationsForUsers: vi.fn().mockResolvedValue({ count: 1 }),
  createNotificationService: vi.fn().mockResolvedValue(true),
}));
vi.mock("../../../services/push.service.js", () => ({ sendFcmToUsers: vi.fn().mockResolvedValue({ success: true }) }));

const participantService = await import("../../../services/yudisium/participant.service.js");
const devtools = await import("../../../services/devtools/devtools-yudisium.service.js");
const { removeFiles } = await import("../../../services/devtools/devtools-support.js");

const ts = Date.now();
const created = { users: [], theses: [], cpls: [], curriculum: null, yudisium: null, form: null, requirements: [] };
let gkm, admin, cpls;

async function user(prefix, extra = {}) {
  const row = await prisma.user.create({
    data: { fullName: `${prefix} ${ts}`, identityNumber: `${prefix}-${ts}-${created.users.length}`, identityType: "OTHER", email: `${prefix.toLowerCase()}${ts}${created.users.length}@parity.test`, password: "p" },
  });
  created.users.push(row.id);
  if (extra.lecturer) await prisma.lecturer.create({ data: { id: row.id } });
  if (extra.student) await prisma.student.create({ data: { id: row.id, sksCompleted: 146, mandatoryCoursesCompleted: true, mkwuCompleted: true, internshipCompleted: true, kknCompleted: true } });
  return row;
}

/** A registered participant: exit survey answered, every document uploaded, one CPL under its minimum. */
async function registeredParticipant(label) {
  const student = await user(`Yud${label}`, { student: true });
  const thesis = await prisma.thesis.create({ data: { studentId: student.id, title: `Yudisium ${label} ${ts}`, status: "completed" } });
  created.theses.push(thesis.id);
  const participant = await prisma.yudisiumParticipant.create({
    data: { yudisiumId: created.yudisium.id, thesisId: thesis.id, exitSurveyFormId: created.form.id, exitSurveySubmittedAt: new Date(), registeredAt: new Date(), status: "registered" },
  });
  const items = await prisma.yudisiumRequirementItem.findMany({ where: { yudisiumId: created.yudisium.id } });
  for (const item of items) {
    await prisma.yudisiumParticipantRequirement.create({
      data: { yudisiumParticipantId: participant.id, yudisiumRequirementItemId: item.id, yudisiumId: created.yudisium.id, filePath: `uploads/parity/${participant.id}-${item.id}.pdf`, fileName: "x.pdf", mimeType: "application/pdf", fileSize: 1, submittedAt: new Date(), status: "submitted" },
    });
  }
  for (const [index, cpl] of cpls.entries()) {
    await prisma.studentCplScore.create({ data: { studentId: student.id, cplId: cpl.id, score: index === 0 ? cpl.minimalScore - 10 : cpl.minimalScore + 20, status: "calculated" } });
  }
  return { student, thesis, participant, items };
}

async function snapshot(ctx) {
  const participant = await prisma.yudisiumParticipant.findUnique({ where: { id: ctx.participant.id } });
  const records = await prisma.yudisiumParticipantRequirement.findMany({ where: { yudisiumParticipantId: ctx.participant.id } });
  const scores = await prisma.studentCplScore.findMany({ where: { studentId: ctx.student.id }, include: { cpl: true } });
  const active = scores.filter((s) => s.cpl.isActive);
  return {
    status: participant.status,
    requirementVerified: !!participant.requirementVerifiedAt,
    cplValidated: !!participant.cplValidatedAt,
    itemsApproved: records.length === ctx.items.length && records.every((r) => r.status === "approved" && !!r.verifiedAt),
    scoresValidated: active.every((s) => s.status === "validated" && !!s.validatedAt),
    scoresMeetMinimum: active.every((s) => s.score >= s.cpl.minimalScore),
    repairedKeepsOldScore: active.filter((s) => s.oldCplScore !== null).map((s) => s.oldCplScore < s.cpl.minimalScore),
    repairDocuments: active.filter((s) => s.recommendationDocumentPath && s.settlementDocumentPath).length,
  };
}

beforeAll(async () => {
  gkm = await user("Gkm", { lecturer: true });
  admin = await user("AdminYud");
  // The CPLs that count are the active ones; the test adds two of its own when none exist.
  cpls = await prisma.cpl.findMany({ where: { isActive: true } });
  if (cpls.length === 0) {
    created.curriculum = await prisma.curriculum.create({ data: { name: `Parity ${ts}`, startYear: 2021 } });
    for (const code of ["PAR-1", "PAR-2"]) {
      const cpl = await prisma.cpl.create({ data: { curriculumId: created.curriculum.id, code: `${code}-${ts}`, description: code, minimalScore: 55 } });
      created.cpls.push(cpl.id);
    }
    cpls = await prisma.cpl.findMany({ where: { isActive: true } });
  }
  created.form = await prisma.exitSurveyForm.create({ data: { title: `Parity ${ts}` } });
  for (const name of ["Bebas Pustaka", "Pas Foto"]) {
    created.requirements.push(await prisma.yudisiumRequirement.create({ data: { name: `${name} ${ts}` } }));
  }
  created.yudisium = await prisma.yudisium.create({
    data: {
      name: `Parity ${ts}`,
      exitSurveyFormId: created.form.id,
      registrationOpenDate: new Date(Date.now() - 86400000),
      registrationCloseDate: new Date(Date.now() + 86400000),
      requirementItems: { create: created.requirements.map((r, index) => ({ yudisiumRequirementId: r.id, order: index })) },
    },
  });
});

afterAll(async () => {
  const students = created.users;
  const scores = await prisma.studentCplScore.findMany({ where: { studentId: { in: students } } });
  await removeFiles(scores.flatMap((s) => [s.recommendationDocumentPath, s.settlementDocumentPath]));
  await prisma.yudisiumParticipant.deleteMany({ where: { yudisiumId: created.yudisium?.id } });
  await prisma.studentCplScore.deleteMany({ where: { studentId: { in: students } } });
  if (created.yudisium) await prisma.yudisium.delete({ where: { id: created.yudisium.id } });
  await prisma.yudisiumRequirement.deleteMany({ where: { id: { in: created.requirements.map((r) => r.id) } } });
  if (created.form) await prisma.exitSurveyForm.delete({ where: { id: created.form.id } });
  await prisma.cpl.deleteMany({ where: { id: { in: created.cpls } } });
  if (created.curriculum) await prisma.curriculum.delete({ where: { id: created.curriculum.id } });
  await prisma.auditLog.deleteMany({ where: { OR: [{ userId: { in: students } }, { entityId: { in: students } }] } });
  await prisma.thesis.deleteMany({ where: { id: { in: created.theses } } });
  await prisma.student.deleteMany({ where: { id: { in: students } } });
  await prisma.lecturer.deleteMany({ where: { id: { in: students } } });
  await prisma.user.deleteMany({ where: { id: { in: students } } });
});

describe("DevTools and the module path reach the same yudisium participant", () => {
  it("Memenuhi Syarat: documents approved, CPL validated (with the repair), status eligible", async () => {
    const module = await registeredParticipant("Modul");
    for (const item of module.items) {
      await participantService.verifyParticipantDocument(module.participant.id, item.id, { action: "approve", notes: null, userId: admin.id });
    }
    const pdf = { originalname: "rekomendasi.pdf", mimetype: "application/pdf", size: 4, buffer: Buffer.from("%PDF") };
    const [failing, ...passing] = cpls;
    await participantService.saveCplRepairment(module.participant.id, failing.id, {
      newScore: String(failing.minimalScore), oldScore: String(failing.minimalScore - 10), recommendationFile: pdf, settlementFile: { ...pdf, originalname: "penyelesaian.pdf" }, userId: gkm.id,
    });
    for (const cpl of passing) await participantService.validateCplScore(module.participant.id, cpl.id, gkm.id);

    const viaDevtools = await registeredParticipant("Dev");
    await devtools.applyParticipantStatus({ participantId: viaDevtools.participant.id, target: "eligible", actorUserId: admin.id });

    const a = await snapshot(module);
    const b = await snapshot(viaDevtools);
    expect(a).toMatchObject({ status: "eligible", requirementVerified: true, cplValidated: true, itemsApproved: true, scoresValidated: true, scoresMeetMinimum: true });
    expect(b).toEqual(a);
  });

  it("removing one approval sends both back to Terdaftar", async () => {
    const ctx = await registeredParticipant("Tolak");
    await devtools.applyParticipantStatus({ participantId: ctx.participant.id, target: "eligible", actorUserId: admin.id });
    await devtools.setRequirementItems({ participantId: ctx.participant.id, itemId: ctx.items[0].id, action: "decline", actorUserId: admin.id });
    const row = await prisma.yudisiumParticipant.findUnique({ where: { id: ctx.participant.id } });
    expect(row.status).toBe("registered");
    expect(row.requirementVerifiedAt).toBeNull();
  });

  it("Final keeps the student status; the CPL scores become final", async () => {
    const ctx = await registeredParticipant("Final");
    await devtools.applyParticipantStatus({ participantId: ctx.participant.id, target: "finalized", actorUserId: admin.id });
    const student = await prisma.student.findUnique({ where: { id: ctx.student.id } });
    const scores = await prisma.studentCplScore.findMany({ where: { studentId: ctx.student.id } });
    expect(student.status).toBe("active");
    expect(scores.every((s) => s.status === "finalized" && s.finalizedAt)).toBe(true);
  });
});
