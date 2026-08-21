import fs from "fs";
import jwt from "jsonwebtoken";
import path from "path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../../../app.js";
import { ENV } from "../../../config/env.js";
import prisma from "../../../config/prisma.js";

describe("Internship Pendaftaran Integration Test", () => {
  let tokens = {};
  let users = {};
  let testProposal;
  let docType;

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
    if (!docType) {
      docType = await prisma.documentType.create({ data: { name: "Proposal Internship" } });
    }

    // 3. Ensure templates are on disk to prevent ENOENT errors
    const templatesDir = path.join(process.cwd(), "uploads/internship/templates");
    if (!fs.existsSync(templatesDir)) {
      fs.mkdirSync(templatesDir, { recursive: true });
    }
    const files = fs.readdirSync(templatesDir).filter(f => f.endsWith(".docx"));
    if (files.length === 0) {
      fs.writeFileSync(path.join(templatesDir, "dummy.docx"), Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]));
      files.push("dummy.docx");
    }
    const sourceFile = path.join(templatesDir, files[0]);
    const dbTemplates = await prisma.documentTemplate.findMany();
    for (const t of dbTemplates) {
      const targetPath = path.join(process.cwd(), t.filePath);
      const targetDir = path.dirname(targetPath);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      if (!fs.existsSync(targetPath)) {
        fs.copyFileSync(sourceFile, targetPath);
      }
    }

    // 4. Cleanup old proposals/internships
    await prisma.internship.deleteMany({ where: { studentId: users.student.id } });
    await prisma.internshipProposal.deleteMany({ where: { coordinatorId: users.student.id } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("should successfully submit a new internship proposal as Student", async () => {
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
        companyName: "PT Pendaftaran Integration",
        address: "Jl. Pendaftaran No. 1",
        alasan: "Testing registration integration",
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

  it("should successfully approve the proposal as Sekdep", async () => {
    const payload = {
      response: "APPROVED_PROPOSAL",
      notes: "Proposal disetujui."
    };

    const response = await request(app)
      .post(`/insternship/sekdep/proposals/${testProposal.id}/respond`)
      .set("Authorization", `Bearer ${tokens.sekdep}`)
      .send(payload);

    expect(response.status).toBe(200);

    const updated = await prisma.internshipProposal.findUnique({ where: { id: testProposal.id } });
    expect(updated.status).toBe("APPROVED_PROPOSAL");
  });

  it("should generate proposal letter as Admin and approve/sign as Kadep", async () => {
    const adminPayload = {
      documentNumber: `B/TEST-PENDAFTARAN/2025`,
      startDatePlanned: "2025-07-01",
      endDatePlanned: "2025-08-31"
    };

    const adminRes = await request(app)
      .patch(`/insternship/admin/proposals/${testProposal.id}/letter`)
      .set("Authorization", `Bearer ${tokens.admin}`)
      .send(adminPayload);
    expect(adminRes.status).toBe(200);

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

  it("should allow a student with a FAILED internship to submit a new proposal", async () => {
    await prisma.internshipProposal.update({
      where: { id: testProposal.id },
      data: { status: "ACCEPTED_BY_COMPANY" }
    });
    await prisma.internship.updateMany({
      where: { proposalId: testProposal.id, studentId: users.student.id },
      data: { status: "FAILED" }
    });

    const dummyDoc = await prisma.document.create({
      data: {
        userId: users.student.id,
        documentTypeId: docType.id,
        fileName: "test_proposal_after_failed.pdf",
        filePath: "uploads/test/test_proposal_after_failed.pdf",
      },
    });

    const response = await request(app)
      .post("/insternship/registration/submit")
      .set("Authorization", `Bearer ${tokens.student}`)
      .send({
        proposalDocumentId: dummyDoc.id,
        proposedStartDate: "2025-10-01",
        proposedEndDate: "2025-12-01",
        newCompany: {
          companyName: "PT Pendaftaran Ulang Integration",
          address: "Jl. Pendaftaran Ulang No. 1",
          alasan: "Testing re-registration after failed internship",
        },
        memberIds: [],
      });

    expect(response.status).toBe(201);
  });
});
