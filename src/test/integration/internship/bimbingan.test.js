import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import app from "../../../app.js";
import prisma from "../../../config/prisma.js";
import { ENV } from "../../../config/env.js";

describe("Internship Bimbingan Integration Test", () => {
  let tokens = {};
  let users = {};
  let testInternship;
  let testQuestion;
  let testCriteria;

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

    // Assign supervisor to internship
    await prisma.internship.update({
      where: { id: testInternship.id },
      data: { supervisorId: users.lecturer.lecturer.id }
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("should create guidance questions and criteria as Sekdep", async () => {
    const academicYear = await prisma.academicYear.findFirst({ where: { isActive: true } });
    
    // Create Question
    const questionPayload = {
      questionText: "What are your accomplishments this week?",
      weekNumber: 1,
      academicYearId: academicYear.id
    };

    const qRes = await request(app)
      .post("/insternship/sekdep/guidance/questions")
      .set("Authorization", `Bearer ${tokens.sekdep}`)
      .send(questionPayload);

    expect(qRes.status).toBe(201);
    testQuestion = qRes.body.data;

    // Create Criteria
    const criteriaPayload = {
      criteriaName: "Quality of Work",
      weekNumber: 1,
      inputType: "EVALUATION",
      academicYearId: academicYear.id
    };

    const cRes = await request(app)
      .post("/insternship/sekdep/guidance/criteria")
      .set("Authorization", `Bearer ${tokens.sekdep}`)
      .send(criteriaPayload);

    expect(cRes.status).toBe(201);
    testCriteria = cRes.body.data;
  });

  it("should submit student guidance answers", async () => {
    const payload = {
      weekNumber: 1,
      answers: {
        [testQuestion.id]: "I have completed backend user module."
      }
    };

    const response = await request(app)
      .post("/insternship/activity/guidance/submit")
      .set("Authorization", `Bearer ${tokens.student}`)
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it("should evaluate the student guidance week as Lecturer", async () => {
    const payload = {
      evaluations: {
        [testCriteria.id]: {
          evaluationValue: "85",
          answerText: "Keep up the good progress."
        }
      }
    };

    const response = await request(app)
      .post(`/insternship/activity/guidance/lecturer/students/${testInternship.id}/week/1/evaluate`)
      .set("Authorization", `Bearer ${tokens.lecturer}`)
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});
