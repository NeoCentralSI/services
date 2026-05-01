import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import app from "../../../../app.js";
import prisma from "../../../../config/prisma.js";
import { ENV } from "../../../../config/env.js";

describe("Internship Registration Integration Test", () => {
  let tokens = {};
  let users = {};
  let testProposal;
  let docType, academicYear;

  beforeAll(async () => {
    // 1. Get All Required Users
    const roles = [
      { key: 'student', email: "fariz_2211523034@fti.unand.ac.id" },
      { key: 'sekdep', email: "sekdep_si@fti.unand.ac.id" },
      { key: 'admin', email: "admin_si@fti.unand.ac.id" },
      { key: 'kadep', email: "kadep_si@fti.unand.ac.id" }
    ];

    for (const role of roles) {
      const user = await prisma.user.findFirst({ where: { email: role.email } });
      if (!user) throw new Error(`User ${role.key} (${role.email}) not found.`);
      users[role.key] = user;
      tokens[role.key] = jwt.sign({ sub: user.id, email: user.email }, ENV.JWT_SECRET);
    }

    // 2. Get Master Data
    docType = await prisma.documentType.findFirst({ where: { name: "Proposal Internship" } });
    academicYear = await prisma.academicYear.findFirst({ where: { isActive: true } });

    // 3. Cleanup: Hapus data lama milik mahasiswa ini agar fresh
    await prisma.internship.deleteMany({
      where: { studentId: users.student.id }
    });
    await prisma.internshipProposal.deleteMany({
      where: { coordinatorId: users.student.id },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // --- STEP 1: REGISTRATION ---
  it("STEP 1: Student should successfully submit a new internship proposal", async () => {
    const dummyDoc = await prisma.document.create({
      data: {
        userId: users.student.id,
        documentTypeId: docType.id,
        fileName: "test_proposal.pdf",
        filePath: "uploads/test/test_proposal.pdf",
      },
    });

    const payload = {
      proposalDocumentId: dummyDoc.id,
      proposedStartDate: "2025-07-01",
      proposedEndDate: "2025-09-30",
      newCompany: {
        companyName: "PT Workflow Integration",
        address: "Jl. Workflow No. 1",
        alasan: "Testing full workflow integration",
      },
      memberIds: [],
    };

    const response = await request(app)
      .post("/insternship/registration/submit")
      .set("Authorization", `Bearer ${tokens.student}`)
      .send(payload);

    expect(response.status).toBe(201);
    
    testProposal = await prisma.internshipProposal.findFirst({
      where: { coordinatorId: users.student.id },
      include: { targetCompany: true }
    });
    expect(testProposal.status).toBe("PENDING");
  });

  // --- STEP 2: SEKDEP VERIFICATION ---
  it("STEP 2: Sekdep should successfully approve the proposal", async () => {
    const payload = {
      response: "APPROVED_PROPOSAL",
      notes: "Proposal bagus, lanjutkan."
    };

    const response = await request(app)
      .post(`/insternship/sekdep/proposals/${testProposal.id}/respond`)
      .set("Authorization", `Bearer ${tokens.sekdep}`)
      .send(payload);

    expect(response.status).toBe(200);
    
    const updated = await prisma.internshipProposal.findUnique({ where: { id: testProposal.id } });
    expect(updated.status).toBe("APPROVED_PROPOSAL");
  });

  // --- STEP 3: ADMIN GENERATE LETTER & KADEP SIGN ---
  it("STEP 3: Admin should generate letter and Kadep should sign it", async () => {
    // 3a. Admin generate
    const adminPayload = {
      documentNumber: `B/WORKFLOW/2025`,
      startDatePlanned: "2025-07-01",
      endDatePlanned: "2025-08-31"
    };

    const adminRes = await request(app)
      .patch(`/insternship/admin/proposals/${testProposal.id}/letter`)
      .set("Authorization", `Bearer ${tokens.admin}`)
      .send(adminPayload);

    expect(adminRes.status).toBe(200);

    // 3b. Kadep sign
    const kadepPayload = {
      type: "APPLICATION",
      id: testProposal.id,
      signaturePositions: { page: 1, x: 100, y: 100 }
    };

    const kadepRes = await request(app)
      .post("/insternship/kadep/approve-letter")
      .set("Authorization", `Bearer ${tokens.kadep}`)
      .send(kadepPayload);

    expect(kadepRes.status).toBe(200);

    const signed = await prisma.internshipProposal.findUnique({ where: { id: testProposal.id } });
    expect(signed.appLetterSignedById).toBe(users.kadep.id);
  });

  // --- STEP 4: ADMIN UPLOAD COMPANY RESPONSE ---
  it("STEP 4: Admin should successfully upload company response", async () => {
    const responseDoc = await prisma.document.create({
      data: {
        userId: users.student.id,
        documentTypeId: docType.id,
        fileName: "response.pdf",
        filePath: "uploads/test/response.pdf",
      },
    });

    const response = await request(app)
      .post(`/insternship/admin/proposals/${testProposal.id}/company-response`)
      .set("Authorization", `Bearer ${tokens.admin}`)
      .send({ documentId: responseDoc.id });

    expect(response.status).toBe(200);

    const final = await prisma.internshipProposal.findUnique({ where: { id: testProposal.id } });
    expect(final.status).toBe("ACCEPTED_BY_COMPANY");
  });

  // --- STEP 5: ADMIN GENERATE ASSIGNMENT LETTER (SURAT TUGAS) ---
  it("STEP 5: Admin should successfully generate assignment letter", async () => {
    const payload = {
      documentNumber: `B/ST-KP/2025`,
      startDateActual: "2025-07-07", // Monday
      endDateActual: "2025-08-31",
    };

    const response = await request(app)
      .patch(`/insternship/admin/proposals/${testProposal.id}/assignment-letter`)
      .set("Authorization", `Bearer ${tokens.admin}`)
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body.message).toContain("berhasil diperbarui");
  });

  // --- STEP 6: KADEP SIGN ASSIGNMENT LETTER (TRIGGERS LOGBOOK) ---
  it("STEP 6: Kadep should sign assignment letter and initialize logbooks", async () => {
    const payload = {
      type: "ASSIGNMENT",
      id: testProposal.id,
      signaturePositions: { page: 1, x: 200, y: 200 }
    };

    const response = await request(app)
      .post("/insternship/kadep/approve-letter")
      .set("Authorization", `Bearer ${tokens.kadep}`)
      .send(payload);

    expect(response.status).toBe(200);

    // Verify Logbooks are created
    const logbooks = await prisma.internshipLogbook.findMany({
      where: { internship: { proposalId: testProposal.id } }
    });
    
    expect(logbooks.length).toBeGreaterThan(0);
    console.log(`✅ Logbooks initialized: ${logbooks.length} entries created.`);
  });
});
