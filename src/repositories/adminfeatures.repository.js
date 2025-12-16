import prisma from "../config/prisma.js";

export function findUserByEmailOrIdentity(email, identityNumber) {
	const or = [];
	if (email) or.push({ email: String(email).toLowerCase() });
	if (identityNumber) or.push({ identityNumber: String(identityNumber) });
	if (or.length === 0) return null;
	return prisma.user.findFirst({ where: { OR: or } });
}

export function findUserByEmail(email) {
	if (!email) return null;
	return prisma.user.findFirst({ where: { email: String(email).toLowerCase() } });
}

export function findUserByIdentity(identityNumber) {
	if (!identityNumber) return null;
	return prisma.user.findFirst({ where: { identityNumber: String(identityNumber) } });
}

export function createUser({ fullName, email, password, identityNumber, identityType, isVerified }) {
	return prisma.user.create({
		data: { fullName, email: email ? String(email).toLowerCase() : null, password, identityNumber, identityType, isVerified },
	});
}

export async function getOrCreateRole(name) {
	const n = String(name || "").trim();
	if (!n) throw new Error("Role name is required");
	const existing = await prisma.userRole.findFirst({ where: { name: n } });
	if (existing) return existing;
	return prisma.userRole.create({ data: { name: n } });
}

export function addRolesToUser(userId, roleIds = []) {
	if (!roleIds.length) return Promise.resolve({ count: 0 });
	const data = roleIds.map((roleId) => ({ userId, roleId, status: "active" }));
	return prisma.userHasRole.createMany({ data, skipDuplicates: true });
}

export function ensureUserRole(userId, roleId) {
	return prisma.userHasRole.upsert({
		where: { userId_roleId: { userId, roleId } },
		update: {},
		create: { userId, roleId, status: "active" },
	});
}

export function findStudentStatusByName(name) {
	return prisma.studentStatus.findFirst({ where: { name } });
}
export function createStudentStatus(name) {
	return prisma.studentStatus.create({ data: { name } });
}

export function createStudentForUser({ userId, studentStatusId, enrollmentYear, skscompleted }) {
	const sks = Number.isInteger(skscompleted) && skscompleted >= 0 ? skscompleted : 0;
	return prisma.student.create({
		data: { id: userId, studentStatusId: studentStatusId || null, enrollmentYear: enrollmentYear ?? null, skscompleted: sks },
	});
}

export function findLecturerByUserId(userId) {
	return prisma.lecturer.findUnique({ where: { id: userId } });
}
export function createLecturerForUser({ userId, scienceGroupId = null }) {
	return prisma.lecturer.create({ data: { id: userId, scienceGroupId } });
}

// Admin-oriented helpers moved from user.repository.js
export function findUserById(id) {
	return prisma.user.findUnique({ where: { id } });
}
export function updateUserById(id, data) {
	return prisma.user.update({ where: { id }, data });
}
export function getUserRolesWithIds(userId) {
	return prisma.userHasRole.findMany({
		where: { userId },
		select: { roleId: true, status: true, role: { select: { id: true, name: true } } },
	});
}
export function upsertUserRole(userId, roleId, status = "active") {
	return prisma.userHasRole.upsert({
		where: { userId_roleId: { userId, roleId } },
		update: { status },
		create: { userId, roleId, status },
	});
}
export function findStudentByUserId(userId) {
	return prisma.student.findUnique({ where: { id: userId } });
}
export function findRoleByName(name) {
	return prisma.userRole.findFirst({ where: { name } });
}

