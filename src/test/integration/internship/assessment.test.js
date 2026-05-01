import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import app from "../../../app.js";
import prisma from "../../../config/prisma.js";
import { ENV } from "../../../config/env.js";

describe("Internship Assessment Integration Test", () => {
  let tokens = {};
  let users = {};
  let testInternship;
  let lecturerCpmks = [];
  let fieldCpmks = [];
  let fieldToken;

  beforeAll(async () => {
    console.log("🔍 [SETUP] Initializing assessment test data...");
    
    const roles = [
      { key: 'student', email: "fariz_2211523034@fti.unand.ac.id" },
      { key: 'sekdep', email: "sekdep_si@fti.unand.ac.id" },
      { key: 'lecturer', email: "pembimbing_si@fti.unand.ac.id" }
    ];

    for (const role of roles) {
      const user = await prisma.user.findFirst({ 
        where: { email: role.email },
        include: { lecturer: true, student: true }
      });
      if (!user) throw new Error(`User ${role.key} not found.`);
      users[role.key] = user;
      tokens[role.key] = jwt.sign({ sub: user.id, email: user.email, roles: [role.key] }, ENV.JWT_SECRET);
    }

    testInternship = await prisma.internship.findFirst({
      where: { studentId: users.student.student.id },
      include: { proposal: true },
      orderBy: { createdAt: 'desc' }
    });

    if (!testInternship) throw new Error("Internship not found.");

    // CLEANUP/RESET FOR ASSESSMENT TEST
    console.log(`DEBUG: Student User ID: ${users.student.id}`);
    console.log(`DEBUG: Student Table ID: ${users.student.student.id}`);

    await prisma.internship.update({
      where: { id: testInternship.id },
      data: {
        isLogbookLocked: true,
        companyReportDocId: null,
        companyReportStatus: null,
        fieldAssessmentStatus: null,
        lecturerAssessmentStatus: null,
        status: 'ONGOING'
      }
    });

    await prisma.fieldAssessmentToken.deleteMany({
      where: { internshipId: testInternship.id }
    });

    // Create test document
    const testDocument = await prisma.document.create({
      data: {
        fileName: "company-report.pdf",
        filePath: "uploads/test/company-report.pdf",
        userId: users.student.id
      }
    });
    users.student.testDocumentId = testDocument.id;

    // Ensure CPMKs have rubrics for testing
    const allCpmks = await prisma.internshipCpmk.findMany({
      where: { academicYearId: testInternship.proposal.academicYearId },
      include: { rubrics: true }
    });

    for (const cpmk of allCpmks) {
      if (cpmk.rubrics.length === 0) {
        console.log(`🛠️ [SETUP] Creating dummy rubric for CPMK: ${cpmk.code}`);
        await prisma.internshipAssessmentRubric.create({
          data: {
            cpmkId: cpmk.id,
            levelName: "Sangat Baik",
            rubricLevelDescription: "Performance is outstanding",
            minScore: 0,
            maxScore: 100
          }
        });
      }
    }

    // Refresh CPMKs
    const refreshedCpmks = await prisma.internshipCpmk.findMany({
      where: { academicYearId: testInternship.proposal.academicYearId },
      include: { rubrics: true }
    });

    lecturerCpmks = refreshedCpmks.filter(c => c.assessorType === 'LECTURER');
    fieldCpmks = refreshedCpmks.filter(c => c.assessorType === 'FIELD');

    console.log(`✅ [SETUP] Lecturer CPMKs: ${lecturerCpmks.length}, Field CPMKs: ${fieldCpmks.length}`);
  });

  // --- STEP 1: STUDENT SUBMIT COMPANY REPORT (TRIGGERS AUTO TOKEN) ---
  it("STEP 1: Student should successfully submit company report and trigger token", async () => {
    console.log("🚀 [STEP 1] Submitting Company Report (Student)...");
    const response = await request(app)
      .post("/insternship/activity/company-report")
      .set("Authorization", `Bearer ${tokens.student}`)
      .send({ documentId: users.student.testDocumentId });

    if (response.status !== 200) {
      console.log("❌ [STEP 1] Error Details:", JSON.stringify(response.body, null, 2));
    }
    expect(response.status).toBe(200);
    
    // System should automatically create the token
    const tokenRecord = await prisma.fieldAssessmentToken.findFirst({
      where: { internshipId: testInternship.id, isUsed: false },
      orderBy: { createdAt: 'desc' }
    });
    
    expect(tokenRecord).not.toBeNull();
    fieldToken = tokenRecord.token;
    console.log(`✅ [STEP 1] Token auto-generated: ${fieldToken}`);
  });

  // --- STEP 2: FIELD SUPERVISOR SUBMIT ASSESSMENT ---
  it("STEP 2: Field Supervisor should successfully submit assessment", async () => {
    console.log("🚀 [STEP 2] Submitting Field Assessment...");
    
    const scores = fieldCpmks.map(cpmk => ({
      chosenRubricId: cpmk.rubrics[0].id,
      score: 85
    }));

    const payload = {
      scores,
      signature: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    };

    const response = await request(app)
      .post(`/insternship/field-assessment/submit/${fieldToken}`)
      .send(payload);

    if (response.status !== 200) console.log("❌ [STEP 2] Error:", JSON.stringify(response.body, null, 2));
    expect(response.status).toBe(200);
    
    const updated = await prisma.internship.findUnique({ where: { id: testInternship.id } });
    expect(updated.fieldAssessmentStatus).toBe('COMPLETED');
    console.log("✅ [STEP 2] Field Assessment Submitted.");
  });

  // --- STEP 3: LECTURER SUBMIT ASSESSMENT ---
  it("STEP 3: Lecturer should successfully submit assessment", async () => {
    console.log("🚀 [STEP 3] Submitting Lecturer Assessment...");
    
    const scores = lecturerCpmks.map(cpmk => ({
      chosenRubricId: cpmk.rubrics[0].id,
      score: 90
    }));

    const response = await request(app)
      .post(`/insternship/activity/guidance/lecturer/assessment/${testInternship.id}`)
      .set("Authorization", `Bearer ${tokens.lecturer}`)
      .send({ scores });

    if (response.status !== 200) console.log("❌ [STEP 3] Error:", JSON.stringify(response.body, null, 2));
    expect(response.status).toBe(200);
    
    const updated = await prisma.internship.findUnique({ where: { id: testInternship.id } });
    expect(updated.lecturerAssessmentStatus).toBe('COMPLETED');
    console.log(`✅ [STEP 3] Lecturer Assessment Submitted. Final Score: ${updated.finalNumericScore}`);
  });
});
