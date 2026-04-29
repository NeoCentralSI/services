import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import app from "../../../app.js";
import prisma from "../../../config/prisma.js";
import { ENV } from "../../../config/env.js";

describe("Internship Finalization Integration Test", () => {
  let tokens = {};
  let users = {};
  let testInternship;
  let testSeminar;
  let testRoom;
  let moderator;
  let testDocument;

  beforeAll(async () => {
    console.log("🔍 [SETUP] Initializing finalization test data...");
    
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

    // DEBUG IDs
    console.log(`DEBUG: Student User ID: ${users.student.id}`);
    console.log(`DEBUG: Student Table ID: ${users.student.student.id}`);

    // Fetch internship using student ID from student table
    testInternship = await prisma.internship.findFirst({
      where: { studentId: users.student.student.id },
      orderBy: { createdAt: 'desc' }
    });

    if (!testInternship) {
        // Try finding by user ID just in case they are swapped
        testInternship = await prisma.internship.findFirst({
            where: { studentId: users.student.id },
            orderBy: { createdAt: 'desc' }
        });
    }

    if (!testInternship) throw new Error("No internship found for the test student.");

    // RESET STATUSES FOR CLEAN TEST
    await prisma.internship.update({
      where: { id: testInternship.id },
      data: {
        logbookDocumentStatus: null,
        companyReceiptStatus: null,
        reportFinalStatus: null,
        lecturerAssessmentStatus: 'COMPLETED',
        fieldAssessmentStatus: 'COMPLETED',
        status: 'ONGOING'
      }
    });

    // Create a real document for testing
    testDocument = await prisma.document.create({
      data: {
        fileName: "test-document.pdf",
        filePath: "uploads/test/test-document.pdf",
        userId: users.student.id
      }
    });

    // Find/Create a room
    testRoom = await prisma.room.findFirst();
    if (!testRoom) {
      testRoom = await prisma.room.create({
        data: { name: "Lab Riset SI", location: "Gedung F" }
      });
    }

    // Find another student for moderator
    const modUser = await prisma.user.findFirst({
      where: { 
        student: { isNot: null },
        id: { not: users.student.id }
      },
      include: { student: true }
    });
    moderator = modUser.student;

    console.log(`✅ [SETUP] InternshipID: ${testInternship.id}, DocumentID: ${testDocument.id}`);
  });

  // --- STEP 1: STUDENT REGISTER SEMINAR ---
  it("STEP 1: Student should successfully register for a seminar", async () => {
    console.log("🚀 [STEP 1] Registering Seminar...");
    const payload = {
      seminarDate: "2025-09-01",
      startTime: "09:00",
      endTime: "10:00",
      roomId: testRoom.id,
      moderatorStudentId: moderator.id,
      memberInternshipIds: []
    };

    const response = await request(app)
      .post("/insternship/activity/register-seminar")
      .set("Authorization", `Bearer ${tokens.student}`)
      .send(payload);

    if (response.status !== 200) {
      console.log("❌ [STEP 1] Error Details:", JSON.stringify(response.body, null, 2));
    }
    expect(response.status).toBe(200);
    // The response might be an array (from transaction)
    const data = response.body.data;
    testSeminar = Array.isArray(data) ? data[0] : data;
    console.log(`✅ [STEP 1] Seminar registered. ID: ${testSeminar.id}, Status: ${testSeminar.status}`);
  });

  // --- STEP 2: LECTURER APPROVE SEMINAR ---
  it("STEP 2: Lecturer should successfully approve the seminar request", async () => {
    console.log("🚀 [STEP 2] Approving Seminar...");
    const response = await request(app)
      .post(`/insternship/activity/guidance/lecturer/seminar/${testSeminar.id}/approve`)
      .set("Authorization", `Bearer ${tokens.lecturer}`)
      .send();

    if (response.status !== 200) console.log("❌ [STEP 2] Error:", response.body);
    expect(response.status).toBe(200);
    console.log("✅ [STEP 2] Seminar APPROVED.");
  });

  // --- STEP 3: LECTURER COMPLETE SEMINAR ---
  it("STEP 3: Lecturer should successfully complete (lock) the seminar", async () => {
    console.log("🚀 [STEP 3] Completing Seminar...");
    const response = await request(app)
      .post(`/insternship/activity/guidance/lecturer/seminar/${testSeminar.id}/complete`)
      .set("Authorization", `Bearer ${tokens.lecturer}`)
      .send();

    if (response.status !== 200) console.log("❌ [STEP 3] Error:", response.body);
    expect(response.status).toBe(200);
    console.log("✅ [STEP 3] Seminar COMPLETED.");
  });

  // --- STEP 4: STUDENT UPLOAD FINAL DOCUMENTS ---
  it("STEP 4: Student should successfully upload final documents", async () => {
    console.log("🚀 [STEP 4] Uploading Final Documents...");
    
    // 1. Logbook Document (KP-002)
    const res1 = await request(app)
      .post("/insternship/activity/logbook-doc")
      .set("Authorization", `Bearer ${tokens.student}`)
      .send({ documentId: testDocument.id });
    if (res1.status !== 200) console.log("❌ [STEP 4.1] Error:", res1.body);
    expect(res1.status).toBe(200);

    // 2. Company Receipt (KP-004)
    const res2 = await request(app)
      .post("/insternship/activity/receipt")
      .set("Authorization", `Bearer ${tokens.student}`)
      .send({ documentId: testDocument.id });
    if (res2.status !== 200) console.log("❌ [STEP 4.2] Error:", res2.body);
    expect(res2.status).toBe(200);

    // 3. Final Fix Report (KP-005)
    const res3 = await request(app)
      .post("/insternship/activity/final-fix-report")
      .set("Authorization", `Bearer ${tokens.student}`)
      .send({ reportFinalTitle: "Laporan Akhir KP Fix", documentId: testDocument.id });
    if (res3.status !== 200) console.log("❌ [STEP 4.3] Error:", res3.body);
    expect(res3.status).toBe(200);

    console.log("✅ [STEP 4] Documents uploaded.");
  });

  // --- STEP 5: SEKDEP VERIFY LOGBOOK & RECEIPT ---
  it("STEP 5: Sekdep should successfully verify logbook and receipt", async () => {
    console.log("🚀 [STEP 5] Sekdep Verifying Documents...");
    
    // Verify Logbook
    const res1 = await request(app)
      .put(`/insternship/sekdep/internships/${testInternship.id}/verify-document`)
      .set("Authorization", `Bearer ${tokens.sekdep}`)
      .send({ documentType: "logbookDocument", status: "APPROVED", notes: "Lengkap" });
    expect(res1.status).toBe(200);

    // Verify Receipt
    const res2 = await request(app)
      .put(`/insternship/sekdep/internships/${testInternship.id}/verify-document`)
      .set("Authorization", `Bearer ${tokens.sekdep}`)
      .send({ documentType: "companyReceipt", status: "APPROVED", notes: "Valid" });
    expect(res2.status).toBe(200);

    console.log("✅ [STEP 5] Sekdep verified documents.");
  });

  // --- STEP 7: FINAL CHECK STATUS COMPLETED ---
  it("STEP 7: Internship status should be COMPLETED", async () => {
    console.log("🚀 [STEP 7] Final Status Check...");
    const updated = await prisma.internship.findUnique({
      where: { id: testInternship.id }
    });
    
    console.log(`📊 Final Status: ${updated.status}`);
    expect(updated.status).toBe('COMPLETED');
    console.log("🎊 CONGRATULATIONS! Internship E2E Workflow PASSED.");
  });
});
