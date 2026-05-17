import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { unlink } from "fs/promises";
import path from "path";
import prisma from "../../../config/prisma.js";
import * as coreService from "../../../services/yudisium/core.service.js";

vi.mock("../../../services/notification.service.js", () => ({
  createNotificationsForUsers: vi.fn().mockResolvedValue({ count: 1 }),
  createNotificationService: vi.fn().mockResolvedValue(true),
}));
vi.mock("../../../services/push.service.js", () => ({
  sendFcmToUsers: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock("../../../services/outlook-calendar.service.js", () => ({
  hasCalendarAccess: vi.fn().mockResolvedValue(true),
  createCalendarEvent: vi.fn().mockResolvedValue({ eventId: "yudisium-sk-event" }),
}));

describe("Integration: Yudisium SK Finalization", () => {
  const ts = Date.now();
  const createdCplIds = [];

  let studentUser;
  let student;
  let coordinatorUser;
  let thesis;
  let room;
  let yudisium;
  let participant;
  let cpls = [];
  let decreeDocumentId;
  let decreeFilePath;

  beforeAll(async () => {
    studentUser = await prisma.user.create({
      data: {
        fullName: `Yudisium Final Student ${ts}`,
        identityNumber: `NIM-YUD-FIN-${ts}`,
        identityType: "NIM",
        email: `student-yud-fin-${ts}@test.local`,
        password: "p",
      },
    });
    student = await prisma.student.create({
      data: {
        id: studentUser.id,
        skscompleted: 150,
        status: "active",
        mandatoryCoursesCompleted: true,
        mkwuCompleted: true,
        internshipCompleted: true,
        kknCompleted: true,
      },
    });
    coordinatorUser = await prisma.user.create({
      data: {
        fullName: `Koordinator SK Yudisium ${ts}`,
        identityNumber: `NIP-YUD-FIN-${ts}`,
        identityType: "NIP",
        email: `koor-yud-fin-${ts}@test.local`,
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
        title: `Tugas Akhir Finalisasi Yudisium ${ts}`,
        thesisStatusId: thesisStatus.id,
      },
    });
    room = await prisma.room.create({
      data: { name: `Ruang SK Yudisium ${ts}`, location: "Integration Test" },
    });
    yudisium = await prisma.yudisium.create({
      data: {
        name: `Yudisium SK Finalization ${ts}`,
        roomId: room.id,
        eventDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
        appointedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    });
    participant = await prisma.yudisiumParticipant.create({
      data: {
        yudisiumId: yudisium.id,
        thesisId: thesis.id,
        status: "appointed",
        registeredAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },
    });

    cpls = await prisma.cpl.findMany({ where: { isActive: true }, orderBy: { code: "asc" } });
    if (cpls.length === 0) {
      cpls = await prisma.$transaction([
        prisma.cpl.create({
          data: {
            code: `CPL-FIN-1-${ts}`,
            description: "CPL finalization 1",
            minimalScore: 60,
            isActive: true,
          },
        }),
        prisma.cpl.create({
          data: {
            code: `CPL-FIN-2-${ts}`,
            description: "CPL finalization 2",
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
        score: Math.max(cpl.minimalScore, 80 + index),
        status: "validated",
        validatedBy: coordinatorUser.id,
        validatedAt: new Date(),
      })),
    });
  });

  afterAll(async () => {
    try {
      if (decreeFilePath) {
        await unlink(path.join(process.cwd(), decreeFilePath)).catch(() => {});
      }
      await prisma.yudisium.update({
        where: { id: yudisium.id },
        data: {
          documentId: null,
          decreeUploadedBy: null,
          decreeUploadedAt: null,
        },
      }).catch(() => {});
      if (decreeDocumentId) {
        await prisma.document.delete({ where: { id: decreeDocumentId } }).catch(() => {});
      }
      await prisma.yudisiumParticipant.delete({ where: { id: participant.id } }).catch(() => {});
      await prisma.studentCplScore.deleteMany({ where: { studentId: student.id } }).catch(() => {});
      await prisma.cpl.deleteMany({ where: { id: { in: createdCplIds } } }).catch(() => {});
      await prisma.yudisium.delete({ where: { id: yudisium.id } }).catch(() => {});
      await prisma.room.delete({ where: { id: room.id } }).catch(() => {});
      await prisma.thesis.delete({ where: { id: thesis.id } }).catch(() => {});
      await prisma.student.delete({ where: { id: student.id } }).catch(() => {});
      await prisma.user.deleteMany({
        where: { id: { in: [studentUser.id, coordinatorUser.id] } },
      }).catch(() => {});
    } catch (err) {
      console.error("Yudisium finalization cleanup error:", err);
    }
  });

  it("finalizes appointed participants, CPL scores, and student status when SK is uploaded", async () => {
    const result = await coreService.updateYudisium(yudisium.id, {
      userId: coordinatorUser.id,
      decreeFile: {
        originalname: "sk-yudisium-final.pdf",
        buffer: Buffer.from(`sk-yudisium-${ts}`),
        mimetype: "application/pdf",
      },
    });

    decreeDocumentId = result.decreeDocument?.id;
    decreeFilePath = result.decreeDocument?.filePath;

    const [updatedParticipant, updatedScores, updatedStudent, updatedYudisium] =
      await Promise.all([
        prisma.yudisiumParticipant.findUnique({ where: { id: participant.id } }),
        prisma.studentCplScore.findMany({
          where: { studentId: student.id, cplId: { in: cpls.map((item) => item.id) } },
        }),
        prisma.student.findUnique({ where: { id: student.id } }),
        prisma.yudisium.findUnique({ where: { id: yudisium.id } }),
      ]);

    expect(updatedParticipant.status).toBe("finalized");
    expect(updatedScores).toHaveLength(cpls.length);
    expect(updatedScores.every((score) => score.status === "finalized")).toBe(true);
    expect(updatedScores.every((score) => score.finalizedAt)).toBe(true);
    expect(updatedStudent.status).toBe("lulus");
    expect(updatedYudisium.documentId).toBeTruthy();
    expect(updatedYudisium.decreeUploadedBy).toBe(coordinatorUser.id);
    expect(updatedYudisium.decreeUploadedAt).toBeTruthy();
  });
});
