import { describe, it, expect, beforeEach, vi } from "vitest";

// ── hoisted mocks ──────────────────────────────────────────────
const { mockPrisma, mockCoreRepo, mockXlsx } = vi.hoisted(() => ({
  mockPrisma: {
    thesisSeminar: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
    user: { findMany: vi.fn() },
    student: { findMany: vi.fn() },
  },
  mockCoreRepo: {
    findThesisById: vi.fn(),
    findRoomById: vi.fn(),
    findSeminarByThesisId: vi.fn(),
    findSeminarByThesisIdExcludingId: vi.fn(),
    findSeminarById: vi.fn(),
    findSeminarBasicById: vi.fn(),
    createSeminarWithExaminers: vi.fn(),
    updateSeminarWithExaminers: vi.fn(),
    deleteSeminar: vi.fn(),
    findSupervisorsByThesisId: vi.fn(),
    findStudentByNim: vi.fn(),
    findActiveThesisByStudentId: vi.fn(),
    findRoomByNameLike: vi.fn(),
    findLecturerByNameLike: vi.fn(),
    updateSeminar: vi.fn(),
  },
  mockXlsx: {
    read: vi.fn(),
    utils: {
      sheet_to_json: vi.fn(),
    },
  },
}));

vi.mock("../../../../config/prisma.js", () => ({ default: mockPrisma }));
vi.mock("../../../../repositories/thesis-seminar/thesis-seminar.repository.js", () => mockCoreRepo);
vi.mock("xlsx", () => mockXlsx);

vi.mock("../../../../services/notification.service.js", () => ({
  createNotificationsForUsers: vi.fn().mockResolvedValue({ count: 1 }),
}));
vi.mock("../../../../services/push.service.js", () => ({
  sendFcmToUsers: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock("../../../../services/outlook-calendar.service.js", () => ({
  hasCalendarAccess: vi.fn().mockResolvedValue(true),
  createCalendarEvent: vi.fn().mockResolvedValue({ eventId: "outlook-event-1" }),
}));
vi.mock("../../../../helpers/pdf.helper.js", () => ({
  convertHtmlToPdf: vi.fn().mockResolvedValue(Buffer.from("fake-pdf-buffer")),
}));
vi.mock("../../../../services/thesis-seminar/examiner.service.js", () => ({
  getFinalizationData: vi.fn(),
}));

import {
  scheduleSeminar,
  finalizeSchedule,
  generateAssessmentResultPdf,
} from "../../../../services/thesis-seminar/core.service.js";

describe("Thesis Seminar Core Service (Archive Logic)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createArchive (Manual)", () => {
    const validBody = {
      thesisId: "thesis-1",
      roomId: "room-1",
      date: "2026-05-20T10:00:00Z",
      status: "passed",
      examinerLecturerIds: ["lec-1", "lec-2"],
    };

    it("creates archive seminar successfully", async () => {
      mockCoreRepo.findThesisById.mockResolvedValue({ id: "thesis-1" });
      mockCoreRepo.findRoomById.mockResolvedValue({ id: "room-1" });
      mockCoreRepo.findSeminarByThesisId.mockResolvedValue(null);
      mockPrisma.thesisSeminar.findFirst.mockResolvedValue(null); // No existing passed seminar
      mockCoreRepo.findSupervisorsByThesisId.mockResolvedValue([{ lecturerId: "lec-3" }]);
      mockCoreRepo.createSeminarWithExaminers.mockResolvedValue({ id: "sem-1" });
      mockCoreRepo.findSeminarById.mockResolvedValue({ id: "sem-1" });

      const result = await createArchive(validBody, "admin-user");

      expect(result).toHaveProperty("id", "sem-1");
      expect(mockCoreRepo.createSeminarWithExaminers).toHaveBeenCalledWith(expect.objectContaining({
        thesisId: "thesis-1",
        status: "passed",
      }));
    });

    it("throws 409 if student already passed a seminar", async () => {
      mockCoreRepo.findThesisById.mockResolvedValue({ id: "thesis-1" });
      mockCoreRepo.findRoomById.mockResolvedValue({ id: "room-1" });
      mockPrisma.thesisSeminar.findFirst.mockResolvedValue({ id: "old-sem", status: "passed" });

      await expect(createArchive(validBody, "admin-user")).rejects.toMatchObject({ statusCode: 409 });
    });

    it("throws 400 if examiner is also a supervisor", async () => {
      mockCoreRepo.findThesisById.mockResolvedValue({ id: "thesis-1" });
      mockCoreRepo.findRoomById.mockResolvedValue({ id: "room-1" });
      mockPrisma.thesisSeminar.findFirst.mockResolvedValue(null);
      mockCoreRepo.findSupervisorsByThesisId.mockResolvedValue([{ lecturerId: "lec-1" }]); // lec-1 is examiner in validBody

      await expect(createArchive(validBody, "admin-user")).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe("updateArchive", () => {
    const validBody = {
      thesisId: "thesis-1",
      roomId: "room-1",
      date: "2026-05-20T10:00:00Z",
      status: "passed",
      examinerLecturerIds: ["lec-1", "lec-2"],
    };

    it("updates manual archive successfully", async () => {
      mockCoreRepo.findSeminarBasicById.mockResolvedValue({ id: "sem-1", registeredAt: null }); // It's a manual archive
      mockCoreRepo.findThesisById.mockResolvedValue({ id: "thesis-1" });
      mockCoreRepo.findRoomById.mockResolvedValue({ id: "room-1" });
      mockCoreRepo.findSupervisorsByThesisId.mockResolvedValue([]);
      mockCoreRepo.updateSeminarWithExaminers.mockResolvedValue({});
      mockCoreRepo.findSeminarById.mockResolvedValue({ id: "sem-1" });

      const result = await updateArchive("sem-1", validBody, "admin-user");
      expect(result).toHaveProperty("id", "sem-1");
    });

    it("throws 403 if trying to update an active seminar (registeredAt is not null)", async () => {
      mockCoreRepo.findSeminarBasicById.mockResolvedValue({ id: "sem-1", registeredAt: new Date() });
      await expect(updateArchive("sem-1", validBody, "admin-user")).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe("deleteArchive", () => {
    it("deletes manual archive successfully", async () => {
      mockCoreRepo.findSeminarBasicById.mockResolvedValue({ id: "sem-1", registeredAt: null });
      mockCoreRepo.deleteSeminar.mockResolvedValue({});

      const result = await deleteArchive("sem-1");
      expect(result.success).toBe(true);
    });

    it("throws 403 if trying to delete an active seminar", async () => {
      mockCoreRepo.findSeminarBasicById.mockResolvedValue({ id: "sem-1", registeredAt: new Date() });
      await expect(deleteArchive("sem-1")).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe("importArchive", () => {
    it("imports multiple seminars from excel", async () => {
      mockXlsx.read.mockReturnValue({
        SheetNames: ["Sheet1"],
        Sheets: { "Sheet1": {} }
      });
      mockXlsx.utils.sheet_to_json.mockReturnValue([
        { "NIM": "12345", "Ruangan": "Room A", "Hasil": "Lulus", "Tanggal": "2026-05-20", "Dosen Penguji 1": "Dosen A", "Dosen Penguji 2": "Dosen B" }
      ]);
      mockCoreRepo.findStudentByNim.mockResolvedValue({ id: "stu-1" });
      mockCoreRepo.findActiveThesisByStudentId.mockResolvedValue({ id: "thesis-1" });
      mockPrisma.thesisSeminar.findFirst.mockResolvedValue(null);
      mockCoreRepo.findRoomByNameLike.mockResolvedValue({ id: "room-1" });
      mockCoreRepo.findLecturerByNameLike.mockResolvedValue({ id: "lec-1" });
      mockCoreRepo.createSeminarWithExaminers.mockResolvedValue({});

      const result = await importArchive(Buffer.from("test"), "admin-user");

      expect(result.successCount).toBe(1);
      expect(mockCoreRepo.createSeminarWithExaminers).toHaveBeenCalled();
    });
    it("skips row if student already passed a seminar", async () => {
      mockXlsx.read.mockReturnValue({
        SheetNames: ["Sheet1"],
        Sheets: { "Sheet1": {} }
      });
      mockXlsx.utils.sheet_to_json.mockReturnValue([
        { "NIM": "12345", "Ruangan": "Room A", "Hasil": "Lulus", "Tanggal": "2026-05-20", "Dosen Penguji 1": "Dosen A", "Dosen Penguji 2": "Dosen B" }
      ]);
      mockCoreRepo.findStudentByNim.mockResolvedValue({ id: "stu-1" });
      mockCoreRepo.findActiveThesisByStudentId.mockResolvedValue({ id: "thesis-1" });
      mockPrisma.thesisSeminar.findFirst.mockResolvedValue({ id: "old-sem", status: "passed" });

      const result = await importArchive(Buffer.from("test"), "admin-user");

      expect(result.successCount).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.failedRows[0].error).toBe("Sudah lulus seminar hasil");
    });
  });

  describe("cancelSeminar", () => {
    it("cancels seminar and resets supervisor seminarReady flag", async () => {
      mockCoreRepo.findSeminarBasicById.mockResolvedValue({ id: "sem-1", status: "verified", thesisId: "thesis-1" });
      mockCoreRepo.updateSeminar.mockResolvedValue({ id: "sem-1", status: "cancelled" });
      mockPrisma.thesisSupervisors = { updateMany: vi.fn().mockResolvedValue({ count: 1 }) };

      const result = await cancelSeminar("sem-1", { cancelledReason: "Test Reason" });

      expect(result.status).toBe("cancelled");
      expect(mockCoreRepo.updateSeminar).toHaveBeenCalledWith("sem-1", expect.objectContaining({ status: "cancelled", cancelledReason: "Test Reason" }));
      expect(mockPrisma.thesisSupervisors.updateMany).toHaveBeenCalledWith({
        where: { thesisId: "thesis-1" },
        data: { seminarReady: false }
      });
    });

    it("throws 400 if seminar is already concluded", async () => {
      mockCoreRepo.findSeminarBasicById.mockResolvedValue({ id: "sem-1", status: "passed" });
      await expect(cancelSeminar("sem-1", { cancelledReason: "Reason" })).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe("getSchedulingData", () => {
    it("returns availability, rooms, and bookings", async () => {
      mockCoreRepo.findSeminarById.mockResolvedValue({
        id: "sem-1",
        thesis: { thesisSupervisors: [{ lecturerId: "sup-1", role: { name: "Pembimbing 1" } }] },
        examiners: [{ lecturerId: "ex-1", lecturerName: "Examiner 1" }]
      });
      mockCoreRepo.findLecturerAvailabilities = vi.fn().mockResolvedValue([{ id: "av-1", lecturerId: "sup-1", day: "Senin", startTime: new Date(), endTime: new Date() }]);
      mockCoreRepo.findAllRooms = vi.fn().mockResolvedValue([{ id: "room-1", name: "Room 1" }]);
      mockCoreRepo.findRoomBookings = vi.fn().mockResolvedValue([]);

      const result = await getSchedulingData("sem-1");
      expect(result.participantIds).toContain("sup-1");
      expect(result.participantIds).toContain("ex-1");
      expect(result.rooms.length).toBe(1);
    });
  });

  describe("scheduleSeminar", () => {
    beforeEach(() => {
      mockCoreRepo.findSeminarBasicById.mockResolvedValue({ id: "sem-1", status: "examiner_assigned" });
      mockCoreRepo.findRoomScheduleConflict = vi.fn().mockResolvedValue(null);
    });

    it("saves draft schedule without conflict (weekday, business hours)", async () => {
      const result = await scheduleSeminar("sem-1", {
        isOnline: false, roomId: "room-1",
        date: "2026-05-19", startTime: "10:00", endTime: "12:00" // Tuesday
      });
      expect(result.status).toBe("examiner_assigned");
      expect(mockCoreRepo.updateSeminar).toHaveBeenCalled();
    });

    it("throws 409 if there is a room conflict", async () => {
      mockCoreRepo.findRoomScheduleConflict = vi.fn().mockResolvedValue({ id: "conflict-1" });
      await expect(scheduleSeminar("sem-1", {
        isOnline: false, roomId: "room-1",
        date: "2026-05-19", startTime: "10:00", endTime: "12:00"
      })).rejects.toMatchObject({ statusCode: 409 });
    });

    it("throws 400 if scheduled on Saturday", async () => {
      await expect(scheduleSeminar("sem-1", {
        isOnline: false, roomId: "room-1",
        date: "2026-05-16", startTime: "10:00", endTime: "12:00" // Saturday
      })).rejects.toMatchObject({ statusCode: 400 });
    });

    it("throws 400 if scheduled on Sunday", async () => {
      await expect(scheduleSeminar("sem-1", {
        isOnline: false, roomId: "room-1",
        date: "2026-05-17", startTime: "10:00", endTime: "12:00" // Sunday
      })).rejects.toMatchObject({ statusCode: 400 });
    });

    it("throws 400 if start time is before 06:00", async () => {
      await expect(scheduleSeminar("sem-1", {
        isOnline: false, roomId: "room-1",
        date: "2026-05-19", startTime: "05:00", endTime: "07:00"
      })).rejects.toMatchObject({ statusCode: 400 });
    });

    it("throws 400 if end time is after 18:00", async () => {
      await expect(scheduleSeminar("sem-1", {
        isOnline: false, roomId: "room-1",
        date: "2026-05-19", startTime: "17:00", endTime: "19:00"
      })).rejects.toMatchObject({ statusCode: 400 });
    });

    it("throws 400 if start time is not before end time", async () => {
      await expect(scheduleSeminar("sem-1", {
        isOnline: false, roomId: "room-1",
        date: "2026-05-19", startTime: "12:00", endTime: "10:00"
      })).rejects.toMatchObject({ statusCode: 400 });
    });

    it("allows online seminar without room conflict check", async () => {
      const result = await scheduleSeminar("sem-1", {
        isOnline: true, meetingLink: "https://meet.google.com/abc",
        date: "2026-05-19", startTime: "10:00", endTime: "12:00"
      });
      expect(result.status).toBe("examiner_assigned");
      expect(mockCoreRepo.findRoomScheduleConflict).not.toHaveBeenCalled();
    });
  });

  describe("finalizeSchedule", () => {
    it("transitions to scheduled and triggers notifications and outlook events", async () => {
      mockCoreRepo.findSeminarById = vi.fn().mockResolvedValue({
        id: "sem-1", status: "examiner_assigned",
        date: new Date("2026-05-20T00:00:00Z"),
        startTime: new Date("1970-01-01T03:00:00Z"),
        endTime: new Date("1970-01-01T05:00:00Z"),
        room: { name: "A1" },
        thesis: {
          student: { id: "stu-1", user: { id: "stu-user", fullName: "Student Name" } },
          thesisSupervisors: [{ lecturerId: "sup-1", lecturer: { user: { id: "sup-1", fullName: "Supervisor 1", email: "sup@test.com" } } }]
        },
        examiners: [{ lecturerId: "ex-1" }],
        audiences: [{ studentId: "aud-user" }]
      });
      mockPrisma.student.findMany.mockResolvedValue([{ id: "stu-1" }, { id: "other-stu" }]);
      mockPrisma.user.findMany.mockResolvedValue([
        { id: "ex-1", fullName: "Examiner 1", email: "ex1@test.com" },
        { id: "aud-user", fullName: "Audience 1", email: "aud1@test.com" }
      ]);

      const result = await finalizeSchedule("sem-1", "admin-user");

      expect(result.status).toBe("scheduled");
      expect(mockCoreRepo.updateSeminar).toHaveBeenCalledWith("sem-1", { status: "scheduled" });
    });

    it("throws 400 if seminar is not in examiner_assigned status", async () => {
      mockCoreRepo.findSeminarById = vi.fn().mockResolvedValue({
        id: "sem-1", status: "scheduled", date: new Date("2026-05-20T00:00:00Z"),
      });
      await expect(finalizeSchedule("sem-1", "admin-user")).rejects.toMatchObject({ statusCode: 400 });
    });

    it("throws 400 if seminar date is not yet set", async () => {
      mockCoreRepo.findSeminarById = vi.fn().mockResolvedValue({
        id: "sem-1", status: "examiner_assigned", date: null,
      });
      await expect(finalizeSchedule("sem-1", "admin-user")).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe("generateAssessmentResultPdf", () => {
    it("generates PDF buffer for a finalized seminar", async () => {
      mockCoreRepo.findSeminarById.mockResolvedValue({
        id: "sem-1",
        date: new Date(),
        startTime: new Date(),
        endTime: new Date(),
        thesis: { student: { user: { fullName: "Test Student", identityNumber: "123" } } }
      });

      const { getFinalizationData } = await import("../../../../services/thesis-seminar/examiner.service.js");
      getFinalizationData.mockResolvedValue({
        seminar: { status: "passed", resultFinalizedAt: new Date() },
        examiners: [],
        criteriaGroups: []
      });

      const result = await generateAssessmentResultPdf("sem-1");
      expect(result.toString()).toBe("fake-pdf-buffer");
    });

    it("throws 400 if seminar is not finalized", async () => {
      mockCoreRepo.findSeminarById.mockResolvedValue({ id: "sem-1" });
      const { getFinalizationData } = await import("../../../../services/thesis-seminar/examiner.service.js");
      getFinalizationData.mockResolvedValue({
        seminar: { status: "ongoing", resultFinalizedAt: null },
        examiners: [],
        criteriaGroups: []
      });

      await expect(generateAssessmentResultPdf("sem-1")).rejects.toMatchObject({ statusCode: 400 });
    });
  });
});
