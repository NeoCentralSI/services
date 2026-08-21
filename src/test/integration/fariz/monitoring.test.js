import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import app from "../../../app.js";
import prisma from "../../../config/prisma.js";
import { ENV } from "../../../config/env.js";
import { createOngoingInternship } from "./test-utils.js";

describe("Internship Monitoring Integration Test", () => {
  let tokens = {};
  let users = {};
  let testInternship;

  beforeAll(async () => {
    // 1. Get All Required Users
    const roles = [
      { key: 'student', email: "fariz_2211523034@fti.unand.ac.id" },
      { key: 'sekdep', email: "sekdep_si@fti.unand.ac.id" }
    ];

    for (const role of roles) {
      const user = await prisma.user.findFirst({
        where: { email: role.email },
        include: { student: true }
      });
      if (!user) throw new Error(`User ${role.key} (${role.email}) not found.`);
      users[role.key] = user;
      tokens[role.key] = jwt.sign({ sub: user.id, email: user.email, roles: [role.key] }, ENV.JWT_SECRET);
    }

    // 2. Create a fresh active internship fixture
    testInternship = await createOngoingInternship({
      studentUser: users.student,
      companyName: "PT Monitoring Integration",
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("should successfully retrieve internships list as Sekdep", async () => {
    const response = await request(app)
      .get("/insternship/sekdep/internships")
      .set("Authorization", `Bearer ${tokens.sekdep}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
  });

  it("should retrieve internship detail by ID as Sekdep", async () => {
    const response = await request(app)
      .get(`/insternship/sekdep/internships/${testInternship.id}`)
      .set("Authorization", `Bearer ${tokens.sekdep}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it("should retrieve monitoring stats as Sekdep", async () => {
    const response = await request(app)
      .get("/insternship/monitoring/stats")
      .set("Authorization", `Bearer ${tokens.sekdep}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});
