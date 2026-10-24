import csv from "csv-parser";
import { Readable } from "stream";
import path from "path";
import fs from "fs";
import prisma from "../config/prisma.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { ENV } from "../config/env.js";
import { sendMail } from "../config/mailer.js";
import redisClient from "../config/redis.js";
import { accountInviteTemplate } from "../utils/emailTemplate.js";
import { generatePassword } from "../utils/password.util.js";
import { sendFcmToUsers } from "./push.service.js";
import { createNotificationsForUsers } from "./notification.service.js";
import {
	ROLES,
	SUPERVISOR_ROLES,
	LECTURER_ROLES,
	isStudentRole,
	isLecturerRole,
	isAdminRole,
	isSupervisorRole,
	normalize,
} from "../constants/roles.js";
import { USER_CREDENTIAL_OMIT } from "../constants/userFields.js";
import {
	getActiveAcademicYear,
	resolveOperationalAcademicYear,
	ensureOperationalAcademicYearWindow,
	formatAcademicYearLabel,
} from "../helpers/academicYear.helper.js";
import {
	BadRequestError,
	ConflictError,
	NotFoundError,
} from "../utils/errors.js";
import { THESIS_STATUS, OPEN_THESIS_STATUSES, CLOSED_THESIS_STATUSES, isThesisOnLeave } from "../constants/thesisStatus.js";
import { SCHEDULED_GUIDANCE_STATUSES } from "../constants/guidanceStatus.js";
import { createThesisMasterData, updateThesisMasterData } from "./masterDataTa.service.js";
import { THESIS_STATUS_LABELS } from "../constants/thesisLabels.js";
import {
	logAudit,
	listAdminAuditLogs,
	AUDIT_ACTIONS,
	ENTITY_TYPES,
} from "./auditLog.service.js";

export { listAdminAuditLogs };
import { assertAdminRoleExclusive, assertUserUpdateAllowed } from "./admin-account-rules.service.js";
import { applyStudentStatusChange, announceStudentStatusChange } from "./thesisLifecycle.service.js";

import {
	getOrCreateRole,
	findUserByEmailOrIdentity,
	createUser,
	addRolesToUser,
	createStudentForUser,
	findLecturerByUserId,
	createLecturerForUser,
	findRoomsPaginated,
	findUserById,
	updateUserById as repoUpdateUserById,
	findRoleByName,
	getUserRolesWithIds,
	upsertUserRole,
	findStudentByUserId,
	deleteUserRolesByIds,
} from "../repositories/adminfeatures.repository.js";

function clean(v) {
	if (v == null) return "";
	return String(v).replace(/[\u00A0\u200B]/g, " ").trim();
}
function deriveEnrollmentYearFromNIM(nim) {
	const s = String(nim || "").trim();
	if (s.length >= 2) {
		const yy = parseInt(s.slice(0, 2), 10);
		if (!isNaN(yy)) return 2000 + yy;
	}
	return null;
}

function normalizeGpa(value) {
	if (value === null || value === undefined || value === "") return null;
	const parsed = Number(value);
	if (Number.isNaN(parsed)) return null;
	return Math.round(parsed * 100) / 100;
}

function roleAuditSignature(roles = []) {
	return roles
		.map((role) => `${normalize(role?.name || role || "")}:${role?.status || "active"}`)
		.filter((item) => item.startsWith(":") === false && item !== ":active")
		.sort()
		.join("|");
}

export async function adminUpdateUser(id, payload = {}, actor = {}) {
	if (!id) {
		const err = new Error("User id is required");
		err.statusCode = 400;
		throw err;
	}

	const user = await findUserById(id);
	if (!user) {
		const err = new Error("User not found");
		err.statusCode = 404;
		throw err;
	}

	const { fullName, email, roles, identityNumber, identityType, isVerified, gender } = payload || {};

	// Validate: if identityType is NIM (current or new), role must be student only
	const currentIdentityType = String(user.identityType || "").toUpperCase();
	const newIdentityType = String(identityType || currentIdentityType || "").toUpperCase();

	if (newIdentityType === "NIM" && Array.isArray(roles)) {
		const hasNonStudentRole = roles.some((r) => {
			const roleName = typeof r === "string" ? r : r?.name;
			return !isStudentRole(roleName);
		});
		if (hasNonStudentRole) {
			const err = new Error("User dengan identity type NIM hanya dapat memiliki role Mahasiswa");
			err.statusCode = 400;
			throw err;
		}
	}

	// Validate: if identityType is NIP (current or new), cannot have student role
	if (newIdentityType === "NIP" && Array.isArray(roles)) {
		const hasStudentRole = roles.some((r) => {
			const roleName = typeof r === "string" ? r : r?.name;
			return isStudentRole(roleName);
		});
		if (hasStudentRole) {
			const err = new Error("User dengan identity type NIP tidak dapat memiliki role Mahasiswa");
			err.statusCode = 400;
			throw err;
		}
	}

	// Normalized roles asked for (string or { name, status }); undefined keeps the roles.
	const desired = Array.isArray(roles)
		? roles
			.map((r) => (typeof r === "string" ? { name: r, status: undefined } : r && typeof r.name === "string" ? { name: r.name, status: r.status } : null))
			.filter(Boolean)
			.map((x) => ({ name: x.name.trim(), status: x.status }))
			.filter((x) => x.name)
		: undefined;
	const existingRoles = await getUserRolesWithIds(id);
	const currentRoles = existingRoles.map((ur) => ({ name: ur.role?.name ?? "", status: ur.status ?? "active" }));
	await assertUserUpdateAllowed({
		actorUserId: actor.actorUserId ?? null,
		user,
		currentRoles,
		desiredRoles: desired?.map((x) => {
			const current = currentRoles.find((r) => normalize(r.name) === normalize(x.name));
			return { name: x.name, status: x.status || current?.status || "active" };
		}),
		isVerified: typeof isVerified === "boolean" ? isVerified : undefined,
	});

	// Prepare update data
	const updateData = {};
	if (typeof fullName === "string" && fullName.trim()) updateData.fullName = fullName.trim();
	if (typeof email === "string" && email.trim()) updateData.email = email.trim().toLowerCase();
	if (typeof identityNumber === "string" && identityNumber.trim()) updateData.identityNumber = identityNumber.trim();
	if (typeof identityType === "string") updateData.identityType = identityType;
	if (typeof isVerified === "boolean") updateData.isVerified = isVerified;
	if (gender !== undefined) updateData.gender = gender;

	const profileFields = ["fullName", "email", "identityNumber", "identityType", "gender"];
	const profileBefore = Object.fromEntries(profileFields.map((k) => [k, user[k] ?? null]));
	if (Object.keys(updateData).length) {
		try {
			await repoUpdateUserById(id, updateData);
		} catch (e) {
			// Handle unique constraint errors gracefully
			if (e && e.code === "P2002") {
				const err = new Error("Email or identity number already in use");
				err.statusCode = 409;
				throw err;
			}
			throw e;
		}
	}

	// Profile and activation changes in the activity log.
	const profileChanged = profileFields.filter((k) => k in updateData && (updateData[k] ?? null) !== profileBefore[k]);
	if (profileChanged.length) {
		await logAudit({
			actorUserId: actor.actorUserId ?? null,
			action: AUDIT_ACTIONS.USER_UPDATED,
			entityType: ENTITY_TYPES.USER,
			entityId: id,
			oldValues: Object.fromEntries(profileChanged.map((k) => [k, profileBefore[k]])),
			newValues: Object.fromEntries(profileChanged.map((k) => [k, updateData[k] ?? null])),
			ipAddress: actor.ipAddress ?? null,
			userAgent: actor.userAgent ?? null,
		});
	}
	if ("isVerified" in updateData && updateData.isVerified !== user.isVerified) {
		await logAudit({
			actorUserId: actor.actorUserId ?? null,
			action: AUDIT_ACTIONS.USER_ACTIVATION_CHANGED,
			entityType: ENTITY_TYPES.USER,
			entityId: id,
			oldValues: { isVerified: user.isVerified },
			newValues: { isVerified: updateData.isVerified },
			ipAddress: actor.ipAddress ?? null,
			userAgent: actor.userAgent ?? null,
		});
	}

	// Update roles if provided: the list is the full role set (Admin included).
	if (desired) {
		const desiredClean = desired.map((x) => ({ name: x.name.toLowerCase(), status: x.status }));
		const existing = existingRoles;
		const existingByRoleId = new Map(existing.map((ur) => [ur.roleId, ur]));
		const existingByName = new Map(existing.map((ur) => [normalize(ur.role?.name || ""), ur]));

		// Build set of desired role IDs
		const desiredRoleIds = new Set();
		for (const item of desiredClean) {
			let role = await findRoleByName(item.name);
			if (!role) role = await getOrCreateRole(item.name);
			desiredRoleIds.add(role.id);
			const current = existingByRoleId.get(role.id) || existingByName.get(item.name);
			const status = item.status || current?.status || "active";
			// Upsert and update status when provided
			await upsertUserRole(id, role.id, status);
		}

		// Remove roles that are no longer desired
		const rolesToRemove = [];
		for (const ur of existing) {
			if (!desiredRoleIds.has(ur.roleId)) {
				rolesToRemove.push(ur.roleId);
			}
		}
		if (rolesToRemove.length > 0) {
			await deleteUserRolesByIds(id, rolesToRemove);
		}

		const updatedRoles = await getUserRolesWithIds(id);
		const oldSignature = roleAuditSignature(existing.map((ur) => ({ name: ur.role?.name, status: ur.status })));
		const newSignature = roleAuditSignature(updatedRoles.map((ur) => ({ name: ur.role?.name, status: ur.status })));
		if (oldSignature !== newSignature) {
			await logAudit({
				actorUserId: actor.actorUserId ?? null,
				action: AUDIT_ACTIONS.USER_ROLES_UPDATED,
				entityType: ENTITY_TYPES.USER,
				entityId: id,
				oldValues: {
					roles: existing.map((ur) => ({ name: ur.role?.name ?? null, status: ur.status ?? null })),
				},
				newValues: {
					roles: updatedRoles.map((ur) => ({ name: ur.role?.name ?? null, status: ur.status ?? null })),
				},
				ipAddress: actor.ipAddress ?? null,
				userAgent: actor.userAgent ?? null,
			});
		}
	}

	// Ensure Student/Lecturer records when relevant
	const latest = await findUserById(id);
	const latestRoles = await getUserRolesWithIds(id);
	const roleNames = latestRoles.map((r) => r.role?.name || "");
	const type = (latest?.identityType || identityType || "").toString();

	// Student
	if (roleNames.some(isStudentRole) || type === "NIM") {
		const existingStudent = await findStudentByUserId(id);
		if (!existingStudent) {
			const enrollmentYear = deriveEnrollmentYearFromNIM(latest?.identityNumber || identityNumber);
			await createStudentForUser({ userId: id, enrollmentYear, sksCompleted: 0 });
		}
	}

	// Lecturer
	if (roleNames.some(isLecturerRole) || type === "NIP") {
		const existingLect = await findLecturerByUserId(id);
		if (!existingLect) {
			await createLecturerForUser({ userId: id });
		}
	}

	// Return user with roles for client convenience
	const result = await prisma.user.findUnique({
		where: { id },
		omit: USER_CREDENTIAL_OMIT,
		include: {
			userHasRoles: { include: { role: true } },
			student: true,
			lecturer: true,
		},
	});
	return result;
}

// Admin - Create user and assign roles, plus invite email
export async function adminCreateUser({ fullName, email, roles = [], identityNumber, identityType, gender }, actor = {}) {
	// Validate
	if (!email) {
		const err = new Error("Email is required");
		err.statusCode = 400;
		throw err;
	}

	// Validate: if identityType is NIM, role must be student only
	if (String(identityType || "").toUpperCase() === "NIM") {
		const hasNonStudentRole = roles.some((r) => !isStudentRole(r));
		if (hasNonStudentRole || roles.length === 0) {
			const err = new Error("User dengan identity type NIM hanya dapat memiliki role Mahasiswa");
			err.statusCode = 400;
			throw err;
		}
	}

	// Validate: if identityType is NIP, cannot have student role
	if (String(identityType || "").toUpperCase() === "NIP") {
		const hasStudentRole = roles.some((r) => isStudentRole(r));
		if (hasStudentRole) {
			const err = new Error("User dengan identity type NIP tidak dapat memiliki role Mahasiswa");
			err.statusCode = 400;
			throw err;
		}
	}
	assertAdminRoleExclusive(roles);

	const existing = await findUserByEmailOrIdentity(String(email).toLowerCase(), identityNumber);
	if (existing) {
		const err = new Error("User already exists");
		err.statusCode = 409;
		throw err;
	}

	const plainPassword = generatePassword(12);
	const hash = await bcrypt.hash(plainPassword, 10);
	const user = await createUser({
		fullName: fullName || "",
		email: String(email).toLowerCase(),
		password: hash,
		identityNumber: identityNumber || undefined,
		identityType: identityType || undefined,
		isVerified: false,
		gender: gender ?? null,
	});

	// Roles: any role; Admin only on its own (checked above).
	const uniqueRoles = [...new Set(Array.isArray(roles) ? roles : [])];
	for (const rn of uniqueRoles) {
		const role = await getOrCreateRole(rn);
		await addRolesToUser(user.id, [role.id]); // idempotent via skipDuplicates
	}

	// If role 'Mahasiswa' is assigned, ensure Student record exists
	if (uniqueRoles.some((r) => isStudentRole(r))) {
		const existingStudent = await prisma.student.findUnique({ where: { id: user.id } });
		if (!existingStudent) {
			const enrollmentYear = identityNumber ? deriveEnrollmentYearFromNIM(identityNumber) : null;
			await createStudentForUser({ userId: user.id, status: "active", enrollmentYear, sksCompleted: 0 });
		}
	}

	// If identityType is NIP OR lecturer-related role is assigned, ensure Lecturer record exists
	const hasLecturerRole = uniqueRoles.some((r) => isLecturerRole(r));
	const isLecturerIdentity = String(identityType || "").toUpperCase() === "NIP";
	if (hasLecturerRole || isLecturerIdentity) {
		const existingLect = await findLecturerByUserId(user.id);
		if (!existingLect) await createLecturerForUser({ userId: user.id });
	}

	// Send invitation email with verification link
	try {
		if (!redisClient.isOpen) await redisClient.connect();
		const tokenPayload = { sub: user.id, purpose: "verify" };
		const token = jwt.sign(tokenPayload, ENV.JWT_SECRET, { expiresIn: "7d" });
		const key = `verify:${user.id}`;
		await redisClient.setEx(key, 7 * 24 * 3600, "1");
		const baseUrl = (ENV.BASE_URL || "").replace(/\/$/, "");
		const verifyUrl = `${baseUrl}/auth/verify?token=${encodeURIComponent(token)}`;
		const html = accountInviteTemplate({ appName: ENV.APP_NAME, fullName: user.fullName, email: user.email, temporaryPassword: plainPassword, verifyUrl });
		await sendMail({ to: user.email, subject: `${ENV.APP_NAME || "App"} - Account Invitation`, html });
	} catch (e) {
		console.error("âœ‰ï¸ Failed to send verification email:", e?.message || e);
	}

	await logAudit({
		actorUserId: actor.actorUserId ?? null,
		action: AUDIT_ACTIONS.USER_CREATED,
		entityType: ENTITY_TYPES.USER,
		entityId: user.id,
		newValues: { email: user.email, roles: uniqueRoles },
		ipAddress: actor.ipAddress ?? null,
		userAgent: actor.userAgent ?? null,
	});

	return { id: user.id, email: user.email, roles: uniqueRoles };
}
export function normalizeStudentStatus(val) {
	const s = String(val || "").trim().toLowerCase();
	const valid = ["active", "bss", "lulus", "mengundurkan_diri", "dropout"];
	if (valid.includes(s)) return s;
	if (s === "aktif" || s === "active") return "active";
	if (s === "lulus" || s === "lulusan") return "lulus";
	if (s === "cuti" || s === "bss" || s === "cuti (bss)") return "bss";
	if (s === "dropout" || s === "drop out" || s === "do" || s === "keluar") return "dropout";
	if (s === "mengundurkan diri" || s === "undur diri" || s === "mengundurkan_diri") return "mengundurkan_diri";
	// Empty means active; an unknown value is refused by the import (null).
	return s ? null : "active";
}

export function normalizeRoleInputName(name) {
	const raw = String(name || "").trim();
	const lower = raw.toLowerCase();
	if (lower === "mahasiswa" || lower === "mhs" || lower === "student") return [ROLES.MAHASISWA];
	if (lower === "dosen" || lower === "lecturer") return [ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2, ROLES.PENGUJI];
	if (lower === "dosen pembimbing" || lower === "pembimbing") return [ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2];
	if (lower === "dosen penguji" || lower === "penguji") return [ROLES.PENGUJI];
	if (lower === "pembimbing 1" || lower === "pembimbing1") return [ROLES.PEMBIMBING_1];
	if (lower === "pembimbing 2" || lower === "pembimbing2") return [ROLES.PEMBIMBING_2];
	if (lower === "ketua departemen" || lower === "kadep") return [ROLES.KETUA_DEPARTEMEN];
	if (lower === "sekretaris departemen" || lower === "sekdep") return [ROLES.SEKRETARIS_DEPARTEMEN];
	if (lower === "gkm") return [ROLES.GKM];
	if (lower === "admin") return [ROLES.ADMIN];
	// The stored role value keeps the old name; the import also accepts the UI label.
	if (["koordinator matkul metopen", "koordinator metopen", "koordinator metode penelitian"].includes(lower)) return [ROLES.KOORDINATOR_METODE_PENELITIAN];
	if (lower === "koordinator yudisium") return [ROLES.KOORDINATOR_YUDISIUM];
	if (lower === "tim pengelola cpl" || lower === "pengelola cpl") return [ROLES.TIM_PENGELOLA_CPL];
	return [raw];
}

/** An imported row may not give an Admin account another role, nor Admin to another account. */
async function assertImportRolesAllowed(existingUserId, roleNames) {
	const current = existingUserId ? await getUserRolesWithIds(existingUserId) : [];
	assertAdminRoleExclusive([...current.map((ur) => ur.role?.name ?? ""), ...roleNames]);
}

/** One activity log entry per import, with its row counts. */
async function logImport(kind, results, actor = {}) {
	await logAudit({
		actorUserId: actor.actorUserId ?? null,
		action: AUDIT_ACTIONS.USERS_IMPORTED,
		entityType: ENTITY_TYPES.USER,
		newValues: { kind, created: results.success ?? results.created ?? 0, updated: results.updated ?? 0, failed: results.failed ?? 0 },
		ipAddress: actor.ipAddress ?? null,
		userAgent: actor.userAgent ?? null,
	});
}

export async function processImportUserRows(rows, actor = {}) {
	const results = { success: 0, updated: 0, failed: 0, errors: [] };

	for (let i = 0; i < rows.length; i++) {
		const row = rows[i];
		const rowNum = i + 2;
		try {
			const email = clean(row.email).toLowerCase();
			const fullName = clean(row.fullName);
			const identityNumber = clean(row.identityNumber);
			const rolesStr = clean(row.role);
			const rawStudentStatus = clean(row.studentStatus);
			const rawSksCompleted = clean(row.sksCompleted);
			let identityType = clean(row.identityType).toUpperCase();

			if (!email) throw new Error("Email wajib diisi");

			// Parse multiple comma or semicolon separated roles
			const roleNames = rolesStr
				? rolesStr.split(/[,;]/).flatMap((s) => normalizeRoleInputName(s.trim())).filter(Boolean)
				: [];

			// Auto derive identityType if missing
			if (!identityType || identityType === "OTHER") {
				if (roleNames.some((r) => isStudentRole(r)) || (/^\d{6,12}$/.test(identityNumber) && !roleNames.some(isLecturerRole))) {
					identityType = "NIM";
				} else if (roleNames.some((r) => isLecturerRole(r)) || /^\d{16,18}$/.test(identityNumber)) {
					identityType = "NIP";
				} else if (identityNumber) {
					identityType = identityNumber.length <= 12 ? "NIM" : "NIP";
				} else {
					identityType = "OTHER";
				}
			}

			// If roles is empty, provide sensible default
			if (roleNames.length === 0) {
				if (identityType === "NIM") roleNames.push(ROLES.MAHASISWA);
				else if (identityType === "NIP") {
					roleNames.push(ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2, ROLES.PENGUJI);
				}
			}

			const existingUser = await findUserByEmailOrIdentity(email, identityNumber);
			await assertImportRolesAllowed(existingUser?.id ?? null, roleNames);
			let user;
			if (existingUser) {
				user = await prisma.user.update({
					where: { id: existingUser.id },
					data: {
						fullName: fullName || existingUser.fullName,
						identityNumber: identityNumber || existingUser.identityNumber,
						identityType: identityType || existingUser.identityType,
					},
				});
				results.updated++;
			} else {
				const plainPassword = generatePassword(12);
				const hash = await bcrypt.hash(plainPassword, 10);
				user = await prisma.user.create({
					data: {
						fullName: fullName || "",
						email,
						password: hash,
						identityNumber: identityNumber || null,
						identityType,
						isVerified: true,
					},
				});
				results.success++;
			}

			// Sync roles (support multiple roles)
			for (const rn of roleNames) {
				const role = await getOrCreateRole(rn);
				await upsertUserRole(user.id, role.id, "active");
			}

			// Handle Student / Lecturer profile record
			const hasStudent = roleNames.some((r) => isStudentRole(r)) || identityType === "NIM";
			const hasLecturer = roleNames.some((r) => isLecturerRole(r)) || identityType === "NIP";

			if (hasStudent) {
				const studentStatus = normalizeStudentStatus(rawStudentStatus);
				if (!studentStatus) throw new Error(`Status mahasiswa "${rawStudentStatus}" tidak dikenal`);
				const enrollmentYear = identityNumber ? deriveEnrollmentYearFromNIM(identityNumber) : null;
				const parsedSksCompleted = Number.parseInt(rawSksCompleted, 10);
				const sksCompleted =
					Number.isInteger(parsedSksCompleted) && parsedSksCompleted >= 0
						? parsedSksCompleted
						: 0;
				const existingStudent = await prisma.student.findUnique({ where: { id: user.id }, select: { id: true } });
				if (!existingStudent) {
					await prisma.student.create({ data: { id: user.id, enrollmentYear, status: studentStatus, sksCompleted } });
				} else {
					await prisma.student.update({
						where: { id: user.id },
						data: {
							...(enrollmentYear ? { enrollmentYear } : {}),
							...(rawSksCompleted ? { sksCompleted } : {}),
						},
					});
					// An empty cell keeps the status; a change goes through the thesis lifecycle.
					if (rawStudentStatus) {
						const change = await prisma.$transaction((tx) =>
							applyStudentStatusChange(tx, user.id, studentStatus, { actorUserId: actor.actorUserId ?? null, source: "import" }),
						);
						await announceStudentStatusChange(change);
					}
				}
			}

			if (hasLecturer) {
				await prisma.lecturer.upsert({
					where: { id: user.id },
					create: { id: user.id, acceptingRequests: true },
					update: {},
				});
			}
		} catch (err) {
			results.failed++;
			results.errors.push(`Baris ${rowNum}: ${err.message}`);
		}
	}

	await logImport("users", results, actor);
	return {
		created: results.success,
		updated: results.updated,
		failed: results.failed,
		errors: results.errors,
		summary: {
			created: results.success,
			updated: results.updated,
			failed: results.failed,
		},
	};
}

export async function importStudentsCsvFromUpload(fileBuffer, actor = {}) {
	if (!fileBuffer || !fileBuffer.length) {
		const err = new Error("CSV file is required");
		err.statusCode = 400;
		throw err;
	}

	function detectSeparator(buf) {
		try {
			const text = buf.toString("utf8");
			const firstLine = text.split(/\r?\n/).find((l) => l && l.trim().length > 0) || "";
			const commas = (firstLine.match(/,/g) || []).length;
			const semicolons = (firstLine.match(/;/g) || []).length;
			return semicolons > commas ? ";" : ",";
		} catch {
			return ",";
		}
	}

	const sep = detectSeparator(fileBuffer);

	const rows = await new Promise((resolve, reject) => {
		const out = [];
		const stream = Readable.from(fileBuffer);
		stream
			.pipe(csv({ separator: sep }))
			.on("data", (data) => {
				// Normalize keys (strip BOM, lowercase, trim)
				const norm = {};
				for (const k of Object.keys(data)) {
					const nk = String(k).replace(/^\ufeff/, "").trim().toLowerCase();
					norm[nk] = data[k];
				}
				out.push({
					identityNumber: clean(norm.nim || norm.nip || norm.identity_number || norm.identitas || norm["nim/nip"] || ""),
					fullName: clean(norm.nama || norm.name || norm.fullname || norm["nama lengkap"] || ""),
					email: clean(norm.email || "").toLowerCase(),
					role: clean(norm.role || norm.roles || norm.peran || ""),
					studentStatus: clean(norm.student_status || norm.status || norm["status mahasiswa"] || norm["status_mahasiswa"] || ""),
					sksCompleted: clean(norm.sks_completed || norm["sks completed"] || norm.sks || ""),
					identityType: clean(norm.identity_type || norm.tipe_identitas || norm["tipe identitas"] || ""),
				});
			})
			.on("end", () => resolve(out))
			.on("error", (err) => reject(err));
	});

	return processImportUserRows(rows, actor);
}

const ACADEMIC_YEAR_FORMAT = /^\d{4}\/\d{4}$/;

function normalizeAcademicYearPayload({ semester, year, startDate, endDate }) {
	if (!ACADEMIC_YEAR_FORMAT.test(String(year ?? ""))) {
		throw new BadRequestError("Format tahun ajaran harus YYYY/YYYY, contoh 2025/2026");
	}
	if (!["ganjil", "genap"].includes(semester)) {
		throw new BadRequestError("Semester harus ganjil atau genap");
	}

	const parsedStart = new Date(startDate);
	const parsedEnd = new Date(endDate);
	if (Number.isNaN(parsedStart.getTime()) || Number.isNaN(parsedEnd.getTime())) {
		throw new BadRequestError("Tanggal mulai dan selesai tahun akademik wajib valid");
	}
	if (parsedStart > parsedEnd) {
		throw new BadRequestError("Tanggal selesai harus setelah atau sama dengan tanggal mulai");
	}

	return {
		semester,
		year: String(year),
		startDate: parsedStart,
		endDate: parsedEnd,
	};
}

async function assertAcademicYearDoesNotOverlap(client, { id = null, startDate, endDate }) {
	const overlap = await client.academicYear.findFirst({
		where: {
			...(id ? { id: { not: id } } : {}),
			startDate: { lte: endDate },
			endDate: { gte: startDate },
		},
		select: { id: true, year: true, semester: true, startDate: true, endDate: true },
	});
	if (overlap) {
		throw new ConflictError(
			`Rentang tanggal overlap dengan ${overlap.year} ${overlap.semester}. ` +
			"Setiap waktu hanya boleh dimiliki satu periode akademik.",
		);
	}
}

// Create Academic Year (Admin)
export async function createAcademicYear(payload, actor = {}) {
	const data = normalizeAcademicYearPayload(payload);

	const created = await prisma.$transaction(async (tx) => {
		await assertAcademicYearDoesNotOverlap(tx, data);
		const duplicate = await tx.academicYear.findUnique({
			where: {
				year_semester: {
					year: data.year,
					semester: data.semester,
				},
			},
			select: { id: true },
		});
		if (duplicate) {
			throw new ConflictError("Tahun akademik untuk semester tersebut sudah ada");
		}

		return tx.academicYear.create({ data });
	}, { isolationLevel: "Serializable" });

	await logAudit({
		actorUserId: actor.actorUserId ?? null,
		action: AUDIT_ACTIONS.ACADEMIC_YEAR_CREATED,
		entityType: ENTITY_TYPES.ACADEMIC_YEAR,
		entityId: created.id,
		newValues: {
			year: created.year,
			semester: created.semester,
			startDate: created.startDate,
			endDate: created.endDate,
		},
		ipAddress: actor.ipAddress ?? null,
		userAgent: actor.userAgent ?? null,
	});

	return created;
}

export async function updateAcademicYear(id, patch = {}, actor = {}) {
	if (!id) throw new BadRequestError("Academic year id wajib diisi");

	const updated = await prisma.$transaction(async (tx) => {
		const existing = await tx.academicYear.findUnique({ where: { id } });
		if (!existing) throw new NotFoundError("Tahun akademik tidak ditemukan");

		const merged = normalizeAcademicYearPayload({
			semester: patch.semester ?? existing.semester,
			year: patch.year ?? existing.year,
			startDate: patch.startDate ?? existing.startDate,
			endDate: patch.endDate ?? existing.endDate,
		});
		await assertAcademicYearDoesNotOverlap(tx, { id, ...merged });

		const duplicate = await tx.academicYear.findFirst({
			where: {
				id: { not: id },
				year: merged.year,
				semester: merged.semester,
			},
			select: { id: true },
		});
		if (duplicate) {
			throw new ConflictError("Tahun akademik untuk semester tersebut sudah ada");
		}

		const row = await tx.academicYear.update({
			where: { id },
			data: merged,
		});
		return { existing, row };
	}, { isolationLevel: "Serializable" });

	await logAudit({
		actorUserId: actor.actorUserId ?? null,
		action: AUDIT_ACTIONS.ACADEMIC_YEAR_UPDATED,
		entityType: ENTITY_TYPES.ACADEMIC_YEAR,
		entityId: id,
		oldValues: {
			year: updated.existing.year,
			semester: updated.existing.semester,
			startDate: updated.existing.startDate,
			endDate: updated.existing.endDate,
			isActive: updated.existing.isActive,
		},
		newValues: {
			year: updated.row.year,
			semester: updated.row.semester,
			startDate: updated.row.startDate,
			endDate: updated.row.endDate,
			isActive: updated.row.isActive,
		},
		ipAddress: actor.ipAddress ?? null,
		userAgent: actor.userAgent ?? null,
	});

	return updated.row;
}

// Re-export getActiveAcademicYear from helper for API controller
export {
	getActiveAcademicYear,
	resolveOperationalAcademicYear,
	ensureOperationalAcademicYearWindow,
};

/**
 * Operational year for admin/UAT surfaces.
 * Uses date window first, then DB flag fallback (same as quota catalog).
 */
export async function getOperationalAcademicYear() {
	return resolveOperationalAcademicYear();
}

// Get all Academic Years with pagination
// isActive is computed from date window (shared helper) so Admin Master Data
// and Kuota Bimbingan agree with resolveOperationalAcademicYear.
export async function getAcademicYears({ page = 1, pageSize = 10, search = "" } = {}) {
	const skip = (page - 1) * pageSize;
	const take = pageSize;

	const where = search
		? {
			OR: [
				{ year: { contains: search } },
				{ semester: { contains: search } },
			].filter((condition) => condition.year !== undefined || condition.semester !== undefined),
		}
		: {};

	const [academicYears, total, operational] = await Promise.all([
		prisma.academicYear.findMany({
			where,
			skip,
			take,
			orderBy: [{ year: "desc" }, { semester: "desc" }, { createdAt: "desc" }],
		}),
		prisma.academicYear.count({ where }),
		resolveOperationalAcademicYear(),
	]);

	const academicYearsWithStatus = academicYears.map((ay) => {
		return { ...ay, isActive: ay.id === operational?.id };
	});

	return {
		academicYears: academicYearsWithStatus,
		meta: {
			page,
			pageSize,
			total,
			totalPages: Math.ceil(total / pageSize),
		},
	};
}

// ==================== Room (Admin) ====================

function mapRoomRow(room) {
	const relationCount =
		room._count.internshipSeminars +
		room._count.thesisSeminars +
		room._count.thesisDefences +
		room._count.yudisiums;

	return {
		id: room.id,
		name: room.name,
		location: room.location,
		capacity: room.capacity,
		relationCount,
		createdAt: room.createdAt,
		updatedAt: room.updatedAt,
		canDelete: relationCount === 0,
	};
}

/**
 * @param {{ page?: number; limit?: number; pageSize?: number; search?: string; status?: string }} params
 * status: all | available | in_use — "available" = no scheduling relations; "in_use" = has at least one.
 */
export async function getRooms({ page = 1, limit: limitArg, pageSize, search = "", status = "all" } = {}) {
	const limit = parseInt(String(limitArg ?? pageSize ?? 10), 10) || 10;
	const parsedPage = parseInt(String(page), 10) || 1;
	const normalizedStatus = ["all", "available", "in_use"].includes(status) ? status : "all";

	const { rooms, total } = await findRoomsPaginated({
		status: normalizedStatus,
		search: String(search || "").trim(),
		page: parsedPage,
		limit,
	});

	return {
		data: rooms.map(mapRoomRow),
		total,
	};
}

export async function createRoom({ name, location, capacity }) {
	if (!name || !String(name).trim()) {
		const err = new Error("Nama ruangan wajib diisi");
		err.statusCode = 400;
		throw err;
	}

	const normalizedName = String(name).trim();
	const normalizedLocation = typeof location === "string" && location.trim() ? location.trim() : null;
	const normalizedCapacity = Number.isInteger(capacity) ? capacity : null;

	if (normalizedCapacity !== null && normalizedCapacity <= 0) {
		const err = new Error("Kapasitas harus lebih dari 0");
		err.statusCode = 400;
		throw err;
	}

	const existing = await prisma.room.findFirst({
		where: {
			name: normalizedName,
			location: normalizedLocation,
		},
	});

	if (existing) {
		const err = new Error("Ruangan dengan nama dan lokasi yang sama sudah ada");
		err.statusCode = 409;
		throw err;
	}

	return prisma.room.create({
		data: {
			name: normalizedName,
			location: normalizedLocation,
			capacity: normalizedCapacity,
		},
	});
}

export async function updateRoom(id, { name, location, capacity } = {}) {
	if (!id) {
		const err = new Error("Id ruangan wajib diisi");
		err.statusCode = 400;
		throw err;
	}

	const existing = await prisma.room.findUnique({
		where: { id },
		include: {
			_count: {
				select: {
					internshipSeminars: true,
					thesisSeminars: true,
					thesisDefences: true,
					yudisiums: true,
				},
			},
		},
	});
	if (!existing) {
		const err = new Error("Ruangan tidak ditemukan");
		err.statusCode = 404;
		throw err;
	}

	const relationCount =
		existing._count.internshipSeminars +
		existing._count.thesisSeminars +
		existing._count.thesisDefences +
		existing._count.yudisiums;

	const data = {};
	if (name !== undefined) {
		const trimmedName = String(name).trim();
		if (!trimmedName) {
			const err = new Error("Nama ruangan wajib diisi");
			err.statusCode = 400;
			throw err;
		}
		if (relationCount > 0 && trimmedName !== existing.name) {
			const err = new Error(
				"Ruangan yang sudah digunakan untuk penjadwalan tidak dapat mengubah nama"
			);
			err.statusCode = 400;
			throw err;
		}
		data.name = trimmedName;
	}
	if (location !== undefined) data.location = typeof location === "string" && location.trim() ? location.trim() : null;
	if (capacity !== undefined) {
		if (capacity !== null && (!Number.isInteger(capacity) || capacity <= 0)) {
			const err = new Error("Kapasitas harus lebih dari 0");
			err.statusCode = 400;
			throw err;
		}
		data.capacity = capacity;
	}

	if (Object.keys(data).length === 0) {
		return existing;
	}

	const candidateName = data.name ?? existing.name;
	const candidateLocation = data.location !== undefined ? data.location : existing.location;

	const duplicate = await prisma.room.findFirst({
		where: {
			id: { not: id },
			name: candidateName,
			location: candidateLocation,
		},
	});

	if (duplicate) {
		const err = new Error("Ruangan dengan nama dan lokasi yang sama sudah ada");
		err.statusCode = 409;
		throw err;
	}

	return prisma.room.update({ where: { id }, data });
}

export async function deleteRoom(id) {
	if (!id) {
		const err = new Error("Id ruangan wajib diisi");
		err.statusCode = 400;
		throw err;
	}

	const room = await prisma.room.findUnique({
		where: { id },
		include: {
			_count: {
				select: {
					internshipSeminars: true,
					thesisSeminars: true,
					thesisDefences: true,
					yudisiums: true,
				},
			},
		},
	});

	if (!room) {
		const err = new Error("Ruangan tidak ditemukan");
		err.statusCode = 404;
		throw err;
	}

	const relationCount =
		room._count.internshipSeminars +
		room._count.thesisSeminars +
		room._count.thesisDefences +
		room._count.yudisiums;

	if (relationCount > 0) {
		const err = new Error("Ruangan tidak dapat dihapus karena sudah memiliki relasi data");
		err.statusCode = 400;
		throw err;
	}

	await prisma.room.delete({ where: { id } });
	return { success: true };
}



// Get all Users with pagination
export async function getUsers({ page = 1, pageSize = 10, search = "", identityType = "", role = "", isVerified = undefined, enrollmentYear = undefined } = {}) {
	const skip = pageSize > 0 ? (page - 1) * pageSize : undefined;
	const take = pageSize > 0 ? pageSize : undefined;

	// Build where clause with all filters
	const where = {
		AND: [
			// Search filter
			search ? {
				OR: [
					{ fullName: { contains: search } },
					{ email: { contains: search } },
					{ identityNumber: { contains: search } },
				],
			} : {},
			// Identity type filter
			identityType ? { identityType } : {},
			// Verified status filter
			isVerified !== undefined ? { isVerified } : {},
			// Role filter
			role ? {
				userHasRoles: {
					some: {
						role: {
							name: role
						}
					}
				}
			} : {},
			// Enrollment year filter (via student relation)
			enrollmentYear ? {
				student: {
					enrollmentYear: parseInt(enrollmentYear)
				}
			} : {},
		].filter(condition => Object.keys(condition).length > 0) // Remove empty conditions
	};

	const [users, total] = await Promise.all([
		prisma.user.findMany({
			where,
			skip,
			take,
			orderBy: [
				{ identityType: "desc" },
				{ identityNumber: "desc" },
				{ createdAt: "desc" },
			],
			omit: USER_CREDENTIAL_OMIT,
			include: {
				userHasRoles: {
					include: {
						role: true,
					},
				},
				student: true,
			},
		}),
		prisma.user.count({ where }),
	]);

	// Transform userHasRoles to roles format
	const transformedUsers = users.map((user) => ({
		...user,
		roles: user.userHasRoles.map((ur) => ({
			id: ur.role.id,
			name: ur.role.name,
			status: ur.status,
		})),
		userHasRoles: undefined, // Remove userHasRoles from response
	}));

	return {
		users: transformedUsers,
		meta: {
			page,
			pageSize,
			total,
			totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 1,
		},
	};
}

// Get all Students with detailed information
const SEMESTER_FLAGS_SELECT = {
	academicYearId: true,
	eligibleResearchMethod: true,
	takingThesisCourse: true,
	eligibilitySource: true,
	thesisCourseSource: true,
	capturedAt: true,
};

/** SIA flags of one period for the student master data. */
function toSemesterFlags(snapshot, academicYear) {
	if (!academicYear) return null;
	return {
		academicYearId: academicYear.id,
		academicYearLabel: formatAcademicYearLabel(academicYear),
		takingResearchMethod: snapshot?.eligibleResearchMethod ?? null,
		takingThesisCourse: snapshot?.takingThesisCourse ?? null,
		source: snapshot?.thesisCourseSource ?? snapshot?.eligibilitySource ?? null,
		// Each flag has its own source (sia, admin, devtools); "admin" is kept by the sync.
		researchMethodSource: snapshot?.eligibilitySource ?? null,
		thesisCourseSource: snapshot?.thesisCourseSource ?? null,
		capturedAt: snapshot?.capturedAt ?? null,
	};
}

/**
 * "Program" filter of the student list: the SIA flags of the operational
 * period — taking Metode Penelitian and/or Tugas Akhir.
 */
const NOT_TRUE = [false, null];
const STUDENT_STATUS_VALUES = ["active", "bss", "lulus", "mengundurkan_diri", "dropout"];
const PROGRAM_SNAPSHOT_FILTERS = {
	"research-method": { eligibleResearchMethod: true, OR: NOT_TRUE.map((takingThesisCourse) => ({ takingThesisCourse })) },
	thesis: { takingThesisCourse: true, OR: NOT_TRUE.map((eligibleResearchMethod) => ({ eligibleResearchMethod })) },
	both: { eligibleResearchMethod: true, takingThesisCourse: true },
};

export async function getStudents({ page = 1, pageSize = 10, search = "", enrollmentYear = undefined, sortBy = undefined, sortOrder = "desc", program = undefined, academicYearId = undefined, status = undefined } = {}) {
	const skip = pageSize > 0 ? (page - 1) * pageSize : undefined;
	const take = pageSize > 0 ? pageSize : undefined;
	// SIA flags and the program filter follow the chosen period, else the operational one.
	const period = academicYearId
		? await prisma.academicYear.findUnique({ where: { id: academicYearId } })
		: await resolveOperationalAcademicYear();

	// Every filter is applied in the query, before pagination, so the count follows it.
	const studentWhere = [];
	if (enrollmentYear && Number.isInteger(parseInt(enrollmentYear))) studentWhere.push({ enrollmentYear: parseInt(enrollmentYear) });
	if (status && STUDENT_STATUS_VALUES.includes(status)) studentWhere.push({ status });
	if (program && (PROGRAM_SNAPSHOT_FILTERS[program] || program === "none")) {
		const periodId = period?.id ?? "__none__";
		studentWhere.push(
			program === "none"
				? { academicYearSnapshots: { none: { academicYearId: periodId, OR: [{ eligibleResearchMethod: true }, { takingThesisCourse: true }] } } }
				: { academicYearSnapshots: { some: { academicYearId: periodId, ...PROGRAM_SNAPSHOT_FILTERS[program] } } },
		);
	}

	const where = {
		student: studentWhere.length ? { is: { AND: studentWhere } } : { isNot: null },
		...(search
			? {
				OR: [
					{ fullName: { contains: search } },
					{ email: { contains: search } },
					{ identityNumber: { contains: search } },
				],
			}
			: {}),
	};

	let orderBy = [];
	if (sortBy === "identityNumber" || sortBy === "nim") {
		orderBy.push({ identityNumber: sortOrder });
	} else if (sortBy === "fullName" || sortBy === "name") {
		orderBy.push({ fullName: sortOrder });
	} else if (sortBy === "createdAt") {
		orderBy.push({ identityNumber: sortOrder }, { createdAt: sortOrder });
	} else {
		orderBy.push({ identityNumber: "desc" }, { createdAt: "desc" });
	}

	const [students, total] = await Promise.all([
		prisma.user.findMany({
			where,
			skip,
			take,
			orderBy,
			omit: USER_CREDENTIAL_OMIT,
			include: {
				student: {
					include: {
						academicYearSnapshots: {
							where: { academicYearId: period?.id ?? "" },
							select: SEMESTER_FLAGS_SELECT,
						},
						thesis: {
							where: {
								status: { in: OPEN_THESIS_STATUSES },
							},
							include: {
								thesisSupervisors: {
									include: {
										lecturer: {
											include: {
												user: {
													select: {
														fullName: true,
													},
												},
											},
										},
										role: true,
									},
								},
							},
						},
					},
				},
				userHasRoles: {
					include: {
						role: true,
					},
				},
			},
		}),
		prisma.user.count({ where }),
	]);

	// Transform data
	const transformedStudents = students.map((user) => ({
		id: user.id,
		fullName: user.fullName,
		email: user.email,
		identityNumber: user.identityNumber,
		identityType: user.identityType,
		isVerified: user.isVerified,
		createdAt: user.createdAt,
		student: user.student
			? {
				id: user.student.id,
				enrollmentYear: user.student.enrollmentYear,
				sksCompleted: user.student.sksCompleted,
				gpa: user.student.gpa,
				graduationPredicate: user.student.graduationPredicate,
				mandatoryCoursesCompleted: user.student.mandatoryCoursesCompleted,
				mkwuCompleted: user.student.mkwuCompleted,
				internshipCompleted: user.student.internshipCompleted,
				kknCompleted: user.student.kknCompleted,
				researchMethodCompleted: user.student.researchMethodCompleted,
				currentSemester: user.student.currentSemester,
				status: user.student.status || null,
				semesterFlags: toSemesterFlags(user.student.academicYearSnapshots[0], period),
				activeTheses: user.student.thesis.map((thesis) => ({
					title: thesis.title,
					supervisors: thesis.thesisSupervisors
						.filter((tp) => isSupervisorRole(tp.role.name))
						.map((tp) => ({
							role: tp.role.name,
							fullName: tp.lecturer.user.fullName,
						})),
				})),
			}
			: null,
		roles: user.userHasRoles.map((ur) => ({
			id: ur.role.id,
			name: ur.role.name,
			status: ur.status,
		})),
	}));

	return {
		students: transformedStudents,
		academicYearContext: period
			? {
				id: period.id,
				year: period.year,
				semester: period.semester,
				label: formatAcademicYearLabel(period),
				isActive: Boolean(period.isActive),
			}
			: null,
		meta: {
			page,
			pageSize,
			total,
			totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 1,
		},
	};
}

export async function importStudentsExcel(rows, actor = {}) {
	const results = { success: 0, updated: 0, failed: 0, errors: [] };
	const studentRole = await getOrCreateRole(ROLES.MAHASISWA);

	for (let i = 0; i < rows.length; i++) {
		const row = rows[i];
		const rowNum = i + 2;
		try {
			const nim = clean(row["NIM"]);
			const email = clean(row["Email"]).toLowerCase();
			const fullName = clean(row["Nama"]);
			const sks = parseInt(row["SKS Selesai"]) || 0;
			const enrollmentYear = parseInt(row["Tahun Masuk"]) || deriveEnrollmentYearFromNIM(nim);

			if (!nim || !email) throw new Error("NIM dan Email wajib diisi");

			const existingUser = await findUserByEmailOrIdentity(email, nim);
			await assertImportRolesAllowed(existingUser?.id ?? null, [ROLES.MAHASISWA]);
			if (existingUser) {
				// Update existing student
				await prisma.user.update({
					where: { id: existingUser.id },
					data: { fullName, identityNumber: nim, identityType: "NIM" }
				});
				await prisma.student.upsert({
					where: { id: existingUser.id },
					create: { id: existingUser.id, enrollmentYear, sksCompleted: sks, status: "active" },
					update: { enrollmentYear, sksCompleted: sks }
				});
				results.updated++;
			} else {
				// Create new student
				const plainPassword = generatePassword(12);
				const hash = await bcrypt.hash(plainPassword, 10);
				const user = await prisma.user.create({
					data: {
						fullName,
						email,
						password: hash,
						identityNumber: nim,
						identityType: "NIM",
						isVerified: false
					}
				});
				await upsertUserRole(user.id, studentRole.id, "active");
				await prisma.student.create({
					data: { id: user.id, enrollmentYear, sksCompleted: sks, status: "active" }
				});
				results.success++;

				// Optional: send invite (ommited for brevity in bulk import unless requested)
			}
		} catch (err) {
			results.failed++;
			results.errors.push(`Baris ${rowNum}: ${err.message}`);
		}
	}
	await logImport("students", results, actor);
	return results;
}

export async function importLecturersExcel(rows, actor = {}) {
	const results = { success: 0, updated: 0, failed: 0, errors: [] };

	for (let i = 0; i < rows.length; i++) {
		const row = rows[i];
		const rowNum = i + 2;
		try {
			const nip = clean(row["NIP"]);
			const email = clean(row["Email"]).toLowerCase();
			const fullName = clean(row["Nama"]);
			const phone = clean(row["Telepon"]);
			const scienceGroupName = clean(row["Kelompok Keilmuan"]);

			if (!nip || !email) throw new Error("NIP dan Email wajib diisi");

			let scienceGroupId = null;
			if (scienceGroupName && scienceGroupName !== "-") {
				const sg = await prisma.scienceGroup.findFirst({ where: { name: { contains: scienceGroupName } } });
				if (sg) scienceGroupId = sg.id;
			}

			const existingUser = await findUserByEmailOrIdentity(email, nip);
			await assertImportRolesAllowed(existingUser?.id ?? null, [ROLES.PEMBIMBING_1]);
			if (existingUser) {
				await prisma.user.update({
					where: { id: existingUser.id },
					data: { fullName, identityNumber: nip, identityType: "NIP", phone }
				});
				await prisma.lecturer.upsert({
					where: { id: existingUser.id },
					create: { id: existingUser.id, scienceGroupId },
					update: { scienceGroupId }
				});
				results.updated++;
			} else {
				const plainPassword = generatePassword(12);
				const hash = await bcrypt.hash(plainPassword, 10);
				const user = await prisma.user.create({
					data: {
						fullName,
						email,
						password: hash,
						identityNumber: nip,
						identityType: "NIP",
						isVerified: false,
						phone
					}
				});
				// Default to Pembimbing 1 role if not specified
				const role = await getOrCreateRole(ROLES.PEMBIMBING_1);
				await upsertUserRole(user.id, role.id, "active");
				await prisma.lecturer.create({
					data: { id: user.id, scienceGroupId }
				});
				results.success++;
			}
		} catch (err) {
			results.failed++;
			results.errors.push(`Baris ${rowNum}: ${err.message}`);
		}
	}
	await logImport("lecturers", results, actor);
	return results;
}

export async function importUsersExcel(rows, actor = {}) {
	if (!Array.isArray(rows) || rows.length === 0) {
		return { success: 0, updated: 0, failed: 0, errors: ["Data baris Excel kosong"] };
	}

	const normalizedRows = rows.map((row) => ({
		email: clean(row["Email"] || row["email"] || "").toLowerCase(),
		fullName: clean(row["Nama Lengkap"] || row["Nama"] || row["fullName"] || row["nama"] || ""),
		identityNumber: clean(row["NIM/NIP"] || row["NIM"] || row["NIP"] || row["identityNumber"] || row["identity_number"] || row["Nomor Identitas"] || ""),
		identityType: clean(row["Tipe Identitas"] || row["identityType"] || row["identity_type"] || ""),
		role: clean(row["Role"] || row["role"] || row["roles"] || row["Peran"] || ""),
		studentStatus: clean(row["Status Mahasiswa"] || row["Status"] || row["student_status"] || row["status"] || row["status_mahasiswa"] || ""),
		sksCompleted: clean(row["SKS"] || row["SKS Completed"] || row["sksCompleted"] || row["sks_completed"] || ""),
	}));

	return processImportUserRows(normalizedRows, actor);
}

export async function importAcademicYearsExcel(rows) {
	const results = { success: 0, updated: 0, failed: 0, errors: [] };

	for (let i = 0; i < rows.length; i++) {
		const row = rows[i];
		const rowNum = i + 2;
		try {
			const year = clean(row["Tahun"]);
			const semester = clean(row["Semester"]).toLowerCase();
			const startStr = clean(row["Tanggal Mulai"]);
			const endStr = clean(row["Tanggal Selesai"]);

			if (!year || !semester || !startStr || !endStr) {
				throw new Error("Tahun, Semester, Tanggal Mulai, dan Tanggal Selesai wajib diisi");
			}

			const existing = await prisma.academicYear.findUnique({
				where: { year_semester: { year, semester } },
			});
			const data = { year, semester, startDate: startStr, endDate: endStr };

			if (existing) {
				await updateAcademicYear(existing.id, data);
				results.updated++;
			} else {
				await createAcademicYear(data);
				results.success++;
			}
		} catch (err) {
			results.failed++;
			results.errors.push(`Baris ${rowNum}: ${err.message}`);
		}
	}
	return results;
}

// Get all Lecturers with detailed information
export async function getLecturers({ page = 1, pageSize = 10, search = "", scienceGroupId = "" } = {}) {
	const skip = (page - 1) * pageSize;
	const take = pageSize;

	const where = {
		AND: [
			{ lecturer: { isNot: null } }, // Only users with lecturer record
			search ? {
				OR: [
					{ fullName: { contains: search } },
					{ email: { contains: search } },
					{ identityNumber: { contains: search } },
				],
			} : {},
			scienceGroupId ? {
				lecturer: { is: { scienceGroupId } },
			} : {}
		]
	};

	const [lecturers, total] = await Promise.all([
		prisma.user.findMany({
			where,
			skip,
			take,
			orderBy: { createdAt: "desc" },
			omit: USER_CREDENTIAL_OMIT,
			include: {
				lecturer: {
					include: {
						scienceGroup: true,
						_count: {
							select: {
								thesisGuidances: true,
								thesisSupervisors: {
									where: {
										thesis: {
											status: THESIS_STATUS.RESEARCH,
										},
									},
								},
							},
						},
					},
				},
				userHasRoles: {
					include: {
						role: true,
					},
				},
			},
		}),
		prisma.user.count({ where }),
	]);

	// Transform data
	const transformedLecturers = lecturers.map((user) => ({
		id: user.id,
		fullName: user.fullName,
		email: user.email,
		identityNumber: user.identityNumber,
		identityType: user.identityType,
		phone: user.phoneNumber,
		isVerified: user.isVerified,
		createdAt: user.createdAt,
		lecturer: user.lecturer
			? {
				id: user.lecturer.id,
				activeGuidances: user.lecturer._count?.thesisSupervisors || 0,
				participations: user.lecturer._count?.thesisSupervisors || 0,
				scienceGroup: user.lecturer.scienceGroup?.name || null,
				scienceGroupId: user.lecturer.scienceGroupId || null,
			}
			: null,
		roles: user.userHasRoles.map((ur) => ({
			id: ur.role.id,
			name: ur.role.name,
			status: ur.status,
		})),
	}));

	return {
		lecturers: transformedLecturers,
		meta: {
			page,
			pageSize,
			total,
			totalPages: Math.ceil(total / pageSize),
		},
	};
}

// Get Student detail by ID
export async function getStudentDetail(userId) {
	if (!userId) {
		const err = new Error("User ID is required");
		err.statusCode = 400;
		throw err;
	}

	const allYears = await prisma.academicYear.findMany({ select: { id: true, year: true, semester: true }, orderBy: { startDate: "desc" } });
	const user = await prisma.user.findUnique({
		where: { id: userId },
		omit: USER_CREDENTIAL_OMIT,
		include: {
			student: {
				include: {
					academicYearSnapshots: {
						select: { ...SEMESTER_FLAGS_SELECT, academicYear: { select: { id: true, year: true, semester: true } } },
						orderBy: { academicYear: { startDate: "desc" } },
					},
					thesis: {
						include: {
							thesisTopic: true,
							thesisSupervisors: {
								include: {
									lecturer: {
										include: {
											user: {
												select: { id: true, fullName: true, email: true },
											},
										},
									},
									role: true,
								},
							},
							thesisMilestones: {
								orderBy: { createdAt: "asc" },
								select: {
									id: true,
									title: true,
									status: true,
									targetDate: true,
									completedAt: true,
								},
							},
							thesisGuidances: {
								orderBy: { createdAt: "desc" },
								take: 10,
								select: {
									id: true,
									status: true,
									approvedDate: true,
									completedAt: true,
								},
							},
							// Read only: the latest seminar and defence of each thesis for the "Tugas Akhir" card.
							thesisSeminars: {
								select: { id: true, status: true, date: true, registeredAt: true, createdAt: true },
								orderBy: { createdAt: "desc" },
							},
							thesisDefences: {
								select: { id: true, status: true, date: true, registeredAt: true, createdAt: true },
								orderBy: { createdAt: "desc" },
							},
						},
					},
				},
			},
			userHasRoles: {
				include: {
					role: true,
				},
			},
		},
	});

	if (!user || !user.student) {
		const err = new Error("Mahasiswa tidak ditemukan");
		err.statusCode = 404;
		throw err;
	}

	const snapshotsByYear = new Map(user.student.academicYearSnapshots.map((row) => [row.academicYearId ?? row.academicYear?.id, row]));
	const studentCplScores = await prisma.studentCplScore.findMany({
		where: { studentId: user.student.id },
		include: {
			cpl: {
				select: {
					id: true,
					code: true,
					description: true,
					minimalScore: true,
				},
			},
		},
		orderBy: [
			{ cpl: { code: "asc" } },
			{ cplId: "asc" },
		],
	});

	// Transform thesis data
	const theses = user.student.thesis.map((thesis) => {
		const supervisors = thesis.thesisSupervisors
			.filter((tp) => isSupervisorRole(tp.role.name))
			.map((tp) => ({
				id: tp.lecturer.user.id,
				role: tp.role.name,
				fullName: tp.lecturer.user.fullName,
				email: tp.lecturer.user.email,
			}));

		const examiners = thesis.thesisSupervisors
			.filter((tp) => tp.role.name.toLowerCase().includes("penguji"))
			.map((tp) => ({
				id: tp.lecturer.user.id,
				role: tp.role.name,
				fullName: tp.lecturer.user.fullName,
				email: tp.lecturer.user.email,
			}));

		const completedMilestones = thesis.thesisMilestones.filter((m) => m.status === "completed").length;
		const totalMilestones = thesis.thesisMilestones.length;
		const milestoneProgress = totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;

		const completedGuidances = thesis.thesisGuidances.filter((g) => g.status === "completed").length;
		const totalGuidances = thesis.thesisGuidances.length;

		return {
			id: thesis.id,
			title: thesis.title,
			status: thesis.status || null,
			// The student is on leave: the thesis is paused ("Cuti" badge).
			isOnLeave: isThesisOnLeave({ status: thesis.status, student: { status: user.student.status } }),
			topic: thesis.thesisTopic?.name || null,
			startDate: thesis.startDate,
			supervisors,
			examiners,
			milestones: {
				completed: completedMilestones,
				total: totalMilestones,
				progress: milestoneProgress,
				items: thesis.thesisMilestones,
			},
			guidances: {
				completed: completedGuidances,
				total: totalGuidances,
				recent: thesis.thesisGuidances,
			},
			seminars: thesis.thesisSeminars.map((s) => ({
				id: s.id,
				status: s.status,
				date: s.date ?? s.registeredAt ?? null,
				createdAt: s.createdAt,
			})),
			defences: thesis.thesisDefences.map((d) => ({
				id: d.id,
				status: d.status,
				date: d.date ?? d.registeredAt ?? null,
				createdAt: d.createdAt,
			})),
		};
	});

	return {
		id: user.id,
		fullName: user.fullName,
		email: user.email,
		identityNumber: user.identityNumber,
		identityType: user.identityType,
		phoneNumber: user.phoneNumber,
		isVerified: user.isVerified,
		createdAt: user.createdAt,
		student: {
			enrollmentYear: user.student.enrollmentYear,
			sksCompleted: user.student.sksCompleted,
			gpa: user.student.gpa,
			graduationPredicate: user.student.graduationPredicate,
			mandatoryCoursesCompleted: user.student.mandatoryCoursesCompleted,
			mkwuCompleted: user.student.mkwuCompleted,
			internshipCompleted: user.student.internshipCompleted,
			kknCompleted: user.student.kknCompleted,
			researchMethodCompleted: user.student.researchMethodCompleted,
			currentSemester: user.student.currentSemester,
			status: user.student.status || null,
			// Every semester, so the Admin can set a flag where SIA reported none.
			semesterFlags: allYears.map((year) => toSemesterFlags(snapshotsByYear.get(year.id), year)),
		},
		roles: user.userHasRoles.map((ur) => ({
			id: ur.role.id,
			name: ur.role.name,
			status: ur.status,
		})),
		cplScores: studentCplScores.map((row) => ({
			cplId: row.cplId,
			cplCode: row.cpl?.code || null,
			cplDescription: row.cpl?.description || null,
			minimalScore: row.cpl?.minimalScore ?? null,
			score: row.score,
			source: row.source,
			status: row.status,
			inputAt: row.inputAt,
			verifiedAt: row.validatedAt,
			finalizedAt: row.finalizedAt,
		})),
		theses,
	};
}

const EXAMINED_EVENT_SELECT = {
	id: true,
	status: true,
	date: true,
	registeredAt: true,
	thesis: {
		select: {
			id: true,
			title: true,
			student: { select: { user: { select: { id: true, fullName: true, identityNumber: true } } } },
		},
	},
};

/**
 * "Penguji Seminar dan Sidang" of the lecturer detail, read only from the seminar and defence
 * examiner tables: kind, student, title, event day and status, newest first.
 */
export async function findExaminerAssignments(lecturerId, client = prisma) {
	const [seminars, defences] = await Promise.all([
		client.thesisSeminarExaminer.findMany({ where: { lecturerId }, select: { id: true, assignedAt: true, seminar: { select: EXAMINED_EVENT_SELECT } } }),
		client.thesisDefenceExaminer.findMany({ where: { lecturerId }, select: { id: true, assignedAt: true, defence: { select: EXAMINED_EVENT_SELECT } } }),
	]);
	const row = (kind, examiner, event) => ({
		id: examiner.id,
		kind,
		eventId: event.id,
		status: event.status,
		date: event.date ?? event.registeredAt ?? examiner.assignedAt ?? null,
		thesisId: event.thesis.id,
		title: event.thesis.title,
		student: {
			id: event.thesis.student?.user?.id ?? null,
			fullName: event.thesis.student?.user?.fullName ?? null,
			nim: event.thesis.student?.user?.identityNumber ?? null,
		},
	});
	return [
		...seminars.map((examiner) => row("seminar", examiner, examiner.seminar)),
		...defences.map((examiner) => row("defence", examiner, examiner.defence)),
	].sort((a, b) => new Date(b.date ?? 0) - new Date(a.date ?? 0));
}

// Get Lecturer detail by ID
export async function getLecturerDetail(userId) {
	if (!userId) {
		const err = new Error("User ID is required");
		err.statusCode = 400;
		throw err;
	}

	const user = await prisma.user.findUnique({
		where: { id: userId },
		omit: USER_CREDENTIAL_OMIT,
		include: {
			lecturer: {
				include: {
					scienceGroup: true,
					thesisSupervisors: {
						include: {
							role: true,
							thesis: {
								include: {
									student: {
										include: {
											user: {
												select: { id: true, fullName: true, identityNumber: true },
											},
										},
									},
								},
							},
						},
					},
					thesisGuidances: {
						where: { status: { in: SCHEDULED_GUIDANCE_STATUSES } },
						orderBy: { approvedDate: "desc" },
						take: 10,
						include: {
							thesis: {
								include: {
									student: {
										include: {
											user: {
												select: { fullName: true, identityNumber: true },
											},
										},
									},
								},
							},
						},
					},
				},
			},
			userHasRoles: {
				include: {
					role: true,
				},
			},
		},
	});

	if (!user || !user.lecturer) {
		const err = new Error("Dosen tidak ditemukan");
		err.statusCode = 404;
		throw err;
	}

	// Group thesis participations by role
	const supervising = user.lecturer.thesisSupervisors
		.filter((tp) => isSupervisorRole(tp.role.name))
		.map((tp) => ({
			thesisId: tp.thesis.id,
			title: tp.thesis.title,
			status: tp.thesis.status || null,
			// The student is on leave: the thesis is paused ("Cuti" badge).
			isOnLeave: isThesisOnLeave(tp.thesis),
			relationStatus: tp.status,
			role: tp.role.name,
			student: {
				id: tp.thesis.student.user.id,
				fullName: tp.thesis.student.user.fullName,
				nim: tp.thesis.student.user.identityNumber,
			},
		}));

	const examining = await findExaminerAssignments(user.lecturer.id);

	// Active vs completed supervising
	const activeSupervising = supervising.filter((s) => s.relationStatus === "active" && !CLOSED_THESIS_STATUSES.includes(s.status));
	const completedSupervising = supervising.filter((s) => s.status === THESIS_STATUS.COMPLETED);

	// Recent guidances
	const recentGuidances = user.lecturer.thesisGuidances.map((g) => ({
		id: g.id,
		approvedDate: g.approvedDate,
		studentName: g.thesis?.student?.user?.fullName || null,
		studentNim: g.thesis?.student?.user?.identityNumber || null,
		thesisTitle: g.thesis?.title || null,
	}));

	return {
		id: user.id,
		fullName: user.fullName,
		email: user.email,
		identityNumber: user.identityNumber,
		identityType: user.identityType,
		phoneNumber: user.phoneNumber,
		isVerified: user.isVerified,
		createdAt: user.createdAt,
		lecturer: {
			scienceGroup: user.lecturer.scienceGroup?.name || null,
		},
		roles: user.userHasRoles.map((ur) => ({
			id: ur.role.id,
			name: ur.role.name,
			status: ur.status,
		})),
		statistics: {
			activeSupervising: activeSupervising.length,
			completedSupervising: completedSupervising.length,
			totalSupervising: supervising.length,
			examining: examining.length,
		},
		supervising: activeSupervising,
		completedSupervising,
		examining,
		recentGuidances,
	};
}


/**
 * Delete a thesis and all related data (hard delete)
 * Used for topic/supervisor change scenarios
 * @param {string} thesisId - The thesis ID to delete
 * @param {string} reason - Reason for deletion (for logging)
 * @returns {Object} Summary of deleted data
 */


// Removed Science Group functions

export async function adminUpdateLecturer(id, data, actor = {}) {
	const before = await prisma.lecturer.findUnique({ where: { id }, select: { scienceGroupId: true } });
	const scienceGroupId = data.scienceGroupId === "" ? null : data.scienceGroupId;
	const updated = await prisma.lecturer.update({ where: { id }, data: { scienceGroupId } });
	if ((before?.scienceGroupId ?? null) !== (updated.scienceGroupId ?? null)) {
		await logAudit({
			actorUserId: actor.actorUserId ?? null,
			action: AUDIT_ACTIONS.LECTURER_UPDATED,
			entityType: ENTITY_TYPES.LECTURER,
			entityId: id,
			oldValues: { scienceGroupId: before?.scienceGroupId ?? null },
			newValues: { scienceGroupId: updated.scienceGroupId ?? null },
			ipAddress: actor.ipAddress ?? null,
			userAgent: actor.userAgent ?? null,
		});
	}
	return updated;
}

export async function adminUpdateStudent(id, data, actor = {}) {
	const updateData = {};

	const rawSksCompleted = data.sksCompleted ?? data.skscompleted;
	if (rawSksCompleted !== undefined) updateData.sksCompleted = parseInt(rawSksCompleted);
	if (data.enrollmentYear !== undefined) updateData.enrollmentYear = parseInt(data.enrollmentYear);
	if (data.currentSemester !== undefined) updateData.currentSemester = data.currentSemester === "" ? null : parseInt(data.currentSemester);
	if (data.gpa !== undefined) updateData.gpa = normalizeGpa(data.gpa);
	if (data.graduationPredicate !== undefined) {
		updateData.graduationPredicate = data.graduationPredicate
			? String(data.graduationPredicate).trim()
			: null;
	}

	if (data.mandatoryCoursesCompleted !== undefined) updateData.mandatoryCoursesCompleted = !!data.mandatoryCoursesCompleted;
	if (data.mkwuCompleted !== undefined) updateData.mkwuCompleted = !!data.mkwuCompleted;
	if (data.internshipCompleted !== undefined) updateData.internshipCompleted = !!data.internshipCompleted;
	if (data.kknCompleted !== undefined) updateData.kknCompleted = !!data.kknCompleted;
	if (data.researchMethodCompleted !== undefined) updateData.researchMethodCompleted = !!data.researchMethodCompleted;

	const before = await prisma.student.findUnique({ where: { id } });
	if (!before) throw new NotFoundError("Mahasiswa tidak ditemukan.");

	// The student status drives the thesis (leave, end of studies): one transaction.
	let statusChange = null;
	const updated = await prisma.$transaction(async (tx) => {
		if (data.status !== undefined && data.status !== before.status) {
			statusChange = await applyStudentStatusChange(tx, id, data.status, { actorUserId: actor.actorUserId ?? null, source: "admin" });
		}
		const changedKeys = Object.keys(updateData).filter((key) => String(before[key] ?? "") !== String(updateData[key] ?? ""));
		if (changedKeys.length) {
			await tx.auditLog.create({
				data: {
					userId: actor.actorUserId ?? null,
					action: AUDIT_ACTIONS.STUDENT_ACADEMIC_UPDATED,
					entity: ENTITY_TYPES.STUDENT,
					entityId: id,
					changes: {
						oldValues: Object.fromEntries(changedKeys.map((key) => [key, before[key] ?? null])),
						newValues: Object.fromEntries(changedKeys.map((key) => [key, updateData[key] ?? null])),
						metadata: null,
					},
					ipAddress: actor.ipAddress ?? null,
					userAgent: actor.userAgent ?? null,
				},
			});
		}
		return Object.keys(updateData).length
			? tx.student.update({ where: { id }, data: updateData })
			: tx.student.findUnique({ where: { id } });
	});
	await announceStudentStatusChange(statusChange);
	return updated;
}

const thesisInclude = {
	student: { include: { user: { omit: USER_CREDENTIAL_OMIT } } },
	academicYear: true,
	thesisSupervisors: {
		include: {
			lecturer: { include: { user: { omit: USER_CREDENTIAL_OMIT } } },
			role: true,
		},
	},
};

export async function getThesisListForAdmin({ page = 1, pageSize = 10, search = "", status = "" } = {}) {
	const skip = (Number(page) - 1) * Number(pageSize);
	const take = Number(pageSize);
	const where = {};

	if (search) {
		where.OR = [
			{ title: { contains: search } },
			{ student: { user: { fullName: { contains: search } } } },
			{ student: { user: { identityNumber: { contains: search } } } },
		];
	}
	if (status) {
		// Status enum; unknown values match nothing.
		where.status = Object.values(THESIS_STATUS).includes(status) ? status : { in: [] };
	}

	const [items, total] = await Promise.all([
		prisma.thesis.findMany({
			where,
			skip,
			take,
			orderBy: { updatedAt: "desc" },
			include: thesisInclude,
		}),
		prisma.thesis.count({ where }),
	]);

	return { data: items, total, page: Number(page), pageSize: take };
}

export async function getThesisById(id) {
	const thesis = await prisma.thesis.findUnique({
		where: { id },
		include: thesisInclude,
	});
	if (!thesis) {
		const err = new Error("Thesis not found");
		err.statusCode = 404;
		throw err;
	}
	return thesis;
}

/** Validate an admin-supplied thesis status (an enum value). Throws 400 for unknown values. */
function resolveThesisStatusInput(status) {
	if (status === undefined || status === null || status === "") return null;
	if (!Object.values(THESIS_STATUS).includes(status)) {
		const err = new Error(`Status tugas akhir tidak valid. Pilihan: ${Object.values(THESIS_STATUS_LABELS).join(", ")}.`);
		err.statusCode = 400;
		throw err;
	}
	return status;
}

/** `[{ lecturerId|id, roleId }]` -> `{ pembimbing1, pembimbing2 }` by role name. */
async function supervisorsToPembimbing(supervisors) {
	if (!Array.isArray(supervisors) || supervisors.length === 0) return {};
	const roles = await prisma.userRole.findMany({
		where: { id: { in: supervisors.map((s) => s.roleId).filter(Boolean) } },
		select: { id: true, name: true },
	});
	const roleName = (roleId) => roles.find((r) => r.id === roleId)?.name;
	const pick = (name) => supervisors.find((s) => roleName(s.roleId) === name);
	return {
		pembimbing1: (pick(ROLES.PEMBIMBING_1)?.lecturerId ?? pick(ROLES.PEMBIMBING_1)?.id) || undefined,
		pembimbing2: (pick(ROLES.PEMBIMBING_2)?.lecturerId ?? pick(ROLES.PEMBIMBING_2)?.id) || undefined,
	};
}

/**
 * Manual thesis creation follows the same rules as the data master (one open thesis
 * per student, the status enum, Pembimbing 1 required). Not mounted on a route today;
 * it delegates so a future route cannot bypass the rules.
 */
export async function createThesisManually(payload = {}) {
	const { studentId, title, status, academicYearId, thesisTopicId, startDate, supervisors = [], actorUserId = null } = payload;
	if (!studentId) {
		const err = new Error("Mahasiswa wajib dipilih");
		err.statusCode = 400;
		throw err;
	}
	const thesis = await createThesisMasterData(
		{
			studentId,
			title,
			status: resolveThesisStatusInput(status) ?? undefined,
			academicYearId,
			thesisTopicId,
			startDate,
			terminationReason: payload.terminationReason,
			terminationNote: payload.terminationNote,
			...(await supervisorsToPembimbing(supervisors)),
		},
		{ actorUserId },
	);
	return prisma.thesis.findUnique({ where: { id: thesis.id }, include: thesisInclude });
}

/** See createThesisManually. */
export async function updateThesisManually(id, payload = {}) {
	const { title, status, academicYearId, thesisTopicId, startDate, actorUserId = null } = payload;
	await updateThesisMasterData(
		id,
		{
			title,
			status: resolveThesisStatusInput(status) ?? undefined,
			academicYearId,
			thesisTopicId,
			startDate,
			terminationReason: payload.terminationReason,
			terminationNote: payload.terminationNote,
			...(payload.supervisors ? await supervisorsToPembimbing(payload.supervisors) : {}),
		},
		{ actorUserId },
	);
	return prisma.thesis.findUnique({ where: { id }, include: thesisInclude });
}

export async function deleteThesis(id, reason = null, actorUserId = null) {
	await prisma.thesis.delete({ where: { id } });
	return { id, deleted: true, reason, actorUserId };
}

export async function getAvailableStudents() {
	return prisma.student.findMany({
		where: {
			// Students without an open (proposal / research / on leave) thesis.
			thesis: { none: { status: { in: OPEN_THESIS_STATUSES } } },
		},
		include: { user: { omit: USER_CREDENTIAL_OMIT } },
		orderBy: { user: { fullName: "asc" } },
	});
}

export async function getAllLecturersForDropdown() {
	return prisma.lecturer.findMany({
		include: { user: { omit: USER_CREDENTIAL_OMIT }, scienceGroup: true },
		orderBy: { user: { fullName: "asc" } },
	});
}

export async function getSupervisorRoles() {
	return prisma.userRole.findMany({
		where: { name: { in: SUPERVISOR_ROLES } },
		orderBy: { name: "asc" },
	});
}

export async function getThesisStatuses() {
	// Statuses are an enum on thesis.status (no lookup table).
	return Object.values(THESIS_STATUS).map((status) => ({ id: status, name: status }));
}

/**
 * Get count of failed theses (status `failed`)
 */
export async function getFailedThesesCount() {
	return prisma.thesis.count({ where: { status: THESIS_STATUS.FAILED } });
}

/**
 * Get list of failed theses (status `failed`) with student info
 */
export async function getFailedTheses() {
	return prisma.thesis.findMany({
		where: { status: THESIS_STATUS.FAILED },
		select: {
			id: true,
			title: true,
			createdAt: true,
			student: {
				select: {
					user: {
						select: { id: true, fullName: true, identityNumber: true, email: true },
					},
				},
			},
		},
		orderBy: { createdAt: "asc" },
	});
}
