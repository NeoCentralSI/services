// src/services/microsoft-auth.service.js
import { ConfidentialClientApplication } from "@azure/msal-node";
import axios from "axios";
import { ENV } from "../config/env.js";
import prisma from "../config/prisma.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { AppError, ForbiddenError, NotFoundError, UnauthorizedError } from "../utils/errors.js";

const GRAPH_API_BASE = "https://graph.microsoft.com/v1.0";
const MICROSOFT_TOKEN_URL = `https://login.microsoftonline.com/${ENV.TENANT_ID}/oauth2/v2.0/token`;

// MSAL Configuration (for auth URL only)
const msalConfig = {
  auth: {
    clientId: ENV.CLIENT_ID,
    authority: `https://login.microsoftonline.com/${ENV.TENANT_ID}`,
    clientSecret: ENV.CLIENT_SECRET,
  },
};

let msalClient = null;

function getMsalClient() {
  if (msalClient) return msalClient;

  if (!ENV.CLIENT_ID || !ENV.CLIENT_SECRET || !ENV.TENANT_ID || !ENV.REDIRECT_URI) {
    throw new AppError(
      "Microsoft OAuth belum dikonfigurasi. Lengkapi CLIENT_ID, CLIENT_SECRET, TENANT_ID, dan REDIRECT_URI di .env",
      503,
    );
  }

  msalClient = new ConfidentialClientApplication(msalConfig);
  return msalClient;
}

// Scopes for Microsoft OAuth (including Calendar access)
const MICROSOFT_SCOPES = [
  "user.read",
  "openid",
  "profile",
  "email",
  "Calendars.ReadWrite",
  "offline_access",
];

const USER_AUTH_INCLUDE = {
  userHasRoles: {
    include: {
      role: true,
    },
  },
  student: true,
  lecturer: {
    include: {
      scienceGroup: true,
    },
  },
};

function extractIdentityNumberFromMicrosoftProfile(profile) {
  const candidates = [
    profile?.mail,
    profile?.userPrincipalName,
    profile?.employeeId,
  ].filter((value) => typeof value === "string");

  for (const value of candidates) {
    const match = value.match(/\d{8,20}/);
    if (match) {
      return match[0];
    }
  }

  return null;
}

async function findUserForMicrosoftLogin({ oauthId, email, identityNumber }) {
  if (oauthId) {
    const linkedUser = await prisma.user.findFirst({
      where: {
        oauthProvider: "microsoft",
        oauthId,
      },
      include: USER_AUTH_INCLUDE,
    });

    if (linkedUser) {
      return linkedUser;
    }
  }

  const userByEmail = await prisma.user.findUnique({
    where: { email },
    include: USER_AUTH_INCLUDE,
  });

  if (userByEmail || !identityNumber) {
    return userByEmail;
  }

  return prisma.user.findUnique({
    where: { identityNumber },
    include: USER_AUTH_INCLUDE,
  });
}

/**
 * Get Microsoft OAuth authorization URL
 * @returns {string} Authorization URL
 */
export function getMicrosoftAuthUrl() {
  const client = getMsalClient();
  const authCodeUrlParameters = {
    scopes: MICROSOFT_SCOPES,
    redirectUri: ENV.REDIRECT_URI,
    prompt: 'select_account',
  };

  return client.getAuthCodeUrl(authCodeUrlParameters);
}

/**
 * Exchange authorization code for tokens using direct HTTP request
 * This ensures we get the refresh token (MSAL caches it internally and doesn't always return it)
 * @param {string} code - Authorization code from Microsoft
 * @returns {Promise<Object>} Token response with access token, refresh token and user info
 */
export async function exchangeCodeForTokens(code) {
  try {
    // Use direct HTTP request to get tokens (this guarantees refresh_token)
    const tokenResponse = await axios.post(
      MICROSOFT_TOKEN_URL,
      new URLSearchParams({
        client_id: ENV.CLIENT_ID,
        client_secret: ENV.CLIENT_SECRET,
        code: code,
        redirect_uri: ENV.REDIRECT_URI,
        grant_type: 'authorization_code',
        scope: MICROSOFT_SCOPES.join(' '),
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const { access_token, refresh_token, id_token } = tokenResponse.data;

    // Get user profile from Microsoft Graph
    const userProfile = await getMicrosoftUserProfile(access_token);

    // Check calendar access
    const calendarAccess = await checkCalendarAccessWithToken(access_token);

    return {
      accessToken: access_token,
      refreshToken: refresh_token,
      idToken: id_token,
      userProfile,
      hasCalendarAccess: calendarAccess,
    };
  } catch (error) {
    const detail = error.response?.data?.error_description || error.message || "Unknown error";
    throw new UnauthorizedError(`Failed to authenticate with Microsoft: ${detail}`);
  }
}

export async function loginWithMicrosoftAuthorizationCode(code) {
  const { accessToken, refreshToken, userProfile, hasCalendarAccess } =
    await exchangeCodeForTokens(code);

  return loginOrRegisterWithMicrosoft(
    userProfile,
    accessToken,
    refreshToken,
    hasCalendarAccess,
  );
}

/**
 * Get user profile from Microsoft Graph API
 * @param {string} accessToken - Microsoft access token
 * @returns {Promise<Object>} User profile data
 */
async function getMicrosoftUserProfile(accessToken) {
  try {
    const response = await axios.get(`${GRAPH_API_BASE}/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    return response.data;
  } catch (error) {
    console.warn("[MicrosoftAuth] User profile fetch failed:", error.response?.status || error.message);
    throw new UnauthorizedError("Failed to fetch user profile from Microsoft");
  }
}

/**
 * Check if the access token has calendar permissions by trying to access calendars
 * @param {string} accessToken - Microsoft access token
 * @returns {Promise<boolean>} True if calendar access is available
 */
async function checkCalendarAccessWithToken(accessToken) {
  try {
    // Try to access user's calendars to verify calendar permission
    await axios.get(`${GRAPH_API_BASE}/me/calendars`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    return true;
  } catch (error) {
    console.log("[MicrosoftAuth] Calendar access check failed:", error.response?.status, error.response?.data?.error?.code);
    return false;
  }
}

/**
 * Login or register user with Microsoft account
 * @param {Object} microsoftProfile - Microsoft user profile
 * @param {string} accessToken - Microsoft access token
 * @param {string} refreshToken - Microsoft refresh token (optional)
 * @param {boolean} hasCalendarAccess - Whether calendar access is granted
 * @returns {Promise<Object>} User data with JWT tokens
 */
export async function loginOrRegisterWithMicrosoft(microsoftProfile, accessToken, refreshToken = null, hasCalendarAccess = false) {
  const { id: oauthId, mail, userPrincipalName, displayName } = microsoftProfile;

  const rawEmail =
    typeof mail === "string"
      ? mail
      : typeof userPrincipalName === "string"
        ? userPrincipalName
        : "";
  const email = rawEmail.trim().toLowerCase();
  const normalizedDisplayName =
    typeof displayName === "string" && displayName.trim()
      ? displayName.trim()
      : email;
  const identityNumber = extractIdentityNumberFromMicrosoftProfile(microsoftProfile);

  if (!email) {
    throw new UnauthorizedError("Email not found in Microsoft account");
  }

  // Login utama memakai oauthId karena Microsoft mail/userPrincipalName bisa
  // berbeda dari email lokal setelah akun pernah terhubung.
  let user = await findUserForMicrosoftLogin({
    oauthId,
    email,
    identityNumber,
  });

  if (!user) {
    // ❌ User BELUM TERDAFTAR - Return error (tidak buat user baru)
    throw new NotFoundError("Akun belum terdaftar. Silakan hubungi admin.");
  }

  // ✅ CHECK: Apakah akun sudah aktif?
  if (!user.isVerified) {
    throw new ForbiddenError("Akun belum diaktivasi. Silakan aktivasi akun terlebih dahulu.");
  }

  // ✅ USER SUDAH ADA & AKTIF - UPDATE dengan OAuth info (tidak buat row baru)
  user = await prisma.user.update({
    where: { id: user.id },
    data: {
      oauthProvider: "microsoft",
      oauthId,
      oauthRefreshToken: refreshToken,
      // Password TETAP ADA (tidak dihapus) untuk fallback/development
      // fullName dan identityNumber tidak diupdate (preserve existing data)
    },
    include: USER_AUTH_INCLUDE,
  });

  // Generate JWT tokens (gunakan 'sub' untuk consistency dengan password login)
  const jwtAccessToken = jwt.sign(
    { sub: user.id, email: user.email },
    ENV.JWT_SECRET,
    { expiresIn: ENV.JWT_EXPIRES_IN }
  );

  const jwtRefreshToken = jwt.sign(
    { sub: user.id, email: user.email },
    ENV.REFRESH_TOKEN_SECRET,
    { expiresIn: ENV.REFRESH_TOKEN_EXPIRES_IN }
  );

  const refreshHash = await bcrypt.hash(jwtRefreshToken, 10);

  // Update refresh token in database
  await prisma.user.update({
    where: { id: user.id },
    data: { refreshToken: refreshHash },
  });

  // Format user response.
  //
  // DTO whitelist eksplisit — tidak meneruskan row Prisma full untuk
  // student/lecturer (sebelumnya bisa membocorkan field internal seperti
  // timestamp audit, FK internal, atau kolom yang tidak relevan untuk klien).
  // Bandingkan dengan `getUserProfile` di auth.service.js yang mengikuti
  // pola DTO yang sama.
  const userResponse = {
    id: user.id,
    fullName: user.fullName || normalizedDisplayName,
    email: user.email,
    identityNumber: user.identityNumber,
    identityType: user.identityType,
    phoneNumber: user.phoneNumber,
    isVerified: user.isVerified,
    avatarUrl: user.avatarUrl ?? null,
    roles: user.userHasRoles.map((ur) => ({
      id: ur.role.id,
      name: ur.role.name,
      status: ur.status,
    })),
    student: user.student
      ? {
          id: user.student.id,
          enrollmentYear: user.student.enrollmentYear ?? null,
          sksCompleted: user.student.sksCompleted ?? 0,
          currentSemester: user.student.currentSemester ?? null,
          status: user.student.status ?? null,
          eligibleMetopen: user.student.eligibleMetopen ?? null,
          metopenEligibilitySource: user.student.metopenEligibilitySource ?? null,
          metopenEligibilityUpdatedAt: user.student.metopenEligibilityUpdatedAt ?? null,
          takingThesisCourse: user.student.takingThesisCourse ?? null,
          thesisCourseEnrollmentSource: user.student.thesisCourseEnrollmentSource ?? null,
          thesisCourseEnrollmentUpdatedAt: user.student.thesisCourseEnrollmentUpdatedAt ?? null,
        }
      : null,
    lecturer: user.lecturer
      ? {
          id: user.lecturer.id,
          scienceGroup: user.lecturer.scienceGroup?.name ?? null,
          data: user.lecturer.data ?? null,
        }
      : null,
  };

  return {
    user: userResponse,
    accessToken: jwtAccessToken,
    refreshToken: jwtRefreshToken,
    hasCalendarAccess,
  };
}

/**
 * Refresh Microsoft access token
 * @param {string} userId - User ID
 * @returns {Promise<string>} New access token
 */
export async function refreshMicrosoftToken(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      oauthRefreshToken: true,
      oauthProvider: true,
    },
  });

  if (!user || user.oauthProvider !== "microsoft" || !user.oauthRefreshToken) {
    throw new NotFoundError("Microsoft refresh token not found");
  }

  const silentRequest = {
    refreshToken: user.oauthRefreshToken,
    scopes: ["user.read"],
  };

  try {
    const client = getMsalClient();
    const response = await client.acquireTokenByRefreshToken(silentRequest);

    // Update tokens in database
    await prisma.user.update({
      where: { id: userId },
      data: {
        oauthRefreshToken: response.refreshToken || user.oauthRefreshToken,
      },
    });

    return response.accessToken;
  } catch (error) {
    console.warn("[MicrosoftAuth] Token refresh failed:", error.message);
    throw new UnauthorizedError("Failed to refresh Microsoft token");
  }
}
