import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  thesisSeminar: { findMany: vi.fn() },
  thesisDefence: { findMany: vi.fn() },
  yudisium: { findMany: vi.fn() },
  student: { findMany: vi.fn() },
  user: { findMany: vi.fn() },
  thesisSeminarExaminer: { findMany: vi.fn() },
  thesisDefenceExaminer: { findMany: vi.fn() },
};

vi.mock("../../../config/prisma.js", () => ({ default: prismaMock }));

const createNotificationsForUsers = vi.fn().mockResolvedValue({ count: 1 });
const sendFcmToUsers = vi.fn().mockResolvedValue({ success: true });

vi.mock("../../../services/notification.service.js", () => ({
  createNotificationsForUsers,
}));

vi.mock("../../../services/push.service.js", () => ({
  sendFcmToUsers,
}));

const {
  runAcademicEventReminderJob,
  runExaminerNoResponseReminderJob,
  runYudisiumRegistrationClosedReminderJob,
  runYudisiumRegistrationClosingReminderJob,
  runYudisiumRegistrationOpenReminderJob,
} = await import("../../../jobs/academic-event-notification.job.js");

describe("academic event notification job", () => {
  const now = new Date("2026-05-17T05:00:00.000Z");
  const today = new Date("2026-05-17T03:00:00.000Z");
  const tomorrow = new Date("2026-05-18T03:00:00.000Z");
  const threeDaysAgo = new Date("2026-05-14T03:00:00.000Z");

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.thesisSeminar.findMany.mockResolvedValue([]);
    prismaMock.thesisDefence.findMany.mockResolvedValue([]);
    prismaMock.yudisium.findMany.mockResolvedValue([]);
    prismaMock.student.findMany.mockResolvedValue([]);
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.thesisSeminarExaminer.findMany.mockResolvedValue([]);
    prismaMock.thesisDefenceExaminer.findMany.mockResolvedValue([]);
  });

  it("sends H-1 event reminders for seminar, defence, and yudisium participants", async () => {
    prismaMock.thesisSeminar.findMany.mockResolvedValue([
      {
        id: "seminar-1",
        date: tomorrow,
        startTime: new Date("1970-01-01T09:00:00.000Z"),
        meetingLink: null,
        room: { name: "Ruang Seminar" },
        thesis: {
          studentId: "student-seminar",
          student: { user: { fullName: "Seminar Student" } },
        },
        audiences: [{ studentId: "audience-1" }],
        examiners: [{ lecturerId: "lecturer-seminar" }],
      },
    ]);
    prismaMock.thesisDefence.findMany.mockResolvedValue([
      {
        id: "defence-1",
        date: tomorrow,
        startTime: new Date("1970-01-01T10:00:00.000Z"),
        meetingLink: "https://meet.test",
        room: null,
        thesis: {
          studentId: "student-defence",
          student: { user: { fullName: "Defence Student" } },
          thesisSupervisors: [{ lecturerId: "supervisor-1" }],
        },
        examiners: [{ lecturerId: "lecturer-defence" }],
      },
    ]);
    prismaMock.yudisium.findMany.mockResolvedValue([
      {
        id: "yudisium-1",
        name: "Yudisium Mei",
        eventDate: tomorrow,
        room: { name: "Ruang Yudisium" },
        participants: [
          { thesis: { studentId: "student-yudisium-1" } },
          { thesis: { studentId: "student-yudisium-2" } },
        ],
      },
    ]);
    prismaMock.user.findMany.mockImplementation(({ where }) => {
      const ids = where?.id?.in ?? [];
      return Promise.resolve(ids.map((id) => ({ id, fullName: `User ${id}` })));
    });

    const result = await runAcademicEventReminderJob({
      offsetDays: 1,
      phase: "h_minus_one",
      now,
    });

    expect(result).toMatchObject({ seminar: 1, defence: 1, yudisium: 1 });
    expect(createNotificationsForUsers).toHaveBeenCalledTimes(3);
    expect(createNotificationsForUsers).toHaveBeenCalledWith(
      ["student-seminar", "audience-1", "lecturer-seminar"],
      expect.objectContaining({ title: "Pengingat Event Besok: Seminar Hasil" })
    );
    expect(createNotificationsForUsers).toHaveBeenCalledWith(
      ["student-defence", "lecturer-defence", "supervisor-1"],
      expect.objectContaining({ title: "Pengingat Event Besok: Sidang Tugas Akhir" })
    );
    expect(createNotificationsForUsers).toHaveBeenCalledWith(
      ["student-yudisium-1", "student-yudisium-2"],
      expect.objectContaining({ title: "Pengingat Event Besok: Yudisium" })
    );
  });

  it("only sends day-of-event reminders for events matching today's date", async () => {
    prismaMock.thesisSeminar.findMany.mockResolvedValue([
      {
        id: "seminar-today",
        date: today,
        startTime: null,
        meetingLink: null,
        room: null,
        thesis: {
          studentId: "student-today",
          student: { user: { fullName: "Student Today" } },
        },
        audiences: [],
        examiners: [],
      },
      {
        id: "seminar-tomorrow",
        date: tomorrow,
        startTime: null,
        meetingLink: null,
        room: null,
        thesis: {
          studentId: "student-tomorrow",
          student: { user: { fullName: "Student Tomorrow" } },
        },
        audiences: [],
        examiners: [],
      },
    ]);

    const result = await runAcademicEventReminderJob({
      offsetDays: 0,
      phase: "event_day",
      now,
    });

    expect(result).toMatchObject({ seminar: 1, defence: 0, yudisium: 0, sent: 1 });
    expect(createNotificationsForUsers).toHaveBeenCalledTimes(1);
    expect(createNotificationsForUsers).toHaveBeenCalledWith(
      ["student-today"],
      expect.objectContaining({ title: "Pengingat Event Hari Ini: Seminar Hasil" })
    );
  });

  it("broadcasts H-1 yudisium registration closing reminder to all students", async () => {
    prismaMock.yudisium.findMany.mockResolvedValue([
      {
        id: "yudisium-close",
        name: "Yudisium Juni",
        registrationCloseDate: tomorrow,
      },
    ]);
    prismaMock.student.findMany.mockResolvedValue([{ id: "student-1" }, { id: "student-2" }]);

    const result = await runYudisiumRegistrationClosingReminderJob(now);

    expect(result).toEqual({ yudisium: 1, sent: 2 });
    expect(createNotificationsForUsers).toHaveBeenCalledWith(
      ["student-1", "student-2"],
      expect.objectContaining({ title: "Pendaftaran Yudisium Segera Ditutup" })
    );
  });

  it("broadcasts yudisium registration open reminder to all students", async () => {
    prismaMock.yudisium.findMany.mockResolvedValue([
      {
        id: "yudisium-open",
        name: "Yudisium Juli",
        registrationOpenDate: today,
        registrationCloseDate: tomorrow,
      },
    ]);
    prismaMock.student.findMany.mockResolvedValue([{ id: "student-1" }]);

    const result = await runYudisiumRegistrationOpenReminderJob(now);

    expect(result).toEqual({ yudisium: 1, sent: 1 });
    expect(createNotificationsForUsers).toHaveBeenCalledWith(
      ["student-1"],
      expect.objectContaining({ title: "Pendaftaran Yudisium Dibuka" })
    );
  });

  it("notifies yudisium coordinators when registration closes", async () => {
    prismaMock.yudisium.findMany.mockResolvedValue([
      {
        id: "yudisium-closed",
        name: "Yudisium Agustus",
        registrationCloseDate: today,
      },
    ]);
    prismaMock.user.findMany.mockResolvedValue([{ id: "coordinator-1" }]);

    const result = await runYudisiumRegistrationClosedReminderJob(now);

    expect(result).toEqual({ yudisium: 1, sent: 1 });
    expect(prismaMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userHasRoles: expect.objectContaining({
            some: expect.objectContaining({
              role: { name: "Koordinator Yudisium" },
            }),
          }),
        }),
      })
    );
    expect(createNotificationsForUsers).toHaveBeenCalledWith(
      ["coordinator-1"],
      expect.objectContaining({ title: "Pendaftaran Yudisium Ditutup" })
    );
  });

  it("notifies Kadep about seminar and defence examiners with no response after 3 days", async () => {
    prismaMock.thesisSeminarExaminer.findMany.mockResolvedValue([
      {
        id: "seminar-examiner-1",
        assignedAt: threeDaysAgo,
        lecturerId: "lecturer-1",
        seminar: {
          id: "seminar-1",
          thesis: { student: { user: { fullName: "Seminar Student" } } },
        },
      },
    ]);
    prismaMock.thesisDefenceExaminer.findMany.mockResolvedValue([
      {
        id: "defence-examiner-1",
        assignedAt: threeDaysAgo,
        lecturerId: "lecturer-2",
        defence: {
          id: "defence-1",
          thesis: { student: { user: { fullName: "Defence Student" } } },
        },
      },
    ]);
    prismaMock.user.findMany.mockImplementation(({ where }) => {
      const roleName = where?.userHasRoles?.some?.role?.name;
      if (roleName === "Ketua Departemen") return Promise.resolve([{ id: "kadep-1" }]);
      const ids = where?.id?.in ?? [];
      return Promise.resolve(ids.map((id) => ({ id, fullName: `Lecturer ${id}` })));
    });

    const result = await runExaminerNoResponseReminderJob(now);

    expect(result).toEqual({ seminar: 1, defence: 1, sent: 2 });
    expect(createNotificationsForUsers).toHaveBeenCalledWith(
      ["kadep-1"],
      expect.objectContaining({ title: "Penguji Seminar Belum Merespons" })
    );
    expect(createNotificationsForUsers).toHaveBeenCalledWith(
      ["kadep-1"],
      expect.objectContaining({ title: "Penguji Sidang Belum Merespons" })
    );
  });
});
