import * as repository from "../repositories/lecturer-availability.repository.js";

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

class ForbiddenError extends Error {
    constructor(message) {
        super(message);
        this.name = "ForbiddenError";
        this.statusCode = 403;
    }
}

const parseTime = (timeStr) => {
    const [hours, minutes] = timeStr.split(":").map(Number);
    return new Date(Date.UTC(1970, 0, 1, hours, minutes, 0));
};

/**
 * Parse YYYY-MM-DD as a calendar date at UTC midnight (matches @db.Date, avoids local TZ shifts).
 */
const parseDate = (dateStr) => {
    const parts = String(dateStr).split("T")[0].split("-").map(Number);
    const [y, m, d] = parts;
    if (!y || !m || !d) {
        throw new ValidationError("Format tanggal tidak valid");
    }
    return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
};

const calendarUtcStamp = (d) =>
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

const DAY_ORDER = {
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
};

const validateCreateValidFromNotPast = (validFrom) => {
    const today = repository.utcTodayCalendarStart();
    if (calendarUtcStamp(validFrom) < calendarUtcStamp(today)) {
        throw new ValidationError("Tanggal mulai berlaku tidak boleh sebelum hari ini");
    }
};

/**
 * On update: new validFrom may be before "today", but not earlier than this row's current
 * valid-from (the start of the validity window as stored — same as "first saved" until moved).
 */
const validateUpdateValidFromNotBeforeExisting = (existingValidFrom, nextValidFrom) => {
    if (calendarUtcStamp(nextValidFrom) < calendarUtcStamp(existingValidFrom)) {
        throw new ValidationError(
            "Tanggal mulai berlaku tidak boleh lebih awal dari tanggal mulai berlaku yang sudah tercatat untuk jadwal ini"
        );
    }
};

const mapAvailabilityResponse = (item) => {
    const today = repository.utcTodayCalendarStart();
    const t0 = calendarUtcStamp(today);
    const vf = calendarUtcStamp(new Date(item.validFrom));
    const vu = calendarUtcStamp(new Date(item.validUntil));

    return {
        id: item.id,
        day: item.day,
        startTime: item.startTime,
        endTime: item.endTime,
        validFrom: item.validFrom,
        validUntil: item.validUntil,
        isActive: t0 >= vf && t0 <= vu,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
    };
};

const ensureOwnedAvailability = async (id, lecturerId) => {
    const availability = await repository.findById(id);
    if (!availability) {
        throw new NotFoundError("Jadwal ketersediaan tidak ditemukan");
    }
    if (availability.lecturerId !== lecturerId) {
        throw new ForbiddenError("Anda tidak memiliki akses pada jadwal ini");
    }
    return availability;
};

const validateTimeRange = (startTime, endTime) => {
    if (startTime >= endTime) {
        throw new ValidationError("Waktu selesai harus setelah waktu mulai");
    }
};

const validateDateRange = (validFrom, validUntil) => {
    if (calendarUtcStamp(validFrom) >= calendarUtcStamp(validUntil)) {
        throw new ValidationError("Tanggal selesai berlaku harus setelah tanggal mulai berlaku");
    }
};

const validateNoDuplicateSlot = async ({
    lecturerId,
    day,
    startTime,
    endTime,
    validFrom,
    validUntil,
    excludeId = null,
}) => {
    const dup = await repository.findExactDuplicate(
        lecturerId,
        day,
        startTime,
        endTime,
        validFrom,
        validUntil,
        excludeId
    );
    if (dup) {
        throw new ValidationError(
            "Jadwal dengan hari, waktu, dan periode berlaku yang sama sudah ada"
        );
    }
};

const validateNoOverlap = async ({
    lecturerId,
    day,
    startTime,
    endTime,
    validFrom,
    validUntil,
    excludeId = null,
}) => {
    const overlap = await repository.findOverlapping(
        lecturerId,
        day,
        startTime,
        endTime,
        validFrom,
        validUntil,
        excludeId
    );
    if (overlap) {
        throw new ValidationError(
            "Jadwal tumpang tindih dengan ketersediaan lain pada hari, waktu, dan periode berlaku yang beririsan"
        );
    }
};

const sortAvailabilities = (rows) =>
    rows.slice().sort((a, b) => {
        const dayCompare = (DAY_ORDER[a.day] ?? 99) - (DAY_ORDER[b.day] ?? 99);
        if (dayCompare !== 0) return dayCompare;
        return a.startTime - b.startTime;
    });

/**
 * @param {string} lecturerId
 * @param {{ page?: number; limit?: number; search?: string; status?: string }} params
 */
export const getAvailabilities = async (lecturerId, params = {}) => {
    const parsedPage = parseInt(String(params.page), 10) || 1;
    const parsedLimit = parseInt(String(params.limit), 10) || 10;
    const search = String(params.search || "").trim();
    const status = ["all", "active", "inactive"].includes(params.status) ? params.status : "all";

    const [total, rows] = await repository.findAvailabilitiesListTransaction(lecturerId, {
        status,
        search,
    });

    const sorted = sortAvailabilities(rows);
    const skip = (parsedPage - 1) * parsedLimit;
    const pageRows = sorted.slice(skip, skip + parsedLimit);

    return {
        data: pageRows.map(mapAvailabilityResponse),
        total,
    };
};

export const getAvailabilityById = async (id, lecturerId) => {
    const availability = await ensureOwnedAvailability(id, lecturerId);
    return mapAvailabilityResponse(availability);
};

export const createAvailability = async (lecturerId, data) => {
    const startTime = parseTime(data.startTime);
    const endTime = parseTime(data.endTime);
    validateTimeRange(startTime, endTime);

    const validFrom = parseDate(data.validFrom);
    const validUntil = parseDate(data.validUntil);
    validateDateRange(validFrom, validUntil);
    validateCreateValidFromNotPast(validFrom);

    await validateNoDuplicateSlot({
        lecturerId,
        day: data.day,
        startTime,
        endTime,
        validFrom,
        validUntil,
    });

    await validateNoOverlap({
        lecturerId,
        day: data.day,
        startTime,
        endTime,
        validFrom,
        validUntil,
    });

    const created = await repository.create({
        lecturerId,
        day: data.day,
        startTime,
        endTime,
        validFrom,
        validUntil,
    });
    return mapAvailabilityResponse(created);
};

export const updateAvailability = async (id, lecturerId, data) => {
    const existing = await ensureOwnedAvailability(id, lecturerId);

    const updateData = {};
    const nextDay = data.day ?? existing.day;
    const nextStartTime = data.startTime ? parseTime(data.startTime) : existing.startTime;
    const nextEndTime = data.endTime ? parseTime(data.endTime) : existing.endTime;
    const nextValidFrom = data.validFrom ? parseDate(data.validFrom) : existing.validFrom;
    const nextValidUntil = data.validUntil ? parseDate(data.validUntil) : existing.validUntil;

    validateTimeRange(nextStartTime, nextEndTime);
    validateDateRange(nextValidFrom, nextValidUntil);

    if (data.validFrom !== undefined) {
        validateUpdateValidFromNotBeforeExisting(existing.validFrom, nextValidFrom);
    }

    if (data.day !== undefined) updateData.day = data.day;
    if (data.startTime !== undefined) updateData.startTime = nextStartTime;
    if (data.endTime !== undefined) updateData.endTime = nextEndTime;
    if (data.validFrom !== undefined) updateData.validFrom = nextValidFrom;
    if (data.validUntil !== undefined) updateData.validUntil = nextValidUntil;

    if (Object.keys(updateData).length === 0) {
        return mapAvailabilityResponse(existing);
    }

    await validateNoDuplicateSlot({
        lecturerId,
        day: nextDay,
        startTime: nextStartTime,
        endTime: nextEndTime,
        validFrom: nextValidFrom,
        validUntil: nextValidUntil,
        excludeId: id,
    });

    await validateNoOverlap({
        lecturerId,
        day: nextDay,
        startTime: nextStartTime,
        endTime: nextEndTime,
        validFrom: nextValidFrom,
        validUntil: nextValidUntil,
        excludeId: id,
    });

    const updated = await repository.update(id, updateData);
    return mapAvailabilityResponse(updated);
};

export const deleteAvailability = async (id, lecturerId) => {
    await ensureOwnedAvailability(id, lecturerId);

    return await repository.remove(id);
};
