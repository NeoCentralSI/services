/**
 * Credential material for the `User` model.
 *
 * These columns must never reach an HTTP response, even on Admin-only routes:
 * one leaked Admin session would otherwise expose every password hash to
 * offline cracking and every refresh-token hash to cross-user session
 * hijacking. Spread this into any Prisma read whose result is serialized back
 * to a client (SIMPTA-FUN-001).
 *
 * Authentication paths that genuinely need `password` or `refreshToken` must
 * read them through their own query without this omit.
 */
export const USER_CREDENTIAL_OMIT = Object.freeze({
  password: true,
  token: true,
  refreshToken: true,
  oauthRefreshToken: true,
});
