import { describe, it, expect, vi, beforeEach } from "vitest";

import * as service from "../../../../services/yudisium/participant.service.js";

import * as participantRepo from "../../../../repositories/yudisium/participant.repository.js";

import prisma from "../../../../config/prisma.js";

import { mkdir, writeFile } from "fs/promises";



vi.mock("../../../../repositories/yudisium/participant.repository.js");

vi.mock("../../../../repositories/yudisium/requirement.repository.js");

vi.mock("xlsx", () => ({

  read: vi.fn(),

  utils: {

    sheet_to_json: vi.fn(),

  },

}));

vi.mock("fs/promises", () => ({

  mkdir: vi.fn().mockResolvedValue(undefined),

  writeFile: vi.fn().mockResolvedValue(undefined),

}));

vi.mock("../../../../config/prisma.js", () => {

  const mockPrisma = {

    $transaction: vi.fn((cb) => (typeof cb === "function" ? cb(mockPrisma) : Promise.all(cb))),

    yudisium: { findUnique: vi.fn(), findMany: vi.fn() },

    yudisiumParticipant: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },

    yudisiumParticipantRequirement: { findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn(), upsert: vi.fn() },

    yudisiumRequirementItem: { count: vi.fn().mockResolvedValue(1) },

    student: { findUnique: vi.fn(), updateMany: vi.fn() },

    studentCplScore: { updateMany: vi.fn(), update: vi.fn(), findMany: vi.fn() },

    cpl: { findMany: vi.fn() },

  };

  return { default: mockPrisma };

});



vi.mock("../../../../services/notification.service.js", () => ({

  createNotificationsForUsers: vi.fn().mockResolvedValue(undefined),

}));

vi.mock("../../../../services/push.service.js", () => ({

  sendFcmToUsers: vi.fn().mockResolvedValue(undefined),

}));

vi.mock("../../../../services/outlook-calendar.service.js", () => ({

  createCalendarEvent: vi.fn().mockResolvedValue(undefined),

  hasCalendarAccess: vi.fn().mockResolvedValue(true),

}));



describe("Unit Test: Yudisium Participant Service", () => {

  beforeEach(() => {

    vi.clearAllMocks();

    prisma.yudisiumRequirementItem.count.mockResolvedValue(1);

  });



  const verifiedParticipant = {

    id: "participant-1",

    status: "registered",

    registeredAt: new Date(),

    requirementVerifiedAt: new Date(),

    cplValidatedAt: null,

    yudisiumId: "yudisium-1",

    yudisium: { name: "Yudisium Mei 2026" },

    thesis: {

      student: {

        id: "student-1",

        user: { id: "student-user-1", fullName: "Budi Utomo", identityNumber: "21001" },

      },

    },

  };



  describe("verifyParticipantDocument", () => {

    it("notifies the student when a document is declined", async () => {

      participantRepo.findStatusById.mockResolvedValue(verifiedParticipant);

      participantRepo.findRequirementRecord.mockResolvedValue({ status: "submitted" });

      participantRepo.updateRequirementRecord.mockResolvedValue({});

      participantRepo.findVerificationContext.mockResolvedValue(verifiedParticipant);

      participantRepo.listRequirementRecords.mockResolvedValue([{ status: "declined" }]);

      participantRepo.updateStatus.mockResolvedValue({ id: "participant-1", status: "registered" });



      const result = await service.verifyParticipantDocument("participant-1", "item-1", {

        action: "decline",

        notes: "Format PDF tidak sesuai",

        userId: "admin-1",

      });



      expect(result).toMatchObject({

        requirementId: "item-1",

        status: "declined",

        requirementVerified: false,

      });

    });



    it("transitions participant to eligible when both requirements and CPL are verified", async () => {

      participantRepo.findStatusById.mockResolvedValue({ ...verifiedParticipant, cplValidatedAt: new Date() });

      participantRepo.findRequirementRecord.mockResolvedValue({ status: "submitted" });

      participantRepo.updateRequirementRecord.mockResolvedValue({});

      participantRepo.findVerificationContext.mockResolvedValue(verifiedParticipant);

      participantRepo.listRequirementRecords.mockResolvedValue([{ status: "approved", yudisiumRequirementItemId: "item-1" }]);

      participantRepo.updateStatus.mockResolvedValue({ id: "participant-1", status: "eligible" });

      const { default: mockPrisma } = await import("../../../../config/prisma.js");

      mockPrisma.yudisiumParticipantRequirement.findMany.mockResolvedValue([{ status: "approved", yudisiumRequirementItemId: "item-1" }]);



      const result = await service.verifyParticipantDocument("participant-1", "item-1", {

        action: "approve",

        userId: "admin-1",

      });



      expect(result).toMatchObject({

        requirementId: "item-1",

        status: "approved",

        requirementVerified: true,

      });

    });

  });



  describe("CPL validation", () => {

    it("validates a CPL and updates cplValidatedAt when all active CPLs are complete", async () => {

      participantRepo.findStudentByParticipant.mockResolvedValue(verifiedParticipant);

      participantRepo.findStudentCplScore.mockResolvedValue({

        cplId: "cpl-1",

        score: 80,

        status: "calculated",

      });

      participantRepo.validateStudentCplScore.mockResolvedValue({});

      participantRepo.findCplsActive.mockResolvedValue([{ id: "cpl-1" }]);

      participantRepo.findStudentCplScores.mockResolvedValue([{ cplId: "cpl-1", status: "validated" }]);

      participantRepo.findStatusById.mockResolvedValue({ ...verifiedParticipant, cplValidatedAt: new Date() });

      participantRepo.updateStatus.mockResolvedValue({ id: "participant-1", status: "eligible" });



      const result = await service.validateCplScore("participant-1", "cpl-1", "gkm-1");



      expect(participantRepo.validateStudentCplScore).toHaveBeenCalledWith("student-1", "cpl-1", "gkm-1", expect.anything());

      expect(result).toEqual({ cplId: "cpl-1", status: "validated", allCplValidated: true });

    });



    it("saves CPL repair as validated and updates CPL state", async () => {

      participantRepo.findStudentByParticipant.mockResolvedValue(verifiedParticipant);

      participantRepo.findStudentCplScore.mockResolvedValue({

        cplId: "cpl-1",

        score: 60,

        status: "calculated",

      });

      participantRepo.findCplById.mockResolvedValue({ id: "cpl-1", minimalScore: 70 });

      participantRepo.saveCplRepairment.mockResolvedValue({});

      participantRepo.findCplsActive.mockResolvedValue([{ id: "cpl-1" }]);

      participantRepo.findStudentCplScores.mockResolvedValue([{ cplId: "cpl-1", status: "validated" }]);

      participantRepo.findStatusById.mockResolvedValue({ ...verifiedParticipant, cplValidatedAt: new Date() });

      participantRepo.updateStatus.mockResolvedValue({ id: "participant-1", status: "eligible" });



      const result = await service.saveCplRepairment("participant-1", "cpl-1", {

        newScore: 75,

        oldScore: 60,

        recommendationFile: { originalname: "rekomendasi.pdf", buffer: Buffer.from("pdf"), mimetype: "application/pdf", size: 100 },

        settlementFile: { originalname: "penyelesaian.pdf", buffer: Buffer.from("pdf"), mimetype: "application/pdf", size: 100 },

        userId: "gkm-1",

      });



      expect(mkdir).toHaveBeenCalled();

      expect(writeFile).toHaveBeenCalledTimes(2);

      expect(participantRepo.saveCplRepairment).toHaveBeenCalledWith(

        "student-1",

        "cpl-1",

        expect.objectContaining({

          score: 75,

          oldCplScore: 60,

          recommendationDocumentName: "rekomendasi.pdf",

          settlementDocumentName: "penyelesaian.pdf",

          verifiedBy: "gkm-1",

        }),

        expect.anything()

      );

      expect(result).toEqual({ cplId: "cpl-1", status: "validated", allCplValidated: true });

    });



    it("allows replacing an existing CPL repair document while in CPL validation", async () => {

      participantRepo.findStudentByParticipant.mockResolvedValue(verifiedParticipant);

      participantRepo.findStudentCplScore.mockResolvedValue({

        cplId: "cpl-1",

        score: 75,

        status: "validated",

        oldCplScore: 60,

        recommendationDocumentPath: "old-rec.pdf",

        settlementDocumentPath: "old-set.pdf",

      });

      participantRepo.findCplById.mockResolvedValue({ id: "cpl-1", minimalScore: 70 });

      participantRepo.saveCplRepairment.mockResolvedValue({});

      participantRepo.findCplsActive.mockResolvedValue([{ id: "cpl-1" }, { id: "cpl-2" }]);

      participantRepo.findStudentCplScores.mockResolvedValue([

        { cplId: "cpl-1", status: "validated" },

        { cplId: "cpl-2", status: "calculated" },

      ]);

      participantRepo.findStatusById.mockResolvedValue(verifiedParticipant);



      await service.saveCplRepairment("participant-1", "cpl-1", {

        newScore: 78,

        oldScore: 60,

        recommendationFile: { originalname: "rekomendasi-baru.pdf", buffer: Buffer.from("pdf"), mimetype: "application/pdf", size: 100 },

        settlementFile: null,

        userId: "gkm-1",

      });



      expect(writeFile).toHaveBeenCalledTimes(1);

      expect(participantRepo.saveCplRepairment).toHaveBeenCalledWith(

        "student-1",

        "cpl-1",

        expect.objectContaining({

          score: 78,

          oldCplScore: 60,

          recommendationDocumentName: "rekomendasi-baru.pdf",

          settlementDocumentPath: "old-set.pdf",

          verifiedBy: "gkm-1",

        }),

        expect.anything()

      );

    });

  });

});
