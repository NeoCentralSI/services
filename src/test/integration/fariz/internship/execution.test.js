import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import app from "../../../../app.js";
import prisma from "../../../../config/prisma.js";
import { ENV } from "../../../../config/env.js";

describe("Internship Execution Integration Test", () => {
  let tokens = {};
  let users = {};
  let testInternship;
  let testLogbook;
  let testQuestion;
  let testCriteria;

  beforeAll(async () => {
    console.log("🔍 [SETUP] Initializing test data...");
    
    // 1. Get All Required Users
    const roles = [
      { key: 'student', email: "fariz_2211523034@fti.unand.ac.id" },
      { key: 'sekdep', email: "sekdep_si@fti.unand.ac.id" },
      { key: 'admin', email: "admin_si@fti.unand.ac.id" },
      { key: 'kadep', email: "kadep_si@fti.unand.ac.id" },
      { key: 'lecturer', email: "pembimbing_si@fti.unand.ac.id" } // Supervisor
    ];

    for (const role of roles) {
      const user = await prisma.user.findFirst({ 
        where: { email: role.email },
        include: { lecturer: true, student: true }
      });
      if (!user) throw new Error(`User ${role.key} (${role.email}) not found.`);
      users[role.key] = user;
      tokens[role.key] = jwt.sign({ sub: user.id, email: user.email, roles: [role.key] }, ENV.JWT_SECRET);
    }
    
    // CLEANUP/RESET PREVIOUS TEST DATA
    await prisma.internship.updateMany({
      where: { studentId: users.student.student.id },
      data: {
        status: 'ONGOING',
        fieldAssessmentStatus: null,
        lecturerAssessmentStatus: null,
        isLogbookLocked: false
      }
    });

    // 2. Find the internship
    const internship = await prisma.internship.findFirst({
      where: { studentId: users.student.student.id },
      orderBy: { createdAt: 'desc' }
    });
    
    if (!internship) throw new Error("No internship found. Run registration.test.js first.");
    testInternship = internship;

    // 3. Find/Create Guidance Question
    testQuestion = await prisma.internshipGuidanceQuestion.findFirst({
      where: { weekNumber: 1 }
    });
    if (!testQuestion) {
      testQuestion = await prisma.internshipGuidanceQuestion.create({
        data: {
          questionText: "Apa progres Anda minggu ini?",
          weekNumber: 1,
          academicYearId: testInternship.proposal.academicYearId
        }
      });
    }

    // 4. Find/Create Lecturer Criteria
    testCriteria = await prisma.internshipGuidanceLecturerCriteria.findFirst({
      where: { weekNumber: 1 }
    });
    if (!testCriteria) {
      testCriteria = await prisma.internshipGuidanceLecturerCriteria.create({
        data: {
          criteriaName: "Kualitas Pekerjaan",
          weekNumber: 1,
          inputType: "EVALUATION",
          academicYearId: testInternship.proposal.academicYearId
        }
      });
    }

    console.log(`✅ [SETUP] Ready. QuestionID: ${testQuestion.id}, CriteriaID: ${testCriteria.id}`);
  });

  // --- STEP 1: SEKDEP ASSIGN SUPERVISOR ---
  it("STEP 1: Sekdep should successfully assign a supervisor", async () => {
    console.log("🚀 [STEP 1] Assigning Supervisor...");
    const payload = {
      internshipIds: [testInternship.id],
      supervisorId: users.lecturer.lecturer.id
    };
    const response = await request(app)
      .patch("/insternship/sekdep/internships/bulk-assign")
      .set("Authorization", `Bearer ${tokens.sekdep}`)
      .send(payload);
    expect(response.status).toBe(200);
  });

  // --- STEP 2: ADMIN/SEKDEP GENERATE SUPERVISOR LETTER ---
  it("STEP 2: Admin should successfully generate supervisor letter", async () => {
    console.log("🚀 [STEP 2] Generating Supervisor Letter...");
    const payload = {
      documentNumber: "B/ST-DOSEN/2025",
      internshipIds: [testInternship.id],
      startDate: "2025-07-07",
      endDate: "2025-08-31"
    };
    const response = await request(app)
      .post(`/insternship/sekdep/lecturers/${users.lecturer.lecturer.id}/supervisor-letter`)
      .set("Authorization", `Bearer ${tokens.sekdep}`)
      .send(payload);
    expect(response.status).toBe(200);
  });

  // --- STEP 3: STUDENT INPUT FIELD SUPERVISOR INFO ---
  it("STEP 3: Student should successfully input field supervisor info", async () => {
    console.log("🚀 [STEP 3] Inputting Field Supervisor Info...");
    const payload = {
      fieldSupervisorName: "Bapak Eko",
      fieldSupervisorEmail: "eko@perusahaan.com",
      unitSection: "IT Infrastructure"
    };
    const response = await request(app)
      .put("/insternship/activity/details")
      .set("Authorization", `Bearer ${tokens.student}`)
      .send(payload);
    expect(response.status).toBe(200);
  });

  // --- STEP 4: STUDENT UPDATE LOGBOOK ---
  it("STEP 4: Student should successfully update a logbook entry", async () => {
    console.log("🚀 [STEP 4] Updating Logbook Entry...");
    testLogbook = await prisma.internshipLogbook.findFirst({
      where: { internshipId: testInternship.id },
      orderBy: { activityDate: 'asc' }
    });

    const today = new Date();
    today.setHours(12, 0, 0, 0);
    await prisma.internshipLogbook.update({
      where: { id: testLogbook.id },
      data: { activityDate: today }
    });

    const response = await request(app)
      .put(`/insternship/activity/logbook/${testLogbook.id}`)
      .set("Authorization", `Bearer ${tokens.student}`)
      .send({ activityDescription: "Mempelajari arsitektur sistem." });
    expect(response.status).toBe(200);
  });

  // --- STEP 5: STUDENT SUBMIT GUIDANCE ANSWERS ---
  it("STEP 5: Student should successfully submit guidance answers", async () => {
    console.log("🚀 [STEP 5] Submitting Guidance Answers...");
    const payload = {
      weekNumber: 1,
      answers: {
        [testQuestion.id]: "Minggu ini saya sudah mulai coding modul auth."
      }
    };
    const response = await request(app)
      .post("/insternship/activity/guidance/submit")
      .set("Authorization", `Bearer ${tokens.student}`)
      .send(payload);
    expect(response.status).toBe(200);
  });

  // --- STEP 6: LECTURER EVALUATE WEEK ---
  it("STEP 6: Lecturer should successfully evaluate the guidance week", async () => {
    console.log("🚀 [STEP 6] Evaluating Guidance Week (Fixing Value Type)...");
    const payload = {
      evaluations: {
        [testCriteria.id]: {
          evaluationValue: "85", // Prisma expects String? in schema
          answerText: "Bagus, pertahankan progresnya."
        }
      }
    };

    const response = await request(app)
      .post(`/insternship/activity/guidance/lecturer/students/${testInternship.id}/week/1/evaluate`)
      .set("Authorization", `Bearer ${tokens.lecturer}`)
      .send(payload);

    if (response.status !== 200) {
      console.log("❌ [STEP 6] Error Details:", JSON.stringify(response.body, null, 2));
    }
    expect(response.status).toBe(200);
    console.log("✅ [STEP 6] All steps completed successfully!");
  });
});
