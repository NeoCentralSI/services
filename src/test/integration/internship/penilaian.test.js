import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../../../app.js";
import { ENV } from "../../../config/env.js";
import prisma from "../../../config/prisma.js";
import { createOngoingInternship } from "./test-utils.js";

function logResponseOnFailure(label, response, expectedStatus, payload) {
  if (response.status === expectedStatus) {
    return;
  }

  console.log(`\n[${label}] expected=${expectedStatus} actual=${response.status}`);
  if (payload !== undefined) {
    console.log(`[${label}] request payload:`, JSON.stringify(payload, null, 2));
  }
  console.log(`[${label}] response body:`, JSON.stringify(response.body, null, 2));
  console.log(`[${label}] response text:`, response.text);
}

describe("Internship Penilaian Integration Test", () => {
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
      tokens[role.key] = jwt.sign({ sub: user.id, email: user.email, roles: [role.key] }, ENV.JWT_SECRET);
    }

    // 2. Create a fresh active internship fixture
    testInternship = await createOngoingInternship({
      studentUser: users.student,
      supervisorUser: users.lecturer,
      companyName: "PT Penilaian Integration",
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("should successfully retrieve CPMKs list as Sekdep", async () => {
    const response = await request(app)
      .get("/insternship/sekdep/cpmk")
      .set("Authorization", `Bearer ${tokens.sekdep}`);

    logResponseOnFailure("get-cpmk-list", response, 200);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it("should retrieve assessment criteria for a lecturer", async () => {
    const response = await request(app)
      .get(`/insternship/activity/guidance/lecturer/assessment/${testInternship.id}`)
      .set("Authorization", `Bearer ${tokens.lecturer}`);

    logResponseOnFailure("get-assessment-criteria", response, 200, { internshipId: testInternship.id });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it("should fail submit assessment with invalid scores format", async () => {
    const payload = {
      scores: "invalid_format"
    };

    const response = await request(app)
      .post(`/insternship/activity/guidance/lecturer/assessment/${testInternship.id}`)
      .set("Authorization", `Bearer ${tokens.lecturer}`)
      .send(payload);

    logResponseOnFailure("submit-invalid-assessment", response, 400, payload);

    expect(response.status).toBe(400);
  });
});
