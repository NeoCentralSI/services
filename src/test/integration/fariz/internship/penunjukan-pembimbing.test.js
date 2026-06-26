import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import fs from "fs";
import path from "path";
import app from "../../../app.js";
import prisma from "../../../config/prisma.js";
import { ENV } from "../../../config/env.js";
import { createOngoingInternship } from "./test-utils.js";

describe("Internship Penunjukan Pembimbing Integration Test", () => {
  let tokens = {};
  let users = {};
  let testInternship;

  beforeAll(async () => {
    // 1. Get All Required Users
    const roles = [
      { key: 'student', email: "fariz_2211523034@fti.unand.ac.id" },
      { key: 'sekdep', email: "sekdep_si@fti.unand.ac.id" },
      { key: 'lecturer', email: "pembimbing_si@fti.unand.ac.id" }
    ];

    for (const role of roles) {
      const user = await prisma.user.findFirst({ 
        where: { email: role.email },
        include: { student: true, lecturer: true }
      });
      if (!user) throw new Error(`User ${role.key} (${role.email}) not found.`);
      users[role.key] = user;
      tokens[role.key] = jwt.sign({ sub: user.id, email: user.email }, ENV.JWT_SECRET);
    }

    // 2. Create a fresh assignable internship for the student
    testInternship = await createOngoingInternship({
      studentUser: users.student,
      companyName: "PT Penunjukan Pembimbing Integration",
    });

    // Ensure templates are on disk
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
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("should successfully retrieve lecturers workload", async () => {
    const response = await request(app)
      .get("/insternship/sekdep/lecturers/workload")
      .set("Authorization", `Bearer ${tokens.sekdep}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it("should successfully assign a supervisor to an internship", async () => {
    const payload = {
      internshipIds: [testInternship.id],
      supervisorId: users.lecturer.lecturer.id
    };

    const response = await request(app)
      .patch("/insternship/sekdep/internships/bulk-assign")
      .set("Authorization", `Bearer ${tokens.sekdep}`)
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const updated = await prisma.internship.findUnique({ where: { id: testInternship.id } });
    expect(updated.supervisorId).toBe(users.lecturer.lecturer.id);
  });

  it("should save and generate supervisor letter for a lecturer", async () => {
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
    expect(response.body.success).toBe(true);
  });
});
