/**
 * Unit Tests — Modules 15-18: Admin Features
 *   Module 15: Data Master Mahasiswa
 *   Module 16: Data Master Dosen
 *   Module 17: Data Master Akun User
 *   Module 18: Tahun Ajaran
 * Covers: user CRUD, student/lecturer detail, CSV import, academic year CRUD
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── hoisted mocks ──────────────────────────────────────────────
const { mockPrisma, mockAdminRepo, mockMailer, mockEnv, mockEmailTpl, mockPwdUtil, mockRoles, mockRedis, mockPush, mockNotif, mockAcademicYear } = vi.hoisted(() => ({
  mockPrisma: {
    user: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    student: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), update: vi.fn() },
    lecturer: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), update: vi.fn() },
    academicYear: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
    userRole: { findMany: vi.fn(), deleteMany: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
  },
  mockAdminRepo: {
    getOrCreateRole: vi.fn(),
    findUserByEmailOrIdentity: vi.fn(),
    createUser: vi.fn(),
    addRolesToUser: vi.fn(),
    createStudentForUser: vi.fn(),
    findLecturerByUserId: vi.fn(),
    createLecturerForUser: vi.fn(),
    findUserById: vi.fn(),
    updateUserById: vi.fn(),
    findRoleByName: vi.fn(),
    getUserRolesWithIds: vi.fn(),
    upsertUserRole: vi.fn(),
    findStudentByUserId: vi.fn(),
    deleteUserRolesByIds: vi.fn(),
  },
  mockMailer: { sendMail: vi.fn().mockResolvedValue(undefined) },
  mockEnv: { JWT_SECRET: "test-secret", FRONTEND_URL: "http://localhost:3000" },
  mockEmailTpl: { accountInviteTemplate: vi.fn().mockReturnValue("<html>invite</html>") },
  mockPwdUtil: { generatePassword: vi.fn().mockReturnValue("RandomPass123") },
  mockRoles: {
    ROLES: {
      MAHASISWA: "mahasiswa",
      PEMBIMBING_1: "pembimbing_1",
      PEMBIMBING_2: "pembimbing_2",
      KETUA_DEPARTEMEN: "ketua_departemen",
      ADMIN: "admin",
    },
    SUPERVISOR_ROLES: ["pembimbing_1", "pembimbing_2"],
    LECTURER_ROLES: ["pembimbing_1", "pembimbing_2", "penguji"],
    isStudentRole: vi.fn((r) => r === "mahasiswa"),
    isLecturerRole: vi.fn((r) => ["pembimbing_1", "pembimbing_2", "penguji"].includes(r)),
    isAdminRole: vi.fn((r) => r === "admin"),
    isSupervisorRole: vi.fn((r) => ["pembimbing_1", "pembimbing_2"].includes(r)),
    normalize: vi.fn((r) => r?.toLowerCase?.()),
  },
  mockRedis: { default: { del: vi.fn(), isOpen: true, connect: vi.fn().mockResolvedValue(undefined), setEx: vi.fn().mockResolvedValue(undefined) } },
  mockPush: { sendFcmToUsers: vi.fn().mockResolvedValue(undefined) },
  mockNotif: { createNotificationsForUsers: vi.fn().mockResolvedValue(undefined) },
  mockAcademicYear: { getActiveAcademicYear: vi.fn() },
}));

vi.mock("../config/prisma.js", () => ({ default: mockPrisma }));
vi.mock("../repositories/adminfeatures.repository.js", () => mockAdminRepo);
vi.mock("../config/mailer.js", () => mockMailer);
vi.mock("../config/env.js", () => ({ ENV: mockEnv }));
vi.mock("../utils/emailTemplate.js", () => mockEmailTpl);
vi.mock("../utils/password.util.js", () => mockPwdUtil);
vi.mock("../constants/roles.js", () => mockRoles);
vi.mock("../config/redis.js", () => mockRedis);
vi.mock("../services/push.service.js", () => mockPush);
vi.mock("../services/notification.service.js", () => mockNotif);
vi.mock("../helpers/academicYear.helper.js", () => mockAcademicYear);
vi.mock("bcrypt", () => ({
  default: { hash: vi.fn().mockResolvedValue("hashed"), compare: vi.fn() },
}));
vi.mock("jsonwebtoken", () => ({
  default: { sign: vi.fn().mockReturnValue("token-123") },
}));
vi.mock("csv-parser", () => ({ default: vi.fn() }));

import {
  adminCreateUser,
  adminUpdateUser,
  getUsers,
  getStudents,
  getLecturers,
  getStudentDetail,
  getLecturerDetail,
  createAcademicYear,
  updateAcademicYear,
  getAcademicYears,
  adminUpdateLecturer,
  adminUpdateStudent,
} from "../services/adminfeatures.service.js";

// ── Test Data ──────────────────────────────────────────────────
const USER = {
  id: "user-1",
  fullName: "Budi Santoso",
  email: "budi@test.com",
  identityNumber: "123456",
  identityType: "NIM",
  userHasRoles: [{ role: { id: "role-mhs", name: "mahasiswa" }, status: "active" }],
  student: { id: "s1" },
};

// ══════════════════════════════════════════════════════════════
describe("Module 17: Data Master Akun User", () => {
  beforeEach(() => vi.clearAllMocks());

  // ─── Admin Create User ────────────────────────────────────
  describe("adminCreateUser", () => {
    it("creates user with email and sends invite email", async () => {
      mockAdminRepo.findUserByEmailOrIdentity.mockResolvedValue(null);
      mockAdminRepo.getOrCreateRole.mockResolvedValue({ id: "role-mhs" });
      mockAdminRepo.createUser.mockResolvedValue({ id: "new-user", email: "new@test.com" });
      mockAdminRepo.addRolesToUser.mockResolvedValue([]);
      mockPrisma.student.findUnique.mockResolvedValue(null);
      mockAdminRepo.createStudentForUser.mockResolvedValue({ id: "new-student" });

      const result = await adminCreateUser({
        fullName: "New Student",
        email: "new@test.com",
        roles: ["mahasiswa"],
        identityNumber: "999",
        identityType: "NIM",
      });

      expect(result).toHaveProperty("id");
      expect(mockMailer.sendMail).toHaveBeenCalled();
    });

    it("rejects (400) if email is missing", async () => {
      await expect(
        adminCreateUser({ fullName: "X", roles: ["mahasiswa"], identityNumber: "1", identityType: "NIM" })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects (409) if user already exists", async () => {
      mockAdminRepo.findUserByEmailOrIdentity.mockResolvedValue(USER);

      await expect(
        adminCreateUser({ fullName: "Budi", email: "budi@test.com", identityNumber: "123456", identityType: "NIM", roles: ["mahasiswa"] })
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it("rejects (400) if NIM with non-student role", async () => {
      mockAdminRepo.findUserByEmailOrIdentity.mockResolvedValue(null);

      await expect(
        adminCreateUser({ fullName: "X", email: "x@t.com", identityType: "NIM", identityNumber: "1", roles: ["pembimbing_1"] })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects (400) if NIP with student role", async () => {
      mockAdminRepo.findUserByEmailOrIdentity.mockResolvedValue(null);

      await expect(
        adminCreateUser({ fullName: "X", email: "x@t.com", identityType: "NIP", identityNumber: "1", roles: ["mahasiswa"] })
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  // ─── Admin Update User ────────────────────────────────────
  describe("adminUpdateUser", () => {
    it("updates user name and roles", async () => {
      mockAdminRepo.findUserById.mockResolvedValue(USER);
      mockAdminRepo.getUserRolesWithIds.mockResolvedValue([{ id: "ur1", role: { name: "mahasiswa" }, roleId: "role-mhs" }]);
      mockAdminRepo.findRoleByName.mockResolvedValue({ id: "role-mhs" });
      mockAdminRepo.upsertUserRole.mockResolvedValue({});
      mockAdminRepo.findStudentByUserId.mockResolvedValue({ id: "s1" });
      mockAdminRepo.updateUserById.mockResolvedValue({ ...USER, fullName: "Updated" });
      mockPrisma.user.findUnique.mockResolvedValue({ ...USER, fullName: "Updated", userHasRoles: USER.userHasRoles });

      const result = await adminUpdateUser("user-1", { fullName: "Updated", roles: ["mahasiswa"] });

      expect(result).toBeDefined();
    });

    it("rejects (400) if user id is missing", async () => {
      await expect(adminUpdateUser(null, { fullName: "X" })).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it("rejects (404) if user not found", async () => {
      mockAdminRepo.findUserById.mockResolvedValue(null);

      await expect(adminUpdateUser("nonexistent", { fullName: "X" })).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  // ─── Get Users (Paginated) ────────────────────────────────
  describe("getUsers", () => {
    it("returns paginated user list", async () => {
      mockPrisma.user.findMany.mockResolvedValue([USER]);
      mockPrisma.user.count.mockResolvedValue(1);

      const result = await getUsers({ page: 1, pageSize: 10 });

      expect(result).toHaveProperty("users");
      expect(result).toHaveProperty("meta");
    });
  });
});

// ══════════════════════════════════════════════════════════════
describe("Module 15: Data Master Mahasiswa", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("getStudents", () => {
    it("returns paginated student list", async () => {
      mockPrisma.user.findMany.mockResolvedValue([{
        ...USER,
        student: { id: "s1", status: "aktif", enrollmentYear: 2021, skscompleted: 100, thesis: [] },
      }]);
      mockPrisma.user.count.mockResolvedValue(1);

      const result = await getStudents({ page: 1, pageSize: 10 });

      expect(result).toHaveProperty("students");
    });
  });

  describe("getStudentDetail", () => {
    it("returns student detail with thesis info", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...USER,
        student: {
          id: "s1",
          status: "aktif",
          enrollmentYear: 2021,
          skscompleted: 100,
          thesis: [{
            id: "thesis-1",
            title: "AI Research",
            thesisSupervisors: [{ lecturer: { user: { fullName: "Dr. Andi" } }, role: { name: "pembimbing_1" } }],
            thesisMilestones: [],
            thesisGuidances: [],
            thesisSeminars: [],
            thesisDefences: [],
            thesisStatus: { name: "Bimbingan" },
            academicYear: { semester: "Ganjil", year: 2024 },
          }],
        },
      });

      const result = await getStudentDetail("user-1");

      expect(result).toBeDefined();
    });

    it("rejects (400) if userId is missing", async () => {
      await expect(getStudentDetail(null)).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects (404) if student not found", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(getStudentDetail("nonexistent")).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe("adminUpdateStudent", () => {
    it("updates student status and SKS", async () => {
      mockPrisma.student.update.mockResolvedValue({ id: "s1", status: "aktif", sksCompleted: 120 });

      const result = await adminUpdateStudent("s1", { status: "aktif", skscompleted: 120 });

      expect(result).toHaveProperty("status", "aktif");
    });
  });
});

// ══════════════════════════════════════════════════════════════
describe("Module 16: Data Master Dosen", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("getLecturers", () => {
    it("returns paginated lecturer list", async () => {
      mockPrisma.user.findMany.mockResolvedValue([{
        id: "user-lec",
        fullName: "Dr. Andi",
        userHasRoles: [{ role: { id: "r1", name: "pembimbing_1" }, status: "active" }],
        lecturer: {
          id: "l1",
          scienceGroup: { name: "AI" },
          _count: { thesisSupervisors: 3 },
        },
      }]);
      mockPrisma.user.count.mockResolvedValue(1);

      const result = await getLecturers({ page: 1, pageSize: 10 });

      expect(result).toHaveProperty("lecturers");
    });
  });

  describe("getLecturerDetail", () => {
    it("returns lecturer detail", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user-lec",
        fullName: "Dr. Andi",
        userHasRoles: [{ role: { id: "r1", name: "pembimbing_1" }, status: "active" }],
        lecturer: {
          id: "l1",
          scienceGroup: { name: "AI" },
          thesisSupervisors: [
            {
              thesis: { id: "t1", title: "AI", thesisStatus: { name: "Bimbingan" }, student: { user: { fullName: "Budi" } } },
              role: { name: "pembimbing_1" },
            },
          ],
          thesisGuidances: [],
        },
      });

      const result = await getLecturerDetail("user-lec");

      expect(result).toBeDefined();
    });

    it("rejects (400) if userId is missing", async () => {
      await expect(getLecturerDetail(null)).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects (404) if lecturer not found", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(getLecturerDetail("nonexistent")).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe("adminUpdateLecturer", () => {
    it("updates lecturer science group", async () => {
      mockPrisma.lecturer.update.mockResolvedValue({ id: "l1", scienceGroupId: "sg-1" });

      const result = await adminUpdateLecturer("l1", { scienceGroupId: "sg-1" });

      expect(result).toHaveProperty("scienceGroupId", "sg-1");
    });
  });
});

// ══════════════════════════════════════════════════════════════
describe("Module 18: Tahun Ajaran", () => {
  beforeEach(() => vi.clearAllMocks());

  // ─── Create Academic Year ─────────────────────────────────
  describe("createAcademicYear", () => {
    it("creates academic year with valid dates", async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue(null); // no duplicate
      mockPrisma.academicYear.create.mockResolvedValue({
        id: "ay-new",
        semester: "ganjil",
        year: 2024,
        startDate: new Date("2024-09-01"),
        endDate: new Date("2025-01-31"),
      });

      const result = await createAcademicYear({
        semester: "ganjil",
        year: 2024,
        startDate: "2024-09-01",
        endDate: "2025-01-31",
      });

      expect(result).toHaveProperty("semester", "ganjil");
    });

    it("rejects (400) if startDate is after endDate", async () => {
      await expect(
        createAcademicYear({
          semester: "ganjil",
          year: 2024,
          startDate: "2025-01-31",
          endDate: "2024-09-01",
        })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects (409) if duplicate semester and year", async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: "existing" });

      await expect(
        createAcademicYear({ semester: "ganjil", year: 2024, startDate: "2024-09-01", endDate: "2025-01-31" })
      ).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  // ─── Update Academic Year ─────────────────────────────────
  describe("updateAcademicYear", () => {
    it("updates academic year dates", async () => {
      const now = new Date();
      const startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      const endDate = new Date(now.getFullYear(), now.getMonth() + 4, 1);
      mockPrisma.academicYear.findUnique.mockResolvedValue({
        id: "ay-1",
        semester: "ganjil",
        year: now.getFullYear(),
        startDate,
        endDate,
      });
      mockPrisma.academicYear.findFirst.mockResolvedValue(null); // no conflict
      mockPrisma.academicYear.update.mockResolvedValue({
        id: "ay-1",
        startDate: new Date("2024-09-15"),
      });

      const result = await updateAcademicYear("ay-1", {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });

      expect(result).toBeDefined();
    });

    it("rejects (400) if id is missing", async () => {
      await expect(updateAcademicYear(null, {})).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects (404) if academic year not found", async () => {
      mockPrisma.academicYear.findUnique.mockResolvedValue(null);

      await expect(updateAcademicYear("nonexistent", {})).rejects.toMatchObject({ statusCode: 404 });
    });

    it("rejects (400) if academic year is not active", async () => {
      mockPrisma.academicYear.findUnique.mockResolvedValue({
        id: "ay-1",
        semester: "ganjil",
        year: 2020,
        startDate: new Date("2020-01-01"),
        endDate: new Date("2020-06-30"),
      });

      await expect(updateAcademicYear("ay-1", {})).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  // ─── Get Academic Years ───────────────────────────────────
  describe("getAcademicYears", () => {
    it("returns paginated academic years", async () => {
      mockPrisma.academicYear.findMany.mockResolvedValue([{ id: "ay1", semester: "ganjil", year: 2024 }]);
      mockPrisma.academicYear.count.mockResolvedValue(1);

      const result = await getAcademicYears({ page: 1, pageSize: 10 });

      expect(result).toHaveProperty("academicYears");
      expect(result).toHaveProperty("meta");
    });
  });
});
