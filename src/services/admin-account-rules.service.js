/**
 * Account rules that keep the department reachable by an Admin:
 * 1. an Admin cannot change the roles of their own account, nor deactivate it;
 * 2. at least one active Admin always remains (active = verified account with an active
 *    Admin role);
 * 3. the Admin role is exclusive: an account with it holds no other role.
 * Used by the user form, the user creation and the user import.
 */
import prisma from "../config/prisma.js";
import { isAdminRole, normalize } from "../constants/roles.js";

export const ADMIN_RULE_MESSAGES = Object.freeze({
  SELF_ROLES: "Anda tidak dapat mengubah peran akun Anda sendiri.",
  SELF_DEACTIVATE: "Anda tidak dapat menonaktifkan akun Anda sendiri.",
  LAST_ADMIN: "Harus ada minimal satu Admin aktif. Akun ini adalah Admin aktif terakhir.",
  EXCLUSIVE: "Peran Admin tidak dapat digabung dengan peran lain. Akun Admin hanya memegang peran Admin.",
});

function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

const roleNameOf = (role) => (typeof role === "string" ? role : role?.name ?? role?.role?.name ?? "");

/** Throws when the role set mixes Admin with any other role. */
export function assertAdminRoleExclusive(roles = []) {
  const names = [...new Set(roles.map(roleNameOf).map((name) => normalize(name)).filter(Boolean))];
  if (names.some(isAdminRole) && names.length > 1) throw badRequest(ADMIN_RULE_MESSAGES.EXCLUSIVE);
}

/** True when the role set gives an active Admin role. */
export function hasActiveAdminRole(roles = []) {
  return roles.some((role) => isAdminRole(roleNameOf(role)) && (typeof role === "string" || (role?.status ?? "active") === "active"));
}

/** Verified accounts with an active Admin role, other than `excludeUserId`. */
export async function countOtherActiveAdmins(excludeUserId, client = prisma) {
  return client.user.count({
    where: {
      id: { not: excludeUserId },
      isVerified: true,
      userHasRoles: { some: { status: "active", role: { name: "Admin" } } },
    },
  });
}

const roleSignature = (roles = []) =>
  roles
    .map((role) => `${normalize(roleNameOf(role))}:${typeof role === "string" ? "active" : role?.status ?? "active"}`)
    .filter((item) => !item.startsWith(":"))
    .sort()
    .join("|");

/**
 * Checks an update of a user before anything is written.
 * @param {object} params
 * @param {string} params.actorUserId the Admin who edits
 * @param {object} params.user the edited user, with `isVerified`
 * @param {Array} params.currentRoles current `{ name, status }` roles
 * @param {Array|undefined} params.desiredRoles roles asked for (undefined: unchanged)
 * @param {boolean|undefined} params.isVerified activation asked for (undefined: unchanged)
 */
export async function assertUserUpdateAllowed({ actorUserId, user, currentRoles, desiredRoles, isVerified }, client = prisma) {
  const isSelf = actorUserId && actorUserId === user.id;
  const rolesChange = Array.isArray(desiredRoles) && roleSignature(desiredRoles) !== roleSignature(currentRoles);
  const deactivates = isVerified === false && user.isVerified !== false;

  if (isSelf && rolesChange) throw badRequest(ADMIN_RULE_MESSAGES.SELF_ROLES);
  if (isSelf && deactivates) throw badRequest(ADMIN_RULE_MESSAGES.SELF_DEACTIVATE);
  if (Array.isArray(desiredRoles)) assertAdminRoleExclusive(desiredRoles);

  const isActiveAdminNow = user.isVerified !== false && hasActiveAdminRole(currentRoles);
  const staysActiveAdmin =
    (isVerified ?? user.isVerified) !== false && hasActiveAdminRole(Array.isArray(desiredRoles) ? desiredRoles : currentRoles);
  if (isActiveAdminNow && !staysActiveAdmin && (await countOtherActiveAdmins(user.id, client)) === 0) {
    throw badRequest(ADMIN_RULE_MESSAGES.LAST_ADMIN);
  }
}
