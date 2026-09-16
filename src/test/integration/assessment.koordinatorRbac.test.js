/**
 * Integration RBAC: unggah presensi Metopel + ekspor nilai TA-03 hanya untuk
 * Koordinator Matkul Metopen (BR-19 / BR-28, canon §5.7.3–§5.7.4).
 *
 * Uji ini memakai akun dummy peran tunggal yang BENAR-BENAR ada di database
 * (KC-20260712-02, `docs/uat/02_AkunLogin.md` D-01..D-04) dan login lewat jalur
 * autentikasi asli. Tujuannya menutup residu KC-20260719-01: penolakan harus
 * terbukti datang dari RBAC (403), bukan dari autentikasi yang gagal (401)
 * karena akun tidak pernah diseed.
 *
 * Usage:
 *   npx vitest run src/test/integration/assessment.koordinatorRbac.test.js \
 *     --config vitest.integration.config.js
 */
import express from "express";
import request from "supertest";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

import prisma from "../../config/prisma.js";
import { ROLES } from "../../constants/roles.js";
import { loginWithEmailPassword } from "../../services/auth.service.js";
import assessmentRouter from "../../routes/assessment.route.js";
import errorHandler from "../../middlewares/error.middleware.js";

const UAT_PASSWORD = "Password@2025";
const KOORDINATOR_EMAIL = "uat.koordinator@dummy.ac.id"; // D-04, memegang peran
const WRONG_ROLE_EMAILS = [
  "uat.sekdep@dummy.ac.id", // D-03, pembanding isolasi utama
  "uat.admin@dummy.ac.id", // D-01, peran kuat tetapi tetap harus ditolak
];

const KOORDINATOR_ONLY_ENDPOINTS = [
  { method: "post", path: "/assessment/metopen/attendance/upload" },
  { method: "get", path: "/assessment/metopen/scores/export" },
];

const UNAUTHENTICATED = 401;
const FORBIDDEN = 403;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/assessment", assessmentRouter);
  app.use(errorHandler);
  return app;
}

function call(app, endpoint, token) {
  const req = request(app)[endpoint.method](endpoint.path);
  return token ? req.set("Authorization", `Bearer ${token}`) : req;
}

async function loadAccount(email) {
  const user = await prisma.user.findFirst({
    where: { email },
    select: {
      id: true,
      email: true,
      userHasRoles: {
        where: { status: "active" },
        select: { role: { select: { name: true } } },
      },
    },
  });
  if (!user) return null;
  return {
    ...user,
    roleNames: user.userHasRoles.map((assignment) => assignment.role?.name),
  };
}

describe("RBAC unggah presensi & ekspor nilai Metopel — Koordinator-only", () => {
  const app = buildApp();
  /** @type {Record<string, {account: object, token: string}>} */
  const sessions = {};

  beforeAll(async () => {
    for (const email of [KOORDINATOR_EMAIL, ...WRONG_ROLE_EMAILS]) {
      const account = await loadAccount(email);
      if (!account) continue;
      const login = await loginWithEmailPassword(email, UAT_PASSWORD);
      sessions[email] = { account, token: login.accessToken };
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("uses UAT accounts that really exist, with the expected role split", () => {
    for (const email of [KOORDINATOR_EMAIL, ...WRONG_ROLE_EMAILS]) {
      const session = sessions[email];
      expect(session, `Akun UAT ${email} tidak ada di database`).toBeDefined();
      expect(session.account.id).toBeTruthy();
      // Login berhasil = autentikasi bukan penyebab penolakan di test berikutnya.
      expect(session.token, `Login ${email} gagal`).toBeTruthy();
    }

    expect(sessions[KOORDINATOR_EMAIL].account.roleNames).toContain(
      ROLES.KOORDINATOR_METOPEN,
    );
    for (const email of WRONG_ROLE_EMAILS) {
      expect(sessions[email].account.roleNames.length).toBeGreaterThan(0);
      expect(sessions[email].account.roleNames).not.toContain(
        ROLES.KOORDINATOR_METOPEN,
      );
    }
  });

  it.each(KOORDINATOR_ONLY_ENDPOINTS)(
    "answers 401 (not 403) for $method $path without a token",
    async (endpoint) => {
      const res = await call(app, endpoint);
      expect(res.status).toBe(UNAUTHENTICATED);
      expect(res.status).not.toBe(FORBIDDEN);
      expect(res.body.message).toMatch(/unauthorized/i);
    },
  );

  it.each(
    WRONG_ROLE_EMAILS.flatMap((email) =>
      KOORDINATOR_ONLY_ENDPOINTS.map((endpoint) => ({ email, endpoint })),
    ),
  )(
    "rejects $email on $endpoint.path with 403 from RBAC, not 401 from auth",
    async ({ email, endpoint }) => {
      const session = sessions[email];
      const res = await call(app, endpoint, session.token);

      expect(
        res.status,
        `${email} seharusnya ditolak RBAC pada ${endpoint.path}`,
      ).toBe(FORBIDDEN);
      // Penolakan tidak boleh berasal dari autentikasi: akun ini nyata dan
      // tokennya baru saja diterbitkan oleh login yang sukses.
      expect(res.status).not.toBe(UNAUTHENTICATED);
      expect(res.body.message).toMatch(/insufficient role/i);
      expect(res.body.message).not.toMatch(/unauthorized|invalid credentials/i);
    },
  );

  it.each(KOORDINATOR_ONLY_ENDPOINTS)(
    "lets the Koordinator past the RBAC guard on $method $path",
    async (endpoint) => {
      const res = await call(app, endpoint, sessions[KOORDINATOR_EMAIL].token);

      // Kontrol positif: request tanpa payload valid tetap boleh gagal secara
      // bisnis, tetapi tidak boleh berhenti di gerbang autentikasi/RBAC.
      expect(res.status).not.toBe(UNAUTHENTICATED);
      expect(res.status).not.toBe(FORBIDDEN);
    },
  );
});
