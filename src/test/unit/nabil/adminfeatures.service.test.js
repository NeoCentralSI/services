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
    studentCplScore: { findMany: vi.fn() },
    thesisSeminarExaminer: { findMany: vi.fn(async () => []) },
    thesisDefenceExaminer: { findMany: vi.fn(async () => []) },
    lecturer: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), update: vi.fn() },
    academicYear: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
    userRole: { findMany: vi.fn(), deleteMany: vi.fn(), create: vi.fn() },
    studentCplScore: { findMany: vi.fn() },
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
    updateStudentByUserId: vi.fn(),
    deleteUserRolesByIds: vi.fn(),
    updateLecturerByUserId: vi.fn(),
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
      KOORDINATOR_METODE_PENELITIAN: "Koordinator Matkul Metopen",
    },
    SUPERVISOR_ROLES: ["pembimbing_1", "pembimbing_2"],
    LECTURER_ROLES: ["pembimbing_1", "pembimbing_2", "penguji"],
    isStudentRole: vi.fn((r) => r === "mahasiswa"),
    isLecturerRole: vi.fn((r) => ["pembimbing_1", "pembimbing_2", "penguji"].includes(r)),
    isAdminRole: vi.fn((r) => r === "admin"),
    isSupervisorRole: vi.fn((r) => ["pembimbing_1", "pembimbing_2"].includes(r)),
    normalize: vi.fn((r) => r?.toLowerCase?.()),
    supervisorRoleDisplayName: vi.fn((r) => {
      if (r === "pembimbing_1") return "Pembimbing 1";
      if (r === "pembimbing_2") return "Pembimbing 2";
      return r;
    }),
    isPembimbing1: vi.fn((r) => r === "pembimbing_1" || r === "Pembimbing 1"),
    isPembimbing2: vi.fn((r) => r === "pembimbing_2" || r === "Pembimbing 2"),
  },
  mockRedis: { default: { del: vi.fn(), isOpen: true, connect: vi.fn().mockResolvedValue(undefined), setEx: vi.fn().mockResolvedValue(undefined) } },
  mockPush: { sendFcmToUsers: vi.fn().mockResolvedValue(undefined) },
  mockNotif: { createNotificationsForUsers: vi.fn().mockResolvedValue(undefined) },
  mockAcademicYear: {
    getActiveAcademicYear: vi.fn(),
    resolveOperationalAcademicYear: vi.fn(),
    formatAcademicYearLabel: vi.fn((ay) => `${ay.year} ${ay.semester === "ganjil" ? "Ganjil" : "Genap"}`.trim()),
  },
}));

// The student action shield (TA course of the semester, leave) reads tables this test does not fake.
vi.mock("../../../services/thesisLifecycle.service.js", async (importOriginal) => ({
  ...(await importOriginal()),
  getStudentThesisActionBlock: vi.fn(async () => ({ blocked: false, code: null, reason: null, takingThesisCourse: true })),
  assertStudentThesisActionAllowed: vi.fn(async () => ({ blocked: false, code: null, reason: null, takingThesisCourse: true })),
}));
// The graduation predicate is computed from tables this test does not fake.
vi.mock("../../../helpers/graduation-predicate.helper.js", async (importOriginal) => ({
  ...(await importOriginal()),
  getGraduationSummaries: vi.fn(async (students) => new Map(students.map((s) => [s.id, { predicate: null, studySemesters: null, studyLength: "-" }]))),
  getStudentGraduationSummary: vi.fn(async () => ({ predicate: null, studySemesters: null, studyLength: "-" })),
}));
vi.mock("../../../config/prisma.js", () => ({ default: mockPrisma }));
vi.mock("../../../repositories/adminfeatures.repository.js", () => mockAdminRepo);
vi.mock("../../../config/mailer.js", () => mockMailer);
vi.mock("../../../config/env.js", () => ({ ENV: mockEnv }));
vi.mock("../../../utils/emailTemplate.js", () => mockEmailTpl);
vi.mock("../../../utils/password.util.js", () => mockPwdUtil);
vi.mock("../../../constants/roles.js", () => mockRoles);
vi.mock("../../../config/redis.js", () => mockRedis);
vi.mock("../../../services/push.service.js", () => mockPush);
vi.mock("../../../services/notification.service.js", () => mockNotif);
vi.mock("../../../helpers/academicYear.helper.js", () => mockAcademicYear);
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
  normalizeRoleInputName,
  processImportUserRows,
} from "../../../services/adminfeatures.service.js";

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

  // ─── Admin account rules ──────────────────────────────────
  describe("Admin account rules", () => {
    const ADMIN_A = { id: "admin-a", fullName: "Admin A", email: "a@x.test", identityType: "NIP", isVerified: true };
    const ADMIN_B = { id: "admin-b", fullName: "Admin B", email: "b@x.test", identityType: "NIP", isVerified: true };
    const adminRoles = [{ roleId: "role-admin", status: "active", role: { name: "admin" } }];

    beforeEach(() => {
      mockAdminRepo.getUserRolesWithIds.mockResolvedValue(adminRoles);
      mockAdminRepo.findRoleByName.mockImplementation(async (name) => ({ id: `role-${name}` }));
      mockAdminRepo.upsertUserRole.mockResolvedValue({});
      mockAdminRepo.deleteUserRolesByIds.mockResolvedValue({});
      mockAdminRepo.updateUserById.mockResolvedValue({});
      mockAdminRepo.findLecturerByUserId.mockResolvedValue({ id: "l" });
      mockPrisma.user.findUnique.mockResolvedValue({ ...ADMIN_B, userHasRoles: [] });
    });

    it("an Admin cannot change the roles of their own account", async () => {
      mockAdminRepo.findUserById.mockResolvedValue(ADMIN_A);
      await expect(
        adminUpdateUser("admin-a", { roles: ["admin", "pembimbing_1"] }, { actorUserId: "admin-a" }),
      ).rejects.toMatchObject({ statusCode: 400, message: "Anda tidak dapat mengubah peran akun Anda sendiri." });
      expect(mockAdminRepo.upsertUserRole).not.toHaveBeenCalled();
    });

    it("an Admin cannot deactivate their own account, but may save it unchanged", async () => {
      mockAdminRepo.findUserById.mockResolvedValue(ADMIN_A);
      await expect(adminUpdateUser("admin-a", { isVerified: false }, { actorUserId: "admin-a" })).rejects.toMatchObject({
        message: "Anda tidak dapat menonaktifkan akun Anda sendiri.",
      });
      await expect(adminUpdateUser("admin-a", { fullName: "Admin A2", roles: ["admin"] }, { actorUserId: "admin-a" })).resolves.toBeDefined();
    });

    it("the last active Admin keeps the role and stays active", async () => {
      mockAdminRepo.findUserById.mockResolvedValue(ADMIN_B);
      mockPrisma.user.count.mockResolvedValue(0);
      await expect(adminUpdateUser("admin-b", { roles: [] }, { actorUserId: "admin-a" })).rejects.toMatchObject({
        message: "Harus ada minimal satu Admin aktif. Akun ini adalah Admin aktif terakhir.",
      });
      await expect(adminUpdateUser("admin-b", { isVerified: false }, { actorUserId: "admin-a" })).rejects.toMatchObject({
        message: expect.stringContaining("Admin aktif terakhir"),
      });
      await expect(
        adminUpdateUser("admin-b", { roles: [{ name: "admin", status: "nonActive" }] }, { actorUserId: "admin-a" }),
      ).rejects.toMatchObject({ message: expect.stringContaining("Admin aktif terakhir") });
      expect(mockAdminRepo.deleteUserRolesByIds).not.toHaveBeenCalled();

      // Another active Admin remains: the role may be revoked.
      mockPrisma.user.count.mockResolvedValue(1);
      await adminUpdateUser("admin-b", { roles: ["pembimbing_1"] }, { actorUserId: "admin-a" });
      expect(mockAdminRepo.deleteUserRolesByIds).toHaveBeenCalledWith("admin-b", ["role-admin"]);
    });

    it("an import row that mixes Admin with another role, or adds a role to an Admin, is rejected and reported", async () => {
      mockAdminRepo.findUserByEmailOrIdentity.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "admin-b" });
      const result = await processImportUserRows(
        [
          { email: "x@x.test", fullName: "X", identityNumber: "198001012005011001", role: "admin, pembimbing 1", identityType: "NIP" },
          { email: "b@x.test", fullName: "Admin B", identityNumber: "198001012005011002", role: "penguji", identityType: "NIP" },
        ],
        { actorUserId: "admin-a" },
      );
      expect(result.failed).toBe(2);
      expect(result.errors).toEqual([
        expect.stringMatching(/^Baris 2: Peran Admin tidak dapat digabung/),
        expect.stringMatching(/^Baris 3: Peran Admin tidak dapat digabung/),
      ]);
      expect(mockAdminRepo.upsertUserRole).not.toHaveBeenCalled();
    });

    it("the Admin role is exclusive on edit and on create", async () => {
      mockAdminRepo.findUserById.mockResolvedValue({ ...USER, id: "lect-1", identityType: "NIP", isVerified: true });
      mockAdminRepo.getUserRolesWithIds.mockResolvedValue([{ roleId: "role-pembimbing_1", status: "active", role: { name: "pembimbing_1" } }]);
      await expect(adminUpdateUser("lect-1", { roles: ["pembimbing_1", "admin"] }, { actorUserId: "admin-a" })).rejects.toMatchObject({
        statusCode: 400,
        message: "Peran Admin tidak dapat digabung dengan peran lain. Akun Admin hanya memegang peran Admin.",
      });
      await expect(
        adminCreateUser({ email: "new@x.test", roles: ["admin", "penguji"], identityType: "NIP" }, { actorUserId: "admin-a" }),
      ).rejects.toMatchObject({ message: expect.stringContaining("Peran Admin tidak dapat digabung") });
      expect(mockAdminRepo.createUser).not.toHaveBeenCalled();
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
describe("normalizeRoleInputName (import)", () => {
  it("maps the UI label and the stored name of the research method coordinator to the same role", () => {
    for (const name of ["Koordinator Metode Penelitian", "Koordinator Matkul Metopen", "koordinator metopen"]) {
      expect(normalizeRoleInputName(name)).toEqual(["Koordinator Matkul Metopen"]);
    }
  });
});

// ══════════════════════════════════════════════════════════════
describe("Module 15: Data Master Mahasiswa", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("getStudents", () => {
    it("returns paginated student list", async () => {
      mockPrisma.user.findMany.mockResolvedValue([{
        ...USER,
        student: { id: "s1", status: "aktif", enrollmentYear: 2021, sksCompleted: 100, thesis: [], academicYearSnapshots: [] },
      }]);
      mockPrisma.user.count.mockResolvedValue(1);

      const result = await getStudents({ page: 1, pageSize: 10 });

      expect(result).toHaveProperty("students");
    });

    it("returns transformed students with meta (activeTheses + sksCompleted)", async () => {
      mockPrisma.user.findMany.mockResolvedValue([{
        ...USER,
        student: {
          id: "s1",
          status: "active",
          enrollmentYear: 2021,
          sksCompleted: 120,
          thesis: [{
            id: "thesis-1",
            title: "AI Research",
            proposalStatus: "submitted",
            thesisSupervisors: [],
          }],
          academicYearSnapshots: [{ eligibleResearchMethod: true, takingThesisCourse: null, eligibilitySource: "sia", thesisCourseSource: null, capturedAt: "2026-08-08T00:00:00.000Z" }],
        },
        userHasRoles: USER.userHasRoles,
      }]);
      mockPrisma.user.count.mockResolvedValue(1);
      mockAcademicYear.resolveOperationalAcademicYear.mockResolvedValue({ id: "ay-op", year: "2026/2027", semester: "ganjil", isActive: true });

      const result = await getStudents({ page: 1, pageSize: 10 });

      expect(result.academicYearContext).toMatchObject({ id: "ay-op", label: "2026/2027 Ganjil", isActive: true });
      expect(result.students[0].student.semesterFlags).toEqual({
        academicYearId: "ay-op",
        academicYearLabel: "2026/2027 Ganjil",
        takingResearchMethod: true,
        takingThesisCourse: null,
        source: "sia",
        // The source of each flag
        researchMethodSource: "sia",
        thesisCourseSource: null,
        capturedAt: "2026-08-08T00:00:00.000Z",
      });
      expect(result.meta).toMatchObject({ page: 1, pageSize: 10, total: 1 });
      expect(result.students[0].student.sksCompleted).toBe(120);
      expect(result.students[0].student.status).toBe("active");
      expect(result.students[0].student.activeTheses[0]).toMatchObject({ title: "AI Research" });
    });

    it("builds where filter with student presence and enrollmentYear", async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);

      await getStudents({ page: 1, pageSize: 10 });
      expect(mockPrisma.user.findMany.mock.calls[0][0].where.student).toEqual({ isNot: null });

      await getStudents({ page: 1, pageSize: 10, enrollmentYear: 2021 });
      expect(mockPrisma.user.findMany.mock.calls[1][0].where.student).toEqual({ is: { AND: [{ enrollmentYear: 2021 }] } });
    });

    it("status filter is applied in the query (count and rows); an unknown value is ignored", async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);

      await getStudents({ page: 1, pageSize: 10, status: "bss" });
      expect(mockPrisma.user.findMany.mock.calls[0][0].where.student).toEqual({ is: { AND: [{ status: "bss" }] } });
      expect(mockPrisma.user.count.mock.calls[0][0].where).toEqual(mockPrisma.user.findMany.mock.calls[0][0].where);

      await getStudents({ page: 1, pageSize: 10, status: "cuti" });
      expect(mockPrisma.user.findMany.mock.calls[1][0].where.student).toEqual({ isNot: null });
    });

    it("program filter reads the SIA flags of the chosen period; unknown flags count as not taking", async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.academicYear.findUnique.mockResolvedValue({ id: "ay-genap", year: "2025/2026", semester: "genap" });

      await getStudents({ page: 1, pageSize: 10, program: "research-method", academicYearId: "ay-genap", enrollmentYear: 2022 });
      expect(mockPrisma.user.findMany.mock.calls[0][0].where.student).toEqual({
        is: {
          AND: [
            { enrollmentYear: 2022 },
            { academicYearSnapshots: { some: { academicYearId: "ay-genap", eligibleResearchMethod: true, OR: [{ takingThesisCourse: false }, { takingThesisCourse: null }] } } },
          ],
        },
      });

      await getStudents({ page: 1, pageSize: 10, program: "none", academicYearId: "ay-genap" });
      expect(mockPrisma.user.findMany.mock.calls[1][0].where.student.is.AND[0].academicYearSnapshots).toEqual({
        none: { academicYearId: "ay-genap", OR: [{ eligibleResearchMethod: true }, { takingThesisCourse: true }] },
      });
    });

    it("program 'both' needs both flags in the chosen period, and combines with status, search and sorting", async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.academicYear.findUnique.mockResolvedValue({ id: "ay-ganjil", year: "2026/2027", semester: "ganjil" });

      await getStudents({ page: 2, pageSize: 10, program: "both", status: "active", search: "Uji", academicYearId: "ay-ganjil", sortBy: "fullName", sortOrder: "asc" });
      const call = mockPrisma.user.findMany.mock.calls[0][0];
      expect(call.where.student).toEqual({
        is: {
          AND: [
            { status: "active" },
            { academicYearSnapshots: { some: { academicYearId: "ay-ganjil", eligibleResearchMethod: true, takingThesisCourse: true } } },
          ],
        },
      });
      expect(call.where.OR).toEqual(expect.arrayContaining([{ fullName: { contains: "Uji" } }]));
      expect(call.orderBy).toEqual([{ fullName: "asc" }]);
      expect(call.skip).toBe(10);
      expect(mockPrisma.user.count.mock.calls[0][0].where).toEqual(call.where);
    });

    it("program filter without a resolvable period matches nothing instead of every student", async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);
      mockAcademicYear.resolveOperationalAcademicYear.mockResolvedValue(null);
      await getStudents({ page: 1, pageSize: 10, program: "both" });
      expect(mockPrisma.user.findMany.mock.calls[0][0].where.student.is.AND[0].academicYearSnapshots.some.academicYearId).toBe("__none__");
    });
  });

  describe("getStudentDetail", () => {
    it("returns student detail with thesis info", async () => {
      mockPrisma.studentCplScore.findMany.mockResolvedValue([]);
      mockAcademicYear.getActiveAcademicYear.mockResolvedValue({
        id: "ay-active",
        year: "2025/2026",
        semester: "genap",
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        ...USER,
        student: {
          id: "s1",
          status: "aktif",
          enrollmentYear: 2021,
          sksCompleted: 100,
          thesis: [{
            id: "thesis-1",
            title: "AI Research",
            proposalStatus: "submitted",
            thesisSupervisors: [{ lecturer: { user: { fullName: "Dr. Andi" } }, role: { name: "pembimbing_1" } }],
            thesisMilestones: [],
            thesisGuidances: [],
            thesisSeminars: [],
            thesisDefences: [],
            status: "research",
            academicYear: { id: "ay-thesis", semester: "ganjil", year: "2024/2025" },
          }],
          academicYearSnapshots: [{
            academicYear: { id: "ay-genap", year: "2025/2026", semester: "genap" },
            eligibleResearchMethod: true, takingThesisCourse: false, eligibilitySource: "sia", thesisCourseSource: "devtools", capturedAt: "2026-02-08T00:00:00.000Z",
          }],
        },
      });
      mockPrisma.studentCplScore.findMany.mockResolvedValue([]);
      // Every semester is listed, so the Admin can set a flag SIA did not report.
      mockPrisma.academicYear.findMany.mockResolvedValue([
        { id: "ay-op", year: "2026/2027", semester: "ganjil" },
        { id: "ay-genap", year: "2025/2026", semester: "genap" },
      ]);

      const result = await getStudentDetail("user-1");

      expect(result).toBeDefined();
      expect(result.student.sksCompleted).toBe(100);
      expect(result.student.semesterFlags).toEqual([
        {
          academicYearId: "ay-op", academicYearLabel: "2026/2027 Ganjil", takingResearchMethod: null, takingThesisCourse: null, source: null,
          researchMethodSource: null, thesisCourseSource: null, capturedAt: null,
        },
        {
          academicYearId: "ay-genap", academicYearLabel: "2025/2026 Genap", takingResearchMethod: true, takingThesisCourse: false, source: "devtools",
          researchMethodSource: "sia", thesisCourseSource: "devtools", capturedAt: "2026-02-08T00:00:00.000Z",
        },
      ]);
      expect(result.theses[0]).toMatchObject({
        id: "thesis-1",
        title: "AI Research",
        status: "research",
      });
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
    it("updates SKS and logs the academic change; an unchanged status writes no status change", async () => {
      const auditCreate = vi.fn();
      mockPrisma.student.findUnique.mockResolvedValue({ id: "user-1", status: "active", sksCompleted: 100 });
      mockPrisma.student.update.mockResolvedValue({ id: "user-1", status: "active", sksCompleted: 120 });
      mockPrisma.$transaction.mockImplementation((fn) => fn({ ...mockPrisma, auditLog: { create: auditCreate } }));

      const result = await adminUpdateStudent("user-1", { status: "active", sksCompleted: 120 }, { actorUserId: "admin-1" });

      expect(result).toHaveProperty("sksCompleted", 120);
      expect(mockPrisma.student.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: expect.objectContaining({ sksCompleted: 120 }),
      });
      expect(mockPrisma.student.update.mock.calls[0][0].data).not.toHaveProperty("status");
      expect(auditCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: "STUDENT_ACADEMIC_UPDATED",
          entity: "STUDENT",
          entityId: "user-1",
          userId: "admin-1",
          changes: expect.objectContaining({ oldValues: { sksCompleted: 100 }, newValues: { sksCompleted: 120 } }),
        }),
      });
    });
  });
});

// ══════════════════════════════════════════════════════════════
describe("Module 16: Data Master Dosen", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("getLecturers", () => {
    it("filters by science group in the query", async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);
      await getLecturers({ page: 1, pageSize: 10, scienceGroupId: "sg-1" });
      expect(mockPrisma.user.findMany.mock.calls[0][0].where.AND).toContainEqual({ lecturer: { is: { scienceGroupId: "sg-1" } } });
    });

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
              thesis: { id: "t1", title: "AI", status: "research", student: { user: { fullName: "Budi" } } },
              role: { name: "pembimbing_1" },
            },
          ],
          thesisGuidances: [],
        },
      });

      const result = await getLecturerDetail("user-lec");

      expect(result).toBeDefined();
    });

    it("Penguji Seminar dan Sidang: read from the seminar and defence examiner tables, newest first", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user-lec",
        fullName: "Dr. Andi",
        userHasRoles: [],
        lecturer: { id: "l1", scienceGroup: null, thesisSupervisors: [], thesisGuidances: [] },
      });
      const event = (id, status, date) => ({
        id, status, date: new Date(date), registeredAt: null,
        thesis: { id: `t-${id}`, title: `Judul ${id}`, student: { user: { id: `s-${id}`, fullName: `Mhs ${id}`, identityNumber: `221152${id}` } } },
      });
      mockPrisma.thesisSeminarExaminer.findMany.mockResolvedValueOnce([{ id: "se1", assignedAt: new Date("2026-09-01"), seminar: event("01", "passed", "2026-09-10") }]);
      mockPrisma.thesisDefenceExaminer.findMany.mockResolvedValueOnce([{ id: "de1", assignedAt: new Date("2026-10-01"), defence: event("02", "scheduled", "2026-10-20") }]);

      const result = await getLecturerDetail("user-lec");

      expect(mockPrisma.thesisSeminarExaminer.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { lecturerId: "l1" } }));
      expect(result.examining.map((row) => [row.kind, row.status, row.title, row.student.nim])).toEqual([
        ["defence", "scheduled", "Judul 02", "22115202"],
        ["seminar", "passed", "Judul 01", "22115201"],
      ]);
      expect(result.statistics.examining).toBe(2);
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
      mockPrisma.lecturer.update.mockResolvedValue({ id: "user-lec", scienceGroupId: "sg-1" });

      const result = await adminUpdateLecturer("user-lec", { scienceGroupId: "sg-1" });

      expect(result).toHaveProperty("scienceGroupId", "sg-1");
      expect(mockPrisma.lecturer.update).toHaveBeenCalledWith({
        where: { id: "user-lec" },
        data: { scienceGroupId: "sg-1" },
      });
    });
  });
});

// ══════════════════════════════════════════════════════════════
describe("Module 18: Tahun Ajaran", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (callback) =>
      callback(mockPrisma),
    );
    mockAcademicYear.resolveOperationalAcademicYear.mockResolvedValue(null);
  });

  // ─── Create Academic Year ─────────────────────────────────
  describe("createAcademicYear", () => {
    it("creates academic year with valid dates", async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue(null); // no duplicate
      mockPrisma.academicYear.findUnique.mockResolvedValue(null);
      mockPrisma.academicYear.create.mockResolvedValue({
        id: "ay-new",
        semester: "ganjil",
        year: "2024/2025",
        startDate: new Date("2024-09-01"),
        endDate: new Date("2025-01-31"),
      });

      const result = await createAcademicYear({
        semester: "ganjil",
        year: "2024/2025",
        startDate: "2024-09-01",
        endDate: "2025-01-31",
      });

      expect(result).toHaveProperty("semester", "ganjil");
    });

    it("rejects (400) if startDate is after endDate", async () => {
      await expect(
        createAcademicYear({
          semester: "ganjil",
          year: "2024/2025",
          startDate: "2025-01-31",
          endDate: "2024-09-01",
        })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects (409) if duplicate semester and year", async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue(null);
      mockPrisma.academicYear.findUnique.mockResolvedValue({ id: "existing" });

      await expect(
        createAcademicYear({ semester: "ganjil", year: "2024/2025", startDate: "2024-09-01", endDate: "2025-01-31" })
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it("rejects (409) if the date range overlaps another academic period", async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue({
        id: "ay-overlap",
        year: "2024/2025",
        semester: "ganjil",
      });

      await expect(
        createAcademicYear({
          semester: "genap",
          year: "2024/2025",
          startDate: "2025-01-01",
          endDate: "2025-06-30",
        }),
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(mockPrisma.academicYear.create).not.toHaveBeenCalled();
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
        year: `${now.getFullYear()}/${now.getFullYear() + 1}`,
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

    it("allows repairing a past inactive academic year without activating it", async () => {
      mockPrisma.academicYear.findUnique.mockResolvedValue({
        id: "ay-1",
        semester: "ganjil",
        year: "2020/2021",
        startDate: new Date("2020-01-01"),
        endDate: new Date("2020-06-30"),
      });
      mockPrisma.academicYear.findFirst.mockResolvedValue(null);
      mockPrisma.academicYear.update.mockResolvedValue({
        id: "ay-1",
        semester: "ganjil",
        year: "2020/2021",
        startDate: new Date("2020-01-01"),
        endDate: new Date("2020-06-30"),
      });

      await expect(updateAcademicYear("ay-1", {})).resolves.toMatchObject({
        id: "ay-1",
      });
    });
  });

  // ─── Get Academic Years ───────────────────────────────────
  describe("getAcademicYears", () => {
    it("returns paginated academic years", async () => {
      mockPrisma.academicYear.findMany.mockResolvedValue([{ id: "ay1", semester: "ganjil", year: "2024/2025" }]);
      mockPrisma.academicYear.count.mockResolvedValue(1);

      const result = await getAcademicYears({ page: 1, pageSize: 10 });

      expect(result).toHaveProperty("academicYears");
      expect(result).toHaveProperty("meta");
    });
  });
});
