import * as repository from "../repositories/supervisionQuota.repository.js";

class NotFoundError extends Error {
	constructor(message) {
		super(message);
		this.name = "NotFoundError";
		this.statusCode = 404;
	}
}

class ValidationError extends Error {
	constructor(message) {
		super(message);
		this.name = "ValidationError";
		this.statusCode = 400;
	}
}

/**
 * Get default quota for an academic year.
 * Returns fallback values if no default has been set.
 */
export const getDefaultQuota = async (academicYearId) => {
	const quota = await repository.findDefaultByAcademicYear(academicYearId);
	return quota || { quotaMax: 10, quotaSoftLimit: 8, academicYearId };
};

/**
 * Set default quota for an academic year and auto-generate
 * rows for all lecturers that don't have one yet.
 */
export const setDefaultQuota = async (academicYearId, { quotaMax, quotaSoftLimit }) => {
	if (quotaSoftLimit > quotaMax) {
		throw new ValidationError("Soft limit tidak boleh lebih besar dari hard limit (quota max)");
	}
	if (quotaMax < 1) {
		throw new ValidationError("Quota max harus minimal 1");
	}
	if (quotaSoftLimit < 0) {
		throw new ValidationError("Soft limit tidak boleh negatif");
	}

	const defaultQuota = await repository.upsertDefault(academicYearId, { quotaMax, quotaSoftLimit });

	// Auto-generate for all lecturers
	const result = await repository.generateQuotasForAllLecturers(academicYearId, quotaMax, quotaSoftLimit);

	return {
		defaultQuota,
		generated: result,
	};
};

/**
 * Get all lecturer quotas for an academic year.
 */
export const getLecturerQuotas = async (academicYearId, search = "") => {
	const quotas = await repository.findAllLecturerQuotas(academicYearId, search);
	return quotas.map((q) => ({
		id: q.id,
		lecturerId: q.lecturerId,
		fullName: q.lecturer?.user?.fullName || "-",
		identityNumber: q.lecturer?.user?.identityNumber || "-",
		email: q.lecturer?.user?.email || "-",
		scienceGroup: q.lecturer?.scienceGroup?.name || null,
		quotaMax: q.quotaMax,
		quotaSoftLimit: q.quotaSoftLimit,
		currentCount: q.currentCount,
		notes: q.notes,
		remaining: q.quotaMax - q.currentCount,
		isNearLimit: q.currentCount >= q.quotaSoftLimit,
		isFull: q.currentCount >= q.quotaMax,
	}));
};

/**
 * Update an individual lecturer's quota (override).
 */
export const updateLecturerQuota = async (lecturerId, academicYearId, data) => {
	const { quotaMax, quotaSoftLimit, notes } = data;

	if (quotaSoftLimit !== undefined && quotaMax !== undefined && quotaSoftLimit > quotaMax) {
		throw new ValidationError("Soft limit tidak boleh lebih besar dari hard limit (quota max)");
	}

	if (quotaMax !== undefined && quotaMax < 0) {
		throw new ValidationError("Quota max tidak boleh negatif");
	}

	const updateData = {};
	if (quotaMax !== undefined) updateData.quotaMax = quotaMax;
	if (quotaSoftLimit !== undefined) updateData.quotaSoftLimit = quotaSoftLimit;
	if (notes !== undefined) updateData.notes = notes;

	const result = await repository.upsertLecturerQuota(lecturerId, academicYearId, updateData);
	return {
		id: result.id,
		lecturerId: result.lecturerId,
		fullName: result.lecturer?.user?.fullName || "-",
		identityNumber: result.lecturer?.user?.identityNumber || "-",
		quotaMax: result.quotaMax,
		quotaSoftLimit: result.quotaSoftLimit,
		currentCount: result.currentCount,
		notes: result.notes,
	};
};
