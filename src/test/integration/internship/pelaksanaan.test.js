import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import app from "../../../app.js";
import prisma from "../../../config/prisma.js";
import { ENV } from "../../../config/env.js";

describe("Internship Pelaksanaan Integration Test", () => {
  let tokens = {};
  let users = {};
  let testInternship;
  let testLogbook;

  beforeAll(async () => {
    // 1. Get All Required Users
    const roles = [
      { key: 'student', email: "fariz_2211523034@fti.unand.ac.id" }
    ];

    for (const role of roles) {
      const user = await prisma.user.findFirst({ 
        where: { email: role.email },
        include: { student: true }
      });
      if (!user) throw new Error(`User ${role.key} (${role.email}) not found.`);
      users[role.key] = user;
      tokens[role.key] = jwt.sign({ sub: user.id, email: user.email }, ENV.JWT_SECRET);
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

    // 3. Create a dummy logbook entry if not exists
    testLogbook = await prisma.internshipLogbook.findFirst({
      where: { internshipId: testInternship.id }
    });

    if (!testLogbook) {
      testLogbook = await prisma.internshipLogbook.create({
        data: {
          internshipId: testInternship.id,
          activityDate: new Date(),
          activityDescription: "Initial activity"
        }
      });
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("should successfully update internship details (field supervisor info)", async () => {
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
    expect(response.body.success).toBe(true);
  });

  it("should retrieve student logbooks", async () => {
    const response = await request(app)
      .get("/insternship/activity/logbook")
      .set("Authorization", `Bearer ${tokens.student}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
  });

  it("should successfully update a logbook entry", async () => {
    const payload = {
      activityDescription: "Mempelajari arsitektur sistem dan database."
    };

    const response = await request(app)
      .put(`/insternship/activity/logbook/${testLogbook.id}`)
      .set("Authorization", `Bearer ${tokens.student}`)
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});
