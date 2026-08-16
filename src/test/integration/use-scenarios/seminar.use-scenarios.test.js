import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { unlink } from "fs/promises";
import prisma from "../../../config/prisma.js";
import * as docService from "../../../services/thesis-seminar/doc.service.js";
import * as examinerService from "../../../services/thesis-seminar/examiner.service.js";
import * as coreService from "../../../services/thesis-seminar/core.service.js";
import * as revisionService from "../../../services/thesis-seminar/revision.service.js";

vi.mock("../../../services/notification.service.js", () => ({
  createNotificationsForUsers: vi.fn().mockResolvedValue({ count: 1 }),
  createNotificationService: vi.fn().mockResolvedValue(true),
}));
vi.mock("../../../services/push.service.js", () => ({
  sendFcmToUsers: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock("../../../services/outlook-calendar.service.js", () => ({
  hasCalendarAccess: vi.fn().mockResolvedValue(true),
  createCalendarEvent: vi.fn().mockResolvedValue({ eventId: "scenario" }),
  createSeminarCalendarEvents: vi.fn().mockResolvedValue(true),
}));

const localDate = (date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, "0"),
  String(date.getDate()).padStart(2, "0"),
].join("-");

describe.sequential("Use Scenario Integration — Thesis Seminar (UC-11 s.d. UC-17)", () => {
  const marker = `uc-seminar-${Date.now()}`;
  const uploadedPaths = [];
  const audienceFixtures = [];
  let academicYear;
  let requirements = [];
  let studentUser;
  let student;
  let supervisorUser;
  let supervisorLecturer;
  let examinerUser1;
  let examiner1;
  let examinerUser2;
  let examiner2;
  let thesis;
  let supervisor;
  let seminarId;

  beforeAll(async () => {
    academicYear =
      (await prisma.academicYear.findFirst({ where: { isActive: true } })) ||
      (await prisma.academicYear.findFirst({
        where: { startDate: { lte: new Date() }, endDate: { gte: new Date() } },
        orderBy: { startDate: "desc" },
      }));
    if (!academicYear) throw new Error("Academic year aktif/berjalan dibutuhkan untuk skenario seminar.");

    requirements = await prisma.thesisSeminarRequirement.findMany({
      where: { academicYearId: academicYear.id },
      orderBy: { displayOrder: "asc" },
    });
    if (requirements.length === 0) {
      requirements = [await prisma.thesisSeminarRequirement.create({
        data: {
          academicYearId: academicYear.id,
          name: `Persyaratan ${marker}`,
          description: "Fixture skenario integrasi",
          displayOrder: 999,
        },
      })];
    }

    const thesisStatus = await prisma.thesisStatus.findFirst({ where: { name: { contains: "Bimbingan" } } });
    const supervisorRole = await prisma.userRole.findFirst({ where: { name: { contains: "Pembimbing" } } });
    if (!thesisStatus || !supervisorRole) throw new Error("Seed status/role pembimbing belum tersedia.");

    studentUser = await prisma.user.create({
      data: { fullName: `Mahasiswa ${marker}`, identityNumber: `NIM-${marker}`, identityType: "NIM", email: `${marker}@test.local`, password: "test" },
    });
    student = await prisma.student.create({ data: { id: studentUser.id, researchMethodCompleted: true, skscompleted: 144 } });

    const createLecturer = async (label) => {
      const user = await prisma.user.create({
        data: { fullName: `${label} ${marker}`, identityNumber: `NIP-${label}-${marker}`, identityType: "NIP", email: `${label}-${marker}@test.local`, password: "test" },
      });
      const lecturer = await prisma.lecturer.create({ data: { id: user.id } });
      return { user, lecturer };
    };
    ({ user: supervisorUser, lecturer: supervisorLecturer } = await createLecturer("supervisor"));
    ({ user: examinerUser1, lecturer: examiner1 } = await createLecturer("examiner-1"));
    ({ user: examinerUser2, lecturer: examiner2 } = await createLecturer("examiner-2"));

    thesis = await prisma.thesis.create({
      data: { studentId: student.id, title: `Thesis ${marker}`, thesisStatusId: thesisStatus.id, academicYearId: academicYear.id },
    });
    supervisor = await prisma.thesisSupervisors.create({
      data: { thesisId: thesis.id, lecturerId: supervisorLecturer.id, roleId: supervisorRole.id, seminarReady: true },
    });
    await prisma.thesisGuidance.createMany({
      data: Array.from({ length: 8 }, (_, index) => ({
        thesisId: thesis.id,
        supervisorId: supervisorLecturer.id,
        requestedDate: new Date(),
        approvedDate: new Date(),
        completedAt: new Date(),
        studentNotes: `Bimbingan ${index + 1}`,
        status: "completed",
      })),
    });

    for (let index = 0; index < 8; index += 1) {
      const user = await prisma.user.create({
        data: { fullName: `Audience ${index} ${marker}`, identityNumber: `AUD-${index}-${marker}`, identityType: "NIM", email: `aud-${index}-${marker}@test.local`, password: "test" },
      });
      const audience = await prisma.student.create({ data: { id: user.id, skscompleted: 100 } });
      const audienceThesis = await prisma.thesis.create({ data: { studentId: audience.id, title: `Audience thesis ${index}`, thesisStatusId: thesisStatus.id } });
      const pastSeminar = await prisma.thesisSeminar.create({ data: { thesisId: audienceThesis.id, status: "passed", date: new Date() } });
      await prisma.thesisSeminarAudience.create({ data: { thesisSeminarId: pastSeminar.id, thesisId: audienceThesis.id, studentId: student.id, approvedAt: new Date() } });
      audienceFixtures.push({ user, audience, thesis: audienceThesis, seminar: pastSeminar });
    }
  });

  afterAll(async () => {
    for (const filePath of uploadedPaths) await unlink(filePath).catch(() => {});
    if (seminarId) {
      await prisma.thesisSeminarRevision.deleteMany({ where: { seminarExaminer: { thesisSeminarId: seminarId } } }).catch(() => {});
      await prisma.thesisSeminarExaminerAssessmentDetail.deleteMany({ where: { seminarExaminer: { thesisSeminarId: seminarId } } }).catch(() => {});
      await prisma.thesisSeminarRequirementDocument.deleteMany({ where: { thesisSeminarId: seminarId } }).catch(() => {});
      await prisma.thesisSeminarExaminer.deleteMany({ where: { thesisSeminarId: seminarId } }).catch(() => {});
      await prisma.thesisSeminar.delete({ where: { id: seminarId } }).catch(() => {});
    }
    for (const fixture of audienceFixtures) {
      await prisma.thesisSeminarAudience.deleteMany({ where: { thesisSeminarId: fixture.seminar.id } }).catch(() => {});
      await prisma.thesisSeminar.delete({ where: { id: fixture.seminar.id } }).catch(() => {});
      await prisma.thesis.delete({ where: { id: fixture.thesis.id } }).catch(() => {});
      await prisma.student.delete({ where: { id: fixture.audience.id } }).catch(() => {});
      await prisma.user.delete({ where: { id: fixture.user.id } }).catch(() => {});
    }
    if (thesis) {
      await prisma.thesisGuidance.deleteMany({ where: { thesisId: thesis.id } }).catch(() => {});
      await prisma.thesisSupervisors.deleteMany({ where: { thesisId: thesis.id } }).catch(() => {});
      await prisma.thesis.delete({ where: { id: thesis.id } }).catch(() => {});
    }
    await prisma.student.deleteMany({ where: { id: student?.id } }).catch(() => {});
    await prisma.lecturer.deleteMany({ where: { id: { in: [supervisorLecturer?.id, examiner1?.id, examiner2?.id].filter(Boolean) } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: [studentUser?.id, supervisorUser?.id, examinerUser1?.id, examinerUser2?.id].filter(Boolean) } } }).catch(() => {});
    await prisma.thesisSeminarRequirement.deleteMany({ where: { name: `Persyaratan ${marker}` } }).catch(() => {});
  });

  // UC-11 — Normal: unggah seluruh syarat; alternatif: file non-PDF ditolak tanpa membuat pendaftaran.
  describe("UC-11 Pendaftaran seminar", () => {
    it("menolak dokumen non-PDF tanpa membuat seminar", async () => {
      const before = await prisma.thesisSeminar.count({ where: { thesisId: thesis.id } });
      await expect(docService.uploadDocument(null, student.id, {
        originalname: "invalid.txt", buffer: Buffer.from("not a pdf"), size: 9, mimetype: "text/plain",
      }, requirements[0].id)).rejects.toThrow();
      expect(await prisma.thesisSeminar.count({ where: { thesisId: thesis.id } })).toBe(before);
    });

    it("membuat pendaftaran setelah seluruh dokumen berhasil diunggah", async () => {
      const file = { originalname: "requirement.pdf", buffer: Buffer.from("%PDF-1.4\nscenario"), size: 17, mimetype: "application/pdf" };
      for (const requirement of requirements) {
        const result = await docService.uploadDocument(null, student.id, file, requirement.id);
        uploadedPaths.push(result.filePath);
      }
      const seminar = await prisma.thesisSeminar.findFirst({ where: { thesisId: thesis.id }, orderBy: { createdAt: "desc" } });
      seminarId = seminar.id;
      expect(seminar.status).toBe("registered");
      expect(await prisma.thesisSeminarRequirementDocument.count({ where: { thesisSeminarId: seminarId } })).toBe(requirements.length);
    });
  });

  // UC-12 — Normal: Admin menyetujui semua dokumen; alternatif: penolakan menyimpan catatan dan tidak memverifikasi seminar.
  describe("UC-12 Verifikasi dokumen seminar", () => {
    it("menyimpan penolakan dan mempertahankan status registered", async () => {
      await docService.verifyDocument(seminarId, requirements[0].id, { action: "decline", notes: "Dokumen belum jelas", userId: supervisorUser.id });
      const document = await prisma.thesisSeminarRequirementDocument.findUnique({
        where: { thesisSeminarId_thesisSeminarRequirementId: { thesisSeminarId: seminarId, thesisSeminarRequirementId: requirements[0].id } },
      });
      expect(document.status).toBe("declined");
      expect(document.notes).toBe("Dokumen belum jelas");
      expect((await prisma.thesisSeminar.findUnique({ where: { id: seminarId } })).status).toBe("registered");
    });

    it("memverifikasi seminar setelah dokumen pengganti dan seluruh syarat disetujui", async () => {
      const result = await docService.uploadDocument(seminarId, student.id, {
        originalname: "replacement.pdf", buffer: Buffer.from("%PDF-1.4\nreplacement"), size: 20, mimetype: "application/pdf",
      }, requirements[0].id);
      uploadedPaths.push(result.filePath);
      for (const requirement of requirements) {
        await docService.verifyDocument(seminarId, requirement.id, { action: "approve", userId: supervisorUser.id });
      }
      expect((await prisma.thesisSeminar.findUnique({ where: { id: seminarId } })).status).toBe("verified");
    });
  });

  // UC-13 — Normal: Kadep menetapkan penguji; alternatif: daftar kosong ditolak tanpa membuat relasi penguji.
  describe("UC-13 Penetapan penguji seminar", () => {
    it("menolak daftar penguji kosong tanpa mutasi", async () => {
      await expect(examinerService.assignExaminers(seminarId, [], supervisorUser.id)).rejects.toThrow();
      expect(await prisma.thesisSeminarExaminer.count({ where: { thesisSeminarId: seminarId } })).toBe(0);
    });

    it("menetapkan penguji dan beralih setelah seluruh penguji bersedia", async () => {
      await examinerService.assignExaminers(seminarId, [examiner1.id, examiner2.id], supervisorUser.id);
      const examiners = await prisma.thesisSeminarExaminer.findMany({ where: { thesisSeminarId: seminarId }, orderBy: { order: "asc" } });
      expect(examiners).toHaveLength(2);
      for (const examiner of examiners) {
        await examinerService.respondExaminerAssignment(seminarId, examiner.id, { status: "available" }, examiner.lecturerId);
      }
      expect((await prisma.thesisSeminar.findUnique({ where: { id: seminarId } })).status).toBe("examiner_assigned");
    });
  });

  // UC-14 — Normal: Admin menyimpan dan memfinalisasi jadwal; alternatif: hari akhir pekan ditolak tanpa menyimpan tanggal.
  describe("UC-14 Penjadwalan seminar", () => {
    it("menolak jadwal hari Minggu", async () => {
      const sunday = new Date();
      sunday.setDate(sunday.getDate() + ((7 - sunday.getDay()) % 7 || 7));
      await expect(coreService.scheduleSeminar(seminarId, {
        date: localDate(sunday), startTime: "10:00", endTime: "12:00", isOnline: true, meetingLink: "https://example.test/seminar",
      })).rejects.toThrow();
      expect((await prisma.thesisSeminar.findUnique({ where: { id: seminarId } })).date).toBeNull();
    });

    it("menyimpan dan memfinalisasi jadwal hari kerja", async () => {
      const monday = new Date();
      monday.setDate(monday.getDate() + ((8 - monday.getDay()) % 7 || 7));
      await coreService.scheduleSeminar(seminarId, {
        date: localDate(monday), startTime: "10:00", endTime: "12:00", isOnline: true, meetingLink: "https://example.test/seminar",
      });
      await coreService.finalizeSchedule(seminarId, supervisorUser.id);
      expect((await prisma.thesisSeminar.findUnique({ where: { id: seminarId } })).status).toBe("scheduled");
    });
  });

  // UC-15 — Normal: penguji mengisi nilai saat ongoing; alternatif: penilaian sebelum ongoing ditolak tanpa detail nilai.
  describe("UC-15 Penilaian seminar", () => {
    it("menolak penilaian sebelum seminar berlangsung", async () => {
      const criteria = await prisma.thesisSeminarAssessmentCriteria.findMany({ where: { thesisCpmk: { academicYearId: academicYear.id } } });
      await expect(examinerService.submitExaminerAssessment(seminarId, {
        scores: criteria.map((item) => ({ assessmentCriteriaId: item.id, score: item.maxScore })), revisionNotes: "Revisi", isDraft: false,
      }, examiner1.id)).rejects.toThrow();
      expect(await prisma.thesisSeminarExaminerAssessmentDetail.count({ where: { seminarExaminer: { thesisSeminarId: seminarId } } })).toBe(0);
    });

    it("menyimpan nilai lengkap dari penguji pertama saat ongoing", async () => {
      await prisma.thesisSeminar.update({
        where: { id: seminarId },
        data: { date: new Date(), startTime: new Date("1970-01-01T00:00:00.000Z"), endTime: new Date("1970-01-01T23:59:00.000Z") },
      });
      const criteria = await prisma.thesisSeminarAssessmentCriteria.findMany({ where: { thesisCpmk: { academicYearId: academicYear.id } } });
      expect(criteria.length).toBeGreaterThan(0);
      await examinerService.submitExaminerAssessment(seminarId, {
        scores: criteria.map((item) => ({ assessmentCriteriaId: item.id, score: item.maxScore })), revisionNotes: "Perbaiki tata tulis", isDraft: false,
      }, examiner1.id);
      const examiner = await prisma.thesisSeminarExaminer.findFirst({ where: { thesisSeminarId: seminarId, lecturerId: examiner1.id } });
      expect(examiner.assessmentSubmittedAt).toBeTruthy();
    });
  });

  // UC-16 — Normal: Pembimbing menetapkan hasil; alternatif: finalisasi terkunci sampai seluruh penguji submit.
  describe("UC-16 Penetapan hasil seminar", () => {
    it("menolak finalisasi ketika masih ada penguji yang belum submit", async () => {
      await expect(examinerService.finalizeSeminar(seminarId, supervisorLecturer.id, { recommendRevision: true })).rejects.toThrow();
      expect((await prisma.thesisSeminar.findUnique({ where: { id: seminarId } })).resultFinalizedAt).toBeNull();
    });

    it("menetapkan lulus dengan revisi setelah seluruh nilai lengkap", async () => {
      const criteria = await prisma.thesisSeminarAssessmentCriteria.findMany({ where: { thesisCpmk: { academicYearId: academicYear.id } } });
      await examinerService.submitExaminerAssessment(seminarId, {
        scores: criteria.map((item) => ({ assessmentCriteriaId: item.id, score: item.maxScore })), revisionNotes: "Perbaiki kesimpulan", isDraft: false,
      }, examiner2.id);
      const result = await examinerService.finalizeSeminar(seminarId, supervisorLecturer.id, { recommendRevision: true });
      expect(result.status).toBe("passed_with_revision");
      expect((await prisma.thesisSeminar.findUnique({ where: { id: seminarId } })).resultFinalizedAt).toBeTruthy();
    });
  });

  // UC-17 — Normal: mahasiswa mengajukan, pembimbing menyetujui dan memfinalisasi; alternatif: pengajuan kosong ditolak.
  describe("UC-17 Revisi seminar", () => {
    it("menolak pengajuan sebelum isi perbaikan tersedia", async () => {
      const board = await revisionService.getRevisions(seminarId, { ...studentUser, studentId: student.id });
      expect(board.revisions.length).toBeGreaterThan(0);
      await expect(revisionService.updateRevision(seminarId, board.revisions[0].id, { action: "submit" }, {
        ...studentUser, studentId: student.id,
      })).rejects.toThrow();
      expect((await prisma.thesisSeminarRevision.findUnique({ where: { id: board.revisions[0].id } })).studentSubmittedAt).toBeNull();
    });

    it("menyelesaikan seluruh revisi secara terisolasi pada attempt seminar", async () => {
      const studentAuth = { ...studentUser, studentId: student.id };
      const supervisorAuth = { ...supervisorUser, lecturerId: supervisorLecturer.id };
      const board = await revisionService.getRevisions(seminarId, studentAuth);
      for (const revision of board.revisions) {
        await revisionService.updateRevision(seminarId, revision.id, { action: "save_action", revisionAction: "Perbaikan telah diterapkan" }, studentAuth);
        await revisionService.updateRevision(seminarId, revision.id, { action: "submit" }, studentAuth);
        await revisionService.updateRevision(seminarId, revision.id, { action: "approve" }, supervisorAuth);
      }
      await revisionService.finalizeRevisions(seminarId, supervisorLecturer.id);
      const seminar = await prisma.thesisSeminar.findUnique({ where: { id: seminarId } });
      expect(seminar.revisionFinalizedAt).toBeTruthy();
      expect(seminar.revisionFinalizedBy).toBe(supervisor.id);
    });
  });
});
