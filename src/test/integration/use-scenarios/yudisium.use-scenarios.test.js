import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { unlink } from "fs/promises";
import path from "path";
import prisma from "../../../config/prisma.js";
import * as coreService from "../../../services/yudisium/core.service.js";
import * as studentService from "../../../services/yudisium/student.service.js";
import * as participantService from "../../../services/yudisium/participant.service.js";
import * as exitSurveyService from "../../../services/yudisium/exit-survey.service.js";

vi.mock("../../../services/notification.service.js", () => ({
  createNotificationsForUsers: vi.fn().mockResolvedValue({ count: 1 }),
  createNotificationService: vi.fn().mockResolvedValue(true),
}));
vi.mock("../../../services/push.service.js", () => ({ sendFcmToUsers: vi.fn().mockResolvedValue({ success: true }) }));
vi.mock("../../../services/outlook-calendar.service.js", () => ({
  syncYudisiumToOutlook: vi.fn().mockResolvedValue(true),
  createCalendarEvent: vi.fn().mockResolvedValue({ eventId: "scenario" }),
  hasCalendarAccess: vi.fn().mockResolvedValue(true),
}));

const DAY = 24 * 60 * 60 * 1000;
const pdfFile = (name = "document.pdf") => ({
  originalname: name,
  mimetype: "application/pdf",
  size: 2048,
  buffer: Buffer.from(`%PDF-1.4 integration ${name}`),
});

describe.sequential("Use Scenario Integration — Yudisium (UC-25 s.d. UC-32)", () => {
  const marker = `uc-yudisium-${Date.now()}`;
  const uploadedPaths = [];
  const createdCplIds = [];
  let room;
  let form;
  let session;
  let numberQuestion;
  let multipleQuestion;
  let multipleOptions = [];
  let requirements = [];
  let yudisium;
  let studentUser;
  let student;
  let thesis;
  let defence;
  let adminUser;
  let gkmUser;
  let coordinatorUser;
  let participantId;
  let cpls = [];
  let rejectedUser;
  let rejectedStudent;
  let createdCurriculum;
  let rejectedThesis;
  let rejectedParticipant;

  beforeAll(async () => {
    const roles = await prisma.userRole.findMany({
      where: { name: { in: ["Mahasiswa", "Admin", "GKM", "Koordinator Yudisium"] } },
    });
    const roleId = (name) => roles.find((role) => role.name === name)?.id;
    if (["Mahasiswa", "Admin", "GKM", "Koordinator Yudisium"].some((name) => !roleId(name))) {
      throw new Error("Seed role Yudisium belum lengkap.");
    }

    const createUser = (label, identityType, selectedRole) => prisma.user.create({
      data: {
        fullName: `${label} ${marker}`,
        identityNumber: `${identityType}-${label}-${marker}`,
        identityType,
        email: `${label}-${marker}@test.local`,
        password: "test",
        userHasRoles: { create: { roleId: roleId(selectedRole), status: "active" } },
      },
    });
    studentUser = await createUser("student", "NIM", "Mahasiswa");
    adminUser = await createUser("admin", "NIP", "Admin");
    gkmUser = await createUser("gkm", "NIP", "GKM");
    coordinatorUser = await createUser("coordinator", "NIP", "Koordinator Yudisium");
    await prisma.lecturer.createMany({ data: [{ id: gkmUser.id }, { id: coordinatorUser.id }] });

    student = await prisma.student.create({
      data: { id: studentUser.id, sksCompleted: 146, mandatoryCoursesCompleted: true, mkwuCompleted: true, internshipCompleted: true, kknCompleted: true },
    });
    const thesisStatus = await prisma.thesisStatus.findFirst({ where: { name: { contains: "Bimbingan" } } });
    if (!thesisStatus) throw new Error("Seed status thesis Bimbingan belum tersedia.");
    thesis = await prisma.thesis.create({ data: { studentId: student.id, title: `Thesis ${marker}`, thesisStatusId: thesisStatus.id } });
    defence = await prisma.thesisDefence.create({ data: { thesisId: thesis.id, status: "passed", date: new Date() } });

    room = await prisma.room.create({ data: { name: `Room ${marker}`, location: "Integration scenario" } });
    form = await prisma.exitSurveyForm.create({ data: { title: `Form ${marker}`, description: "Integration scenario", isActive: true } });
    session = await exitSurveyService.createSession(form.id, { name: "Evaluasi", description: "Sesi integrasi", order: 1 });
    numberQuestion = await exitSurveyService.createQuestion(form.id, {
      exitSurveySessionId: session.id,
      question: "Berapa lama masa studi?",
      questionType: "number",
      isRequired: true,
      orderNumber: 1,
    });
    multipleQuestion = await exitSurveyService.createQuestion(form.id, {
      exitSurveySessionId: session.id,
      question: "Kompetensi yang paling berkembang?",
      questionType: "multiple_choice",
      isRequired: true,
      orderNumber: 2,
      options: ["Analisis", "Komunikasi", "Kolaborasi"],
    });
    multipleOptions = await prisma.exitSurveyOption.findMany({ where: { exitSurveyQuestionId: multipleQuestion.id }, orderBy: { orderNumber: "asc" } });

    requirements = await prisma.$transaction([
      prisma.yudisiumRequirement.create({ data: { name: `Laporan ${marker}`, description: "Laporan final", isActive: true } }),
      prisma.yudisiumRequirement.create({ data: { name: `Bebas pustaka ${marker}`, description: "Bukti bebas pustaka", isActive: true } }),
    ]);

    cpls = await prisma.cpl.findMany({ where: { isActive: true }, orderBy: { code: "asc" } });
    if (cpls.length === 0) {
      createdCurriculum = await prisma.curriculum.create({ data: { name: "Kurikulum " + marker, startYear: 9997 } });
      cpls = [await prisma.cpl.create({ data: { curriculumId: createdCurriculum.id, code: "CPL-" + marker, description: "CPL skenario", minimalScore: 60, isActive: true } })];
      createdCplIds.push(cpls[0].id);
    }
    await prisma.studentCplScore.createMany({
      data: cpls.map((cpl, index) => ({
        studentId: student.id,
        cplId: cpl.id,
        score: index === 0 ? Math.max(0, cpl.minimalScore - 10) : Math.max(cpl.minimalScore, 75),
        status: "calculated",
      })),
    });
  });

  afterAll(async () => {
    for (const filePath of uploadedPaths) {
      const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
      await unlink(absolutePath).catch(() => {});
    }
    if (yudisium?.id) {
      await prisma.yudisiumParticipantExitSurveySelectedOption.deleteMany({ where: { yudisiumParticipantId: participantId } }).catch(() => {});
      await prisma.yudisiumParticipantExitSurveyAnswer.deleteMany({ where: { yudisiumParticipantId: participantId } }).catch(() => {});
      await prisma.yudisiumParticipantRequirement.deleteMany({ where: { yudisiumId: yudisium.id } }).catch(() => {});
      await prisma.yudisiumParticipant.deleteMany({ where: { yudisiumId: yudisium.id } }).catch(() => {});
      await prisma.yudisiumRequirementItem.deleteMany({ where: { yudisiumId: yudisium.id } }).catch(() => {});
      await prisma.yudisium.delete({ where: { id: yudisium.id } }).catch(() => {});
    }
    await prisma.studentCplScore.deleteMany({ where: { studentId: student?.id } }).catch(() => {});
    await prisma.cpl.deleteMany({ where: { id: { in: createdCplIds } } }).catch(() => {});
    if (createdCurriculum) await prisma.curriculum.delete({ where: { id: createdCurriculum.id } }).catch(() => {});
    await prisma.yudisiumRequirement.deleteMany({ where: { id: { in: requirements.map((item) => item.id) } } }).catch(() => {});
    await prisma.exitSurveyOption.deleteMany({ where: { exitSurveyQuestionId: { in: [numberQuestion?.id, multipleQuestion?.id].filter(Boolean) } } }).catch(() => {});
    await prisma.exitSurveyQuestion.deleteMany({ where: { id: { in: [numberQuestion?.id, multipleQuestion?.id].filter(Boolean) } } }).catch(() => {});
    await prisma.exitSurveySession.deleteMany({ where: { id: session?.id } }).catch(() => {});
    await prisma.exitSurveyForm.deleteMany({ where: { id: form?.id } }).catch(() => {});
    await prisma.thesisDefence.deleteMany({ where: { id: defence?.id } }).catch(() => {});
    await prisma.thesis.deleteMany({ where: { id: { in: [thesis?.id, rejectedThesis?.id].filter(Boolean) } } }).catch(() => {});
    await prisma.student.deleteMany({ where: { id: { in: [student?.id, rejectedStudent?.id].filter(Boolean) } } }).catch(() => {});
    await prisma.lecturer.deleteMany({ where: { id: { in: [gkmUser?.id, coordinatorUser?.id].filter(Boolean) } } }).catch(() => {});
    await prisma.room.deleteMany({ where: { id: room?.id } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: [studentUser?.id, adminUser?.id, gkmUser?.id, coordinatorUser?.id, rejectedUser?.id].filter(Boolean) } } }).catch(() => {});
  });

  // UC-25 — Normal: Koordinator membuat periode; alternatif: urutan tanggal tidak valid tidak boleh menambah data.
  describe("UC-25 Mengelola periode Yudisium", () => {
    it("menolak tanggal pelaksanaan sebelum penutupan", async () => {
      const before = await prisma.yudisium.count({ where: { name: `Yudisium ${marker}` } });
      await expect(coreService.createYudisium({
        name: `Yudisium ${marker}`,
        registrationOpenDate: new Date(Date.now() + DAY),
        registrationCloseDate: new Date(Date.now() + 3 * DAY),
        eventDate: new Date(Date.now() + 2 * DAY),
        roomId: room.id,
        exitSurveyFormId: form.id,
        requirementIds: requirements.map((item) => item.id),
      })).rejects.toThrow();
      expect(await prisma.yudisium.count({ where: { name: `Yudisium ${marker}` } })).toBe(before);
    });

    it("membuat periode beserta form dan daftar persyaratan", async () => {
      const result = await coreService.createYudisium({
        name: `Yudisium ${marker}`,
        registrationOpenDate: new Date(Date.now() + DAY),
        registrationCloseDate: new Date(Date.now() + 2 * DAY),
        eventDate: new Date(Date.now() + 3 * DAY),
        roomId: room.id,
        exitSurveyFormId: form.id,
        requirementIds: requirements.map((item) => item.id),
      });
      yudisium = await prisma.yudisium.findUnique({ where: { id: result.id }, include: { requirementItems: true } });
      expect(yudisium.requirementItems).toHaveLength(requirements.length);
      await prisma.yudisium.update({
        where: { id: yudisium.id },
        data: { registrationOpenDate: new Date(Date.now() - 60 * 60 * 1000), registrationCloseDate: new Date(Date.now() + 2 * DAY) },
      });
    });
  });

  // UC-26 — Normal: jawaban angka dan multiple choice tersimpan terstruktur; alternatif: pertanyaan wajib kosong ditolak atomik.
  describe("UC-26 Mengisi exit survey", () => {
    it("menolak jawaban wajib yang belum lengkap tanpa participant/answer", async () => {
      await expect(exitSurveyService.submitStudentSurvey(student.id, {
        answers: [{ questionId: numberQuestion.id, answerNumber: 4.5 }],
      })).rejects.toThrow();
      expect(await prisma.yudisiumParticipant.count({ where: { yudisiumId: yudisium.id, thesisId: thesis.id } })).toBe(0);
      expect(await prisma.yudisiumParticipantExitSurveyAnswer.count({ where: { yudisiumParticipantId: student.id } })).toBe(0);
    });

    it("membuat participant provisional dan menyimpan jawaban terstruktur", async () => {
      await exitSurveyService.submitStudentSurvey(student.id, {
        answers: [
          { questionId: numberQuestion.id, answerNumber: 4.5 },
          { questionId: multipleQuestion.id, optionIds: multipleOptions.slice(0, 2).map((option) => option.id) },
        ],
      });
      const participant = await prisma.yudisiumParticipant.findFirst({ where: { yudisiumId: yudisium.id, thesisId: thesis.id } });
      participantId = participant.id;
      expect(participant.exitSurveySubmittedAt).toBeTruthy();
      expect(participant.registeredAt).toBeNull();
      const numberAnswer = await prisma.yudisiumParticipantExitSurveyAnswer.findUnique({
        where: { yudisiumParticipantId_exitSurveyFormId_exitSurveyQuestionId: { yudisiumParticipantId: participantId, exitSurveyFormId: form.id, exitSurveyQuestionId: numberQuestion.id } },
      });
      expect(Number(numberAnswer.answerNumber)).toBe(4.5);
      expect(await prisma.yudisiumParticipantExitSurveySelectedOption.count({ where: { yudisiumParticipantId: participantId, exitSurveyQuestionId: multipleQuestion.id } })).toBe(2);
    });
  });

  // UC-27 — Normal: unggah PDF mendaftarkan participant; alternatif: format/ukuran salah ditolak tanpa requirement row.
  describe("UC-27 Mengunggah berkas Yudisium", () => {
    it("menolak non-PDF dan file di atas 10 MB tanpa persistensi", async () => {
      await expect(studentService.uploadOwnDocument(student.id, {
        originalname: "invalid.txt", mimetype: "text/plain", size: 7, buffer: Buffer.from("invalid"),
      }, requirements[0].id)).rejects.toThrow();
      await expect(studentService.uploadOwnDocument(student.id, {
        originalname: "large.pdf", mimetype: "application/pdf", size: 10 * 1024 * 1024 + 1, buffer: Buffer.from("%PDF-"),
      }, requirements[0].id)).rejects.toThrow();
      expect(await prisma.yudisiumParticipantRequirement.count({ where: { yudisiumParticipantId: participantId } })).toBe(0);
    });

    it("menyimpan seluruh dokumen dan mengaktifkan registeredAt", async () => {
      for (const requirement of requirements) {
        const result = await studentService.uploadOwnDocument(student.id, pdfFile(`${requirement.name}.pdf`), requirement.id);
        uploadedPaths.push(result.filePath);
      }
      const participant = await prisma.yudisiumParticipant.findUnique({ where: { id: participantId } });
      expect(participant.status).toBe("registered");
      expect(participant.registeredAt).toBeTruthy();
      expect(await prisma.yudisiumParticipantRequirement.count({ where: { yudisiumParticipantId: participantId } })).toBe(requirements.length);
    });
  });

  // UC-28 — Normal: Admin menyetujui semua dokumen; alternatif: penolakan menyimpan catatan dan tidak memajukan eligibility.
  describe("UC-28 Memverifikasi berkas Yudisium", () => {
    it("menyimpan penolakan dan catatan", async () => {
      const item = yudisium.requirementItems[0];
      await participantService.verifyParticipantDocument(participantId, item.id, { action: "decline", notes: "Mohon unggah ulang", userId: adminUser.id });
      const record = await prisma.yudisiumParticipantRequirement.findFirst({ where: { yudisiumParticipantId: participantId, yudisiumRequirementItemId: item.id } });
      expect(record.status).toBe("declined");
      expect(record.notes).toBe("Mohon unggah ulang");
      expect((await prisma.yudisiumParticipant.findUnique({ where: { id: participantId } })).requirementVerifiedAt).toBeNull();
    });

    it("menyetujui seluruh dokumen setelah mahasiswa mengunggah pengganti", async () => {
      const declinedItem = yudisium.requirementItems[0];
      const replacement = await studentService.uploadOwnDocument(student.id, pdfFile("replacement.pdf"), declinedItem.yudisiumRequirementId);
      uploadedPaths.push(replacement.filePath);
      for (const item of yudisium.requirementItems) {
        await participantService.verifyParticipantDocument(participantId, item.id, { action: "approve", userId: adminUser.id });
      }
      const participant = await prisma.yudisiumParticipant.findUnique({ where: { id: participantId } });
      expect(participant.requirementVerifiedAt).toBeTruthy();
      expect(participant.status).toBe("registered");
    });
  });

  // UC-29 — Normal: GKM memvalidasi CPL; alternatif: nilai di bawah minimal diperbaiki dengan dua dokumen pendukung.
  describe("UC-29 Memvalidasi CPL mahasiswa", () => {
    it("menyimpan perbaikan CPL dan dokumen pendukung", async () => {
      const target = cpls[0];
      await participantService.saveCplRepairment(participantId, target.id, {
        oldScore: Math.max(0, target.minimalScore - 10),
        newScore: target.minimalScore,
        recommendationFile: pdfFile("recommendation.pdf"),
        settlementFile: pdfFile("settlement.pdf"),
        userId: gkmUser.id,
      });
      const score = await prisma.studentCplScore.findUnique({ where: { studentId_cplId: { studentId: student.id, cplId: target.id } } });
      expect(score.score).toBeGreaterThanOrEqual(target.minimalScore);
      expect(score.status).toBe("validated");
      expect(score.recommendationDocumentPath).toBeTruthy();
      expect(score.settlementDocumentPath).toBeTruthy();
      uploadedPaths.push(score.recommendationDocumentPath, score.settlementDocumentPath);
    });

    it("menjadi eligible hanya setelah semua CPL selesai divalidasi", async () => {
      for (const cpl of cpls.slice(1)) await participantService.validateCplScore(participantId, cpl.id, gkmUser.id);
      const participant = await prisma.yudisiumParticipant.findUnique({ where: { id: participantId } });
      expect(participant.cplValidatedAt).toBeTruthy();
      expect(participant.requirementVerifiedAt).toBeTruthy();
      expect(participant.status).toBe("eligible");
    });
  });

  // UC-30 — Normal: eligible -> appointed dan registered -> rejected; guard: finalisasi sebelum tutup ditolak.
  describe("UC-30 Memfinalisasi peserta Yudisium", () => {
    it("menolak finalisasi sebelum pendaftaran ditutup", async () => {
      await expect(participantService.finalizeParticipants(yudisium.id, coordinatorUser.id)).rejects.toThrow();
      expect((await prisma.yudisiumParticipant.findUnique({ where: { id: participantId } })).status).toBe("eligible");
    });

    it("menetapkan eligible dan menolak participant registered secara batch", async () => {
      rejectedUser = await prisma.user.create({ data: { fullName: `Rejected ${marker}`, identityNumber: `NIM-rejected-${marker}`, identityType: "NIM", email: `rejected-${marker}@test.local`, password: "test" } });
      rejectedStudent = await prisma.student.create({ data: { id: rejectedUser.id, sksCompleted: 144 } });
      const thesisStatus = await prisma.thesisStatus.findFirst({ where: { name: { contains: "Bimbingan" } } });
      rejectedThesis = await prisma.thesis.create({ data: { studentId: rejectedStudent.id, title: `Rejected thesis ${marker}`, thesisStatusId: thesisStatus.id } });
      rejectedParticipant = await prisma.yudisiumParticipant.create({
        data: { yudisiumId: yudisium.id, thesisId: rejectedThesis.id, status: "registered", registeredAt: new Date(), exitSurveySubmittedAt: new Date(), exitSurveyFormId: form.id },
      });
      await prisma.yudisium.update({ where: { id: yudisium.id }, data: { registrationCloseDate: new Date(Date.now() - 1000), eventDate: new Date(Date.now() + DAY) } });
      const result = await participantService.finalizeParticipants(yudisium.id, coordinatorUser.id);
      expect(result.appointed).toBe(1);
      expect(result.rejected).toBe(1);
      const [appointed, rejected] = await Promise.all([
        prisma.yudisiumParticipant.findUnique({ where: { id: participantId } }),
        prisma.yudisiumParticipant.findUnique({ where: { id: rejectedParticipant.id } }),
      ]);
      expect(appointed.status).toBe("appointed");
      expect(rejected.status).toBe("rejected");
    });
  });

  // UC-31 — Normal: SK tersimpan dan finalisasi hasil atomik; format/ukuran file diuji pada lapisan HTTP middleware, bukan service ini.
  describe("UC-31 Mengunggah SK Yudisium", () => {
    it("menyimpan metadata SK dan memfinalisasi participant appointed", async () => {
      await prisma.yudisium.update({
        where: { id: yudisium.id },
        data: { registrationOpenDate: new Date(Date.now() - 3 * DAY), registrationCloseDate: new Date(Date.now() - 2 * DAY), eventDate: new Date(Date.now() - DAY) },
      });
      const result = await coreService.updateYudisium(yudisium.id, { userId: coordinatorUser.id, decreeFile: pdfFile("sk-yudisium.pdf") });
      uploadedPaths.push(result.decreeFilePath);
      const participant = await prisma.yudisiumParticipant.findUnique({ where: { id: participantId } });
      expect(participant.status).toBe("finalized");
      expect(result.decreeUploadedBy).toBe(coordinatorUser.id);
      expect(result.decreeUploadedAt).toBeTruthy();
    });
  });

  // UC-32 — Normal: participant appointed/finalized dapat menghasilkan Sertifikat CPL PDF.
  describe("UC-32 Mengunduh dokumen lulusan", () => {
    it("menghasilkan Sertifikat CPL berbentuk PDF untuk participant finalized", async () => {
      const certificate = await participantService.exportCurrentStudentCertificate(student.id);
      expect(Buffer.isBuffer(certificate)).toBe(true);
      expect(certificate.subarray(0, 5).toString()).toBe("%PDF-");
      const overview = await studentService.getOverview(student.id);
      expect(overview.yudisium?.decreeDocument?.filePath).toBeTruthy();
    });
  });
});
