/**
 * A student with a thesis in research who does not take the Tugas Akhir course this semester
 * (or whose flag is not known yet, like the proposal shield) cannot act on the thesis: guidance
 * requests, milestones, seminar and defence registration, change requests. Reading, revisions of
 * a held seminar or defence, yudisium, and lecturer actions stay open. Runs on a real database.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import prisma from "../../../config/prisma.js";

vi.mock("../../../services/notification.service.js", () => ({
  createNotificationsForUsers: vi.fn().mockResolvedValue({ count: 1 }),
  createNotificationService: vi.fn().mockResolvedValue(true),
  createNotificationEventForUsers: vi.fn().mockResolvedValue(true),
}));
vi.mock("../../../services/push.service.js", () => ({ sendFcmToUsers: vi.fn().mockResolvedValue({ success: true }) }));

const lifecycle = await import("../../../services/thesisLifecycle.service.js");
const guidance = await import("../../../services/thesisGuidance/student.guidance.service.js");
const milestone = await import("../../../services/thesisGuidance/milestone.service.js");
const seminarDoc = await import("../../../services/thesis-seminar/doc.service.js");
const defenceDoc = await import("../../../services/thesis-defence/doc.service.js");
const seminarRevision = await import("../../../services/thesis-seminar/revision.service.js");
const changeRequest = await import("../../../services/thesis-change-request.service.js");
const seminarStudent = await import("../../../services/thesis-seminar/student.service.js");
const { resolveOperationalAcademicYear } = await import("../../../helpers/academicYear.helper.js");

const ts = Date.now();
const created = { users: [], theses: [] };
const { NOT_TAKING_THESIS, THESIS_COURSE_UNKNOWN } = lifecycle.THESIS_ACTION_BLOCK;
const REASON = lifecycle.THESIS_ACTION_BLOCK_REASONS;
let year, lecturer, role;
const pdf = { originalname: "syarat.pdf", mimetype: "application/pdf", size: 16, buffer: Buffer.from("%PDF-1.4 syarat") };

async function studentWith(status, flag, label, researchMethod = undefined) {
  const user = await prisma.user.create({ data: { fullName: `Mhs ${label} ${ts}`, identityNumber: `TA-${label}-${ts}`, identityType: "NIM", email: `ta-${label}-${ts}@block.test`, password: "p" } });
  created.users.push(user.id);
  await prisma.student.create({ data: { id: user.id, sksCompleted: 146, researchMethodCompleted: true } });
  const thesis = await prisma.thesis.create({ data: { studentId: user.id, title: `TA ${label} ${ts}`, status, startDate: new Date() } });
  created.theses.push(thesis.id);
  await prisma.thesisSupervisors.create({ data: { thesisId: thesis.id, lecturerId: lecturer.id, roleId: role.id, seminarReady: true, defenceReady: true } });
  if (flag !== undefined || researchMethod !== undefined) {
    await prisma.studentAcademicYearSnapshot.create({
      data: { studentId: user.id, academicYearId: year.id, takingThesisCourse: flag ?? null, eligibleResearchMethod: researchMethod ?? null, capturedAt: new Date() },
    });
  }
  return { student: user, thesis };
}

beforeAll(async () => {
  year = await resolveOperationalAcademicYear();
  if (!year) throw new Error("Semester operasional diperlukan.");
  role = await prisma.userRole.findFirst({ where: { name: "Pembimbing 1" } });
  const user = await prisma.user.create({ data: { fullName: `Dosen ${ts}`, identityNumber: `NIP-${ts}`, identityType: "NIP", email: `dosen-${ts}@block.test`, password: "p" } });
  created.users.push(user.id);
  lecturer = await prisma.lecturer.create({ data: { id: user.id } });
});

afterAll(async () => {
  const theses = created.theses;
  await prisma.thesisSeminarRevision.deleteMany({ where: { seminarExaminer: { seminar: { thesisId: { in: theses } } } } });
  await prisma.thesisSeminar.deleteMany({ where: { thesisId: { in: theses } } });
  await prisma.thesisMilestone.deleteMany({ where: { thesisId: { in: theses } } });
  await prisma.thesisSupervisors.deleteMany({ where: { thesisId: { in: theses } } });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: theses } } });
  await prisma.thesis.deleteMany({ where: { id: { in: theses } } });
  await prisma.studentAcademicYearSnapshot.deleteMany({ where: { studentId: { in: created.users } } });
  await prisma.student.deleteMany({ where: { id: { in: created.users } } });
  await prisma.lecturer.deleteMany({ where: { id: { in: created.users } } });
  await prisma.user.deleteMany({ where: { id: { in: created.users } } });
});

describe("getStudentThesisActionBlock", () => {
  it("blocks a thesis in research when the student does not take the course, or it is not known yet", async () => {
    const no = await studentWith("research", false, "no");
    const unknown = await studentWith("research", undefined, "unknown");
    const yes = await studentWith("research", true, "yes");
    expect((await lifecycle.getStudentThesisActionBlock(no.student.id)).code).toBe(NOT_TAKING_THESIS);
    expect((await lifecycle.getStudentThesisActionBlock(unknown.student.id)).code).toBe(THESIS_COURSE_UNKNOWN);
    expect((await lifecycle.getStudentThesisActionBlock(yes.student.id)).blocked).toBe(false);
  });

  it("taking Metode Penelitian this semester also allows: a proposal that passed starts research at once (K37)", async () => {
    const passed = await studentWith("research", false, "passed", true);
    expect((await lifecycle.getStudentThesisActionBlock(passed.student.id)).blocked).toBe(false);
  });

  it("K43: Metode Penelitian opens guidance and milestones, not seminar or defence registration", async () => {
    const mp = await studentWith("research", false, "mp", true);
    const created = await milestone.createMilestone(mp.thesis.id, mp.student.id, { title: "BAB I" });
    expect(created.id).toBeTruthy();
    expect((await lifecycle.getStudentThesisActionBlock(mp.student.id, { requireThesisCourse: true })).code).toBe(NOT_TAKING_THESIS);
    await expect(seminarDoc.uploadDocument("active", mp.student.id, pdf, "req")).rejects.toThrow(REASON[NOT_TAKING_THESIS]);
    await expect(defenceDoc.uploadDocument("active", mp.student.id, pdf, "req")).rejects.toThrow(REASON[NOT_TAKING_THESIS]);
    const overview = await seminarStudent.getOverview(mp.student.id);
    expect(overview.checklist.mataKuliahTa.met).toBe(false);
  });

  it("does not block a proposal-phase or finished thesis", async () => {
    const proposal = await studentWith("proposal", undefined, "proposal");
    const done = await studentWith("completed", false, "done");
    expect((await lifecycle.getStudentThesisActionBlock(proposal.student.id)).blocked).toBe(false);
    expect((await lifecycle.getStudentThesisActionBlock(done.student.id)).blocked).toBe(false);
  });
});

describe("blocked student actions", () => {
  let ctx;
  beforeAll(async () => { ctx = await studentWith("research", false, "actions"); });

  it("guidance request", async () => {
    await expect(guidance.requestGuidanceService(ctx.student.id, new Date(Date.now() + 86400000).toISOString(), "Catatan", null, lecturer.id)).rejects.toThrow(REASON[NOT_TAKING_THESIS]);
  });

  it("milestone create", async () => {
    await expect(milestone.createMilestone(ctx.thesis.id, ctx.student.id, { title: "BAB I" })).rejects.toThrow(REASON[NOT_TAKING_THESIS]);
  });

  it("seminar and defence registration (requirement documents)", async () => {
    await expect(seminarDoc.uploadDocument("active", ctx.student.id, pdf, "req")).rejects.toThrow(REASON[NOT_TAKING_THESIS]);
    await expect(defenceDoc.uploadDocument("active", ctx.student.id, pdf, "req")).rejects.toThrow(REASON[NOT_TAKING_THESIS]);
  });

  it("change request by the student; the context says why", async () => {
    await expect(changeRequest.submitRequest(ctx.student.id, { requestType: "title", proposedTitle: "Judul baru yang cukup panjang", reason: "Alasan" })).rejects.toThrow(REASON[NOT_TAKING_THESIS]);
    const context = await changeRequest.getThesisChangeContext(ctx.student.id);
    expect(context.canSubmit).toBe(false);
    expect(context.blockReason).toContain("tidak tercatat mengambil mata kuliah Tugas Akhir");
  });

  it("the seminar requirements list the course with its reason", async () => {
    const overview = await seminarStudent.getOverview(ctx.student.id);
    expect(overview.checklist.mataKuliahTa).toMatchObject({ met: false, label: lifecycle.TAKING_THESIS_COURSE_LABEL, reason: REASON[NOT_TAKING_THESIS] });
    expect(overview.allChecklistMet).toBe(false);
  });

  it("a revision of a held seminar still works", async () => {
    const seminar = await prisma.thesisSeminar.create({ data: { thesisId: ctx.thesis.id, status: "passed_with_revision", registeredAt: new Date(), resultFinalizedAt: new Date() } });
    const examiner = await prisma.thesisSeminarExaminer.create({ data: { thesisSeminarId: seminar.id, lecturerId: lecturer.id, order: 1, assignedAt: new Date(), availabilityStatus: "available" } });
    const revision = await seminarRevision.createRevision(seminar.id, { seminarExaminerId: examiner.id, description: "Perbaiki BAB IV", revisionAction: "" }, ctx.student.id);
    expect(revision.id).toBeTruthy();
  });
});
