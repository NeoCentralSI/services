import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

import prisma from "../../../config/prisma.js";
import { ENV } from "../../../config/env.js";
import app from "../../../app.js";

async function findNonAdminStudentUserId() {
  const assignments = await prisma.userHasRole.findMany({
    where: {
      status: "active",
      role: { name: "Mahasiswa" },
    },
    select: { userId: true },
    take: 50,
  });

  for (const assignment of assignments) {
    const adminAssignment = await prisma.userHasRole.findFirst({
      where: {
        userId: assignment.userId,
        status: "active",
        role: { name: "Admin" },
      },
      select: { userId: true },
    });
    if (!adminAssignment) return assignment.userId;
  }

  throw new Error("Akun Mahasiswa aktif non-Admin tidak tersedia untuk system test RBAC.");
}

describe("System Security: authentication and RBAC", () => {
  let studentToken;

  beforeAll(async () => {
    const studentUserId = await findNonAdminStudentUserId();
    studentToken = jwt.sign(
      { sub: studentUserId, email: "system-test@student.invalid" },
      ENV.JWT_SECRET,
      { expiresIn: "5m" }
    );
  });

  it("returns 401 for an unauthenticated protected Yudisium PDF endpoint", async () => {
    const response = await request(app).get(
      "/yudisiums/system-test-event/participants/system-test-participant/requirements/system-test-item/file"
    );

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ success: false, status: 401 });
  });

  it("returns 403 when a student attempts to delete a room", async () => {
    const response = await request(app)
      .delete("/adminfeatures/rooms/system-test-room")
      .set("Authorization", `Bearer ${studentToken}`);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ success: false, status: 403 });
  });

  it("returns 403 when a student attempts to verify a Yudisium requirement", async () => {
    const response = await request(app)
      .post(
        "/yudisiums/system-test-event/participants/system-test-participant/requirements/system-test-requirement/verify"
      )
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ action: "approve" });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ success: false, status: 403 });
  });
});
