export const DEFAULT_SUPERVISION_LIMITS = Object.freeze({ semesterQuota: 5, totalLimit: 10 });

/**
 * Load level against both limits. Exceeding either with a new acceptance
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
