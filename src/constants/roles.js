/**
 * Official Role Names - sesuai dengan data di tabel user_roles
 * JANGAN hardcode role name di tempat lain, selalu import dari sini
 */

export const ROLES = {
  KETUA_DEPARTEMEN: "Ketua Departemen",
  SEKRETARIS_DEPARTEMEN: "Sekretaris Departemen",
  PEMBIMBING_1: "Pembimbing 1",
  PEMBIMBING_2: "Pembimbing 2",
  ADMIN: "Admin",
  PENGUJI: "Penguji",
  MAHASISWA: "Mahasiswa",
  GKM: "GKM",
  KOORDINATOR_METOPEN: "Koordinator Matkul Metopen",
  KOORDINATOR_YUDISIUM: "Koordinator Yudisium",
  TIM_PENGELOLA_CPL: "Tim Pengelola CPL",
};

// Role categories for easy checking
export const SUPERVISOR_ROLES = [ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2];
export const EXAMINER_ROLES = [ROLES.PENGUJI];
export const STUDENT_ROLES = [ROLES.MAHASISWA];
export const ADMIN_ROLES = [ROLES.ADMIN];
export const DEPARTMENT_ROLES = [ROLES.KETUA_DEPARTEMEN, ROLES.SEKRETARIS_DEPARTEMEN, ROLES.GKM];

// All lecturer-related roles (non-student roles that create Lecturer record)
export const LECTURER_ROLES = [
  ROLES.PEMBIMBING_1,
  ROLES.PEMBIMBING_2,
  ROLES.PENGUJI,
  ROLES.KETUA_DEPARTEMEN,
  ROLES.SEKRETARIS_DEPARTEMEN,
  ROLES.GKM,
  ROLES.KOORDINATOR_METOPEN,
  ROLES.KOORDINATOR_YUDISIUM,
  ROLES.TIM_PENGELOLA_CPL,
];

// Helper functions
export function isStudentRole(roleName) {
  return normalize(roleName) === normalize(ROLES.MAHASISWA);
}

export function isLecturerRole(roleName) {
  const normalized = normalize(roleName);
  return LECTURER_ROLES.some(r => normalize(r) === normalized);
}

export function isAdminRole(roleName) {
  return normalize(roleName) === normalize(ROLES.ADMIN);
}

export function isSupervisorRole(roleName) {
  const normalized = normalize(roleName);
  return SUPERVISOR_ROLES.some(r => normalize(r) === normalized);
}

export function isExaminerRole(roleName) {
  const normalized = normalize(roleName);
  return EXAMINER_ROLES.some(r => normalize(r) === normalized);
}

// Notification recipient categories (for FCM data, not DB roles)
export const ROLE_CATEGORY = {
  STUDENT: "student",
  LECTURER: "lecturer",
  ADMIN: "admin",
};

// Normalize role name for comparison
export function normalize(roleName) {
  return String(roleName || "").trim().toLowerCase();
}

// Get role category for calendar/frontend
export function getRoleCategory(roleName) {
  if (isStudentRole(roleName)) return "student";
  if (isLecturerRole(roleName)) return "lecturer";
  if (isAdminRole(roleName)) return "admin";
  return "other";
}

// ── SupervisorRole enum ↔ display-name helpers ────────────────────────
// Prisma SupervisorRole enum values → human-readable display names
export const SUPERVISOR_ROLE_MAP = {
  pembimbing_1: ROLES.PEMBIMBING_1,   // "Pembimbing 1"
  pembimbing_2: ROLES.PEMBIMBING_2,   // "Pembimbing 2"
};

// Reverse: display name (normalised) → enum value
const SUPERVISOR_ROLE_REVERSE = {
  [normalize(ROLES.PEMBIMBING_1)]: "pembimbing_1",
  [normalize(ROLES.PEMBIMBING_2)]: "pembimbing_2",
};

/** Convert Prisma SupervisorRole enum to display name */
export function supervisorRoleDisplayName(enumValue) {
  return SUPERVISOR_ROLE_MAP[enumValue] || enumValue;
}

/** Convert display name to Prisma SupervisorRole enum value */
export function supervisorRoleEnum(displayName) {
  return SUPERVISOR_ROLE_REVERSE[normalize(displayName)] || null;
}

/** Check if supervisorRole (enum or display) means pembimbing 1 */
export function isPembimbing1(roleNameOrEnum) {
  const n = normalize(roleNameOrEnum);
  return n === "pembimbing_1" || n === normalize(ROLES.PEMBIMBING_1);
}

/** Check if supervisorRole (enum or display) means pembimbing 2 */
export function isPembimbing2(roleNameOrEnum) {
  const n = normalize(roleNameOrEnum);
  return n === "pembimbing_2" || n === normalize(ROLES.PEMBIMBING_2);
}

/** Convert array of display names to SupervisorRole enum values for Prisma where */
export function supervisorRoleEnums(displayNames) {
  return displayNames.map(supervisorRoleEnum).filter(Boolean);
}

export default ROLES;
