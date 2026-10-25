/**
 * Yudisium stability: the participant status follows its two checks (documents verified, CPL
 * validated) whatever the order, also when a student registers again after being rejected; and
 * the coordinator's period edits keep the application rules. Runs on a real database.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { unlink } from "fs/promises";
import path from "path";
import prisma from "../../../config/prisma.js";

vi.mock("../../../services/notification.service.js", () => ({
  createNotificationsForUsers: vi.fn().mockResolvedValue({ count: 1 }),
  createNotificationService: vi.fn().mockResolvedValue(true),
}));
vi.mock("../../../services/push.service.js", () => ({ sendFcmToUsers: vi.fn().mockResolvedValue({ success: true }) }));
vi.mock("../../../services/outlook-calendar.service.js", () => ({
  syncYudisiumToOutlook: vi.fn().mockResolvedValue(true),
  createCalendarEvent: vi.fn().mockResolvedValue({ eventId: "x" }),
  hasCalendarAccess: vi.fn().mockResolvedValue(false),
}));

const participantService = await import("../../../services/yudisium/participant.service.js");
const studentService = await import("../../../services/yudisium/student.service.js");
const coreService = await import("../../../services/yudisium/core.service.js");

const DAY = 24 * 60 * 60 * 1000;
const ts = Date.now();
const created = { users: [], theses: [], periods: [], requirements: [], uploads: [] };
let admin, gkm, form, room, cpls, current, parkedPeriods = [];

const pdf = (name) => ({ originalname: name, mimetype: "application/pdf", size: 64, buffer: Buffer.from(`%PDF-1.4 ${name}`) });

async function user(label, extra = {}) {
  const row = await prisma.user.create({
    data: { fullName: `${label} ${ts}`, identityNumber: `${label}-${ts}-${created.users.length}`, identityType: "OTHER", email: `${label.toLowerCase()}-${ts}-${created.users.length}@eligibility.test`, password: "p" },
  });
  created.users.push(row.id);
  if (extra.lecturer) await prisma.lecturer.create({ data: { id: row.id } });
  if (extra.student) {
    await prisma.student.create({ data: { id: row.id, sksCompleted: 146, mandatoryCoursesCompleted: true, mkwuCompleted: true, internshipCompleted: true, kknCompleted: true } });
  }
  return row;
}

async function period(label, { open = -DAY, close = 7 * DAY } = {}) {
  const now = Date.now();
  const requirement = await prisma.yudisiumRequirement.create({ data: { name: `Syarat ${label} ${ts}` } });
  created.requirements.push(requirement.id);
  const row = await prisma.yudisium.create({
    data: {
      name: `Yudisium ${label} ${ts}`,
      exitSurveyFormId: form.id,
      roomId: room.id,
      registrationOpenDate: new Date(now + open),
      registrationCloseDate: new Date(now + close),
      eventDate: new Date(now + close + 3 * DAY),
      requirementItems: { create: [{ yudisiumRequirementId: requirement.id, order: 0 }] },
    },
    include: { requirementItems: true },
  });
  created.periods.push(row.id);
  return row;
}

/** A student with a finished thesis, CPL scores that meet the minimum, registered with documents uploaded. */
async function registered(label, yudisium) {
  const student = await user(`Mhs${label}`, { student: true });
  const thesis = await prisma.thesis.create({ data: { studentId: student.id, title: `TA ${label} ${ts}`, status: "completed" } });
  created.theses.push(thesis.id);
  await prisma.thesisDefence.create({ data: { thesisId: thesis.id, status: "passed", resultFinalizedAt: new Date() } });
  await prisma.studentCplScore.createMany({ data: cpls.map((cpl) => ({ studentId: student.id, cplId: cpl.id, score: cpl.minimalScore + 10, status: "calculated" })) });
  const participant = await prisma.yudisiumParticipant.create({
    data: { yudisiumId: yudisium.id, thesisId: thesis.id, exitSurveyFormId: form.id, exitSurveySubmittedAt: new Date(), registeredAt: null, status: "registered" },
  });
  for (const item of yudisium.requirementItems) {
    await studentService.uploadOwnDocument(student.id, pdf(`${label}.pdf`), item.yudisiumRequirementId);
  }
  return { student, thesis, participant };
}

const statusOf = async (id) => (await prisma.yudisiumParticipant.findUnique({ where: { id }, select: { status: true } })).status;
const verifyAll = (ctx, yudisium) =>
  Promise.all(yudisium.requirementItems.map((item) => participantService.verifyParticipantDocument(ctx.participant.id, item.id, { action: "approve", userId: admin.id })));
const validateAll = async (ctx) => {
  for (const cpl of cpls) await participantService.validateCplScore(ctx.participant.id, cpl.id, gkm.id);
};

beforeAll(async () => {
  // Only one registration window may be open at a time: set aside the periods already open.
  parkedPeriods = await prisma.yudisium.findMany({
    where: { registrationOpenDate: { not: null, lte: new Date(Date.now() + 30 * DAY) }, registrationCloseDate: { not: null, gte: new Date(Date.now() - 30 * DAY) } },
    select: { id: true, registrationOpenDate: true, registrationCloseDate: true },
  });
  for (const p of parkedPeriods) await prisma.yudisium.update({ where: { id: p.id }, data: { registrationOpenDate: null, registrationCloseDate: null } });
  admin = await user("Admin");
  gkm = await user("Gkm", { lecturer: true });
  form = await prisma.exitSurveyForm.create({ data: { title: `Form ${ts}` } });
  room = await prisma.room.create({ data: { name: `Ruang ${ts}` } });
  cpls = await prisma.cpl.findMany({ where: { isActive: true } });
  if (cpls.length === 0) {
    const curriculum = await prisma.curriculum.create({ data: { name: `Kurikulum ${ts}`, startYear: 2021 } });
    created.curriculum = curriculum.id;
    cpls = [await prisma.cpl.create({ data: { curriculumId: curriculum.id, code: `CPL-${ts}`, description: "CPL uji", minimalScore: 55 } })];
  }
});

afterAll(async () => {
  const records = await prisma.yudisiumParticipantRequirement.findMany({ where: { yudisiumId: { in: created.periods } }, select: { filePath: true } });
  for (const r of records) await unlink(path.resolve(process.cwd(), r.filePath)).catch(() => {});
  await prisma.yudisiumParticipant.deleteMany({ where: { yudisiumId: { in: created.periods } } });
  await prisma.yudisium.deleteMany({ where: { id: { in: created.periods } } });
  await prisma.yudisiumRequirement.deleteMany({ where: { id: { in: created.requirements } } });
  await prisma.studentCplScore.deleteMany({ where: { studentId: { in: created.users } } });
  await prisma.thesisDefence.deleteMany({ where: { thesisId: { in: created.theses } } });
  await prisma.thesis.deleteMany({ where: { id: { in: created.theses } } });
  if (created.curriculum) {
    await prisma.cpl.deleteMany({ where: { curriculumId: created.curriculum } });
    await prisma.curriculum.delete({ where: { id: created.curriculum } });
  }
  await prisma.room.deleteMany({ where: { id: room?.id } });
  await prisma.exitSurveyForm.deleteMany({ where: { id: form?.id } });
  await prisma.auditLog.deleteMany({ where: { userId: { in: created.users } } });
  await prisma.student.deleteMany({ where: { id: { in: created.users } } });
  await prisma.lecturer.deleteMany({ where: { id: { in: created.users } } });
  await prisma.user.deleteMany({ where: { id: { in: created.users } } });
  for (const p of parkedPeriods) await prisma.yudisium.update({ where: { id: p.id }, data: { registrationOpenDate: p.registrationOpenDate, registrationCloseDate: p.registrationCloseDate } }).catch(() => {});
});

describe.sequential("Yudisium participant eligibility", () => {

  it("CPL first, then documents: eligible after the last document", async () => {
    current = await period("A");
    const ctx = await registered("A", current);
    await validateAll(ctx);
    expect(await statusOf(ctx.participant.id)).toBe("registered");
    await verifyAll(ctx, current);
    expect(await statusOf(ctx.participant.id)).toBe("eligible");
  });

  it("documents first, then CPL: eligible after the last CPL", async () => {
    const ctx = await registered("B", current);
    await verifyAll(ctx, current);
    expect(await statusOf(ctx.participant.id)).toBe("registered");
    await validateAll(ctx);
    expect(await statusOf(ctx.participant.id)).toBe("eligible");
  });

  it("registering again after Ditolak with the CPL already valid: eligible once the documents are verified", async () => {
    const ctx = await registered("C", current);
    await validateAll(ctx);
    await prisma.yudisiumParticipant.update({ where: { id: ctx.participant.id }, data: { status: "rejected" } });
    // The first period closes; a new one opens and the student registers again.
    await prisma.yudisium.update({ where: { id: current.id }, data: { registrationOpenDate: new Date(Date.now() - 20 * DAY), registrationCloseDate: new Date(Date.now() - 10 * DAY), eventDate: new Date(Date.now() - 5 * DAY) } });
    const next = await period("C2");
    const again = await prisma.yudisiumParticipant.create({
      data: { yudisiumId: next.id, thesisId: ctx.thesis.id, exitSurveyFormId: form.id, exitSurveySubmittedAt: new Date(), status: "registered" },
    });
    await studentService.uploadOwnDocument(ctx.student.id, pdf("C2.pdf"), next.requirementItems[0].yudisiumRequirementId);
    const afterUpload = await prisma.yudisiumParticipant.findUnique({ where: { id: again.id } });
    expect(afterUpload.cplValidatedAt).not.toBeNull();
    expect(afterUpload.status).toBe("registered");
    await participantService.verifyParticipantDocument(again.id, next.requirementItems[0].id, { action: "approve", userId: admin.id });
    expect(await statusOf(again.id)).toBe("eligible");
    current = next;
  });
});

describe.sequential("Coordinator period edits keep the application rules", () => {
  const future = (days) => new Date(Date.now() + days * DAY).toISOString();
  let draft;

  it("dates must go open ≤ close < event", async () => {
    // The open period from above is closed first so new windows may be created.
    await prisma.yudisium.update({ where: { id: current.id }, data: { registrationOpenDate: new Date(Date.now() - 40 * DAY), registrationCloseDate: new Date(Date.now() - 35 * DAY), eventDate: new Date(Date.now() - 30 * DAY) } });
    const requirement = created.requirements[0];
    const base = { roomId: room.id, exitSurveyFormId: form.id, requirementIds: [requirement] };
    await expect(coreService.createYudisium({ ...base, name: `Urutan ${ts}`, registrationOpenDate: future(5), registrationCloseDate: future(3), eventDate: future(8) })).rejects.toThrow("penutupan tidak boleh lebih awal");
    await expect(coreService.createYudisium({ ...base, name: `Acara ${ts}`, registrationOpenDate: future(2), registrationCloseDate: future(4), eventDate: future(4) })).rejects.toThrow("pelaksanaan harus setelah");
    draft = await coreService.createYudisium({ ...base, name: `Draf ${ts}`, registrationOpenDate: future(2), registrationCloseDate: future(6), eventDate: future(9) });
    created.periods.push(draft.id);
    await expect(coreService.updateYudisium(draft.id, { registrationCloseDate: future(1) })).rejects.toThrow("penutupan tidak boleh lebih awal");
    await expect(coreService.updateYudisium(draft.id, { eventDate: future(5) })).rejects.toThrow("pelaksanaan harus setelah");
  });

  it("two registration windows cannot overlap", async () => {
    const base = { roomId: room.id, exitSurveyFormId: form.id, requirementIds: [created.requirements[0]] };
    await expect(coreService.createYudisium({ ...base, name: `Tumpang ${ts}`, registrationOpenDate: future(4), registrationCloseDate: future(10), eventDate: future(12) })).rejects.toThrow("bertabrakan");
    const other = await coreService.createYudisium({ ...base, name: `Lain ${ts}`, registrationOpenDate: future(20), registrationCloseDate: future(25), eventDate: future(28) });
    created.periods.push(other.id);
    await expect(coreService.updateYudisium(other.id, { registrationOpenDate: future(5) })).rejects.toThrow("bertabrakan");
  });

  it("editing a period with participants keeps their status", async () => {
    // Registration closed, event still ahead: the period may be edited.
    await prisma.yudisium.update({ where: { id: current.id }, data: { eventDate: new Date(Date.now() + 40 * DAY) } });
    const before = await prisma.yudisiumParticipant.findMany({ where: { yudisiumId: current.id }, select: { id: true, status: true } });
    expect(before.length).toBeGreaterThan(0);
    await coreService.updateYudisium(current.id, { notes: "Catatan baru" });
    const after = await prisma.yudisiumParticipant.findMany({ where: { yudisiumId: current.id }, select: { id: true, status: true } });
    expect(after).toEqual(before);
  });

  it("a finalized period cannot change its dates", async () => {
    await prisma.yudisium.update({ where: { id: draft.id }, data: { appointedAt: new Date() } });
    await expect(coreService.updateYudisium(draft.id, { eventDate: future(11) })).rejects.toThrow("tidak dapat diubah setelah peserta ditetapkan");
  });
});
