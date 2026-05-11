import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
  env: {
    CLIENT_ID: "client-id",
    CLIENT_SECRET: "client-secret",
    TENANT_ID: "tenant-id",
    REDIRECT_URI: "http://localhost:3000/auth/microsoft/callback",
    JWT_SECRET: "jwt-secret",
    REFRESH_TOKEN_SECRET: "refresh-secret",
    JWT_EXPIRES_IN: "15m",
    REFRESH_TOKEN_EXPIRES_IN: "7d",
  },
  jwt: {
    sign: vi.fn((_, secret) => (secret === "refresh-secret" ? "jwt-refresh" : "jwt-access")),
  },
  bcrypt: {
    hash: vi.fn().mockResolvedValue("hashed-refresh"),
  },
}));

vi.mock("../../config/prisma.js", () => ({ default: mocks.prisma }));
vi.mock("../../config/env.js", () => ({ ENV: mocks.env }));
vi.mock("jsonwebtoken", () => ({ default: mocks.jwt }));
vi.mock("bcrypt", () => ({ default: mocks.bcrypt }));
vi.mock("axios", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock("@azure/msal-node", () => ({
  ConfidentialClientApplication: vi.fn().mockImplementation(() => ({
    getAuthCodeUrl: vi.fn(),
    acquireTokenByRefreshToken: vi.fn(),
  })),
}));

import { loginOrRegisterWithMicrosoft } from "../../services/microsoft-auth.service.js";

function makeUser(overrides = {}) {
  return {
    id: "user-1",
    fullName: "Ilham",
    email: "ilham_2211522028@fti.unand.ac.id",
    identityNumber: "2211522028",
    identityType: "NIM",
    phoneNumber: null,
    isVerified: true,
    avatarUrl: null,
    userHasRoles: [
      {
        role: { id: "role-1", name: "Mahasiswa" },
        status: "active",
      },
    ],
    student: {
      id: "user-1",
      enrollmentYear: 2022,
      sksCompleted: 120,
      currentSemester: 8,
      status: "active",
      eligibleMetopen: true,
      metopenEligibilitySource: null,
      metopenEligibilityUpdatedAt: null,
      takingThesisCourse: true,
      thesisCourseEnrollmentSource: null,
      thesisCourseEnrollmentUpdatedAt: null,
    },
    lecturer: null,
    ...overrides,
  };
}

describe("microsoft-auth.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses existing oauthId link before email lookup", async () => {
    const linkedUser = makeUser({ email: "old-local-email@fti.unand.ac.id" });
    mocks.prisma.user.findFirst.mockResolvedValue(linkedUser);
    mocks.prisma.user.update
      .mockResolvedValueOnce(linkedUser)
      .mockResolvedValueOnce({});

    const result = await loginOrRegisterWithMicrosoft(
      {
        id: "microsoft-object-id",
        mail: "changed-alias@unand.ac.id",
        userPrincipalName: "changed-alias@unand.ac.id",
        displayName: "Ilham",
      },
      "ms-access",
      "ms-refresh",
      true,
    );

    expect(mocks.prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          oauthProvider: "microsoft",
          oauthId: "microsoft-object-id",
        },
      }),
    );
    expect(mocks.prisma.user.findUnique).not.toHaveBeenCalled();
    expect(result.user.email).toBe("old-local-email@fti.unand.ac.id");
    expect(result.accessToken).toBe("jwt-access");
    expect(result.refreshToken).toBe("jwt-refresh");
  });

  it("falls back to normalized Microsoft email for first-time linking", async () => {
    const user = makeUser();
    mocks.prisma.user.findFirst.mockResolvedValue(null);
    mocks.prisma.user.findUnique.mockResolvedValue(user);
    mocks.prisma.user.update
      .mockResolvedValueOnce(user)
      .mockResolvedValueOnce({});

    await loginOrRegisterWithMicrosoft(
      {
        id: "new-microsoft-object-id",
        mail: " ILHAM_2211522028@FTI.UNAND.AC.ID ",
        userPrincipalName: "ignored@unand.ac.id",
        displayName: "Ilham",
      },
      "ms-access",
      "ms-refresh",
      false,
    );

    expect(mocks.prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: "ilham_2211522028@fti.unand.ac.id" },
      }),
    );
    expect(mocks.prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: user.id },
        data: expect.objectContaining({
          oauthProvider: "microsoft",
          oauthId: "new-microsoft-object-id",
          oauthRefreshToken: "ms-refresh",
        }),
      }),
    );
  });

  it("falls back to identityNumber extracted from Microsoft email aliases", async () => {
    const user = makeUser({
      email: "ilham_2211522028@fti.unand.ac.id",
      identityNumber: "2211522028",
    });
    mocks.prisma.user.findFirst.mockResolvedValue(null);
    mocks.prisma.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(user);
    mocks.prisma.user.update
      .mockResolvedValueOnce(user)
      .mockResolvedValueOnce({});

    const result = await loginOrRegisterWithMicrosoft(
      {
        id: "new-microsoft-object-id",
        mail: "2211522028@student.unand.ac.id",
        userPrincipalName: "2211522028@student.unand.ac.id",
        displayName: "Ilham",
      },
      "ms-access",
      "ms-refresh",
      false,
    );

    expect(mocks.prisma.user.findUnique).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { email: "2211522028@student.unand.ac.id" },
      }),
    );
    expect(mocks.prisma.user.findUnique).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { identityNumber: "2211522028" },
      }),
    );
    expect(result.user.email).toBe("ilham_2211522028@fti.unand.ac.id");
  });
});
