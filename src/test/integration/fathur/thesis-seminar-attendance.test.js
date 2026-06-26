import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import prisma from "../../../config/prisma.js";
import * as audienceService from "../../../services/thesis-seminar/audience.service.js";

vi.mock("../../../services/notification.service.js", () => ({ createNotificationsForUsers: vi.fn().mockResolvedValue({ count: 1 }), createNotificationService: vi.fn().mockResolvedValue(true) }));
vi.mock("../../../services/push.service.js", () => ({ sendFcmToUsers: vi.fn().mockResolvedValue({ success: true }) }));
vi.mock("../../../services/outlook-calendar.service.js", () => ({ hasCalendarAccess: vi.fn().mockResolvedValue(true), createCalendarEvent: vi.fn().mockResolvedValue({ eventId: "f" }), createSeminarCalendarEvents: vi.fn().mockResolvedValue(true) }));

describe("Integration: Thesis Seminar Attendance Flow", () => {
  const ts = Date.now();
  let pUser, pStudent, aUser, aStudent, lUser, lecturer, thesis, seminar;

  beforeAll(async () => {
    try {
      pUser = await prisma.user.create({ data: { fullName: "P "+ts, identityNumber: "NIM-P-"+ts, identityType: "NIM", email: `p${ts}@t.com`, password: "p" } });
      pStudent = await prisma.student.create({ data: { id: pUser.id, skscompleted: 140 } });
      aUser = await prisma.user.create({ data: { fullName: "A "+ts, identityNumber: "NIM-A-"+ts, identityType: "NIM", email: `a${ts}@t.com`, password: "p" } });
      aStudent = await prisma.student.create({ data: { id: aUser.id, skscompleted: 140 } });
      lUser = await prisma.user.create({ data: { fullName: "L "+ts, identityNumber: "NIP-L-"+ts, identityType: "NIP", email: `l${ts}@t.com`, password: "p" } });
      lecturer = await prisma.lecturer.create({ data: { id: lUser.id } });

      const status = await prisma.thesisStatus.findFirst({ where: { name: { contains: "Bimbingan" } } });
      const role = await prisma.userRole.findFirst({ where: { name: { contains: "Pembimbing" } } });

      thesis = await prisma.thesis.create({ data: { studentId: pStudent.id, title: "T", thesisStatusId: status.id } });
      await prisma.thesisSupervisors.create({ data: { thesisId: thesis.id, lecturerId: lecturer.id, roleId: role.id } });

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      seminar = await prisma.thesisSeminar.create({
        data: {
          thesisId: thesis.id,
          status: "scheduled",
          date: tomorrow,
          startTime: tomorrow,
          endTime: new Date(tomorrow.getTime() + 7200000),
          registeredAt: new Date(),
        }
      });
    } catch (err) {
      console.error("SETUP ERROR:", err);
      throw err;
    }
  });

  afterAll(async () => {
    vi.useRealTimers();
    if (seminar) {
      await prisma.thesisSeminarAudience.deleteMany({ where: { thesisSeminarId: seminar.id } }).catch(() => {});
      await prisma.thesisSeminar.delete({ where: { id: seminar.id } }).catch(() => {});
    }
    if (thesis) {
      await prisma.thesisSupervisors.deleteMany({ where: { thesisId: thesis.id } }).catch(() => {});
      await prisma.thesis.delete({ where: { id: thesis.id } }).catch(() => {});
    }
    await prisma.student.deleteMany({ where: { id: { in: [pStudent?.id, aStudent?.id].filter(Boolean) } } }).catch(() => {});
    await prisma.lecturer.delete({ where: { id: lecturer?.id } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: [pUser?.id, aUser?.id, lUser?.id].filter(Boolean) } } }).catch(() => {});
  });

  it("Step 1: Student registers as audience for a future seminar", async () => {
    const res = await audienceService.addAudience(seminar.id, {}, { studentId: aStudent.id });
    expect(res.message).toContain("Berhasil mendaftar");

    const record = await prisma.thesisSeminarAudience.findUnique({
      where: { thesisSeminarId_studentId: { thesisSeminarId: seminar.id, studentId: aStudent.id } }
    });
    expect(record).not.toBeNull();
  });

  it("Step 2: Supervisor toggles presence during/after the seminar", async () => {
    // Fast forward to far future
    vi.useFakeTimers();
    const farFuture = new Date(seminar.date);
    farFuture.setFullYear(farFuture.getFullYear() + 1); 
    vi.setSystemTime(farFuture);

    const res = await audienceService.updateAudience(seminar.id, aStudent.id, { action: "toggle_presence" }, { lecturerId: lecturer.id });
    expect(res.success).toBe(true);

    const record = await prisma.thesisSeminarAudience.findUnique({
      where: { thesisSeminarId_studentId: { thesisSeminarId: seminar.id, studentId: aStudent.id } }
    });
    expect(record.approvedAt).not.toBeNull();
  });
});
