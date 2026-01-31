import csv from "csv-parser";
import { Readable } from "stream";
import prisma from "../config/prisma.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { ENV } from "../config/env.js";
import { sendMail } from "../config/mailer.js";
import redisClient from "../config/redis.js";
import { accountInviteTemplate } from "../utils/emailTemplate.js";
import { generatePassword } from "../utils/password.util.js";
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
import { getActiveAcademicYear } from "../helpers/academicYear.helper.js";
import {
	getOrCreateRole,
	findUserByEmailOrIdentity,
	createUser,
	addRolesToUser,
	findStudentStatusByName,
	createStudentStatus,
	createStudentForUser,
	findLecturerByUserId,
	createLecturerForUser,
} from "../repositories/adminfeatures.repository.js";
// Switch admin service to use only adminfeatures.repository for admin operations
import {
	findUserById,
	updateUserById as repoUpdateUserById,
	findRoleByName,
	getUserRolesWithIds,
	upsertUserRole,
	findStudentByUserId,
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
export async function adminUpdateUser(id, payload = {}) {
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

	const { fullName, email, roles, identityNumber, identityType, isVerified } = payload || {};

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

	// Prepare update data
	const updateData = {};
	if (typeof fullName === "string" && fullName.trim()) updateData.fullName = fullName.trim();
	if (typeof email === "string" && email.trim()) updateData.email = email.trim().toLowerCase();
	if (typeof identityNumber === "string" && identityNumber.trim()) updateData.identityNumber = identityNumber.trim();
	if (typeof identityType === "string") updateData.identityType = identityType;
	if (typeof isVerified === "boolean") updateData.isVerified = isVerified;

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

	// Update roles if provided (manage only non-admin roles)
	if (Array.isArray(roles)) {
			// roles can be string[] or {name, status}[]
			const desired = [];
			for (const r of roles) {
				if (typeof r === "string") desired.push({ name: r, status: undefined });
				else if (r && typeof r.name === "string") desired.push({ name: r.name, status: r.status });
			}
			// Normalize
			const desiredClean = desired
				.map((x) => ({ name: x.name.trim().toLowerCase(), status: x.status }))
				.filter((x) => x.name && normalize(x.name) !== normalize(ROLES.ADMIN));

			// Map role names -> role ids, then upsert with status if provided
			const existing = await getUserRolesWithIds(id);
			const existingByRoleId = new Map(existing.map((ur) => [ur.roleId, ur]));
			const existingByName = new Map(existing.map((ur) => [String(ur.role?.name || "").toLowerCase(), ur]));

			for (const item of desiredClean) {
				let role = await findRoleByName(item.name);
				if (!role) role = await getOrCreateRole(item.name);
				const current = existingByRoleId.get(role.id) || existingByName.get(item.name);
				const status = item.status || current?.status || "active";
				// Upsert and update status when provided. Non-destructive for other roles.
				await upsertUserRole(id, role.id, status);
			}
	}

	// Ensure Student/Lecturer records when relevant
	const latest = await findUserById(id);
	const currentRoles = await getUserRolesWithIds(id);
	const roleNames = currentRoles.map((r) => r.role?.name || "");
	const type = (latest?.identityType || identityType || "").toString();

	// Student
	if (roleNames.some(isStudentRole) || type === "NIM") {
		const existingStudent = await findStudentByUserId(id);
		if (!existingStudent) {
			const enrollmentYear = deriveEnrollmentYearFromNIM(latest?.identityNumber || identityNumber);
			await createStudentForUser({ userId: id, enrollmentYear, skscompleted: 0 });
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
		include: {
			userHasRoles: { include: { role: true } },
			student: true,
			lecturer: true,
		},
	});
	return result;
}

// Admin - Create user and assign roles, plus invite email
export async function adminCreateUser({ fullName, email, roles = [], identityNumber, identityType }) {
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
	});

	// Roles: admin can set any roles EXCEPT 'Admin' for this endpoint
	const rawRoles = Array.isArray(roles) ? roles.filter((r) => r !== ROLES.ADMIN) : [];
	const uniqueRoles = [...new Set(rawRoles)];
	console.log("[adminCreateUser] email:", String(email).toLowerCase(), "identityType:", identityType, "identityNumber:", identityNumber);
	console.log("[adminCreateUser] incoming roles:", roles);
	console.log("[adminCreateUser] unique roles:", uniqueRoles);
	for (const rn of uniqueRoles) {
		const role = await getOrCreateRole(rn);
		await addRolesToUser(user.id, [role.id]); // idempotent via skipDuplicates
	}

	// If role 'Mahasiswa' is assigned, ensure Student record exists
	if (uniqueRoles.some((r) => isStudentRole(r))) {
		let status = await findStudentStatusByName("Aktif");
		if (!status) status = await createStudentStatus("Aktif");
		const existingStudent = await prisma.student.findUnique({ where: { id: user.id } });
		if (!existingStudent) {
			const enrollmentYear = identityNumber ? deriveEnrollmentYearFromNIM(identityNumber) : null;
			await createStudentForUser({ userId: user.id, studentStatusId: status.id, enrollmentYear, skscompleted: 0 });
		}
	}

	// If identityType is NIP OR lecturer-related role is assigned, ensure Lecturer record exists
	const hasLecturerRole = uniqueRoles.some((r) => isLecturerRole(r));
	const isLecturerIdentity = String(identityType || "").toUpperCase() === "NIP";
	console.log("[adminCreateUser] lecturer-role detected:", hasLecturerRole, "; identityType=NIP:", isLecturerIdentity);
	if (hasLecturerRole || isLecturerIdentity) {
		const existingLect = await findLecturerByUserId(user.id);
		if (!existingLect) {
			console.log("[adminCreateUser] creating Lecturer for user", user.id);
			const createdLect = await createLecturerForUser({ userId: user.id });
			console.log("[adminCreateUser] Lecturer created id:", createdLect?.id);
		}
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
		console.error("✉️ Failed to send verification email:", e?.message || e);
	}

	return { id: user.id, email: user.email, roles: uniqueRoles };
}
export async function importStudentsCsvFromUpload(fileBuffer) {
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
					nim: clean(norm.nim || ""),
					nama: clean(norm.nama || norm.name || ""),
							email: clean(norm.email || "").toLowerCase(),
							sks_completed: clean(norm.sks_completed || norm["sks_completed"] || norm.sks || ""),
				});
			})
			.on("end", () => resolve(out))
			.on("error", (err) => reject(err));
	});

	// Pre-process rows: normalize, filter invalid, and de-duplicate within file by email and NIM
	const cleanRows = [];
	const seenEmails = new Set();
	const seenNims = new Set();
	let skippedInvalid = 0;
	let skippedDuplicatesInFile = 0;
	for (const r of rows) {
		const nim = String(r.nim || "").trim();
		const email = String(r.email || "").trim().toLowerCase();
		if (!nim || !email) {
			skippedInvalid++;
			continue;
		}
		// dedupe by email first; also guard against duplicate nim in the same file
		if (seenEmails.has(email) || seenNims.has(nim)) {
			skippedDuplicatesInFile++;
			continue;
		}
		seenEmails.add(email);
		seenNims.add(nim);
		const sksCompletedVal = Number.parseInt(String(r.sks_completed || "").trim(), 10);
		cleanRows.push({
			nim,
			nama: String(r.nama || "").trim(),
			email,
			sksCompleted: Number.isFinite(sksCompletedVal) && sksCompletedVal >= 0 ? sksCompletedVal : 0,
		});
	}

	if (cleanRows.length === 0) {
		return { created: 0, updated: 0, skipped: skippedInvalid + skippedDuplicatesInFile, failed: 0 };
	}

	// Fetch existing users by email and by identityNumber (NIM) in 2 queries for efficiency
	const emails = cleanRows.map((r) => r.email);
	const nims = cleanRows.map((r) => r.nim);

	const [existingByEmail, existingByNim] = await Promise.all([
		prisma.user.findMany({ where: { email: { in: emails } }, select: { email: true } }),
		prisma.user.findMany({ where: { identityNumber: { in: nims } }, select: { identityNumber: true } }),
	]);

	const existingEmailSet = new Set(existingByEmail.map((u) => u.email).filter(Boolean));
	const existingNimSet = new Set(existingByNim.map((u) => u.identityNumber));

	const rowsToCreate = cleanRows.filter((r) => !existingEmailSet.has(r.email) && !existingNimSet.has(r.nim));
	const skippedExisting = cleanRows.length - rowsToCreate.length;

	if (rowsToCreate.length === 0) {
		return { created: 0, updated: 0, skipped: skippedInvalid + skippedDuplicatesInFile + skippedExisting, failed: 0 };
	}

	// Create users in bulk
	const userData = rowsToCreate.map((r) => ({
		fullName: r.nama || "",
		email: r.email,
		password: null,
		identityNumber: r.nim,
		identityType: "NIM",
		isVerified: false,
	}));

	await prisma.user.createMany({ data: userData, skipDuplicates: true });

	// Re-fetch created users to get their IDs
	const createdUsers = await prisma.user.findMany({
		where: { email: { in: rowsToCreate.map((r) => r.email) } },
		select: { id: true, email: true, identityNumber: true },
	});

	// Map email -> userId and NIM -> (sksCompleted, enrollmentYear)
	const userIdByEmail = new Map(createdUsers.map((u) => [u.email, u.id]));
	const enrollmentByEmail = new Map(rowsToCreate.map((r) => [r.email, {
		enrollmentYear: deriveEnrollmentYearFromNIM(r.nim),
		sksCompleted: r.sksCompleted,
	}]));

	// Ensure role 'Mahasiswa'
	const studentRole = await getOrCreateRole(ROLES.MAHASISWA);

	const userRoleData = createdUsers.map((u) => ({ userId: u.id, roleId: studentRole.id, status: "active" }));
	// Use createMany with skipDuplicates to avoid constraint errors if re-run
	await prisma.userHasRole.createMany({ data: userRoleData, skipDuplicates: true });

	// Build students data and bulk insert
	const studentData = createdUsers.map((u) => {
		const e = enrollmentByEmail.get(u.email) || {};
		return {
			id: u.id,
			enrollmentYear: e.enrollmentYear ?? null,
			skscompleted: Number.isInteger(e.sksCompleted) && e.sksCompleted >= 0 ? e.sksCompleted : 0,
		};
	});
	await prisma.student.createMany({ data: studentData, skipDuplicates: true });

	return {
		created: createdUsers.length,
		updated: 0,
		skipped: skippedInvalid + skippedDuplicatesInFile + skippedExisting,
		failed: 0,
	};
}

// Create Academic Year (Admin)
export async function createAcademicYear({ semester = "ganjil", year, startDate, endDate }) {
	// Optional: basic date check
	if (startDate && endDate) {
		const s = new Date(startDate);
		const e = new Date(endDate);
		if (!isNaN(s) && !isNaN(e) && s > e) {
			const err = new Error("startDate must be before endDate");
			err.statusCode = 400;
			throw err;
		}
	}

	// Prevent duplicates by (semester, year) when year provided
	if (typeof year === "number") {
		const existing = await prisma.academicYear.findFirst({ where: { semester, year } });
		if (existing) {
			const err = new Error("Academic year already exists for this semester and year");
			err.statusCode = 409;
			throw err;
		}
	}

	const created = await prisma.academicYear.create({
		data: {
			semester,
			year: typeof year === "number" ? year : null,
			startDate: startDate ? new Date(startDate) : null,
			endDate: endDate ? new Date(endDate) : null,
		},
	});
	return created;
}

export async function updateAcademicYear(id, { semester, year, startDate, endDate } = {}) {
	if (!id) {
		const err = new Error("Academic year id is required");
		err.statusCode = 400;
		throw err;
	}

	if (startDate && endDate) {
		const s = new Date(startDate);
		const e = new Date(endDate);
		if (!isNaN(s) && !isNaN(e) && s > e) {
			const err = new Error("startDate must be before endDate");
			err.statusCode = 400;
			throw err;
		}
	}

	// Ensure exists
	const existing = await prisma.academicYear.findUnique({ where: { id } });
	if (!existing) {
		const err = new Error("Academic year not found");
		err.statusCode = 404;
		throw err;
	}

	// Check if academic year is currently active (based on date range)
	// Only active academic years can be edited
	const now = new Date();
	const wibOffset = 7 * 60; // WIB = UTC+7
	const nowWIB = new Date(now.getTime() + (wibOffset + now.getTimezoneOffset()) * 60 * 1000);
	
	let isCurrentlyActive = false;
	if (existing.startDate && existing.endDate) {
		const endDate = new Date(existing.endDate);
		endDate.setHours(23, 59, 59, 999);
		isCurrentlyActive = nowWIB >= existing.startDate && nowWIB <= endDate;
	}
	
	if (!isCurrentlyActive) {
		const err = new Error("Tahun ajaran yang tidak aktif tidak dapat diedit");
		err.statusCode = 400;
		throw err;
	}

	// When both semester & year provided, prevent duplicates
	if (semester && typeof year === "number") {
		const dup = await prisma.academicYear.findFirst({ where: { semester, year, NOT: { id } } });
		if (dup) {
			const err = new Error("Another academic year with the same semester and year already exists");
			err.statusCode = 409;
			throw err;
		}
	}

	const data = {};
	if (semester) data.semester = semester;
	if (typeof year === "number") data.year = year;
	if (startDate !== undefined) data.startDate = startDate ? new Date(startDate) : null;
	if (endDate !== undefined) data.endDate = endDate ? new Date(endDate) : null;

	// Note: isActive is now computed automatically based on date range,
	// so we no longer accept or update isActive field

	const updated = await prisma.academicYear.update({ where: { id }, data });
	return updated;
}

// Re-export getActiveAcademicYear from helper for API controller
export { getActiveAcademicYear };

// Get all Academic Years with pagination
// isActive is now computed based on current date being within startDate-endDate range
export async function getAcademicYears({ page = 1, pageSize = 10, search = "" } = {}) {
	const skip = (page - 1) * pageSize;
	const take = pageSize;

	const where = search
		? {
				OR: [
					{ year: !isNaN(parseInt(search)) ? parseInt(search) : undefined },
					{ semester: { contains: search, mode: "insensitive" } },
				].filter((condition) => condition.year !== undefined || condition.semester !== undefined),
		  }
		: {};

	const [academicYears, total] = await Promise.all([
		prisma.academicYear.findMany({
			where,
			skip,
			take,
			orderBy: [{ year: "desc" }, { semester: "desc" }, { createdAt: "desc" }],
		}),
		prisma.academicYear.count({ where }),
	]);

	// Compute isActive based on current WIB date being within startDate-endDate range
	const now = new Date();
	// Convert to WIB (UTC+7)
	const wibOffset = 7 * 60; // minutes
	const nowWIB = new Date(now.getTime() + (wibOffset + now.getTimezoneOffset()) * 60 * 1000);

	const academicYearsWithStatus = academicYears.map((ay) => {
		let isActive = false;
		if (ay.startDate && ay.endDate) {
			const startDate = new Date(ay.startDate);
			const endDate = new Date(ay.endDate);
			// Set end date to end of day for inclusive comparison
			endDate.setHours(23, 59, 59, 999);
			isActive = nowWIB >= startDate && nowWIB <= endDate;
		}
		return { ...ay, isActive };
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

// Get all Users with pagination
export async function getUsers({ page = 1, pageSize = 10, search = "", identityType = "", role = "", isVerified = undefined } = {}) {
	const skip = (page - 1) * pageSize;
	const take = pageSize;

	// Build where clause with all filters
	const where = {
		AND: [
			// Search filter
			search ? {
				OR: [
					{ fullName: { contains: search, mode: "insensitive" } },
					{ email: { contains: search, mode: "insensitive" } },
					{ identityNumber: { contains: search, mode: "insensitive" } },
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
		].filter(condition => Object.keys(condition).length > 0) // Remove empty conditions
	};

	const [users, total] = await Promise.all([
		prisma.user.findMany({
			where,
			skip,
			take,
			orderBy: { createdAt: "desc" },
			include: {
				userHasRoles: {
					include: {
						role: true,
					},
				},
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
			totalPages: Math.ceil(total / pageSize),
		},
	};
}

// Get all Students with detailed information
export async function getStudents({ page = 1, pageSize = 10, search = "" } = {}) {
	const skip = (page - 1) * pageSize;
	const take = pageSize;

	const where = {
		student: { isNot: null }, // Only users with student record
		...(search
			? {
					OR: [
						{ fullName: { contains: search, mode: "insensitive" } },
						{ email: { contains: search, mode: "insensitive" } },
						{ identityNumber: { contains: search, mode: "insensitive" } },
					],
			  }
			: {}),
	};

	const [students, total] = await Promise.all([
		prisma.user.findMany({
			where,
			skip,
			take,
			orderBy: { createdAt: "desc" },
			include: {
				student: {
					include: {
						studentStatus: true,
						thesis: {
							where: {
								thesisStatus: {
									name: {
										notIn: ["Selesai", "Dibatalkan"],
									},
								},
							},
							include: {
								thesisParticipants: {
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
					sksCompleted: user.student.skscompleted,
					status: user.student.studentStatus?.name || null,
					activeTheses: user.student.thesis.map((thesis) => ({
						title: thesis.title,
						supervisors: thesis.thesisParticipants
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
		meta: {
			page,
			pageSize,
			total,
			totalPages: Math.ceil(total / pageSize),
		},
	};
}

// Get all Lecturers with detailed information
export async function getLecturers({ page = 1, pageSize = 10, search = "" } = {}) {
	const skip = (page - 1) * pageSize;
	const take = pageSize;

	const where = {
		lecturer: { isNot: null }, // Only users with lecturer record
		...(search
			? {
					OR: [
						{ fullName: { contains: search, mode: "insensitive" } },
						{ email: { contains: search, mode: "insensitive" } },
						{ identityNumber: { contains: search, mode: "insensitive" } },
					],
			  }
			: {}),
	};

	const [lecturers, total] = await Promise.all([
		prisma.user.findMany({
			where,
			skip,
			take,
			orderBy: { createdAt: "desc" },
			include: {
				lecturer: {
					include: {
						_count: {
							select: {
								thesisGuidances: {
									where: { 
										status: "accepted",
									},
								},
								thesisSeminarScores: true,
								thesisDefenceScores: true,
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
					activeGuidances: user.lecturer._count?.thesisGuidances || 0,
					seminarJuries: user.lecturer._count?.thesisSeminarScores || 0,
					defenceJuries: user.lecturer._count?.thesisDefenceScores || 0,
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

	const user = await prisma.user.findUnique({
		where: { id: userId },
		include: {
			student: {
				include: {
					studentStatus: true,
					thesis: {
						include: {
							thesisStatus: true,
							thesisTopic: true,
							thesisParticipants: {
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
							thesisSeminars: {
								include: {
									schedule: {
										include: {
											room: true,
										},
									},
									result: true,
								},
							},
							thesisDefences: {
								include: {
									schedule: {
										include: {
											room: true,
										},
									},
									status: true,
									scores: true,
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

	if (!user || !user.student) {
		const err = new Error("Mahasiswa tidak ditemukan");
		err.statusCode = 404;
		throw err;
	}

	// Transform thesis data
	const theses = user.student.thesis.map((thesis) => {
		const supervisors = thesis.thesisParticipants
			.filter((tp) => isSupervisorRole(tp.role.name))
			.map((tp) => ({
				id: tp.lecturer.user.id,
				role: tp.role.name,
				fullName: tp.lecturer.user.fullName,
				email: tp.lecturer.user.email,
			}));

		const examiners = thesis.thesisParticipants
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
			status: thesis.thesisStatus?.name || null,
			topic: thesis.thesisTopic?.name || null,
			startDate: thesis.startDate,
			deadlineDate: thesis.deadlineDate,
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
				type: s.type,
				status: s.status,
				scheduledAt: s.schedule?.scheduledAt || null,
				result: s.result?.status || null,
				score: s.result?.score || null,
			})),
			defences: thesis.thesisDefences.map((d) => ({
				id: d.id,
				status: d.status,
				scheduledAt: d.schedule?.scheduledAt || null,
				result: d.result?.status || null,
				score: d.result?.score || null,
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
			sksCompleted: user.student.skscompleted,
			status: user.student.studentStatus?.name || null,
		},
		roles: user.userHasRoles.map((ur) => ({
			id: ur.role.id,
			name: ur.role.name,
			status: ur.status,
		})),
		theses,
	};
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
		include: {
			lecturer: {
				include: {
					scienceGroup: true,
					thesisParticipants: {
						include: {
							role: true,
							thesis: {
								include: {
									thesisStatus: true,
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
						where: { status: "accepted" },
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
	const supervising = user.lecturer.thesisParticipants
		.filter((tp) => isSupervisorRole(tp.role.name))
		.map((tp) => ({
			thesisId: tp.thesis.id,
			title: tp.thesis.title,
			status: tp.thesis.thesisStatus?.name || null,
			role: tp.role.name,
			student: {
				id: tp.thesis.student.user.id,
				fullName: tp.thesis.student.user.fullName,
				nim: tp.thesis.student.user.identityNumber,
			},
		}));

	const examining = user.lecturer.thesisParticipants
		.filter((tp) => tp.role.name.toLowerCase().includes("penguji"))
		.map((tp) => ({
			thesisId: tp.thesis.id,
			title: tp.thesis.title,
			status: tp.thesis.thesisStatus?.name || null,
			role: tp.role.name,
			student: {
				id: tp.thesis.student.user.id,
				fullName: tp.thesis.student.user.fullName,
				nim: tp.thesis.student.user.identityNumber,
			},
		}));

	// Active vs completed supervising
	const activeSupervising = supervising.filter((s) => !["Selesai", "Dibatalkan"].includes(s.status));
	const completedSupervising = supervising.filter((s) => s.status === "Selesai");

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




