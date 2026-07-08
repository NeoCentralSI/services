import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../../../../app.js";
import prisma from "../../../../config/prisma.js";

describe("Internship Verifikasi Surat Integration Test", () => {
  beforeAll(async () => {
    // No special setup needed
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("should return 404 for verifying a non-existent letter", async () => {
    const response = await request(app)
      .get("/insternship/public/verify-letter/non-existent-id");

    expect(response.status).toBe(404);
  });

  it("should return 404 for verifying non-existent seminar minutes", async () => {
    const response = await request(app)
      .get("/insternship/public/verify-seminar-minutes/non-existent-id");

    expect(response.status).toBe(404);
  });
});
