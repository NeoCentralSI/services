// src/services/microsoft-auth.service.js
import { ConfidentialClientApplication } from "@azure/msal-node";
import axios from "axios";
import { ENV } from "../config/env.js";
import prisma from "../config/prisma.js";
import jwt from "jsonwebtoken";

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

const msalClient = new ConfidentialClientApplication(msalConfig);

// Scopes for Microsoft OAuth (including Calendar access)
const MICROSOFT_SCOPES = [
  "user.read",
  "openid",
  "profile",
  "email",
  "Calendars.ReadWrite",
  "offline_access",
];

/**
 * Get Microsoft OAuth authorization URL
 * @returns {string} Authorization URL
 */
export function getMicrosoftAuthUrl() {
  const authCodeUrlParameters = {
    scopes: MICROSOFT_SCOPES,
    redirectUri: ENV.REDIRECT_URI,
    prompt: 'select_account',
  };

  return msalClient.getAuthCodeUrl(authCodeUrlParameters);
}

/**
 * Exchange authorization code for tokens using direct HTTP request
 * This ensures we get the refresh token (MSAL caches it internally and doesn't always return it)
 * @param {string} code - Authorization code from Microsoft
 * @returns {Promise<Object>} Token response with access token, refresh token and user info
 */
export async function exchangeCodeForTokens(code) {
  try {
    console.log('🔄 Attempting to exchange code for tokens (direct HTTP)...');
    console.log('📍 Redirect URI:', ENV.REDIRECT_URI);

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

    console.log('✅ Token exchange successful');
    console.log('🔑 Has access token:', !!access_token);
    console.log('🔄 Has refresh token:', !!refresh_token);
    console.log('🔄 Fetching user profile from Microsoft Graph...');

    // Get user profile from Microsoft Graph
    const userProfile = await getMicrosoftUserProfile(access_token);

    console.log('✅ User profile fetched successfully');

    // Check calendar access
    const calendarAccess = await checkCalendarAccessWithToken(access_token);
    console.log('📅 Calendar access:', calendarAccess ? 'Yes' : 'No');

    return {
      accessToken: access_token,
      refreshToken: refresh_token,
      idToken: id_token,
      userProfile,
      hasCalendarAccess: calendarAccess,
    };
  } catch (error) {
    console.error("❌ Error exchanging code for tokens:");
    console.error("Error type:", error.constructor.name);
    console.error("Error message:", error.message);

    if (error.response) {
      console.error("Response status:", error.response.status);
      console.error("Response data:", error.response.data);
    }

    const err = new Error(`Failed to authenticate with Microsoft: ${error.response?.data?.error_description || error.message || 'Unknown error'}`);
    err.statusCode = 401;
    throw err;
  }
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
    console.error("Error fetching Microsoft user profile:", error);
    const err = new Error("Failed to fetch user profile from Microsoft");
    err.statusCode = 401;
    throw err;
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

  // ✅ DEBUG: Log semua email info dari Microsoft
  console.log('🔍 Microsoft Profile Debug:');
  console.log('  - OAuth ID:', oauthId);
  console.log('  - mail:', mail);
  console.log('  - userPrincipalName:', userPrincipalName);
  console.log('  - displayName:', displayName);
  console.log('  - Full profile:', JSON.stringify(microsoftProfile, null, 2));

  const email = mail || userPrincipalName;

  if (!email) {
    const err = new Error("Email not found in Microsoft account");
    err.statusCode = 401;
    throw err;
  }

  console.log(`📧 Using email for lookup: ${email}`);

  // ✅ CHECK: Apakah user sudah ada di database (by email)
  let user = await prisma.user.findUnique({
    where: { email },
    include: {
      userHasRoles: {
        include: {
          role: true,
        },
      },
      student: true,
      lecturer: true,
    },
  });

  if (!user) {
    // ❌ User BELUM TERDAFTAR - Return error (tidak buat user baru)
    const err = new Error("Akun belum terdaftar. Silakan hubungi admin.");
    err.statusCode = 404;
    throw err;
  }

  // ✅ CHECK: Apakah akun sudah aktif?
  if (!user.isVerified) {
    const err = new Error("Akun belum diaktivasi. Silakan aktivasi akun terlebih dahulu.");
    err.statusCode = 403;
    throw err;
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
    include: {
      userHasRoles: {
        include: {
          role: true,
        },
      },
      student: true,
      lecturer: true,
    },
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

  // Update refresh token in database
  await prisma.user.update({
    where: { id: user.id },
    data: { refreshToken: jwtRefreshToken },
  });

  // Format user response
  const userResponse = {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    identityNumber: user.identityNumber,
    identityType: user.identityType,
    phoneNumber: user.phoneNumber,
    isVerified: user.isVerified,
    roles: user.userHasRoles.map((ur) => ({
      id: ur.role.id,
      name: ur.role.name,
      status: ur.status,
    })),
    student: user.student ? {
      id: user.student.id,
      enrollmentYear: user.student.enrollmentYear,
      sksCompleted: user.student.skscompleted,
      status: user.student.status,
    } : null,
    lecturer: user.lecturer ? {
      id: user.lecturer.id,
      scienceGroup: user.lecturer.scienceGroup?.name || null,
      data: user.lecturer.data,
    } : null,
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
    const err = new Error("Microsoft refresh token not found");
    err.statusCode = 404;
    throw err;
  }

  const silentRequest = {
    refreshToken: user.oauthRefreshToken,
    scopes: ["user.read"],
  };

  try {
    const response = await msalClient.acquireTokenByRefreshToken(silentRequest);

    // Update tokens in database
    await prisma.user.update({
      where: { id: userId },
      data: {
        oauthRefreshToken: response.refreshToken || user.oauthRefreshToken,
      },
    });

    return response.accessToken;
  } catch (error) {
    console.error("Error refreshing Microsoft token:", error);
    const err = new Error("Failed to refresh Microsoft token");
    err.statusCode = 401;
    throw err;
  }
}

/**
 * Login using a raw Microsoft Graph access token (mobile OAuth flow).
 * Called by POST /auth/microsoft/mobile – the mobile app gets an MS token
 * directly via flutter_appauth and sends it here for validation.
 *
 * @param {string} msAccessToken - Microsoft Graph access token from flutter_appauth
 * @returns {Promise<Object>} { accessToken, refreshToken, user }
 */
export async function loginWithMicrosoftToken(msAccessToken) {
  // 1. Validate token by fetching user profile from Microsoft Graph
  const userProfile = await getMicrosoftUserProfile(msAccessToken);

  // 2. Optional calendar access check (non-blocking)
  const hasCalendarAccess = await checkCalendarAccessWithToken(msAccessToken);

  // 3. Reuse existing business logic: find user in DB, issue our JWT
  return loginOrRegisterWithMicrosoft(
    userProfile,
    msAccessToken,
    null,            // no MS refresh token; we store our own JWT refresh token
    hasCalendarAccess
  );
}
