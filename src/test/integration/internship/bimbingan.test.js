import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../../../app.js";
import prisma from "../../../config/prisma.js";
import { createOngoingInternship, getUserByEmailOrThrow, makeAuthToken } from "./test-utils.js";

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
      const user = await getUserByEmailOrThrow(role.email, { student: true, lecturer: true });
      users[role.key] = user;
      tokens[role.key] = makeAuthToken(user, { roles: [role.key] });
    }

    // 2. Create a fresh active internship fixture
    testInternship = await createOngoingInternship({
      studentUser: users.student,
      supervisorUser: users.lecturer,
      companyName: "PT Bimbingan Integration",
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
