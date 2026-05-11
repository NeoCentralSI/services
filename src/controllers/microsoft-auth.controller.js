// src/controllers/microsoft-auth.controller.js
import {
  getMicrosoftAuthUrl,
  exchangeCodeForTokens,
  loginOrRegisterWithMicrosoft,
} from "../services/microsoft-auth.service.js";
import {
  storeExchangePayload,
  consumeExchangePayload,
} from "../services/oauth-exchange.service.js";

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

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

    const { accessToken, refreshToken, userProfile, hasCalendarAccess } =
      await exchangeCodeForTokens(code);

    const result = await loginOrRegisterWithMicrosoft(
      userProfile,
      accessToken,
      refreshToken,
      hasCalendarAccess,
    );

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
      return res.redirect(`${FRONTEND_URL}/account-inactive`);
    }
    const errorMsg = error.message || "Authentication failed";
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
    if (!payload) {
      return res.status(400).json({
        success: false,
        message: "Exchange code is invalid or already used",
      });
    }

    return res.status(200).json({ success: true, data: payload });
  } catch (err) {
    next(err);
  }
}
