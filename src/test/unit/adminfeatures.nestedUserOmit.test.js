import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    student: { findMany: vi.fn() },
    lecturer: { findMany: vi.fn() },
    thesis: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn() },
    userRole: { findMany: vi.fn() },
    thesisStatus: { findMany: vi.fn() },
  },
}));

vi.mock("../../config/prisma.js", () => ({ default: mockPrisma }));
vi.mock("../../config/redis.js", () => ({ default: { on: vi.fn() } }));
vi.mock("../../config/mailer.js", () => ({ sendMail: vi.fn() }));
vi.mock("../../utils/emailTemplate.js", () => ({ accountInviteTemplate: vi.fn() }));
vi.mock("../../utils/password.util.js", () => ({ generatePassword: vi.fn() }));
vi.mock("../../services/push.service.js", () => ({ sendFcmToUsers: vi.fn() }));
vi.mock("../../services/notification.service.js", () => ({
  createNotificationsForUsers: vi.fn(),
}));
vi.mock("../../services/auditLog.service.js", () => ({
  logAudit: vi.fn(),
  listAdminAuditLogs: vi.fn(),
  AUDIT_ACTIONS: {},
  ENTITY_TYPES: {},
}));
vi.mock("../../helpers/academicYear.helper.js", () => ({
  getActiveAcademicYear: vi.fn(),
  resolveOperationalAcademicYear: vi.fn(),
  ensureOperationalAcademicYearWindow: vi.fn(),
}));
vi.mock("../../repositories/adminfeatures.repository.js", () => ({
  getOrCreateRole: vi.fn(),
  findUserByEmailOrIdentity: vi.fn(),
  createUser: vi.fn(),
  addRolesToUser: vi.fn(),
  createStudentForUser: vi.fn(),
  findLecturerByUserId: vi.fn(),
  createLecturerForUser: vi.fn(),
  findRoomsPaginated: vi.fn(),
  findUserById: vi.fn(),
  updateUserById: vi.fn(),
  findRoleByName: vi.fn(),
  getUserRolesWithIds: vi.fn(),
  upsertUserRole: vi.fn(),
  findStudentByUserId: vi.fn(),
  deleteUserRolesByIds: vi.fn(),
}));
vi.mock("bcrypt", () => ({ default: { hash: vi.fn(), compare: vi.fn() } }));
vi.mock("jsonwebtoken", () => ({ default: { sign: vi.fn(), verify: vi.fn() } }));

import { USER_CREDENTIAL_OMIT } from "../../constants/userFields.js";
import {
  getAllLecturersForDropdown,
  getAvailableStudents,
} from "../../services/adminfeatures.service.js";

describe("admin nested User omit (FUN-001)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.student.findMany.mockResolvedValue([{ id: "student-1", user: { id: "user-1" } }]);
    mockPrisma.lecturer.findMany.mockResolvedValue([{ id: "lecturer-1", user: { id: "user-2" } }]);
  });

  it("omits credential columns when listing available students", async () => {
    const rows = await getAvailableStudents();

    expect(mockPrisma.student.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: { user: { omit: USER_CREDENTIAL_OMIT } },
      }),
    );
    expect(JSON.stringify(rows)).not.toMatch(/password|refreshToken/);
  });

  it("omits credential columns when listing lecturers for dropdown", async () => {
    const rows = await getAllLecturersForDropdown();

    expect(mockPrisma.lecturer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: { user: { omit: USER_CREDENTIAL_OMIT }, scienceGroup: true },
      }),
    );
    expect(JSON.stringify(rows)).not.toMatch(/password|refreshToken/);
  });
});
