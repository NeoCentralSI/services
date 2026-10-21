import { BadRequestError } from "../utils/errors.js";

/**
 * Before the real SIA API exists, SIA_BASE_URL on
 * neocentral.dev is empty, and nothing reads SIA (the scheduled sync, "Sinkronkan data SIA",
 * "Ikuti Data SIA"), so the dummy SIA never overwrites what the Admin entered by hand.
 *
 * The raw environment variable is read on purpose: `config/env.js` replaces an empty
 * SIA_BASE_URL with http://localhost:4000, so `ENV.SIA_BASE_URL` is never empty. `config/env.js`
 * is not changed here. The check holds whatever SIA_MOCK says.
 */
export const SIA_NOT_AVAILABLE_MESSAGE = "Sinkronisasi SIA belum tersedia.";

export function isSiaConfigured(env = process.env) {
  return String(env.SIA_BASE_URL ?? "").trim() !== "";
}

/** Throws a 400 with "Sinkronisasi SIA belum tersedia." when SIA_BASE_URL is empty. */
export function assertSiaConfigured(env = process.env) {
  if (!isSiaConfigured(env)) throw new BadRequestError(SIA_NOT_AVAILABLE_MESSAGE);
}
