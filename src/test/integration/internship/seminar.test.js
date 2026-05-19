import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../../../app.js";
import { ENV } from "../../../config/env.js";
import prisma from "../../../config/prisma.js";

describe("Internship Seminar Integration Test", () => {
  let tokens = {};
  let users = {};
  let testInternship;
  let testSeminar;

  beforeAll(async () => {
    // 1. Get All Required Users
    const roles = [
      { key: 'student', email: "fariz_2211523034@fti.unand.ac.id" },
      { key: 'lecturer', email: "pembimbing_si@fti.unand.ac.id" }
    ];

    for (const role of roles) {
      const user = await prisma.user.findFirst({ 
        where: { email: role.email },
        include: { student: true, lecturer: true }
      });
      if (!user) throw new Error(`User ${role.key} (${role.email}) not found.`);
      users[role.key] = user;
      tokens[role.key] = jwt.sign({ sub: user.id, email: user.email, roles: [role.key] }, ENV.JWT_SECRET);
    }

    // 2. Find or create internship
    testInternship = await prisma.internship.findFirst({
      where: { studentId: users.student.student.id }
    });

    if (!testInternship) {
      const academicYear = await prisma.academicYear.findFirst({ where: { isActive: true } });
      const company = await prisma.company.findFirst() || await prisma.company.create({
        data: { name: "PT Default", address: "Default Address" }
      });
      const proposal = await prisma.internshipProposal.create({
        data: {
          coordinatorId: users.student.id,
          academicYearId: academicYear.id,
          targetCompanyId: company.id,
          proposedStartDate: new Date(),
          proposedEndDate: new Date(),
          status: "APPROVED_PROPOSAL"
        }
      });
      testInternship = await prisma.internship.create({
        data: {
          studentId: users.student.student.id,
          proposalId: proposal.id,
          status: "ONGOING"
        }
      });
    }

    // Assign supervisor
    await prisma.internship.update({
      where: { id: testInternship.id },
      data: { supervisorId: users.lecturer.lecturer.id }
    });

    // Clean up any old seminar records
    await prisma.internshipSeminar.deleteMany({
      where: { internshipId: testInternship.id }
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("should successfully register an internship seminar proposal as Student", async () => {
    const payload = {
      seminarDate: "2025-09-15",
      seminarTimeStart: "09:00:00",
      seminarTimeEnd: "10:00:00",
      room: "Ruang Rapat FTI",
      title: "Rancang Bangun Sistem Informasi Magang"
    };

    const response = await request(app)
      .post("/insternship/activity/register-seminar")
      .set("Authorization", `Bearer ${tokens.student}`)
      .send(payload);
    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);

    testSeminar = await prisma.internshipSeminar.findFirst({
      where: { internshipId: testInternship.id }
    });
    expect(testSeminar).toBeDefined();
  });

  it("should retrieve upcoming seminars list", async () => {
    const response = await request(app)
      .get("/insternship/activity/seminars")
      .set("Authorization", `Bearer ${tokens.student}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it("should approve the seminar as Lecturer", async () => {
    if (!testSeminar) {
      throw new Error("testSeminar is undefined because seminar registration did not create a record.");
    }

    const response = await request(app)
      .post(`/insternship/activity/guidance/lecturer/seminar/${testSeminar.id}/approve`)
      .set("Authorization", `Bearer ${tokens.lecturer}`);
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});
