// src/controllers/microsoft-auth.controller.js
import { ENV } from "../config/env.js";
import {
  getMicrosoftAuthUrl,
  loginWithMicrosoftAuthorizationCode,
} from "../services/microsoft-auth.service.js";
import { storeExchangePayload, consumeExchangePayload } from "../services/oauth-exchange.service.js";

const frontendUrl = () => ENV.FRONTEND_URL;

function isDirectMicrosoftAuthorizationCode(code) {
  return typeof code === "string" && code.startsWith("0.");
}

function publicMicrosoftAuthErrorMessage(error) {
  const rawMessage = error?.message || "";
  if (/prisma|invocation|database|column|does not exist/i.test(rawMessage)) {
    return "Sistem autentikasi belum siap. Hubungi admin.";
  }
  return rawMessage || "Authentication failed";
}

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
      return res.redirect(`${frontendUrl()}/login?error=${encodeURIComponent(errorMsg)}`);
    }

    if (!code) {
      return res.redirect(`${frontendUrl()}/login?error=${encodeURIComponent('Authorization code is required')}`);
    }

    const result = await loginWithMicrosoftAuthorizationCode(code);

    const callbackUrl = `${frontendUrl()}/auth/microsoft/callback`;
    const tokenData = {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
      hasCalendarAccess: result.hasCalendarAccess,
    };

    const exchangeCode = await storeExchangePayload(tokenData);
    res.redirect(`${callbackUrl}?code=${encodeURIComponent(exchangeCode)}`);
  } catch (error) {
    // If account not verified (403), redirect to account-inactive page
    if (error.statusCode === 403) {
      return res.redirect(`${frontendUrl()}/auth/inactive`);
    }
    // Redirect ke login dengan error message
    const errorMsg = publicMicrosoftAuthErrorMessage(error);
    res.redirect(`${frontendUrl()}/login?error=${encodeURIComponent(errorMsg)}`);
  }
}

/**
 * Exchange one-shot code for tokens
 * POST /auth/microsoft/exchange
 */
export async function exchangeOauthCode(req, res, next) {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ success: false, message: "Exchange code is required" });
    }

    const payload = await consumeExchangePayload(code);
    if (payload) {
      return res.status(200).json({ success: true, data: payload });
    }

    if (!isDirectMicrosoftAuthorizationCode(code)) {
      return res.status(400).json({
        success: false,
        message: "Exchange code is invalid, expired, or already used",
      });
    }

    const result = await loginWithMicrosoftAuthorizationCode(code);
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}
