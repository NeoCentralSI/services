// src/controllers/microsoft-auth.controller.js
import {
  getMicrosoftAuthUrl,
  exchangeCodeForTokens,
  loginOrRegisterWithMicrosoft,
  loginWithMicrosoftToken,
} from "../services/microsoft-auth.service.js";

/**
 * Initiate Microsoft OAuth login
 * GET /auth/microsoft/login
 */
export async function initiateLogin(req, res, next) {
  try {
    const isMobile = req.query.platform === 'mobile';
    const authUrl = await getMicrosoftAuthUrl(isMobile);
    res.redirect(authUrl);
  } catch (error) {
    next(error);
  }
}

/**
 * Handle Microsoft OAuth callback
 * GET /auth/microsoft/callback
 */
export async function handleCallback(req, res, next) {
  try {
    const { code, error: oauthError, error_description, state } = req.query;
    // Detect mobile flow: state carries platform=mobile (encoded by getMicrosoftAuthUrl)
    const isMobile = state && Buffer.from(state, 'base64').toString().includes('"platform":"mobile"');

    // Handle OAuth errors dari Microsoft
    if (oauthError) {
      const errorMsg = error_description || oauthError || 'Login failed';
      if (isMobile) return res.redirect(`neocentral://auth?error=${encodeURIComponent(errorMsg)}`);
      const frontendUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/login?error=${encodeURIComponent(errorMsg)}`;
      return res.redirect(frontendUrl);
    }

    if (!code) {
      if (isMobile) return res.redirect(`neocentral://auth?error=${encodeURIComponent('Authorization code is required')}`);
      const frontendUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/login?error=${encodeURIComponent('Authorization code is required')}`;
      return res.redirect(frontendUrl);
    }

    // Exchange code for tokens and get user profile (including calendar access check)
    const { accessToken, refreshToken, userProfile, hasCalendarAccess } = await exchangeCodeForTokens(code);

    // Login or register user with calendar access status
    const result = await loginOrRegisterWithMicrosoft(
      userProfile,
      accessToken,
      refreshToken,
      hasCalendarAccess
    );

    // Base64 encode token data to avoid special characters in URL
    const tokenData = {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
    };
    const encodedTokens = Buffer.from(JSON.stringify(tokenData)).toString('base64');

    if (isMobile) {
      // Mobile: redirect to custom scheme intercepted by flutter_web_auth_2
      return res.redirect(`neocentral://auth?tokens=${encodedTokens}`);
    }

    // Web: redirect to frontend callback
    const frontendUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/auth/microsoft/callback`;
    res.redirect(`${frontendUrl}?tokens=${encodedTokens}`);
  } catch (error) {
    // If account not verified (403)
    if (error.statusCode === 403) {
      if (isMobile) return res.redirect(`neocentral://auth?error=${encodeURIComponent('Akun belum diaktivasi')}`);
      const frontendUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/auth/inactive`;
      return res.redirect(frontendUrl);
    }
    const errorMsg = error.message || 'Authentication failed';
    if (isMobile) return res.redirect(`neocentral://auth?error=${encodeURIComponent(errorMsg)}`);
    const frontendUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/login?error=${encodeURIComponent(errorMsg)}`;
    res.redirect(frontendUrl);
  }
}

/**
 * Mobile Microsoft OAuth login
 * POST /auth/microsoft/mobile
 * Body: { accessToken: string }  – Microsoft Graph access token from flutter_appauth
 */
export async function mobileLogin(req, res, next) {
  try {
    const { accessToken } = req.body;

    if (!accessToken) {
      return res.status(400).json({ message: "accessToken is required" });
    }

    const result = await loginWithMicrosoftToken(accessToken);

    res.json({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
    });
  } catch (error) {
    next(error);
  }
}
