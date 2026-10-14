/**
 * Supervision limits (plan section 10.1, K30). The limits that apply to a decision are the
 * limits of the running period when Kadep/Sekdep set them, otherwise the general limits,
 * otherwise these defaults (K4: warning at 8, maximum 10).
 */
export const DEFAULT_SUPERVISION_LIMITS = Object.freeze({ softLimit: 8, hardLimit: 10 });

/**
 * Load level against the applicable limits. Soft only warns; hard means a new acceptance
 * becomes a "Pengajuan di Atas Kuota" that needs the Head of Department.
 */
export const SUPERVISION_LOAD_LEVEL = Object.freeze({
  AVAILABLE: "available",
  NEAR_LIMIT: "near_limit",
  FULL: "full",
});

/** Where the applicable limits came from. */
export const SUPERVISION_LIMIT_SOURCE = Object.freeze({
  PERIOD: "period",
  GENERAL: "general",
  DEFAULT: "default",
});
