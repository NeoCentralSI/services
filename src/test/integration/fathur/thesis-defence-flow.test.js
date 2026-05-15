import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import prisma from "../../../config/prisma.js";
import * as docService from "../../../services/thesis-defence/doc.service.js";
import * as examinerService from "../../../services/thesis-defence/examiner.service.js";
import * as coreService from "../../../services/thesis-defence/core.service.js";
import * as revisionService from "../../../services/thesis-defence/revision.service.js";
import * as docRepo from "../../../repositories/thesis-defence/doc.repository.js";

vi.mock("../../../services/notification.service.js", () => ({ 
  createNotificationsForUsers: vi.fn().mockResolvedValue({ count: 1 }), 
  createNotificationService: vi.fn().mockResolvedValue(true) 
}));
vi.mock("../../../services/push.service.js", () => ({ 
  sendFcmToUsers: vi.fn().mockResolvedValue({ success: true }) 
}));
vi.mock("../../../services/outlook-calendar.service.js", () => ({ 
  hasCalendarAccess: vi.fn().mockResolvedValue(true), 
  createCalendarEvent: vi.fn().mockResolvedValue({ eventId: "f" }), 
  createSeminarCalendarEvents: vi.fn().mockResolvedValue(true) 
}));

describe("Integration: Thesis Defence Flow (Registration to Finalization)", () => {
  const ts = Date.now();
  let studentUser, student, lecturerUser, lecturer, examinerUser, examinerLecturer, examinerUser2, examinerLecturer2, thesis, supervisor, seminar;
  let defenceId, docTypes, criteriaExaminer, criteriaSupervisor;

  beforeAll(async () => {
    try {
      console.log("Starting Setup...");
      // 1. Create Users
      studentUser = await prisma.user.create({ data: { fullName: "S " + ts, identityNumber: "NIM-" + ts, identityType: "NIM", email: `s${ts}@t.com`, password: "p" } });
      student = await prisma.student.create({ data: { id: studentUser.id, researchMethodCompleted: true, skscompleted: 144 } });
      console.log("Student created:", student.id);
      
      lecturerUser = await prisma.user.create({ data: { fullName: "L " + ts, identityNumber: "NIP-" + ts, identityType: "NIP", email: `l${ts}@t.com`, password: "p" } });
      lecturer = await prisma.lecturer.create({ data: { id: lecturerUser.id } });
      console.log("Lecturer created:", lecturer.id);

      examinerUser = await prisma.user.create({ data: { fullName: "E " + ts, identityNumber: "NIP-E-" + ts, identityType: "NIP", email: `e${ts}@t.com`, password: "p" } });
      examinerLecturer = await prisma.lecturer.create({ data: { id: examinerUser.id } });

      examinerUser2 = await prisma.user.create({ data: { fullName: "E2 " + ts, identityNumber: "NIP-E2-" + ts, identityType: "NIP", email: `e2${ts}@t.com`, password: "p" } });
      examinerLecturer2 = await prisma.lecturer.create({ data: { id: examinerUser2.id } });

      // 2. Setup Thesis & Prerequisites
      const status = await prisma.thesisStatus.findFirst({ where: { name: { contains: "Bimbingan" } } });
      const role = await prisma.userRole.findFirst({ where: { name: { contains: "Pembimbing" } } });
      if (!status || !role) throw new Error(`Seeds missing: status=${!!status}, role=${!!role}`);

      thesis = await prisma.thesis.create({ data: { studentId: student.id, title: "Defence Int Test", thesisStatusId: status.id } });
      supervisor = await prisma.thesisSupervisors.create({ data: { thesisId: thesis.id, lecturerId: lecturer.id, roleId: role.id, seminarReady: true, defenceReady: true } });
      console.log("Thesis created:", thesis.id);

      // Create passed seminar
      seminar = await prisma.thesisSeminar.create({ data: { thesisId: thesis.id, status: "passed", date: new Date() } });

      // 3. Setup Assessment Criteria
      let cpmk = await prisma.cpmk.findFirst({ where: { code: "CPMK-INT-TEST" } });
      if (!cpmk) {
        cpmk = await prisma.cpmk.create({
          data: { code: "CPMK-INT-TEST", description: "Int Test", type: "thesis" }
        });
      }

      criteriaExaminer = await prisma.assessmentCriteria.create({
        data: { name: "Criteria Examiner", maxScore: 50, appliesTo: "defence", role: "examiner", cpmkId: cpmk.id, displayOrder: 1 }
      });
      criteriaSupervisor = await prisma.assessmentCriteria.create({
        data: { name: "Criteria Supervisor", maxScore: 50, appliesTo: "defence", role: "supervisor", cpmkId: cpmk.id, displayOrder: 1 }
      });

      docTypes = await docRepo.ensureDefenceDocumentTypes();
      console.log("Setup Finished.");
    } catch (err) {
      console.error("SETUP ERROR:", err.message); throw err;
    }
  });

  afterAll(async () => {
    try {
      console.log("Starting Cleanup...");
      if (defenceId) {
        await prisma.thesisDefenceRevision.deleteMany({ where: { defenceExaminer: { thesisDefenceId: defenceId } } }).catch(() => {});
        await prisma.thesisDefenceDocument.deleteMany({ where: { thesisDefenceId: defenceId } }).catch(() => {});
        await prisma.thesisDefenceExaminerAssessmentDetail.deleteMany({ where: { defenceExaminer: { thesisDefenceId: defenceId } } }).catch(() => {});
        await prisma.thesisDefenceExaminer.deleteMany({ where: { thesisDefenceId: defenceId } }).catch(() => {});
        await prisma.thesisDefenceSupervisorAssessmentDetail.deleteMany({ where: { thesisDefenceId: defenceId } }).catch(() => {});
        await prisma.thesisDefence.delete({ where: { id: defenceId } }).catch(() => {});
      }
      if (criteriaExaminer) await prisma.assessmentCriteria.delete({ where: { id: criteriaExaminer.id } }).catch(() => {});
      if (criteriaSupervisor) await prisma.assessmentCriteria.delete({ where: { id: criteriaSupervisor.id } }).catch(() => {});
      if (seminar) await prisma.thesisSeminar.delete({ where: { id: seminar.id } }).catch(() => {});
      if (thesis) {
        await prisma.thesisSupervisors.deleteMany({ where: { thesisId: thesis.id } }).catch(() => {});
        await prisma.thesis.delete({ where: { id: thesis.id } }).catch(() => {});
      }
      if (student) await prisma.student.delete({ where: { id: student.id } }).catch(() => {});
      if (lecturer) await prisma.lecturer.delete({ where: { id: lecturer.id } }).catch(() => {});
      if (examinerLecturer) await prisma.lecturer.delete({ where: { id: examinerLecturer.id } }).catch(() => {});
      if (examinerLecturer2) await prisma.lecturer.delete({ where: { id: examinerLecturer2.id } }).catch(() => {});
      if (studentUser) await prisma.user.deleteMany({ where: { id: { in: [studentUser.id, lecturerUser.id, examinerUser.id, examinerUser2.id] } } }).catch(() => {});
      console.log("Cleanup Finished.");
    } catch (err) { console.error("CLEANUP ERROR:", err.message); }
  });

  it("Step 1: Student uploads all required documents to trigger registration", async () => {
    try {
      const fakeFile = { originalname: "t.pdf", buffer: Buffer.from("t"), mimetype: "application/pdf" };
      const names = ["Laporan Tugas Akhir", "Slide Presentasi", "Draft Jurnal TEKNOSI", "Sertifikat TOEFL", "Sertifikat SAPS"];
      
      console.log("Step 1: Uploading documents...");
      for (const name of names) {
        await docService.uploadDocument(null, studentUser.id, fakeFile, name);
      }
      
      const defence = await prisma.thesisDefence.findFirst({ where: { thesisId: thesis.id } });
      if (!defence) throw new Error("Defence not created after uploads");
      defenceId = defence.id;
      console.log("Step 1: Defence created:", defenceId);
      expect(defence.status).toBe("registered");
    } catch (err) {
      console.error("STEP 1 ERROR:", err.message);
      throw err;
    }
  });

  it("Step 2: Admin verifies all documents and transitions status to verified", async () => {
    const names = ["Laporan Tugas Akhir", "Slide Presentasi", "Draft Jurnal TEKNOSI", "Sertifikat TOEFL", "Sertifikat SAPS"];
    for (const name of names) {
      const res = await docService.verifyDocument(defenceId, docTypes[name].id, { action: "approve", userId: lecturerUser.id });
      if (name === names[names.length - 1]) {
        expect(res.defenceTransitioned).toBe(true);
      }
    }
    
    const defence = await prisma.thesisDefence.findUnique({ where: { id: defenceId } });
    expect(defence.status).toBe("verified");
  });

  it("Step 3: Kadep assigns examiners", async () => {
    await examinerService.assignExaminers(defenceId, [examinerLecturer.id, examinerLecturer2.id], lecturerUser.id);
    const defence = await prisma.thesisDefence.findUnique({ where: { id: defenceId } });
    expect(defence.status).toBe("verified");
  });

  it("Step 4: Examiners respond available and transitions status to examiner_assigned", async () => {
    const examiners = await prisma.thesisDefenceExaminer.findMany({ where: { thesisDefenceId: defenceId } });
    for (const ex of examiners) {
      await examinerService.respondExaminerAssignment(defenceId, ex.id, { status: "available" }, ex.lecturerId);
    }
    
    const defence = await prisma.thesisDefence.findUnique({ where: { id: defenceId } });
    expect(defence.status).toBe("examiner_assigned");
  });

  it("Step 5: Admin drafts and finalizes the schedule", async () => {
    // Ensure we pick a weekday (Next Monday)
    const nextMonday = new Date();
    nextMonday.setDate(nextMonday.getDate() + ((7 - nextMonday.getDay() + 1) % 7 || 7));
    const dateStr = nextMonday.toISOString().split("T")[0];

    await coreService.setSchedule(defenceId, {
      date: dateStr,
      startTime: "13:00", endTime: "15:00", isOnline: false, roomId: null
    });
    
    await coreService.finalizeSchedule(defenceId, lecturerUser.id);

    const defence = await prisma.thesisDefence.findUnique({ where: { id: defenceId } });
    expect(defence.status).toBe("scheduled");
  });

  it("Step 6 & 7: Assessment and Revision Flow", async () => {
    try {
      // 6.1 Set to ongoing
      await prisma.thesisDefence.update({
        where: { id: defenceId },
        data: { 
          date: new Date(),
          startTime: new Date(Date.now() - 3600000),
          endTime: new Date(Date.now() + 3600000)
        }
      });

      const examiners = await prisma.thesisDefenceExaminer.findMany({ where: { thesisDefenceId: defenceId } });
      console.log(`Step 6: Found ${examiners.length} examiners`);

      // Fetch all active criteria to satisfy the "all criteria must be filled" check
      const activeExaminerCriteria = await prisma.assessmentCriteria.findMany({ where: { appliesTo: "defence", role: "examiner" } });
      const activeSupervisorCriteria = await prisma.assessmentCriteria.findMany({ where: { appliesTo: "defence", role: "supervisor" } });
      
      // 6.2 Examiner Assessment
      for (const ex of examiners) {
        await examinerService.submitAssessment(defenceId, {
          scores: activeExaminerCriteria.map(c => ({ assessmentCriteriaId: c.id, score: c.maxScore })),
          revisionNotes: "Fix something",
          isDraft: false
        }, ex.lecturerId);
      }
      console.log("Step 6: Examiners submitted assessments");

      // 6.3 Supervisor Assessment
      await examinerService.submitAssessment(defenceId, {
        scores: activeSupervisorCriteria.map(c => ({ assessmentCriteriaId: c.id, score: c.maxScore })),
        supervisorNotes: "Good job",
        isDraft: false
      }, lecturer.id);
      console.log("Step 6: Supervisor submitted assessment");

      // 6.4 Finalization by Supervisor
      const finalizeRes = await examinerService.finalizeDefence(defenceId, { recommendRevision: true }, lecturer.id);
      console.log("Step 6: Finalize result:", finalizeRes.status);
      expect(finalizeRes.status).toBe("passed_with_revision");

      const finalized = await prisma.thesisDefence.findUnique({ where: { id: defenceId } });
      console.log("Step 6: Finalized status in DB:", finalized.status);
      expect(finalized.status).toBe("passed_with_revision");

      // 7.1 Student submits perbaikan
      const studentAuth = { ...studentUser, studentId: student.id };
      const revisionsResponse = await revisionService.getRevisions(defenceId, studentAuth);
      console.log(`Step 7: Found ${revisionsResponse.revisions.length} revision items`);
      const revisionItem = revisionsResponse.revisions[0];
      
      await revisionService.updateRevision(defenceId, revisionItem.id, { 
        action: "submit", 
        revisionAction: "I have fixed it" 
      }, studentAuth);
      console.log("Step 7: Student submitted revision");

      const afterSubmit = await prisma.thesisDefenceRevision.findUnique({ where: { id: revisionItem.id } });
      expect(afterSubmit.studentSubmittedAt).toBeDefined();

      // 7.2 Supervisor approves
      const supervisorAuth = { ...lecturerUser, lecturerId: lecturer.id };
      await revisionService.updateRevision(defenceId, revisionItem.id, { action: "approve" }, supervisorAuth);
      console.log("Step 7: Supervisor approved revision");
      
      const afterApprove = await prisma.thesisDefenceRevision.findUnique({ where: { id: revisionItem.id } });
      expect(afterApprove.supervisorApprovedAt).toBeDefined();

      // 7.3 Supervisor finalizes revisions
      await revisionService.finalizeRevisions(defenceId, lecturer.id);
      console.log("Step 7: Supervisor finalized all revisions");

      const finalizedDefence = await prisma.thesisDefence.findUnique({ where: { id: defenceId } });
      expect(finalizedDefence.revisionFinalizedAt).toBeDefined();
      expect(finalizedDefence.revisionFinalizedBy).toBe(supervisor.id);
    } catch (err) {
      console.error("STEP 6/7 ERROR:", err.message, err.statusCode);
      if (err.stack) console.error(err.stack);
      throw err;
    }
  });
});
