import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { unlink } from "fs/promises";
import prisma from "../../../config/prisma.js";
import * as docService from "../../../services/thesis-seminar/doc.service.js";
import * as examinerService from "../../../services/thesis-seminar/examiner.service.js";
import * as coreService from "../../../services/thesis-seminar/core.service.js";

vi.mock("../../../services/notification.service.js", () => ({ createNotificationsForUsers: vi.fn().mockResolvedValue({ count: 1 }), createNotificationService: vi.fn().mockResolvedValue(true) }));
vi.mock("../../../services/push.service.js", () => ({ sendFcmToUsers: vi.fn().mockResolvedValue({ success: true }) }));
vi.mock("../../../services/outlook-calendar.service.js", () => ({ hasCalendarAccess: vi.fn().mockResolvedValue(true), createCalendarEvent: vi.fn().mockResolvedValue({ eventId: "f" }), createSeminarCalendarEvents: vi.fn().mockResolvedValue(true) }));

describe("Integration: Thesis Seminar Flow (Registration to Scheduling)", () => {
  const ts = Date.now();
  let studentUser, student, lecturerUser, lecturer, thesis, supervisor, dummyTheses = [], dummySeminars = [];
  let seminarId, academicYear, requirements = [], uploadedPaths = [], createdRequirementIds = [], createdAcademicYear = false;

  beforeAll(async () => {
    try {
      studentUser = await prisma.user.create({ data: { fullName: "S " + ts, identityNumber: "NIM-" + ts, identityType: "NIM", email: `s${ts}@t.com`, password: "p" } });
      student = await prisma.student.create({ data: { id: studentUser.id, researchMethodCompleted: true, sksCompleted: 140 } });
      lecturerUser = await prisma.user.create({ data: { fullName: "L " + ts, identityNumber: "NIP-" + ts, identityType: "NIP", email: `l${ts}@t.com`, password: "p" } });
      lecturer = await prisma.lecturer.create({ data: { id: lecturerUser.id } });

      const status = await prisma.thesisStatus.findFirst({ where: { name: { contains: "Bimbingan" } } });
      const role = await prisma.userRole.findFirst({ where: { name: { contains: "Pembimbing" } } });
      if (!status || !role) throw new Error(`Seeds missing`);

      const now = new Date();
      academicYear = await prisma.academicYear.findFirst({
        where: { startDate: { lte: now }, endDate: { gte: now } },
        orderBy: { startDate: "desc" },
      });
      if (!academicYear) {
        academicYear = await prisma.academicYear.create({
          data: { year: "9999", semester: "ganjil", isActive: false, startDate: new Date(now.getTime() - 86400000), endDate: new Date(now.getTime() + 86400000) },
        });
        createdAcademicYear = true;
      }
      requirements = await prisma.thesisSeminarRequirement.findMany({
        where: { academicYearId: academicYear.id, isActive: true },
        orderBy: { displayOrder: "asc" },
      });
      if (requirements.length === 0) {
        requirements = await Promise.all(
          ["Laporan Tugas Akhir", "Slide Presentasi", "Draft Jurnal TEKNOSI"].map((name, index) =>
            prisma.thesisSeminarRequirement.create({ data: { academicYearId: academicYear.id, name, displayOrder: index + 1 } })
          )
        );
        createdRequirementIds = requirements.map((item) => item.id);
      }

      thesis = await prisma.thesis.create({ data: { studentId: student.id, title: "Int Test", thesisStatusId: status.id, academicYearId: academicYear.id } });
      supervisor = await prisma.thesisSupervisors.create({ data: { thesisId: thesis.id, lecturerId: lecturer.id, roleId: role.id, seminarReady: true } });

      await prisma.thesisGuidance.createMany({
        data: Array.from({ length: 8 }).map((_, i) => ({
          thesisId: thesis.id, supervisorId: lecturer.id, requestedDate: new Date(), approvedDate: new Date(), completedAt: new Date(), studentNotes: `G ${i + 1}`, status: "completed",
        }))
      });

      for (let i = 0; i < 8; i++) {
        const u = await prisma.user.create({ data: { fullName: "O" + i + ts, identityNumber: "N-O-" + i + ts, identityType: "NIM", email: `o${i}${ts}@t.com`, password: "p" } });
        const s = await prisma.student.create({ data: { id: u.id, sksCompleted: 100 } });
        const t = await prisma.thesis.create({ data: { studentId: s.id, title: "O", thesisStatusId: status.id } });
        const sem = await prisma.thesisSeminar.create({ data: { thesisId: t.id, status: "passed", date: new Date() } });
        dummyTheses.push({ user: u, student: s, thesis: t });
        dummySeminars.push(sem);
        await prisma.thesisSeminarAudience.create({ data: { thesisSeminarId: sem.id, thesisId: t.id, studentId: student.id, approvedAt: new Date() } });
      }

    } catch (err) {
      console.error("SETUP ERROR:", err); throw err;
    }
  });

  afterAll(async () => {
    try {
      for (const filePath of uploadedPaths) await unlink(filePath).catch(() => {});
      if (seminarId) {
        await prisma.thesisSeminarRequirementDocument.deleteMany({ where: { thesisSeminarId: seminarId } }).catch(() => {});
        await prisma.thesisSeminarExaminer.deleteMany({ where: { thesisSeminarId: seminarId } }).catch(() => {});
        await prisma.thesisSeminar.delete({ where: { id: seminarId } }).catch(() => {});
      }
      for (const ds of dummySeminars) {
        await prisma.thesisSeminarAudience.deleteMany({ where: { thesisSeminarId: ds.id } }).catch(() => {});
        await prisma.thesisSeminar.delete({ where: { id: ds.id } }).catch(() => {});
      }
      for (const dt of dummyTheses) {
        await prisma.thesis.delete({ where: { id: dt.thesis.id } }).catch(() => {});
        await prisma.student.delete({ where: { id: dt.student.id } }).catch(() => {});
        await prisma.user.delete({ where: { id: dt.user.id } }).catch(() => {});
      }
      if (thesis) {
        await prisma.thesisGuidance.deleteMany({ where: { thesisId: thesis.id } }).catch(() => {});
        await prisma.thesisSupervisors.deleteMany({ where: { thesisId: thesis.id } }).catch(() => {});
        await prisma.thesis.delete({ where: { id: thesis.id } }).catch(() => {});
      }
      if (createdRequirementIds.length > 0) await prisma.thesisSeminarRequirement.deleteMany({ where: { id: { in: createdRequirementIds } } }).catch(() => {});
      if (createdAcademicYear && academicYear) await prisma.academicYear.delete({ where: { id: academicYear.id } }).catch(() => {});
      if (student) await prisma.student.delete({ where: { id: student.id } }).catch(() => {});
      if (lecturer) await prisma.lecturer.delete({ where: { id: lecturer.id } }).catch(() => {});
      if (studentUser) await prisma.user.deleteMany({ where: { id: { in: [studentUser.id, lecturerUser.id] } } }).catch(() => {});
    } catch (err) { console.error("CLEANUP ERROR:", err); }
  });

  it("Step 1: Student uploads all required documents", async () => {
    const fakeFile = { originalname: "t.pdf", buffer: Buffer.from("%PDF-1.4\nbody"), size: 13, mimetype: "application/pdf" };
    for (const requirement of requirements) {
      const res = await docService.uploadDocument("active", student.id, fakeFile, requirement.id);
      expect(res.status).toBe("submitted");
      uploadedPaths.push(res.filePath);
    }

    const seminar = await prisma.thesisSeminar.findFirst({ where: { thesisId: thesis.id } });
    seminarId = seminar.id;
    expect(seminar.status).toBe("registered");
  });

  it("Step 2: Lecturer verifies all documents and transitions status to verified", async () => {
    for (const requirement of requirements) {
      await docService.verifyDocument(seminarId, requirement.id, { action: "approve", userId: lecturerUser.id });
    }

    const seminar = await prisma.thesisSeminar.findUnique({ where: { id: seminarId } });
    expect(seminar.status).toBe("verified");
  });

  it("Step 3: Kadep assigns examiners", async () => {
    await examinerService.assignExaminers(seminarId, [lecturer.id], lecturerUser.id);
    const seminar = await prisma.thesisSeminar.findUnique({ where: { id: seminarId } });
    // Status stays verified because examiner is pending
    expect(seminar.status).toBe("verified");
  });

  it("Step 4: Examiner responds available and transitions status to examiner_assigned", async () => {
    const examinerRec = await prisma.thesisSeminarExaminer.findFirst({ where: { thesisSeminarId: seminarId, lecturerId: lecturer.id } });
    await examinerService.respondExaminerAssignment(seminarId, examinerRec.id, { status: "available" }, lecturer.id);

    const seminar = await prisma.thesisSeminar.findUnique({ where: { id: seminarId } });
    expect(seminar.status).toBe("examiner_assigned");
  });

  it("Step 5: Admin drafts and finalizes the schedule", async () => {
    // Ensure we pick a weekday (Next Monday)
    const nextMonday = new Date();
    nextMonday.setUTCHours(12, 0, 0, 0);
    nextMonday.setUTCDate(nextMonday.getUTCDate() + ((8 - nextMonday.getUTCDay()) % 7 || 7));
    const dateStr = nextMonday.toISOString().split("T")[0];

    await coreService.scheduleSeminar(seminarId, {
      date: dateStr,
      startTime: "10:00", endTime: "12:00", isOnline: true, meetingLink: "https://zoom.us"
    });

    await coreService.finalizeSchedule(seminarId, lecturerUser.id);

    const finalSeminar = await prisma.thesisSeminar.findUnique({ where: { id: seminarId } });
    expect(finalSeminar.status).toBe("scheduled");
    expect(finalSeminar.scheduledAt).toBeDefined();
    expect(new Date(finalSeminar.scheduledAt).getTime()).toBeLessThanOrEqual(Date.now());
  });

});
