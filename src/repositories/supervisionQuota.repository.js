import prisma from "../config/prisma.js";

/**
 * Find default quota for an academic year
 */
export const findDefaultByAcademicYear = async (academicYearId) => {
	return await prisma.supervisionQuotaDefault.findUnique({
		where: { academicYearId },
	});
};

/**
 * Upsert default quota for an academic year
 */
export const upsertDefault = async (academicYearId, { quotaMax, quotaSoftLimit }) => {
	return await prisma.supervisionQuotaDefault.upsert({
		where: { academicYearId },
		update: { quotaMax, quotaSoftLimit },
		create: { academicYearId, quotaMax, quotaSoftLimit },
	});
};

/**
 * Find all lecturer quotas for an academic year (with lecturer + user info)
 */
export const findAllLecturerQuotas = async (academicYearId, search = "") => {
	const where = { academicYearId };

	if (search) {
		where.lecturer = {
			user: {
				OR: [
					{ fullName: { contains: search } },
					{ identityNumber: { contains: search } },
				],
			},
		};
	}

	return await prisma.lecturerSupervisionQuota.findMany({
		where,
		include: {
			lecturer: {
				include: {
					user: {
						select: {
							id: true,
							fullName: true,
							identityNumber: true,
							email: true,
						},
					},
					scienceGroup: { select: { id: true, name: true } },
				},
			},
		},
		orderBy: {
			lecturer: { user: { fullName: "asc" } },
		},
	});
};

/**
 * Find a single lecturer's quota for an academic year
 */
export const findLecturerQuota = async (lecturerId, academicYearId) => {
	return await prisma.lecturerSupervisionQuota.findUnique({
		where: {
			lecturerId_academicYearId: { lecturerId, academicYearId },
		},
		include: {
			lecturer: {
				include: {
					user: {
						select: { id: true, fullName: true, identityNumber: true },
					},
				},
			},
		},
	});
};

/**
 * Upsert a single lecturer's quota
 */
export const upsertLecturerQuota = async (lecturerId, academicYearId, data) => {
	return await prisma.lecturerSupervisionQuota.upsert({
		where: {
			lecturerId_academicYearId: { lecturerId, academicYearId },
		},
		update: data,
		create: { lecturerId, academicYearId, ...data },
		include: {
			lecturer: {
				include: {
					user: {
						select: { id: true, fullName: true, identityNumber: true },
					},
				},
			},
		},
	});
};

/**
 * Generate/update quotas for all lecturers in the given academic year.
 * - Creates quota for lecturers who don't have one
 * - Updates existing quotas to match the new default (applies to all dosen)
 */
export const generateQuotasForAllLecturers = async (academicYearId, quotaMax, quotaSoftLimit) => {
	const lecturers = await prisma.lecturer.findMany({
		select: { id: true },
	});

	if (lecturers.length === 0) return { created: 0, updated: 0, total: 0 };

	let created = 0;
	let updated = 0;

	for (const lecturer of lecturers) {
		const existing = await prisma.lecturerSupervisionQuota.findUnique({
			where: {
				lecturerId_academicYearId: {
					lecturerId: lecturer.id,
					academicYearId,
				},
			},
		});

		if (!existing) {
			await prisma.lecturerSupervisionQuota.create({
				data: {
					lecturerId: lecturer.id,
					academicYearId,
					quotaMax,
					quotaSoftLimit,
				},
			});
			created++;
		} else {
			await prisma.lecturerSupervisionQuota.update({
				where: { id: existing.id },
				data: { quotaMax, quotaSoftLimit },
			});
			updated++;
		}
	}

	return { created, updated, total: lecturers.length };
};
