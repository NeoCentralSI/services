import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

import prisma from "../../../config/prisma.js";
import { ENV } from "../../../config/env.js";
import app from "../../../app.js";

const execFileAsync = promisify(execFile);
const BASE_URL = process.env.SYSTEM_TEST_BASE_URL || "http://localhost:3000";
const MAX_KNF_AVERAGE_LATENCY_MS = 3_000;

async function findActiveUserId() {
  const assignment = await prisma.userHasRole.findFirst({
    where: {
      status: "active",
      role: {
        name: {
          in: [
            "Admin",
            "Mahasiswa",
            "Dosen",
            "Ketua Departemen",
            "Sekretaris Departemen",
            "GKM",
            "Koordinator Yudisium",
          ],
        },
      },
    },
    select: { userId: true },
  });

  if (!assignment) {
    throw new Error("Akun aktif tidak tersedia untuk performance system test.");
  }
  return assignment.userId;
}

function createShortLivedToken(userId) {
  return jwt.sign(
    { sub: userId, email: "system-test@neocentral.invalid" },
    ENV.JWT_SECRET,
    { expiresIn: "5m" }
  );
}

async function ensureBackendServer() {
  try {
    const health = await request(BASE_URL).get("/health");
    if (health.status === 200) return null;
  } catch {
    // Start an isolated HTTP listener below when no development server is active.
  }

  const target = new URL(BASE_URL);
  if (!["localhost", "127.0.0.1"].includes(target.hostname)) {
    throw new Error(`Backend system-test tidak tersedia di ${BASE_URL}.`);
  }

  const port = Number(target.port || 3000);
  return await new Promise((resolve, reject) => {
    const server = app.listen(port, () => resolve(server));
    server.once("error", reject);
  });
}

describe("System Performance: concurrent load capacity", () => {
  let loadToken;

  beforeAll(async () => {
    const health = await request(BASE_URL).get("/health");
    if (health.status !== 200) {
      throw new Error(`Backend system-test tidak tersedia di ${BASE_URL}.`);
    }

    loadToken = createShortLivedToken(await findActiveUserId());
  });

  it("serves 20 concurrent users with average latency within the 3-second KNF limit", async () => {
    const { stdout } = await execFileAsync(
      "npx",
      [
        "--yes",
        "autocannon",
        "-c",
        "20",
        "-d",
        "10",
        "-j",
        "-H",
        `Authorization=Bearer ${loadToken}`,
        `${BASE_URL}/yudisiums`,
      ],
      { maxBuffer: 10 * 1024 * 1024, timeout: 45_000 }
    );

    const result = JSON.parse(stdout);

    console.info("AUTOCANNON_RESULT", {
      connections: 20,
      durationSeconds: 10,
      averageLatencyMs: result.latency.average,
      averageRequestsPerSecond: result.requests.average,
      errors: result.errors,
      non2xx: result.non2xx,
    });

    expect(result.errors).toBe(0);
    expect(result.non2xx).toBe(0);
    expect(result.latency.average).toBeLessThanOrEqual(MAX_KNF_AVERAGE_LATENCY_MS);
    expect(result.requests.average).toBeGreaterThan(0);
  });
});
