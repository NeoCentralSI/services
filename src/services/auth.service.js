import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import prisma from "../config/prisma.js";
import { ENV } from "../config/env.js";
import { findUserByEmail, findUserById, updateUserPassword } from "../repositories/auth.repository.js";
import { getUserRolesWithIds } from "../repositories/adminfeatures.repository.js";
import { sendMail } from "../config/mailer.js";
import redisClient from "../config/redis.js";
import { passwordResetTemplate, accountActivationWithTempPasswordTemplate } from "../utils/emailTemplate.js";
import { generatePassword } from "../utils/password.util.js";
import crypto from "crypto";

function signAccessToken(payload) {
	return jwt.sign(payload, ENV.JWT_SECRET, { expiresIn: ENV.JWT_EXPIRES_IN || "15m" });
}

function signRefreshToken(payload) {
	return jwt.sign(payload, ENV.REFRESH_TOKEN_SECRET, { expiresIn: ENV.REFRESH_TOKEN_EXPIRES_IN || "7d" });
}

export async function loginWithEmailPassword(email, password) {
	const user = await findUserByEmail(email.toLowerCase());
	if (!user) {
		const err = new Error("Invalid credentials");
		err.statusCode = 401;
		throw err;
	}

	// Check if account is verified/activated
	if (!user.isVerified) {
		const err = new Error("Akun belum diaktivasi. Silakan aktivasi akun terlebih dahulu.");
		err.statusCode = 403;
		err.code = "NOT_VERIFIED";
		throw err;
	}

	const ok = await bcrypt.compare(password, user.password);
	if (!ok) {
		const err = new Error("Invalid credentials");
		err.statusCode = 401;
		throw err;
	}



	const payload = { sub: user.id, email: user.email };
	const accessToken = signAccessToken(payload);
	const refreshToken = signRefreshToken(payload);

	// Store refresh token hash (revocation support)
	// Store hashed refresh token into User.refreshToken (column mapped to refresh_token)
	const refreshHash = await bcrypt.hash(refreshToken, 10);
	await prisma.user.update({
		where: { id: user.id },
		data: { refreshToken: refreshHash },
	});

	// Fetch roles for the user (from user_has_roles -> user_roles)
	const roleAssignments = await getUserRolesWithIds(user.id);
	const roles = (roleAssignments || []).map((ra) => ({
		id: ra?.role?.id,
		name: ra?.role?.name,
		status: ra?.status,
	}));

	return {
		user: { id: user.id, fullName: user.fullName, email: user.email, roles },
		accessToken,
		refreshToken,
	};
}

export async function refreshTokens(refreshToken) {
	try {
		const decoded = jwt.verify(refreshToken, ENV.REFRESH_TOKEN_SECRET);
		const user = await findUserById(decoded.sub);
		if (!user || !user.refreshToken) {
			const err = new Error("Invalid refresh token");
			err.statusCode = 401;
			throw err;
		}

		const match = await bcrypt.compare(refreshToken, user.refreshToken);
		if (!match) {
			const err = new Error("Invalid refresh token");
			err.statusCode = 401;
			throw err;
		}

		const payload = { sub: user.id, email: user.email };
		const accessToken = signAccessToken(payload);
		const newRefreshToken = signRefreshToken(payload);

		// Rotate refresh token
		const newHash = await bcrypt.hash(newRefreshToken, 10);
		await prisma.user.update({ where: { id: user.id }, data: { refreshToken: newHash } });

		return { accessToken, refreshToken: newRefreshToken };
	} catch (e) {
		const err = new Error("Invalid refresh token");
		err.statusCode = 401;
		throw err;
	}
}

export async function logout(userId) {
	await prisma.user.update({ where: { id: userId }, data: { refreshToken: null } });
}

export function verifyAccessToken(token) {
	try {
		return jwt.verify(token, ENV.JWT_SECRET);
	} catch (e) {
		const err = new Error("Unauthorized");
		err.statusCode = 401;
		throw err;
	}
}

export async function changePassword(userId, currentPassword, newPassword) {
	const user = await findUserById(userId);
	if (!user || !user.password) {
		const err = new Error("User not found");
		err.statusCode = 404;
		throw err;
	}

	const ok = await bcrypt.compare(currentPassword, user.password);
	if (!ok) {
		const err = new Error("Current password is incorrect");
		err.statusCode = 400;
		throw err;
	}

	const hash = await bcrypt.hash(newPassword, 10);
	await updateUserPassword(userId, hash);

	// Optional: revoke refresh token to force new login on other sessions
	await prisma.user.update({ where: { id: userId }, data: { refreshToken: null } });
}

// -----------------------------
// Password Reset via Email (Forgot Password)
// -----------------------------
function resetKeyFor(userId, tokenId) {
	return `pwdreset:${userId}:${tokenId}`;
}

export async function requestPasswordReset(email) {
	const normalized = email?.toLowerCase?.();
	if (!normalized) return; // ignore invalid
	const user = await findUserByEmail(normalized);
	// Avoid user enumeration: always return success even if user not found
	if (!user || !user.email) return;

	if (!redisClient.isOpen) await redisClient.connect();

	const tokenId = crypto.randomBytes(16).toString("hex");
	const token = jwt.sign({ sub: user.id, jti: tokenId, purpose: "pwdreset" }, ENV.JWT_SECRET, { expiresIn: "15m" });
	const key = resetKeyFor(user.id, tokenId);
	await redisClient.setEx(key, 15 * 60, "1");

	const baseUrl = (ENV.BASE_URL || "").replace(/\/$/, "");
	const resetUrl = `${baseUrl}/auth/reset/verify?token=${encodeURIComponent(token)}`;
	const html = passwordResetTemplate({ appName: ENV.APP_NAME, fullName: user.fullName || user.email, resetUrl, expiresInMinutes: 15 });
	try {
		await sendMail({ to: user.email, subject: `${ENV.APP_NAME || "App"} - Password Reset`, html });
	} catch (e) {
		// Do not leak details to client; log server-side and still return success to avoid user enumeration
		console.error("❌ SMTP send failed:", e?.message || e);
		if (ENV.NODE_ENV !== "production") {
			console.warn("🔗 Dev hint — password reset URL:", resetUrl);
		}
	}
}

export async function verifyPasswordResetToken(token) {
	try {
		const decoded = jwt.verify(token, ENV.JWT_SECRET);
		if (decoded.purpose !== "pwdreset") throw new Error("Invalid token");
		if (!redisClient.isOpen) await redisClient.connect();
		const key = resetKeyFor(decoded.sub, decoded.jti);
		const exists = await redisClient.get(key);
		if (!exists) {
			const err = new Error("Token expired or already used");
			err.statusCode = 400;
			throw err;
		}
		return decoded;
	} catch (e) {
		const err = new Error("Invalid or expired token");
		err.statusCode = 400;
		throw err;
	}
}

export async function resetPasswordWithToken(token, newPassword) {
	const decoded = await verifyPasswordResetToken(token);
	const hash = await bcrypt.hash(newPassword, 10);
	await updateUserPassword(decoded.sub, hash);
	// consume token and revoke refreshToken
	if (!redisClient.isOpen) await redisClient.connect();
	const key = resetKeyFor(decoded.sub, decoded.jti);
	await redisClient.del(key);
	await prisma.user.update({ where: { id: decoded.sub }, data: { refreshToken: null } });
}

// -----------------------------
// Account Verification via Email
// -----------------------------
export async function verifyAccountToken(token) {
	try {
		const decoded = jwt.verify(token, ENV.JWT_SECRET);
		if (decoded.purpose !== "verify") throw new Error("Invalid token");
		const key = `verify:${decoded.sub}`;
		if (!redisClient.isOpen) await redisClient.connect();
		const exists = await redisClient.get(key);
		if (!exists) {
			const err = new Error("Token expired or already used");
			err.statusCode = 400;
			throw err;
		}
		await prisma.user.update({ where: { id: decoded.sub }, data: { isVerified: true } });
		await redisClient.del(key);
		return { userId: decoded.sub };
	} catch (e) {
		const err = new Error("Invalid or expired token");
		err.statusCode = 400;
		throw err;
	}
}

// -----------------------------
// Get Current User Profile (with roles)
// -----------------------------
export async function getUserProfile(userId) {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		include: {
			userHasRoles: {
				include: {
					role: true,
				},
			},
			student: true,
			lecturer: {
				include: {
					scienceGroup: true,
				},
			},
		},
	});

	if (!user) {
		const err = new Error("User not found");
		err.statusCode = 404;
		throw err;
	}

	// Map roles
	const roles = user.userHasRoles.map((ur) => ({
		id: ur.role.id,
		name: ur.role.name,
		status: ur.status,
	}));

	// Build response
	const profile = {
		id: user.id,
		fullName: user.fullName,
		email: user.email,
		identityNumber: user.identityNumber,
		identityType: user.identityType,
		phoneNumber: user.phoneNumber,
		isVerified: user.isVerified,
		avatarUrl: user.avatarUrl || null,
		roles,
		createdAt: user.createdAt,
		updatedAt: user.updatedAt,
	};

	// Add student info if exists
	if (user.student) {
		profile.student = {
			id: user.student.id,
			enrollmentYear: user.student.enrollmentYear,
			sksCompleted: user.student.skscompleted,
			status: user.student.status || null,
		};
	}

	// Add lecturer info if exists
	if (user.lecturer) {
		profile.lecturer = {
			id: user.lecturer.id,
			scienceGroup: user.lecturer.scienceGroup?.name || null,
			data: user.lecturer.data || null,
		};
	}

	return profile;
}

// -----------------------------
// User-initiated Account Activation Request
// -----------------------------
export async function requestAccountVerification(email) {
	const normalized = email?.toLowerCase?.();
	if (!normalized) {
		const err = new Error("Email is required");
		err.statusCode = 400;
		throw err;
	}
	const user = await findUserByEmail(normalized);
	// If not found, return explicit info for frontend as requested
	if (!user || !user.email) {
		return { found: false, message: "Email tidak terdaftar. Silakan hubungi admin untuk aktivasi akun." };
	}
	// If already verified, noop
	if (user.isVerified) {
		return { found: true, alreadyVerified: true, message: "Akun sudah terverifikasi." };
	}

	// Always generate a temporary password for activation flow (reset any existing one)
	const temporaryPassword = generatePassword(10);
	const hash = await bcrypt.hash(temporaryPassword, 10);
	await updateUserPassword(user.id, hash);

	if (!redisClient.isOpen) await redisClient.connect();

	const token = jwt.sign({ sub: user.id, purpose: "verify" }, ENV.JWT_SECRET, { expiresIn: "1d" });
	// store a simple flag to allow single-use (24h TTL)
	await redisClient.setEx(`verify:${user.id}`, 24 * 60 * 60, "1");

	const baseUrl = (ENV.BASE_URL || "").replace(/\/$/, "");
	const verifyUrl = `${baseUrl}/auth/verify?token=${encodeURIComponent(token)}`;
	const html = accountActivationWithTempPasswordTemplate({
		appName: ENV.APP_NAME,
		fullName: user.fullName || user.email,
		email: user.email,
		temporaryPassword,
		verifyUrl,
	});
	try {
		await sendMail({ to: user.email, subject: `${ENV.APP_NAME || "App"} - Activate Your Account`, html });
	} catch (e) {
		// log server-side, but don't reveal to client
		console.error("❌ SMTP send failed (verify request):", e?.message || e);
	}

	return { found: true, alreadyVerified: false, sent: true };
}

