// src/services/microsoft-auth.service.js
import { ConfidentialClientApplication } from "@azure/msal-node";
import axios from "axios";
import { ENV } from "../config/env.js";
import prisma from "../config/prisma.js";
import jwt from "jsonwebtoken";

const GRAPH_API_BASE = "https://graph.microsoft.com/v1.0";

// MSAL Configuration
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
    // Don't force consent every time - just select account
    prompt: 'select_account',
  };

  return msalClient.getAuthCodeUrl(authCodeUrlParameters);
}

/**
 * Exchange authorization code for tokens
 * @param {string} code - Authorization code from Microsoft
 * @returns {Promise<Object>} Token response with access token and user info
 */
export async function exchangeCodeForTokens(code) {
  const tokenRequest = {
    code,
    scopes: MICROSOFT_SCOPES,
    redirectUri: ENV.REDIRECT_URI,
  };

  try {
    console.log('🔄 Attempting to exchange code for tokens...');
    console.log('📍 Redirect URI:', ENV.REDIRECT_URI);
    
    const response = await msalClient.acquireTokenByCode(tokenRequest);
    
    console.log('✅ Token exchange successful');
    console.log('� Has refresh token:', !!response.refreshToken);
    console.log('�🔄 Fetching user profile from Microsoft Graph...');
    
    // Get user profile from Microsoft Graph
    const userProfile = await getMicrosoftUserProfile(response.accessToken);
    
    console.log('✅ User profile fetched successfully');
    
    // Check calendar access
    const calendarAccess = await checkCalendarAccessWithToken(response.accessToken);
    console.log('📅 Calendar access:', calendarAccess ? 'Yes' : 'No');

    return {
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      idToken: response.idToken,
      userProfile,
      hasCalendarAccess: calendarAccess,
    };
  } catch (error) {
    console.error("❌ Error exchanging code for tokens:");
    console.error("Error type:", error.constructor.name);
    console.error("Error message:", error.message);
    console.error("Error details:", error);
    
    // Log specific MSAL error details
    if (error.errorCode) {
      console.error("MSAL Error Code:", error.errorCode);
      console.error("MSAL Error Message:", error.errorMessage);
    }
    
    const err = new Error(`Failed to authenticate with Microsoft: ${error.message || 'Unknown error'}`);
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
      oauthAccessToken: accessToken,
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
    student: user.student,
    lecturer: user.lecturer,
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
        oauthAccessToken: response.accessToken,
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
