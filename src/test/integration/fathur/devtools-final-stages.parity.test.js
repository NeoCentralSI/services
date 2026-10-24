/**
 * DevTools reaches the same seminar and defence state as the module path.
 *
 * For each result (Lulus, Lulus dengan Revisi, Tidak Lulus) one thesis goes through the module
 * services (examiners and supervisor submit scores, the supervisor finalizes), another is moved
 * by DevTools; the columns the result changes are compared: status, result time and finalizer,
 * the final score against the minimum, submitted scores, supervisor approval, revision items,
 * and the thesis status. Also: a passed defence moved back to Terjadwal reopens the thesis, and
 * the order guards. Runs on a real database (vitest.integration.config.js).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import prisma from "../../../config/prisma.js";

vi.mock("../../../services/notification.service.js", () => ({
  createNotificationsForUsers: vi.fn().mockResolvedValue({ count: 1 }),
  createNotificationService: vi.fn().mockResolvedValue(true),
}));
vi.mock("../../../services/push.service.js", () => ({ sendFcmToUsers: vi.fn().mockResolvedValue({ success: true }) }));
vi.mock("../../../services/outlook-calendar.service.js", () => ({
  hasCalendarAccess: vi.fn().mockResolvedValue(false),
  createCalendarEvent: vi.fn().mockResolvedValue(null),
  createSeminarCalendarEvents: vi.fn().mockResolvedValue(true),
}));

const seminarExaminer = await import("../../../services/thesis-seminar/examiner.service.js");
const defenceExaminer = await import("../../../services/thesis-defence/examiner.service.js");
const seminarRepo = await import("../../../repositories/thesis-seminar/examiner.repository.js");
const defenceRepo = await import("../../../repositories/thesis-defence/examiner.repository.js");
const devtools = await import("../../../services/devtools/devtools-final-stages.service.js");
const { getActiveAcademicYear } = await import("../../../helpers/academicYear.helper.js");
const { mapScoreToGrade } = await import("../../../utils/score.util.js");

const ts = Date.now();
const created = { users: [], theses: [], cpmks: [], restoreYear: null };
let year, supervisorLecturer, examiners, admin, p1Role, seminarCriteria, defenceExaminerCriteria, defenceSupervisorCriteria;

function clockNow(offsetMinutes) {
  const wib = new Date(Date.now() + offsetMinutes * 60000 + 7 * 3600000);
  return {
    date: new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate())),
    time: new Date(`1970-01-01T${String(wib.getUTCHours()).padStart(2, "0")}:${String(wib.getUTCMinutes()).padStart(2, "0")}:00.000Z`),
  };
}

async function user(prefix, extra = {}) {
  const row = await prisma.user.create({
    data: { fullName: `${prefix} ${ts}`, identityNumber: `${prefix}-${ts}-${created.users.length}`, identityType: extra.lecturer ? "NIP" : "NIM", email: `${prefix.toLowerCase()}${ts}${created.users.length}@parity.test`, password: "p" },
  });
  created.users.push(row.id);
  if (extra.lecturer) await prisma.lecturer.create({ data: { id: row.id } });
  if (extra.student) await prisma.student.create({ data: { id: row.id, sksCompleted: 146, researchMethodCompleted: true } });
  return row;
}

/** A thesis in research, its scheduled seminar or defence already started, two examiners available. */
async function scheduledEvent(kind, label) {
  const student = await user(`Mhs${label}`, { student: true });
  const thesis = await prisma.thesis.create({ data: { studentId: student.id, title: `Parity ${label} ${ts}`, status: "research" } });
  created.theses.push(thesis.id);
  const relation = await prisma.thesisSupervisors.create({
    data: { thesisId: thesis.id, lecturerId: supervisorLecturer.id, roleId: p1Role.id, seminarReady: true, defenceReady: true },
  });
  const start = clockNow(-60);
  const end = clockNow(60);
  if (kind === "defence") {
    await prisma.thesisSeminar.create({ data: { thesisId: thesis.id, status: "passed", registeredAt: new Date(), resultFinalizedAt: new Date(), finalScore: 80 } });
  }
  const model = kind === "seminar" ? "thesisSeminar" : "thesisDefence";
  const event = await prisma[model].create({
    data: { thesisId: thesis.id, status: "scheduled", registeredAt: new Date(), verifiedAt: new Date(), scheduledAt: new Date(), date: start.date, startTime: start.time, endTime: end.date.getTime() === start.date.getTime() ? end.time : new Date("1970-01-01T23:59:00.000Z") },
  });
  const examinerModel = kind === "seminar" ? "thesisSeminarExaminer" : "thesisDefenceExaminer";
  const fk = kind === "seminar" ? "thesisSeminarId" : "thesisDefenceId";
  for (const [index, lecturer] of examiners.entries()) {
    await prisma[examinerModel].create({ data: { [fk]: event.id, lecturerId: lecturer.id, order: index + 1, assignedAt: new Date(), availabilityStatus: "available", respondedAt: new Date() } });
  }
  return { student, thesis, relation, event };
}

const sheet = (criteria, ratio) => criteria.map((c) => ({ assessmentCriteriaId: c.id, score: Math.round(c.maxScore * ratio) }));

async function moduleSeminar(target) {
  const ctx = await scheduledEvent("seminar", `SemModul${target}`);
  const ratio = target === "failed" ? 0.4 : 0.85;
  for (const lecturer of examiners) {
    await seminarExaminer.submitExaminerAssessment(ctx.event.id, { scores: sheet(seminarCriteria, ratio), revisionNotes: "Perbaiki BAB IV.", isDraft: false }, lecturer.id);
  }
  await seminarExaminer.finalizeSeminar(ctx.event.id, supervisorLecturer.id, { recommendRevision: target === "passed_with_revision" });
  return ctx;
}

async function moduleDefence(target) {
  const ctx = await scheduledEvent("defence", `SidModul${target}`);
  const ratio = target === "failed" ? 0.4 : 0.85;
  for (const lecturer of examiners) {
    await defenceExaminer.submitAssessment(ctx.event.id, { scores: sheet(defenceExaminerCriteria, ratio), revisionNotes: "Perbaiki BAB IV.", isDraft: false }, lecturer.id);
  }
  await defenceExaminer.submitAssessment(ctx.event.id, { scores: sheet(defenceSupervisorCriteria, ratio), supervisorNotes: "Baik.", isDraft: false }, supervisorLecturer.id);
  await defenceExaminer.finalizeDefence(ctx.event.id, { recommendRevision: target === "passed_with_revision" }, supervisorLecturer.id);
  return ctx;
}

async function devtoolsEvent(kind, target) {
  const ctx = await scheduledEvent(kind, `${kind}Dev${target}`);
  await devtools.applyEventStatus({ kind, studentId: ctx.student.id, target, mode: "change", actorUserId: admin.id });
  return ctx;
}

/** The columns a result changes, in a form both paths can be compared on. */
async function snapshot(kind, ctx) {
  const model = kind === "seminar" ? "thesisSeminar" : "thesisDefence";
  const examinerModel = kind === "seminar" ? "thesisSeminarExaminer" : "thesisDefenceExaminer";
  const revisionModel = kind === "seminar" ? "thesisSeminarRevision" : "thesisDefenceRevision";
  const examinerRelation = kind === "seminar" ? "seminarExaminer" : "defenceExaminer";
  const fk = kind === "seminar" ? "thesisSeminarId" : "thesisDefenceId";
  const minimum = kind === "seminar" ? year.thesisSeminarMinimumScore : year.thesisDefenceMinimumScore;
  const event = await prisma[model].findUnique({ where: { id: ctx.event.id } });
  const rows = await prisma[examinerModel].findMany({ where: { [fk]: ctx.event.id } });
  const revisions = await prisma[revisionModel].findMany({ where: { [examinerRelation]: { [fk]: ctx.event.id } } });
  const supervisor = await prisma.thesisSupervisors.findUnique({ where: { id: ctx.relation.id } });
  const thesis = await prisma.thesis.findUnique({ where: { id: ctx.thesis.id } });
  return {
    status: event.status,
    resultFinalized: !!event.resultFinalizedAt,
    finalizedBySupervisor: event.resultFinalizedBy === ctx.relation.id,
    passesMinimum: event.finalScore >= minimum,
    examinersSubmitted: rows.every((r) => !!r.assessmentSubmittedAt && r.assessmentScore !== null),
    revisionItems: revisions.length > 0,
    revisionsOpen: revisions.length > 0 && revisions.every((r) => !r.supervisorApprovedAt),
    revisionFinalized: !!event.revisionFinalizedAt,
    seminarReady: supervisor.seminarReady,
    defenceReady: supervisor.defenceReady,
    thesisStatus: thesis.status,
    ...(kind === "defence"
      ? {
        supervisorSubmitted: !!event.supervisorAssessmentSubmittedAt && event.supervisorScore !== null,
        finalIsAveragePlusSupervisor: Math.abs(event.finalScore - (event.examinerAverageScore + event.supervisorScore)) < 1e-9,
        gradeMatches: event.grade === mapScoreToGrade(event.finalScore),
      }
      : {}),
  };
}

beforeAll(async () => {
  year = await getActiveAcademicYear();
  if (!year) throw new Error("Tahun ajaran aktif diperlukan untuk tes kesamaan DevTools.");
  const minimums = {};
  if (year.thesisSeminarMinimumScore === null) minimums.thesisSeminarMinimumScore = 65;
  if (year.thesisDefenceMinimumScore === null) minimums.thesisDefenceMinimumScore = 65;
  if (Object.keys(minimums).length) {
    created.restoreYear = Object.fromEntries(Object.keys(minimums).map((k) => [k, null]));
    year = await prisma.academicYear.update({ where: { id: year.id }, data: minimums });
  }
  const seminarCpmks = await seminarRepo.findSeminarAssessmentCpmks(year.id);
  if (seminarCpmks.length === 0) {
    const cpmk = await prisma.thesisCpmk.create({ data: { academicYearId: year.id, code: `PAR-S-${ts}`, description: "Parity seminar" } });
    created.cpmks.push(cpmk.id);
    await prisma.thesisSeminarAssessmentCriteria.create({ data: { thesisCpmkId: cpmk.id, name: "Kriteria seminar", maxScore: 100, displayOrder: 1 } });
  }
  const defenceCpmks = await defenceRepo.findDefenceAssessmentCpmks(year.id, "supervisor");
  if (defenceCpmks.length === 0) {
    const cpmk = await prisma.thesisCpmk.create({ data: { academicYearId: year.id, code: `PAR-D-${ts}`, description: "Parity defence" } });
    created.cpmks.push(cpmk.id);
    await prisma.thesisDefenceExaminerAssessmentCriteria.create({ data: { thesisCpmkId: cpmk.id, name: "Kriteria penguji", maxScore: 50, displayOrder: 1 } });
    await prisma.thesisDefenceSupervisorAssessmentCriteria.create({ data: { thesisCpmkId: cpmk.id, name: "Kriteria pembimbing", maxScore: 50, displayOrder: 1 } });
  }
  seminarCriteria = (await seminarRepo.findSeminarAssessmentCpmks(year.id)).flatMap((c) => c.thesisSeminarAssessmentCriterias);
  defenceExaminerCriteria = (await defenceRepo.findDefenceAssessmentCpmks(year.id, "examiner")).flatMap((c) => c.assessmentCriterias);
  defenceSupervisorCriteria = (await defenceRepo.findDefenceAssessmentCpmks(year.id, "supervisor")).flatMap((c) => c.assessmentCriterias);

  p1Role = await prisma.userRole.findFirst({ where: { name: "Pembimbing 1" } });
  supervisorLecturer = await user("Dosen", { lecturer: true });
  examiners = [await user("PengujiA", { lecturer: true }), await user("PengujiB", { lecturer: true })];
  admin = await user("Admin");
});

afterAll(async () => {
  const theses = created.theses;
  if (theses.length) {
    const files = [
      ...(await prisma.thesisSeminarRequirementDocument.findMany({ where: { seminar: { thesisId: { in: theses } } }, select: { filePath: true } })),
      ...(await prisma.thesisDefenceRequirementDocument.findMany({ where: { defence: { thesisId: { in: theses } } }, select: { filePath: true } })),
    ].map((d) => d.filePath);
    const { removeFiles } = await import("../../../services/devtools/devtools-support.js");
    await removeFiles(files);
    const eventIds = [
      ...(await prisma.thesisSeminar.findMany({ where: { thesisId: { in: theses } }, select: { id: true } })),
      ...(await prisma.thesisDefence.findMany({ where: { thesisId: { in: theses } }, select: { id: true } })),
    ].map((e) => e.id);
    await prisma.officialGeneratedDocument.deleteMany({ where: { sourceId: { in: eventIds } } });
    await prisma.thesisSeminar.deleteMany({ where: { thesisId: { in: theses } } });
    await prisma.thesisDefence.deleteMany({ where: { thesisId: { in: theses } } });
    await prisma.yudisiumParticipant.deleteMany({ where: { thesisId: { in: theses } } }).catch(() => {});
    await prisma.thesisSupervisors.deleteMany({ where: { thesisId: { in: theses } } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: theses } } });
    await prisma.thesis.deleteMany({ where: { id: { in: theses } } });
  }
  await prisma.auditLog.deleteMany({ where: { userId: { in: created.users } } });
  for (const id of created.cpmks) {
    await prisma.thesisSeminarAssessmentCriteria.deleteMany({ where: { thesisCpmkId: id } });
    await prisma.thesisDefenceExaminerAssessmentCriteria.deleteMany({ where: { thesisCpmkId: id } });
    await prisma.thesisDefenceSupervisorAssessmentCriteria.deleteMany({ where: { thesisCpmkId: id } });
    await prisma.thesisCpmk.delete({ where: { id } });
  }
  if (created.restoreYear) await prisma.academicYear.update({ where: { id: year.id }, data: created.restoreYear });
  await prisma.student.deleteMany({ where: { id: { in: created.users } } });
  await prisma.lecturer.deleteMany({ where: { id: { in: created.users } } });
  await prisma.user.deleteMany({ where: { id: { in: created.users } } });
});

describe("DevTools and the module path reach the same result", () => {
  for (const target of ["passed", "passed_with_revision", "failed"]) {
    it(`Seminar Hasil: ${target}`, async () => {
      const module = await snapshot("seminar", await moduleSeminar(target));
      const viaDevtools = await snapshot("seminar", await devtoolsEvent("seminar", target));
      expect(viaDevtools).toEqual(module);
      expect(module.status).toBe(target);
      expect(module.seminarReady).toBe(target !== "failed");
      expect(module.revisionsOpen).toBe(target === "passed_with_revision");
    });

    it(`Sidang TA: ${target}`, async () => {
      const module = await snapshot("defence", await moduleDefence(target));
      const viaDevtools = await snapshot("defence", await devtoolsEvent("defence", target));
      expect(viaDevtools).toEqual(module);
      expect(module.thesisStatus).toBe(target === "passed" ? "completed" : "research");
      expect(module.defenceReady).toBe(target !== "failed");
    });
  }

  it("Sidang Lulus → Terjadwal reopens the thesis, clears the result and keeps the scores as drafts", async () => {
    const ctx = await moduleDefence("passed");
    expect((await prisma.thesis.findUnique({ where: { id: ctx.thesis.id } })).status).toBe("completed");
    await devtools.applyEventStatus({ kind: "defence", studentId: ctx.student.id, target: "scheduled", mode: "change", actorUserId: admin.id });
    const defence = await prisma.thesisDefence.findUnique({ where: { id: ctx.event.id } });
    const rows = await prisma.thesisDefenceExaminer.findMany({ where: { thesisDefenceId: ctx.event.id } });
    expect((await prisma.thesis.findUnique({ where: { id: ctx.thesis.id } })).status).toBe("research");
    expect(defence).toMatchObject({ status: "scheduled", resultFinalizedAt: null, resultFinalizedBy: null, finalScore: null, grade: null, supervisorAssessmentSubmittedAt: null });
    expect(defence.supervisorScore).not.toBeNull();
    expect(rows.every((r) => r.assessmentScore !== null && r.assessmentSubmittedAt === null)).toBe(true);
    // The supervisor can finalize again once everyone submits: the defence is running.
    const data = await defenceExaminer.getFinalizationData(ctx.event.id, { lecturerId: supervisorLecturer.id, roles: [] });
    expect(data.defence.status).toBe("ongoing");
    expect(data.supervisor.canFinalize).toBe(true);
  });

  it("Approving every revision finalizes it like the supervisor does; a defence becomes Selesai", async () => {
    const ctx = await devtoolsEvent("defence", "passed_with_revision");
    await devtools.approveAllRevisions({ kind: "defence", studentId: ctx.student.id, actorUserId: admin.id });
    const defence = await prisma.thesisDefence.findUnique({ where: { id: ctx.event.id } });
    const revisions = await prisma.thesisDefenceRevision.findMany({ where: { defenceExaminer: { thesisDefenceId: ctx.event.id } } });
    expect(defence.revisionFinalizedAt).not.toBeNull();
    expect(defence.revisionFinalizedBy).toBe(ctx.relation.id);
    expect(revisions.length).toBeGreaterThan(0);
    expect(revisions.every((r) => r.supervisorApprovedAt && r.approvedBy === ctx.relation.id)).toBe(true);
    expect((await prisma.thesis.findUnique({ where: { id: ctx.thesis.id } })).status).toBe("completed");
  });

  it("guards the order: a seminar cannot change while a defence exists", async () => {
    const ctx = await scheduledEvent("defence", "Guard");
    await expect(
      devtools.applyEventStatus({ kind: "seminar", studentId: ctx.student.id, target: "scheduled", mode: "change", actorUserId: admin.id }),
    ).rejects.toThrow("Hapus sidang mahasiswa ini terlebih dahulu");
    await expect(devtools.deleteEvent({ kind: "seminar", studentId: ctx.student.id, actorUserId: admin.id })).rejects.toThrow("Hapus sidang");
  });
});
