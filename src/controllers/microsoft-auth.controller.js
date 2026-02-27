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
    const authUrl = await getMicrosoftAuthUrl();
    // Redirect langsung ke Microsoft login page
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
    const { code, error: oauthError, error_description } = req.query;

    // Handle OAuth errors dari Microsoft
    if (oauthError) {
      const errorMsg = error_description || oauthError || 'Login failed';
      const frontendUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/login?error=${encodeURIComponent(errorMsg)}`;
      return res.redirect(frontendUrl);
    }

    if (!code) {
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

    // Redirect ke frontend callback dengan tokens sebagai query params (base64 encoded)
    const frontendUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/auth/microsoft/callback`;
    const tokenData = {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
      hasCalendarAccess: result.hasCalendarAccess,
    };

    // Base64 encode untuk avoid special characters di URL
    const encodedTokens = Buffer.from(JSON.stringify(tokenData)).toString('base64');

    res.redirect(`${frontendUrl}?tokens=${encodedTokens}`);
  } catch (error) {
    // If account not verified (403), redirect to account-inactive page
    if (error.statusCode === 403) {
      const frontendUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/auth/inactive`;
      return res.redirect(frontendUrl);
    }
    // Redirect ke login dengan error message
    const errorMsg = error.message || 'Authentication failed';
    const frontendUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/login?error=${encodeURIComponent(errorMsg)}`;
    res.redirect(frontendUrl);
  }
}
