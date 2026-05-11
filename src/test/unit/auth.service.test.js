/**
 * Unit Tests — Module 1: Authentication & Account Management
 * Covers: login, register verification, resend activation, token refresh, password reset
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── hoisted mocks ──────────────────────────────────────────────
const { mockPrisma, mockRedis, mockRepo, mockAdminRepo, mockMailer, mockEnv, mockEmailTemplate, mockPasswordUtil } = vi.hoisted(() => ({
  mockPrisma: {
    user: { update: vi.fn(), findUnique: vi.fn() },
  },
  mockRedis: {
    isOpen: true,
    connect: vi.fn(),
    setEx: vi.fn(),
    get: vi.fn(),
    del: vi.fn(),
  },
  mockRepo: {
    findUserByEmail: vi.fn(),
    findUserById: vi.fn(),
    updateUserPassword: vi.fn(),
  },
  mockAdminRepo: {
    getUserRolesWithIds: vi.fn(),
  },
  mockMailer: {
    sendMail: vi.fn(),
  },
  mockEnv: {
    JWT_SECRET: "test-secret",
    REFRESH_TOKEN_SECRET: "test-refresh-secret",
    JWT_EXPIRES_IN: "15m",
    REFRESH_TOKEN_EXPIRES_IN: "7d",
    BASE_URL: "http://localhost:3000",
    APP_NAME: "TestApp",
    NODE_ENV: "test",
  },
  mockEmailTemplate: {
    passwordResetTemplate: vi.fn().mockReturnValue("<html>reset</html>"),
    accountActivationWithTempPasswordTemplate: vi.fn().mockReturnValue("<html>activate</html>"),
  },
  mockPasswordUtil: {
    generatePassword: vi.fn().mockReturnValue("TempPass123"),
  },
}));

vi.mock("../../config/prisma.js", () => ({ default: mockPrisma }));
vi.mock("../../config/redis.js", () => ({ default: mockRedis }));
vi.mock("../../repositories/auth.repository.js", () => mockRepo);
vi.mock("../../repositories/adminfeatures.repository.js", () => mockAdminRepo);
vi.mock("../../config/mailer.js", () => mockMailer);
vi.mock("../../config/env.js", () => ({ ENV: mockEnv }));
vi.mock("../../utils/emailTemplate.js", () => mockEmailTemplate);
vi.mock("../../utils/password.util.js", () => mockPasswordUtil);
vi.mock("bcrypt", () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn().mockResolvedValue("hashed-value"),
  },
}));
vi.mock("jsonwebtoken", () => ({
  default: {
    sign: vi.fn().mockReturnValue("mock-jwt-token"),
    verify: vi.fn(),
  },
}));

// Import AFTER mocking
import {
  loginWithEmailPassword,
  refreshTokens,
  logout,
  verifyAccessToken,
  changePassword,
  verifyAccountToken,
  requestAccountVerification,
  getUserProfile,
} from "../../services/auth.service.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

// ── Test Data ──────────────────────────────────────────────────
const VERIFIED_USER = {
  id: "user-1",
  email: "test@university.ac.id",
  fullName: "Test User",
  password: "hashed-password",
  isVerified: true,
  refreshToken: "hashed-refresh",
};

const UNVERIFIED_USER = {
  ...VERIFIED_USER,
  id: "user-2",
  email: "unverified@university.ac.id",
  isVerified: false,
};

const MOCK_ROLES = [
  { role: { id: "role-1", name: "mahasiswa" }, status: "active" },
];

// ── Tests ──────────────────────────────────────────────────────
describe("Module 1: Authentication & Account Management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis.isOpen = true;
  });

  // ─── POST /login ───────────────────────────────────────────
  describe("loginWithEmailPassword", () => {
    it("returns JWT tokens on successful login with verified account", async () => {
      mockRepo.findUserByEmail.mockResolvedValue(VERIFIED_USER);
      bcrypt.compare.mockResolvedValue(true);
      mockAdminRepo.getUserRolesWithIds.mockResolvedValue(MOCK_ROLES);
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.user.findUnique.mockResolvedValue({
        ...VERIFIED_USER,
        userHasRoles: [{ role: { id: "role-1", name: "mahasiswa" }, status: "active" }],
        student: {
          id: "user-1",
          enrollmentYear: 2022,
          sksCompleted: 120,
          currentSemester: 8,
          eligibleMetopen: true,
          takingThesisCourse: true,
          status: "Aktif",
        },
        lecturer: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await loginWithEmailPassword("test@university.ac.id", "password123");

      expect(result).toHaveProperty("accessToken");
      expect(result).toHaveProperty("refreshToken");
      expect(result.user).toMatchObject({ id: "user-1", email: "test@university.ac.id" });
      expect(result.user.roles).toHaveLength(1);
    });

    it("rejects (401) if email not found", async () => {
      mockRepo.findUserByEmail.mockResolvedValue(null);

      await expect(loginWithEmailPassword("unknown@test.com", "pw")).rejects.toMatchObject({
        statusCode: 401,
        message: "Invalid credentials",
      });
    });

    it("rejects (403) if account is not verified (isVerified = false)", async () => {
      mockRepo.findUserByEmail.mockResolvedValue(UNVERIFIED_USER);

      await expect(loginWithEmailPassword("unverified@university.ac.id", "pw")).rejects.toMatchObject({
        statusCode: 403,
      });
    });

    it("rejects (401) if password is incorrect", async () => {
      mockRepo.findUserByEmail.mockResolvedValue(VERIFIED_USER);
      bcrypt.compare.mockResolvedValue(false);

      await expect(loginWithEmailPassword("test@university.ac.id", "wrongpass")).rejects.toMatchObject({
        statusCode: 401,
        message: "Invalid credentials",
      });
    });
  });

  // ─── GET /verify ───────────────────────────────────────────
  describe("verifyAccountToken", () => {
    it("activates account (isVerified = true) with valid token", async () => {
      jwt.verify.mockReturnValue({ sub: "user-1", purpose: "verify" });
      mockRedis.get.mockResolvedValue("1");
      mockPrisma.user.update.mockResolvedValue({});
      mockRedis.del.mockResolvedValue(1);

      const result = await verifyAccountToken("valid-token");

      expect(result).toEqual({ userId: "user-1" });
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { isVerified: true },
      });
    });

    it("rejects (400) if token is expired or invalid", async () => {
      jwt.verify.mockImplementation(() => { throw new Error("expired"); });

      await expect(verifyAccountToken("expired-token")).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it("rejects (400) if token already used (not in Redis)", async () => {
      jwt.verify.mockReturnValue({ sub: "user-1", purpose: "verify" });
      mockRedis.get.mockResolvedValue(null);

      await expect(verifyAccountToken("used-token")).rejects.toMatchObject({
        statusCode: 400,
      });
    });
  });

  // ─── POST /resend-activation ──────────────────────────────
  describe("requestAccountVerification", () => {
    it("sends activation email for unverified account", async () => {
      mockRepo.findUserByEmail.mockResolvedValue(UNVERIFIED_USER);
      mockRepo.updateUserPassword.mockResolvedValue({});
      mockRedis.setEx.mockResolvedValue("OK");
      mockMailer.sendMail.mockResolvedValue({});

      const result = await requestAccountVerification("unverified@university.ac.id");

      expect(result).toMatchObject({ found: true, alreadyVerified: false, sent: true });
      expect(mockMailer.sendMail).toHaveBeenCalled();
    });

    it("returns alreadyVerified if account is already verified", async () => {
      mockRepo.findUserByEmail.mockResolvedValue(VERIFIED_USER);

      const result = await requestAccountVerification("test@university.ac.id");

      expect(result).toMatchObject({ found: true, alreadyVerified: true });
      expect(mockMailer.sendMail).not.toHaveBeenCalled();
    });

    it("returns not found if email doesn't exist", async () => {
      mockRepo.findUserByEmail.mockResolvedValue(null);

      const result = await requestAccountVerification("nonexistent@test.com");

      expect(result).toMatchObject({ found: false });
    });

    it("rejects (400) if email is empty", async () => {
      await expect(requestAccountVerification("")).rejects.toMatchObject({
        statusCode: 400,
      });
    });
  });

  // ─── POST /logout ─────────────────────────────────────────
  describe("logout", () => {
    it("clears refresh token from database", async () => {
      mockPrisma.user.update.mockResolvedValue({});

      await logout("user-1");

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { refreshToken: null },
      });
    });
  });

  // ─── verifyAccessToken ────────────────────────────────────
  describe("verifyAccessToken", () => {
    it("returns decoded payload for valid token", () => {
      const payload = { sub: "user-1", email: "test@university.ac.id" };
      jwt.verify.mockReturnValue(payload);

      const result = verifyAccessToken("valid-token");
      expect(result).toEqual(payload);
    });

    it("throws (401) for invalid/expired token", () => {
      jwt.verify.mockImplementation(() => { throw new Error("invalid"); });

      expect(() => verifyAccessToken("bad-token")).toThrow();
    });
  });

  // ─── changePassword ───────────────────────────────────────
  describe("changePassword", () => {
    it("changes password when current password matches", async () => {
      mockRepo.findUserById.mockResolvedValue(VERIFIED_USER);
      bcrypt.compare.mockResolvedValue(true);
      mockRepo.updateUserPassword.mockResolvedValue({});
      mockPrisma.user.update.mockResolvedValue({});

      await expect(changePassword("user-1", "oldpass", "newpass")).resolves.not.toThrow();
      expect(mockRepo.updateUserPassword).toHaveBeenCalled();
    });

    it("rejects (404) if user not found", async () => {
      mockRepo.findUserById.mockResolvedValue(null);

      await expect(changePassword("bad-id", "old", "new")).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it("rejects (400) if current password is incorrect", async () => {
      mockRepo.findUserById.mockResolvedValue(VERIFIED_USER);
      bcrypt.compare.mockResolvedValue(false);

      await expect(changePassword("user-1", "wrongold", "new")).rejects.toMatchObject({
        statusCode: 400,
      });
    });
  });

  // ─── getUserProfile ───────────────────────────────────────
  describe("getUserProfile", () => {
    it("returns complete profile with roles", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...VERIFIED_USER,
        userHasRoles: [{ role: { id: "r1", name: "mahasiswa" }, status: "active" }],
        student: {
          id: "s1",
          enrollmentYear: 2022,
          sksCompleted: 120,
          currentSemester: 8,
          eligibleMetopen: true,
          metopenEligibilitySource: "sia",
          metopenEligibilityUpdatedAt: new Date("2026-04-20T00:00:00.000Z"),
          takingThesisCourse: true,
          thesisCourseEnrollmentSource: "sia",
          thesisCourseEnrollmentUpdatedAt: new Date("2026-04-20T00:00:00.000Z"),
          status: "Aktif",
        },
        lecturer: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const profile = await getUserProfile("user-1");

      expect(profile).toHaveProperty("id", "user-1");
      expect(profile.roles).toHaveLength(1);
      expect(profile.student).toMatchObject({
        id: "s1",
        sksCompleted: 120,
        currentSemester: 8,
        eligibleMetopen: true,
        metopenEligibilitySource: "sia",
        takingThesisCourse: true,
        thesisCourseEnrollmentSource: "sia",
      });
    });

    it("rejects (404) if user not found", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(getUserProfile("nonexistent")).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });
});
