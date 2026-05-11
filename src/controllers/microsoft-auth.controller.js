// src/controllers/microsoft-auth.controller.js
import {
  getMicrosoftAuthUrl,
  loginWithMicrosoftAuthorizationCode,
} from "../services/microsoft-auth.service.js";
import {
  storeExchangePayload,
  consumeExchangePayload,
} from "../services/oauth-exchange.service.js";

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
const ONE_SHOT_CODE_PATTERN = /^[a-f0-9]{64}$/i;
const GENERIC_AUTH_CALLBACK_ERROR = "Sistem autentikasi belum siap. Hubungi admin.";

function getSafeCallbackErrorMessage(error) {
  if (error?.statusCode === 404 && /akun belum terdaftar/i.test(error.message || "")) {
    return error.message;
  }

  if (error?.statusCode === 401) {
    return "Login Microsoft gagal. Silakan coba lagi atau hubungi admin.";
  }

  return GENERIC_AUTH_CALLBACK_ERROR;
}

function logCallbackError(error) {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  console.error("[MicrosoftAuth] Callback failed:", error?.message || error);
  if (error?.stack) {
    console.error(error.stack);
  }
}

/**
 * Initiate Microsoft OAuth login
 * GET /auth/microsoft/login
 */
export async function initiateLogin(req, res, next) {
  try {
    const authUrl = await getMicrosoftAuthUrl();
    res.redirect(authUrl);
  } catch (error) {
    next(error);
  }
}

/**
 * Handle Microsoft OAuth callback
 * GET /auth/microsoft/callback
 *
 * Tidak lagi mengirim token (access + refresh) lewat URL. Sebagai gantinya,
 * server menyimpan payload di Redis (atau in-memory fallback) dengan TTL
 * pendek dan memberi `?code=<exchangeCode>` ke frontend. Frontend kemudian
 * menukar code itu sekali lewat POST /auth/microsoft/exchange.
 */
export async function handleCallback(req, res, next) {
  try {
    const { code, error: oauthError, error_description } = req.query;

    if (oauthError) {
      const errorMsg = error_description || oauthError || "Login failed";
      return res.redirect(`${FRONTEND_URL}/login?error=${encodeURIComponent(errorMsg)}`);
    }

    if (!code) {
      return res.redirect(
        `${FRONTEND_URL}/login?error=${encodeURIComponent("Authorization code is required")}`,
      );
    }

    const result = await loginWithMicrosoftAuthorizationCode(code);

    const exchangeCode = await storeExchangePayload({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
      hasCalendarAccess: result.hasCalendarAccess,
    });

    return res.redirect(
      `${FRONTEND_URL}/auth/microsoft/callback?code=${encodeURIComponent(exchangeCode)}`,
    );
  } catch (error) {
    if (error.statusCode === 403) {
      return res.redirect(`${FRONTEND_URL}/auth/inactive`);
    }
    logCallbackError(error);
    const errorMsg = getSafeCallbackErrorMessage(error);
    res.redirect(`${FRONTEND_URL}/login?error=${encodeURIComponent(errorMsg)}`);
  }
}

/**
 * Exchange the one-shot code for actual tokens.
 * POST /auth/microsoft/exchange  body: { code }
 */
export async function exchangeOauthCode(req, res, next) {
  try {
    const { code } = req.body ?? {};
    if (!code || typeof code !== "string") {
      return res.status(400).json({
        success: false,
        message: "Exchange code is required",
      });
    }

    const payload = await consumeExchangePayload(code);
    if (payload) {
      return res.status(200).json({ success: true, data: payload });
    }

    if (ONE_SHOT_CODE_PATTERN.test(code)) {
      return res.status(400).json({
        success: false,
        message: "Exchange code is invalid, expired, or already used",
      });
    }

    const result = await loginWithMicrosoftAuthorizationCode(code);
    return res.status(200).json({
      success: true,
      data: {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        user: result.user,
        hasCalendarAccess: result.hasCalendarAccess,
      },
    });
  } catch (err) {
    next(err);
  }
}
