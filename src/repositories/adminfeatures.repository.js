import prisma from "../config/prisma.js";

const roomListCountSelect = {
	internshipSeminars: true,
	thesisSeminars: true,
	thesisDefences: true,
	yudisiums: true,
};

function buildRoomListWhere({ search = "", status = "all" } = {}) {
	const and = [];

	if (search) {
		and.push({
			OR: [
				{ name: { contains: search } },
				{ location: { contains: search } },
			],
		});
	}

	if (status === "available") {
		and.push({
			internshipSeminars: { none: {} },
			thesisSeminars: { none: {} },
			thesisDefences: { none: {} },
			yudisiums: { none: {} },
		});
	} else if (status === "in_use") {
		and.push({
			OR: [
				{ internshipSeminars: { some: {} } },
				{ thesisSeminars: { some: {} } },
				{ thesisDefences: { some: {} } },
				{ yudisiums: { some: {} } },
			],
		});
	}

	if (and.length === 0) return {};
	return { AND: and };
}

/**
 * Paginated room list: findMany + count in a single transaction (consistent snapshot).
 */
export async function findRoomsPaginated({ status = "all", search = "", page = 1, limit = 10 } = {}) {
	const parsedPage = parseInt(String(page), 10) || 1;
	const parsedLimit = parseInt(String(limit), 10) || 10;
	const skip = (parsedPage - 1) * parsedLimit;
	const where = buildRoomListWhere({ search, status });

	const [rooms, total] = await prisma.$transaction([
		prisma.room.findMany({
			where,
			orderBy: [{ name: "asc" }, { createdAt: "desc" }],
			include: {
				_count: {
					select: roomListCountSelect,
				},
			},
			skip,
			take: parsedLimit,
		}),
		prisma.room.count({ where }),
	]);

	return { rooms, total };
}

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

export function createStudentForUser({ userId, status, enrollmentYear, skscompleted }) {
	const sks = Number.isInteger(skscompleted) && skscompleted >= 0 ? skscompleted : 0;
	return prisma.student.create({
		data: { id: userId, status: status || "active", enrollmentYear: enrollmentYear ?? null, skscompleted: sks },
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
	// Search for role name (try exact match first, then case variations)
	const n = String(name || "").trim();
	if (!n) return null;
	return prisma.userRole.findFirst({ 
		where: { 
			OR: [
				{ name: n },
				{ name: n.toLowerCase() },
				{ name: n.charAt(0).toUpperCase() + n.slice(1).toLowerCase() },
				// Title case each word
				{ name: n.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') },
			]
		} 
	});
}

export function deleteUserRole(userId, roleId) {
	return prisma.userHasRole.delete({
		where: { userId_roleId: { userId, roleId } },
	}).catch(() => null); // Ignore if not found
}

export function deleteUserRolesByIds(userId, roleIds) {
	if (!roleIds.length) return Promise.resolve({ count: 0 });
	return prisma.userHasRole.deleteMany({
		where: { userId, roleId: { in: roleIds } },
	});
}

