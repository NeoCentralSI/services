import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { unlink } from "fs/promises";
import prisma from "../../../config/prisma.js";
import * as docService from "../../../services/thesis-defence/doc.service.js";
import * as examinerService from "../../../services/thesis-defence/examiner.service.js";
import * as coreService from "../../../services/thesis-defence/core.service.js";
import * as revisionService from "../../../services/thesis-defence/revision.service.js";
import * as docRepo from "../../../repositories/thesis-defence/doc.repository.js";

vi.mock("../../../services/notification.service.js", () => ({
  createNotificationsForUsers: vi.fn().mockResolvedValue({ count: 1 }),
  createNotificationService: vi.fn().mockResolvedValue(true),
}));
vi.mock("../../../services/push.service.js", () => ({ sendFcmToUsers: vi.fn().mockResolvedValue({ success: true }) }));
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

describe.sequential("Use Scenario Integration — Thesis Defence (UC-18 s.d. UC-24)", () => {
  const marker = `uc-defence-${Date.now()}`;
  const uploadedPaths = [];
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
  let seminar;
  let defenceId;
  let thesisCpmk;
  let examinerCriterion;
  let supervisorCriterion;
  let originalMinimumScore;

  beforeAll(async () => {
    academicYear =
      (await prisma.academicYear.findFirst({ where: { isActive: true } })) ||
      (await prisma.academicYear.findFirst({
        where: { startDate: { lte: new Date() }, endDate: { gte: new Date() } },
        orderBy: { startDate: "desc" },
      }));
    if (!academicYear) throw new Error("Academic year aktif/berjalan dibutuhkan untuk skenario sidang.");
    originalMinimumScore = academicYear.thesisDefenceMinimumScore;
    if (originalMinimumScore == null) {
      await prisma.academicYear.update({ where: { id: academicYear.id }, data: { thesisDefenceMinimumScore: 55 } });
    }

    requirements = await docRepo.findRequirementsByAcademicYear(academicYear.id);
    if (requirements.length === 0) {
      requirements = [await prisma.thesisDefenceRequirement.create({
        data: { academicYearId: academicYear.id, name: `Persyaratan ${marker}`, description: "Fixture skenario integrasi", displayOrder: 999 },
      })];
    }

    const thesisStatus = await prisma.thesisStatus.findFirst({ where: { name: { contains: "Bimbingan" } } });
    const supervisorRole = await prisma.userRole.findFirst({ where: { name: { contains: "Pembimbing" } } });
    if (!thesisStatus || !supervisorRole) throw new Error("Seed status/role pembimbing belum tersedia.");

    studentUser = await prisma.user.create({
      data: { fullName: `Mahasiswa ${marker}`, identityNumber: `NIM-${marker}`, identityType: "NIM", email: `${marker}@test.local`, password: "test" },
    });
    student = await prisma.student.create({ data: { id: studentUser.id, researchMethodCompleted: true, sksCompleted: 144 } });
    const createLecturer = async (label) => {
      const user = await prisma.user.create({
        data: { fullName: `${label} ${marker}`, identityNumber: `NIP-${label}-${marker}`, identityType: "NIP", email: `${label}-${marker}@test.local`, password: "test" },
      });
      return { user, lecturer: await prisma.lecturer.create({ data: { id: user.id } }) };
    };
    ({ user: supervisorUser, lecturer: supervisorLecturer } = await createLecturer("supervisor"));
    ({ user: examinerUser1, lecturer: examiner1 } = await createLecturer("examiner-1"));
    ({ user: examinerUser2, lecturer: examiner2 } = await createLecturer("examiner-2"));

    thesis = await prisma.thesis.create({
      data: { studentId: student.id, title: `Thesis ${marker}`, thesisStatusId: thesisStatus.id, academicYearId: academicYear.id },
    });
    supervisor = await prisma.thesisSupervisors.create({
      data: { thesisId: thesis.id, lecturerId: supervisorLecturer.id, roleId: supervisorRole.id, seminarReady: true, defenceReady: true },
    });
    seminar = await prisma.thesisSeminar.create({ data: { thesisId: thesis.id, status: "passed", date: new Date() } });

    thesisCpmk = await prisma.thesisCpmk.create({
      data: { academicYearId: academicYear.id, code: `CPMK-${marker}`, description: "CPMK skenario sidang" },
    });
    examinerCriterion = await prisma.thesisDefenceExaminerAssessmentCriteria.create({
      data: { name: `Kriteria penguji ${marker}`, maxScore: 50, thesisCpmkId: thesisCpmk.id, displayOrder: 999 },
    });
    supervisorCriterion = await prisma.thesisDefenceSupervisorAssessmentCriteria.create({
      data: { name: `Kriteria pembimbing ${marker}`, maxScore: 50, thesisCpmkId: thesisCpmk.id, displayOrder: 999 },
    });
  });

  afterAll(async () => {
    for (const filePath of uploadedPaths) await unlink(filePath).catch(() => {});
    if (defenceId) {
      await prisma.thesisDefenceRevision.deleteMany({ where: { defenceExaminer: { thesisDefenceId: defenceId } } }).catch(() => {});
      await prisma.thesisDefenceRequirementDocument.deleteMany({ where: { thesisDefenceId: defenceId } }).catch(() => {});
      await prisma.thesisDefenceExaminerAssessmentDetail.deleteMany({ where: { defenceExaminer: { thesisDefenceId: defenceId } } }).catch(() => {});
      await prisma.thesisDefenceSupervisorAssessmentDetail.deleteMany({ where: { thesisDefenceId: defenceId } }).catch(() => {});
      await prisma.thesisDefenceExaminer.deleteMany({ where: { thesisDefenceId: defenceId } }).catch(() => {});
      await prisma.thesisDefence.delete({ where: { id: defenceId } }).catch(() => {});
    }
    await prisma.thesisDefenceExaminerAssessmentCriteria.deleteMany({ where: { id: examinerCriterion?.id } }).catch(() => {});
    await prisma.thesisDefenceSupervisorAssessmentCriteria.deleteMany({ where: { id: supervisorCriterion?.id } }).catch(() => {});
    await prisma.thesisCpmk.deleteMany({ where: { id: thesisCpmk?.id } }).catch(() => {});
    if (academicYear && originalMinimumScore == null) await prisma.academicYear.update({ where: { id: academicYear.id }, data: { thesisDefenceMinimumScore: null } }).catch(() => {});
    await prisma.thesisDefenceRequirement.deleteMany({ where: { name: `Persyaratan ${marker}` } }).catch(() => {});
    await prisma.thesisSeminar.deleteMany({ where: { id: seminar?.id } }).catch(() => {});
    if (thesis) {
      await prisma.thesisSupervisors.deleteMany({ where: { thesisId: thesis.id } }).catch(() => {});
      await prisma.thesis.delete({ where: { id: thesis.id } }).catch(() => {});
    }
    await prisma.student.deleteMany({ where: { id: student?.id } }).catch(() => {});
    await prisma.lecturer.deleteMany({ where: { id: { in: [supervisorLecturer?.id, examiner1?.id, examiner2?.id].filter(Boolean) } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: [studentUser?.id, supervisorUser?.id, examinerUser1?.id, examinerUser2?.id].filter(Boolean) } } }).catch(() => {});
  });

  // UC-18 — Normal: unggah seluruh syarat; alternatif: file non-PDF ditolak tanpa membuat attempt.
  describe("UC-18 Pendaftaran sidang", () => {
    it("menolak dokumen non-PDF tanpa membuat sidang", async () => {
      await expect(docService.uploadDocument(null, student.id, {
        originalname: "invalid.txt", buffer: Buffer.from("invalid"), size: 7, mimetype: "text/plain",
      }, requirements[0].id)).rejects.toThrow();
      expect(await prisma.thesisDefence.count({ where: { thesisId: thesis.id } })).toBe(0);
    });

    it("membuat pendaftaran dan menyimpan semua dokumen", async () => {
      const file = { originalname: "requirement.pdf", buffer: Buffer.from("%PDF-1.4\nscenario"), size: 17, mimetype: "application/pdf" };
      for (const requirement of requirements) {
        const result = await docService.uploadDocument(null, student.id, file, requirement.id);
        uploadedPaths.push(result.filePath);
      }
      const defence = await prisma.thesisDefence.findFirst({ where: { thesisId: thesis.id }, orderBy: { createdAt: "desc" } });
      defenceId = defence.id;
      expect(defence.status).toBe("registered");
      expect(await prisma.thesisDefenceRequirementDocument.count({ where: { thesisDefenceId: defenceId } })).toBe(requirements.length);
    });
  });

  // UC-19 — Normal: Admin menyetujui semua dokumen; alternatif: penolakan menyimpan catatan dan tidak mengubah status.
  describe("UC-19 Verifikasi dokumen sidang", () => {
    it("menyimpan penolakan dan mempertahankan status registered", async () => {
      await docService.verifyDocument(defenceId, requirements[0].id, { action: "decline", notes: "Berkas tidak terbaca", userId: supervisorUser.id });
      const document = await prisma.thesisDefenceRequirementDocument.findUnique({
        where: { thesisDefenceId_thesisDefenceRequirementId: { thesisDefenceId: defenceId, thesisDefenceRequirementId: requirements[0].id } },
      });
      expect(document.status).toBe("declined");
      expect(document.notes).toBe("Berkas tidak terbaca");
      expect((await prisma.thesisDefence.findUnique({ where: { id: defenceId } })).status).toBe("registered");
    });

    it("memverifikasi sidang setelah dokumen pengganti disetujui", async () => {
      const replacement = await docService.uploadDocument(defenceId, student.id, {
        originalname: "replacement.pdf", buffer: Buffer.from("%PDF-1.4\nreplacement"), size: 20, mimetype: "application/pdf",
      }, requirements[0].id);
      uploadedPaths.push(replacement.filePath);
      for (const requirement of requirements) {
        await docService.verifyDocument(defenceId, requirement.id, { action: "approve", userId: supervisorUser.id });
      }
      expect((await prisma.thesisDefence.findUnique({ where: { id: defenceId } })).status).toBe("verified");
    });
  });

  // UC-20 — Normal: Kadep menetapkan penguji; alternatif: daftar kosong ditolak tanpa mutasi.
  describe("UC-20 Penetapan penguji sidang", () => {
    it("menolak daftar penguji kosong", async () => {
      await expect(examinerService.assignExaminers(defenceId, [], supervisorUser.id)).rejects.toThrow();
      expect(await prisma.thesisDefenceExaminer.count({ where: { thesisDefenceId: defenceId } })).toBe(0);
    });

    it("menetapkan dua penguji dan memproses kesediaannya", async () => {
      await examinerService.assignExaminers(defenceId, [examiner1.id, examiner2.id], supervisorUser.id);
      const examiners = await prisma.thesisDefenceExaminer.findMany({ where: { thesisDefenceId: defenceId }, orderBy: { order: "asc" } });
      expect(examiners).toHaveLength(2);
      for (const examiner of examiners) {
        await examinerService.respondExaminerAssignment(defenceId, examiner.id, { status: "available" }, examiner.lecturerId);
      }
      expect((await prisma.thesisDefence.findUnique({ where: { id: defenceId } })).status).toBe("examiner_assigned");
    });
  });

  // UC-21 — Normal: Admin menyimpan/finalisasi jadwal; alternatif: jadwal akhir pekan ditolak.
  describe("UC-21 Penjadwalan sidang", () => {
    it("menolak jadwal hari Minggu tanpa menyimpan tanggal", async () => {
      const sunday = new Date();
      sunday.setDate(sunday.getDate() + ((7 - sunday.getDay()) % 7 || 7));
      await expect(coreService.setSchedule(defenceId, {
        date: localDate(sunday), startTime: "13:00", endTime: "15:00", isOnline: true, meetingLink: "https://example.test/defence",
      })).rejects.toThrow();
      expect((await prisma.thesisDefence.findUnique({ where: { id: defenceId } })).date).toBeNull();
    });

    it("menyimpan dan memfinalisasi jadwal hari kerja", async () => {
      const monday = new Date();
      monday.setDate(monday.getDate() + ((8 - monday.getDay()) % 7 || 7));
      await coreService.setSchedule(defenceId, {
        date: localDate(monday), startTime: "13:00", endTime: "15:00", isOnline: true, meetingLink: "https://example.test/defence",
      });
      await coreService.finalizeSchedule(defenceId, supervisorUser.id);
      expect((await prisma.thesisDefence.findUnique({ where: { id: defenceId } })).status).toBe("scheduled");
    });
  });

  // UC-22 — Normal: penguji dan pembimbing mengisi nilai; alternatif: skor melampaui maksimum ditolak tanpa detail tersimpan.
  describe("UC-22 Penilaian sidang", () => {
    it("menolak skor di atas maksimum", async () => {
      await prisma.thesisDefence.update({
        where: { id: defenceId },
        data: { date: new Date(), startTime: new Date("1970-01-01T00:00:00.000Z"), endTime: new Date("1970-01-01T23:59:00.000Z") },
      });
      await expect(examinerService.submitAssessment(defenceId, {
        scores: [{ assessmentCriteriaId: examinerCriterion.id, score: examinerCriterion.maxScore + 1 }], revisionNotes: "Revisi", isDraft: false,
      }, examiner1.id)).rejects.toThrow();
      expect(await prisma.thesisDefenceExaminerAssessmentDetail.count({ where: { defenceExaminer: { thesisDefenceId: defenceId } } })).toBe(0);
    });

    it("menyimpan penilaian lengkap penguji pertama", async () => {
      const criteria = await prisma.thesisDefenceExaminerAssessmentCriteria.findMany({ where: { thesisCpmk: { academicYearId: academicYear.id } } });
      await examinerService.submitAssessment(defenceId, {
        scores: criteria.map((item) => ({ assessmentCriteriaId: item.id, score: item.maxScore })), revisionNotes: "Perbaiki analisis", isDraft: false,
      }, examiner1.id);
      const examiner = await prisma.thesisDefenceExaminer.findFirst({ where: { thesisDefenceId: defenceId, lecturerId: examiner1.id } });
      expect(examiner.assessmentSubmittedAt).toBeTruthy();
    });
  });

  // UC-23 — Normal: pembimbing menetapkan hasil; alternatif: finalisasi terkunci sampai seluruh penilai submit.
  describe("UC-23 Penetapan hasil sidang", () => {
    it("menolak finalisasi ketika penilaian belum lengkap", async () => {
      await expect(examinerService.finalizeDefence(defenceId, { recommendRevision: true }, supervisorLecturer.id)).rejects.toThrow();
      expect((await prisma.thesisDefence.findUnique({ where: { id: defenceId } })).resultFinalizedAt).toBeNull();
    });

    it("menetapkan lulus dengan revisi setelah seluruh penilaian lengkap", async () => {
      const examinerCriteria = await prisma.thesisDefenceExaminerAssessmentCriteria.findMany({ where: { thesisCpmk: { academicYearId: academicYear.id } } });
      const supervisorCriteria = await prisma.thesisDefenceSupervisorAssessmentCriteria.findMany({ where: { thesisCpmk: { academicYearId: academicYear.id } } });
      await examinerService.submitAssessment(defenceId, {
        scores: examinerCriteria.map((item) => ({ assessmentCriteriaId: item.id, score: item.maxScore })), revisionNotes: "Perbaiki kesimpulan", isDraft: false,
      }, examiner2.id);
      await examinerService.submitAssessment(defenceId, {
        scores: supervisorCriteria.map((item) => ({ assessmentCriteriaId: item.id, score: item.maxScore })), supervisorNotes: "Layak", isDraft: false,
      }, supervisorLecturer.id);
      const result = await examinerService.finalizeDefence(defenceId, { recommendRevision: true }, supervisorLecturer.id);
      expect(result.status).toBe("passed_with_revision");
      expect((await prisma.thesisDefence.findUnique({ where: { id: defenceId } })).resultFinalizedAt).toBeTruthy();
    });
  });

  // UC-24 — Normal: mahasiswa mengajukan, pembimbing menyetujui/finalisasi; alternatif: pengajuan kosong ditolak.
  describe("UC-24 Revisi sidang", () => {
    it("menolak pengajuan revisi tanpa isi perbaikan", async () => {
      const board = await revisionService.getRevisions(defenceId, { ...studentUser, studentId: student.id });
      expect(board.revisions.length).toBeGreaterThan(0);
      await expect(revisionService.updateRevision(defenceId, board.revisions[0].id, { action: "submit" }, {
        ...studentUser, studentId: student.id,
      })).rejects.toThrow();
      expect((await prisma.thesisDefenceRevision.findUnique({ where: { id: board.revisions[0].id } })).studentSubmittedAt).toBeNull();
    });

    it("menyelesaikan seluruh revisi pada attempt sidang", async () => {
      const studentAuth = { ...studentUser, studentId: student.id };
      const supervisorAuth = { ...supervisorUser, lecturerId: supervisorLecturer.id };
      const board = await revisionService.getRevisions(defenceId, studentAuth);
      for (const revision of board.revisions) {
        await revisionService.updateRevision(defenceId, revision.id, { action: "save_action", revisionAction: "Perbaikan telah diterapkan" }, studentAuth);
        await revisionService.updateRevision(defenceId, revision.id, { action: "submit" }, studentAuth);
        await revisionService.updateRevision(defenceId, revision.id, { action: "approve" }, supervisorAuth);
      }
      await revisionService.finalizeRevisions(defenceId, supervisorLecturer.id);
      const defence = await prisma.thesisDefence.findUnique({ where: { id: defenceId } });
      expect(defence.revisionFinalizedAt).toBeTruthy();
      expect(defence.revisionFinalizedBy).toBe(supervisor.id);
    });
  });
});
