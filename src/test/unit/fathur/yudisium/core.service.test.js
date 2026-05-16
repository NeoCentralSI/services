import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as service from "../../../../services/yudisium/core.service.js";
import * as repository from "../../../../repositories/yudisium/yudisium.repository.js";
import prisma from "../../../../config/prisma.js";

vi.mock("../../../../repositories/yudisium/yudisium.repository.js");
vi.mock("../../../../config/prisma.js", () => ({
  default: {
    document: { create: vi.fn() },
    yudisiumParticipant: {
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    studentCplScore: { updateMany: vi.fn() },
    student: { updateMany: vi.fn() },
    cpl: { findMany: vi.fn() },
    yudisium: { update: vi.fn() },
    room: { findMany: vi.fn() },
    yudisiumRequirement: { findMany: vi.fn() },
    yudisiumRequirementItem: { findMany: vi.fn() },
    yudisiumParticipantRequirement: { findMany: vi.fn() },
    thesis: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    thesisTopic: { findMany: vi.fn() },
  },
}));

const makeYudisium = (overrides = {}) => ({
  id: "y1",
  name: "Yudisium Genap",
  registrationOpenDate: null,
  registrationCloseDate: null,
  eventDate: new Date("2026-08-01T02:00:00.000Z"),
  appointedAt: null,
  documentId: null,
  notes: null,
  exitSurveyFormId: null,
  roomId: "room-1",
  document: null,
  exitSurveyForm: null,
  room: { id: "room-1", name: "Ruang Sidang" },
  requirementItems: [],
  participants: [],
  _count: { participants: 0, studentExitSurveyResponses: 0 },
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  ...overrides,
});

const activeYudisium = (overrides = {}) =>
  makeYudisium({
    registrationOpenDate: new Date("2026-07-01T00:00:00.000Z"),
    registrationCloseDate: new Date("2026-07-20T00:00:00.000Z"),
    eventDate: new Date("2026-08-01T02:00:00.000Z"),
    exitSurveyFormId: "form-1",
    exitSurveyForm: { id: "form-1", name: "Exit Survey" },
    requirementItems: [
      {
        id: "item-1",
        yudisiumRequirementId: "req-1",
        order: 0,
        yudisiumRequirement: { id: "req-1", name: "Bebas Pustaka" },
      },
    ],
    ...overrides,
  });

describe("Unit Test: Yudisium Core Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-16T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("createYudisium", () => {
    it("creates archive yudisium with historical event date and minimal required fields", async () => {
      const created = makeYudisium({
        eventDate: new Date("2024-08-01T02:00:00.000Z"),
      });
      repository.create.mockResolvedValue(created);

      const result = await service.createYudisium({
        name: "Arsip 2024",
        eventDate: "2024-08-01T02:00:00.000Z",
        roomId: "room-1",
      });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Arsip 2024",
          registrationOpenDate: null,
          registrationCloseDate: null,
          exitSurveyFormId: null,
          roomId: "room-1",
        })
      );
      expect(result.status).toBe("completed");
    });

    it("requires room for archive yudisium", async () => {
      await expect(
        service.createYudisium({
          name: "Arsip 2024",
          eventDate: "2024-08-01T02:00:00.000Z",
        })
      ).rejects.toThrow("Ruangan yudisium wajib dipilih");
      expect(repository.create).not.toHaveBeenCalled();
    });

    it("requires exit survey and requirements for active yudisium", async () => {
      await expect(
        service.createYudisium({
          name: "Yudisium Aktif",
          eventDate: "2026-08-01T02:00:00.000Z",
          registrationOpenDate: "2026-07-01T00:00:00.000Z",
          registrationCloseDate: "2026-07-20T00:00:00.000Z",
          roomId: "room-1",
        })
      ).rejects.toThrow("Template exit survey wajib dipilih");
      expect(repository.create).not.toHaveBeenCalled();
    });

    it("requires active yudisium event date after registration close date", async () => {
      await expect(
        service.createYudisium({
          name: "Yudisium Aktif",
          eventDate: "2026-07-20T00:00:00.000Z",
          registrationOpenDate: "2026-07-01T00:00:00.000Z",
          registrationCloseDate: "2026-07-20T00:00:00.000Z",
          roomId: "room-1",
          exitSurveyFormId: "form-1",
          requirementIds: ["req-1"],
        })
      ).rejects.toThrow("Tanggal pelaksanaan harus setelah tanggal penutupan");
      expect(repository.create).not.toHaveBeenCalled();
    });

    it("requires active yudisium registration dates not in the past", async () => {
      await expect(
        service.createYudisium({
          name: "Yudisium Aktif",
          eventDate: "2026-08-01T02:00:00.000Z",
          registrationOpenDate: "2026-05-15T00:00:00.000Z",
          registrationCloseDate: "2026-07-20T00:00:00.000Z",
          roomId: "room-1",
          exitSurveyFormId: "form-1",
          requirementIds: ["req-1"],
        })
      ).rejects.toThrow("Tanggal pembukaan pendaftaran tidak boleh sebelum hari ini");
      expect(repository.create).not.toHaveBeenCalled();
    });
  });

  describe("getAnnouncements", () => {
    it("includes archive yudisium when it has finalized participants", async () => {
      repository.findAll.mockResolvedValue([
        makeYudisium({
          id: "archive-1",
          name: "Arsip Yudisium 2025",
          eventDate: new Date("2025-04-16T03:00:00.000Z"),
          _count: { participants: 1, studentExitSurveyResponses: 0 },
        }),
      ]);
      prisma.yudisiumParticipant.findMany.mockResolvedValue([
        {
          id: "participant-1",
          status: "finalized",
          thesis: {
            title: "Sistem Informasi Akademik",
            student: {
              user: { fullName: "Ayu Putri", identityNumber: "2211520001" },
            },
          },
        },
      ]);

      const result = await service.getAnnouncements();

      expect(prisma.yudisiumParticipant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            yudisiumId: "archive-1",
            status: { in: ["appointed", "finalized"] },
          },
        })
      );
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: "archive-1",
        name: "Arsip Yudisium 2025",
        participants: [
          {
            id: "participant-1",
            studentName: "Ayu Putri",
            studentNim: "2211520001",
            thesisTitle: "Sistem Informasi Akademik",
            status: "finalized",
          },
        ],
      });
    });

    it("does not include archive yudisium without finalized participants", async () => {
      repository.findAll.mockResolvedValue([
        makeYudisium({
          id: "archive-empty",
          name: "Arsip Kosong",
          eventDate: new Date("2025-04-16T03:00:00.000Z"),
        }),
      ]);
      prisma.yudisiumParticipant.findMany.mockResolvedValue([]);

      const result = await service.getAnnouncements();

      expect(result).toEqual([]);
    });
  });

  describe("updateYudisium", () => {
    it("allows active yudisium operational updates after registration has participants", async () => {
      const existing = activeYudisium();
      const updated = activeYudisium({
        eventDate: new Date("2026-08-03T02:00:00.000Z"),
        roomId: "room-2",
        room: { id: "room-2", name: "Auditorium" },
        registrationCloseDate: new Date("2026-07-25T00:00:00.000Z"),
      });
      repository.findById.mockResolvedValue(existing);
      repository.hasParticipants.mockResolvedValue(true);
      repository.hasRegisteredParticipants.mockResolvedValue(true);
      repository.update.mockResolvedValue(updated);

      const result = await service.updateYudisium("y1", {
        eventDate: "2026-08-03T02:00:00.000Z",
        roomId: "room-2",
        registrationCloseDate: "2026-07-25T00:00:00.000Z",
      });

      expect(repository.update).toHaveBeenCalledWith(
        "y1",
        expect.objectContaining({
          eventDate: new Date("2026-08-03T02:00:00.000Z"),
          roomId: "room-2",
          registrationCloseDate: new Date("2026-07-25T00:00:00.000Z"),
        })
      );
      expect(result.room?.id).toBe("room-2");
    });

    it("blocks registration open date changes after registration has participants", async () => {
      repository.findById.mockResolvedValue(activeYudisium());
      repository.hasParticipants.mockResolvedValue(true);
      repository.hasRegisteredParticipants.mockResolvedValue(true);

      await expect(
        service.updateYudisium("y1", {
          registrationOpenDate: "2026-07-02T00:00:00.000Z",
        })
      ).rejects.toThrow("Tanggal pembukaan pendaftaran tidak dapat diubah");
      expect(repository.update).not.toHaveBeenCalled();
    });

    it("blocks registration close date shortening after registration has participants", async () => {
      repository.findById.mockResolvedValue(activeYudisium());
      repository.hasParticipants.mockResolvedValue(true);
      repository.hasRegisteredParticipants.mockResolvedValue(true);

      await expect(
        service.updateYudisium("y1", {
          registrationCloseDate: "2026-07-10T00:00:00.000Z",
        })
      ).rejects.toThrow("hanya dapat diperpanjang");
      expect(repository.update).not.toHaveBeenCalled();
    });

    it("blocks exit survey and requirement changes after registration has participants", async () => {
      repository.findById.mockResolvedValue(activeYudisium());
      repository.hasParticipants.mockResolvedValue(true);
      repository.hasRegisteredParticipants.mockResolvedValue(true);

      await expect(
        service.updateYudisium("y1", {
          exitSurveyFormId: "form-2",
        })
      ).rejects.toThrow("Template exit survey tidak dapat diubah");

      await expect(
        service.updateYudisium("y1", {
          requirementIds: ["req-2"],
        })
      ).rejects.toThrow("Persyaratan yudisium tidak dapat diubah");
    });

    it("blocks active/archive type switch once participants exist", async () => {
      repository.findById.mockResolvedValue(activeYudisium());
      repository.hasParticipants.mockResolvedValue(true);
      repository.hasRegisteredParticipants.mockResolvedValue(true);

      await expect(
        service.updateYudisium("y1", {
          registrationOpenDate: null,
          registrationCloseDate: null,
        })
      ).rejects.toThrow("Tipe yudisium tidak dapat diubah");
    });

    it("allows archive yudisium basic updates after manual or imported participants exist", async () => {
      const existing = makeYudisium({
        _count: { participants: 2, studentExitSurveyResponses: 0 },
        participants: [{ id: "participant-1" }, { id: "participant-2" }],
      });
      const updated = makeYudisium({
        name: "Arsip Yudisium Revisi",
        eventDate: new Date("2024-08-03T02:00:00.000Z"),
        roomId: "room-2",
        room: { id: "room-2", name: "Auditorium" },
        notes: "Catatan arsip",
        _count: { participants: 2, studentExitSurveyResponses: 0 },
        participants: [{ id: "participant-1" }, { id: "participant-2" }],
      });
      repository.findById.mockResolvedValue(existing);
      repository.hasParticipants.mockResolvedValue(true);
      repository.hasRegisteredParticipants.mockResolvedValue(true);
      repository.update.mockResolvedValue(updated);

      const result = await service.updateYudisium("y1", {
        name: "Arsip Yudisium Revisi",
        eventDate: "2024-08-03T02:00:00.000Z",
        roomId: "room-2",
        notes: "Catatan arsip",
      });

      expect(repository.update).toHaveBeenCalledWith(
        "y1",
        expect.objectContaining({
          name: "Arsip Yudisium Revisi",
          eventDate: new Date("2024-08-03T02:00:00.000Z"),
          roomId: "room-2",
          notes: "Catatan arsip",
        })
      );
      expect(result).toMatchObject({
        name: "Arsip Yudisium Revisi",
        status: "completed",
        participantCount: 2,
        room: { id: "room-2" },
      });
    });

    it("blocks converting archive yudisium to active after manual or imported participants exist", async () => {
      repository.findById.mockResolvedValue(
        makeYudisium({
          _count: { participants: 1, studentExitSurveyResponses: 0 },
          participants: [{ id: "participant-1" }],
        })
      );
      repository.hasParticipants.mockResolvedValue(true);
      repository.hasRegisteredParticipants.mockResolvedValue(true);

      await expect(
        service.updateYudisium("y1", {
          registrationOpenDate: "2026-07-01T00:00:00.000Z",
          registrationCloseDate: "2026-07-20T00:00:00.000Z",
          exitSurveyFormId: "form-1",
          requirementIds: ["req-1"],
        })
      ).rejects.toThrow("Tipe yudisium tidak dapat diubah");
      expect(repository.update).not.toHaveBeenCalled();
    });

    it("locks active yudisium schedule and setup after appointment", async () => {
      repository.findById.mockResolvedValue(
        activeYudisium({ appointedAt: new Date("2026-07-26T00:00:00.000Z") })
      );
      repository.hasParticipants.mockResolvedValue(true);
      repository.hasRegisteredParticipants.mockResolvedValue(true);

      await expect(
        service.updateYudisium("y1", {
          eventDate: "2026-08-05T02:00:00.000Z",
        })
      ).rejects.toThrow("tidak dapat diubah setelah peserta ditetapkan");
      expect(repository.update).not.toHaveBeenCalled();
    });
  });

  describe("deleteYudisium", () => {
    it("deletes archive yudisium with participants through archive cleanup", async () => {
      repository.findById.mockResolvedValue(makeYudisium({ _count: { participants: 2 } }));
      repository.removeWithParticipants.mockResolvedValue({});

      await service.deleteYudisium("y1");

      expect(repository.removeWithParticipants).toHaveBeenCalledWith("y1");
      expect(repository.remove).not.toHaveBeenCalled();
    });

    it("blocks deleting active yudisium with participants", async () => {
      repository.findById.mockResolvedValue(activeYudisium({ _count: { participants: 1 } }));
      repository.hasParticipants.mockResolvedValue(true);

      await expect(service.deleteYudisium("y1")).rejects.toThrow("sudah memiliki peserta");
      expect(repository.remove).not.toHaveBeenCalled();
      expect(repository.removeWithParticipants).not.toHaveBeenCalled();
    });
  });

  describe("finalizeRegistration", () => {
    it("rejects finalization for archive yudisium", async () => {
      repository.findById.mockResolvedValue(makeYudisium());

      await expect(service.finalizeRegistration("y1")).rejects.toThrow(
        "Finalisasi pendaftaran hanya berlaku untuk yudisium aktif"
      );
      expect(prisma.yudisiumParticipant.findMany).not.toHaveBeenCalled();
    });
  });
});
