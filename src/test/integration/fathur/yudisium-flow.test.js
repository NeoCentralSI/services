import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { unlink } from "fs/promises";
import path from "path";
import prisma from "../../../config/prisma.js";
import * as studentService from "../../../services/yudisium/student.service.js";
import * as participantService from "../../../services/yudisium/participant.service.js";

vi.mock("../../../services/notification.service.js", () => ({
  createNotificationsForUsers: vi.fn().mockResolvedValue({ count: 1 }),
  createNotificationService: vi.fn().mockResolvedValue(true),
}));
vi.mock("../../../services/push.service.js", () => ({
  sendFcmToUsers: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock("../../../services/outlook-calendar.service.js", () => ({
  hasCalendarAccess: vi.fn().mockResolvedValue(true),
  createCalendarEvent: vi.fn().mockResolvedValue({ eventId: "yudisium-flow-event" }),
}));

describe("Integration: Yudisium Flow", () => {
  const ts = Date.now();
  const documentIds = [];
  const uploadedPaths = [];
  const createdCplIds = [];

  let studentUser;
  let student;
  let adminUser;
  let gkmUser;
  let coordinatorUser;
  let thesis;
  let defence;
  let room;
  let yudisium;
  let requirements = [];
  let requirementItems = [];
  let cpls = [];
  let participantId;
  let response;

  const fakeFile = (name = "dokumen-yudisium.pdf") => ({
    originalname: name,
    buffer: Buffer.from(`integration-yudisium-${ts}`),
    mimetype: "application/pdf",
  });

  beforeAll(async () => {
    studentUser = await prisma.user.create({
      data: {
        fullName: `Yudisium Student ${ts}`,
        identityNumber: `NIM-YUD-${ts}`,
        identityType: "NIM",
        email: `student-yud-${ts}@test.local`,
        password: "p",
      },
    });
    student = await prisma.student.create({
      data: {
        id: studentUser.id,
        skscompleted: 150,
        mandatoryCoursesCompleted: true,
        mkwuCompleted: true,
        internshipCompleted: true,
        kknCompleted: true,
      },
    });

    adminUser = await prisma.user.create({
      data: {
        fullName: `Yudisium Admin ${ts}`,
        identityNumber: `NIP-ADM-YUD-${ts}`,
        identityType: "NIP",
        email: `admin-yud-${ts}@test.local`,
        password: "p",
      },
    });
    gkmUser = await prisma.user.create({
      data: {
        fullName: `Yudisium GKM ${ts}`,
        identityNumber: `NIP-GKM-YUD-${ts}`,
        identityType: "NIP",
        email: `gkm-yud-${ts}@test.local`,
        password: "p",
      },
    });
    coordinatorUser = await prisma.user.create({
      data: {
        fullName: `Koordinator Yudisium ${ts}`,
        identityNumber: `NIP-KOOR-YUD-${ts}`,
        identityType: "NIP",
        email: `koor-yud-${ts}@test.local`,
        password: "p",
      },
    });

    const thesisStatus = await prisma.thesisStatus.findFirst({
      where: { name: { contains: "Bimbingan" } },
    });
    if (!thesisStatus) throw new Error("Seed thesis status Bimbingan tidak ditemukan");

    thesis = await prisma.thesis.create({
      data: {
        studentId: student.id,
        title: `Tugas Akhir Yudisium Flow ${ts}`,
        thesisStatusId: thesisStatus.id,
      },
    });
    defence = await prisma.thesisDefence.create({
      data: {
        thesisId: thesis.id,
        status: "passed",
        date: new Date(),
      },
    });

    room = await prisma.room.create({
      data: { name: `Ruang Yudisium Flow ${ts}`, location: "Integration Test" },
    });

    yudisium = await prisma.yudisium.create({
      data: {
        name: `Yudisium Flow ${ts}`,
        roomId: room.id,
        registrationOpenDate: new Date(Date.now() - 1000),
        registrationCloseDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        eventDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        notes: "Integration yudisium flow",
      },
    });

    requirements = await prisma.$transaction([
      prisma.yudisiumRequirement.create({
        data: {
          name: `Laporan Tugas Akhir Final ${ts}`,
          description: "Dokumen laporan akhir",
          isActive: true,
        },
      }),
      prisma.yudisiumRequirement.create({
        data: {
          name: `Bukti Bebas Pustaka ${ts}`,
          description: "Dokumen bebas pustaka",
          isActive: true,
        },
      }),
    ]);

    requirementItems = await Promise.all(
      requirements.map((requirement, index) =>
        prisma.yudisiumRequirementItem.create({
          data: {
            yudisiumId: yudisium.id,
            yudisiumRequirementId: requirement.id,
            order: index + 1,
          },
        })
      )
    );

    response = await prisma.studentExitSurveyResponse.create({
      data: {
        yudisiumId: yudisium.id,
        thesisId: thesis.id,
        submittedAt: new Date(),
      },
    });

    cpls = await prisma.cpl.findMany({ where: { isActive: true }, orderBy: { code: "asc" } });
    if (cpls.length === 0) {
      cpls = await prisma.$transaction([
        prisma.cpl.create({
          data: {
            code: `CPL-YUD-1-${ts}`,
            description: "CPL integration 1",
            minimalScore: 60,
            isActive: true,
          },
        }),
        prisma.cpl.create({
          data: {
            code: `CPL-YUD-2-${ts}`,
            description: "CPL integration 2",
            minimalScore: 60,
            isActive: true,
          },
        }),
      ]);
      createdCplIds.push(...cpls.map((item) => item.id));
    }

    await prisma.studentCplScore.createMany({
      data: cpls.map((cpl, index) => ({
        studentId: student.id,
        cplId: cpl.id,
        score: Math.max(cpl.minimalScore, 75 + index),
        status: "calculated",
      })),
    });
  });

  afterAll(async () => {
    try {
      for (const filePath of uploadedPaths) {
        await unlink(path.join(process.cwd(), filePath)).catch(() => {});
      }

      if (participantId) {
        await prisma.yudisiumParticipantRequirement.deleteMany({
          where: { yudisiumParticipantId: participantId },
        }).catch(() => {});
        await prisma.yudisiumParticipant.delete({ where: { id: participantId } }).catch(() => {});
      }

      await prisma.document.deleteMany({ where: { id: { in: documentIds } } }).catch(() => {});
      if (response) {
        await prisma.studentExitSurveyAnswer.deleteMany({
          where: { studentExitSurveyResponseId: response.id },
        }).catch(() => {});
        await prisma.studentExitSurveyResponse.delete({ where: { id: response.id } }).catch(() => {});
      }
      await prisma.studentCplScore.deleteMany({ where: { studentId: student?.id } }).catch(() => {});
      await prisma.cpl.deleteMany({ where: { id: { in: createdCplIds } } }).catch(() => {});
      await prisma.yudisiumRequirementItem.deleteMany({ where: { yudisiumId: yudisium?.id } }).catch(() => {});
      await prisma.yudisium.delete({ where: { id: yudisium.id } }).catch(() => {});
      await prisma.yudisiumRequirement.deleteMany({
        where: { id: { in: requirements.map((item) => item.id) } },
      }).catch(() => {});
      await prisma.room.delete({ where: { id: room.id } }).catch(() => {});
      await prisma.thesisDefence.delete({ where: { id: defence.id } }).catch(() => {});
      await prisma.thesis.delete({ where: { id: thesis.id } }).catch(() => {});
      await prisma.student.delete({ where: { id: student.id } }).catch(() => {});
      await prisma.user.deleteMany({
        where: {
          id: { in: [studentUser.id, adminUser.id, gkmUser.id, coordinatorUser.id] },
        },
      }).catch(() => {});
    } catch (err) {
      console.error("Yudisium flow cleanup error:", err);
    }
  });

  it("allows a student to upload all yudisium requirement documents", async () => {
    for (const requirement of requirements) {
      const result = await studentService.uploadOwnDocument(
        student.id,
        fakeFile(`${requirement.name}.pdf`),
        requirement.id
      );
      expect(result.status).toBe("submitted");
      expect(result.documentId).toBeDefined();
      documentIds.push(result.documentId);
      uploadedPaths.push(result.filePath);
    }

    const participant = await prisma.yudisiumParticipant.findFirst({
      where: { yudisiumId: yudisium.id, thesisId: thesis.id },
    });

    expect(participant).toBeTruthy();
    expect(participant.status).toBe("registered");
    participantId = participant.id;
  });

  it("transitions participant to verified after admin approves all documents", async () => {
    for (const item of requirementItems) {
      await participantService.verifyParticipantDocument(participantId, item.id, {
        action: "approve",
        userId: adminUser.id,
      });
    }

    const participant = await prisma.yudisiumParticipant.findUnique({
      where: { id: participantId },
    });

    expect(participant.status).toBe("verified");
    expect(participant.verifiedAt).toBeTruthy();
  });

  it("transitions participant to cpl_validated after GKM validates every active CPL score", async () => {
    for (const cpl of cpls) {
      await participantService.validateCplScore(participantId, cpl.id, gkmUser.id);
    }

    const participant = await prisma.yudisiumParticipant.findUnique({
      where: { id: participantId },
    });
    const scores = await prisma.studentCplScore.findMany({
      where: { studentId: student.id, cplId: { in: cpls.map((item) => item.id) } },
    });

    expect(participant.status).toBe("cpl_validated");
    expect(scores.every((score) => score.status === "validated")).toBe(true);
    expect(scores.every((score) => score.validatedAt)).toBe(true);
  });

  it("finalizes yudisium registration into appointed participants after registration closes", async () => {
    await prisma.yudisium.update({
      where: { id: yudisium.id },
      data: {
        registrationCloseDate: new Date(Date.now() - 1000),
        eventDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    const result = await participantService.finalizeParticipants(
      yudisium.id,
      coordinatorUser.id
    );

    const participant = await prisma.yudisiumParticipant.findUnique({
      where: { id: participantId },
    });
    const updatedYudisium = await prisma.yudisium.findUnique({
      where: { id: yudisium.id },
    });

    expect(result.appointed).toBe(1);
    expect(result.rejected).toBe(0);
    expect(participant.status).toBe("appointed");
    expect(updatedYudisium.appointedAt).toBeTruthy();
  });
});
