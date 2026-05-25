import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../../../app.js";
import prisma from "../../../config/prisma.js";
import { createOngoingInternship, getUserByEmailOrThrow, makeAuthToken } from "./test-utils.js";

describe("Internship Pelaksanaan Integration Test", () => {
  let tokens = {};
  let users = {};
  let testInternship;
  let completedInternship;
  let failedInternship;
  let testLogbook;

  beforeAll(async () => {
    // 1. Get All Required Users
    const roles = [
      { key: 'student', email: "fariz_2211523034@fti.unand.ac.id" }
    ];

    for (const role of roles) {
      const user = await getUserByEmailOrThrow(role.email, { student: true });
      users[role.key] = user;
      tokens[role.key] = makeAuthToken(user);
    }

    // 2. Create a fresh active internship fixture
    testInternship = await createOngoingInternship({
      studentUser: users.student,
      companyName: "PT Pelaksanaan Integration",
    });

    completedInternship = await createOngoingInternship({
      studentUser: users.student,
      companyName: "PT Pelaksanaan Completed History",
      status: "COMPLETED",
    });

    failedInternship = await createOngoingInternship({
      studentUser: users.student,
      companyName: "PT Pelaksanaan Failed History",
      status: "FAILED",
    });

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
    expect(Array.isArray(response.body.data.logbooks)).toBe(true);
    expect(response.body.data.internship.id).toBe(testInternship.id);
  });

  it("should retrieve terminal internship history without making terminal internships current", async () => {
    const response = await request(app)
      .get("/insternship/activity/history")
      .set("Authorization", `Bearer ${tokens.student}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.some((item) => item.id === completedInternship.id)).toBe(true);
    expect(response.body.data.some((item) => item.id === failedInternship.id)).toBe(true);
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
