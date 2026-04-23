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

const parseDate = (dateStr) => {
    return new Date(dateStr);
};

const DAY_ORDER = {
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5
};

const startOfLocalDay = (date) => {
    const value = new Date(date);
    value.setHours(0, 0, 0, 0);
    return value;
};

const validateCreateValidFromNotPast = (validFrom) => {
    const today = startOfLocalDay(new Date());
    if (startOfLocalDay(validFrom) < today) {
        throw new ValidationError("Tanggal mulai berlaku tidak boleh sebelum hari ini");
    }
};

const mapAvailabilityResponse = (item) => {
    const today = startOfLocalDay(new Date());
    const validFrom = startOfLocalDay(item.validFrom);
    const validUntil = startOfLocalDay(item.validUntil);

    return {
        id: item.id,
        day: item.day,
        startTime: item.startTime,
        endTime: item.endTime,
        validFrom: item.validFrom,
        validUntil: item.validUntil,
        isActive: today >= validFrom && today <= validUntil,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
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
    if (validFrom >= validUntil) {
        throw new ValidationError("Tanggal selesai berlaku harus setelah tanggal mulai berlaku");
    }
};

const validateNoOverlap = async ({
    lecturerId,
    day,
    startTime,
    endTime,
    validFrom,
    validUntil,
    excludeId = null
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

export const getAvailabilities = async (lecturerId) => {
    const data = await repository.findAllByLecturerId(lecturerId);
    return data
        .slice()
        .sort((a, b) => {
            const dayCompare = (DAY_ORDER[a.day] ?? 99) - (DAY_ORDER[b.day] ?? 99);
            if (dayCompare !== 0) return dayCompare;
            return a.startTime - b.startTime;
        })
        .map(mapAvailabilityResponse);
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

    await validateNoOverlap({
        lecturerId,
        day: data.day,
        startTime,
        endTime,
        validFrom,
        validUntil
    });

    const created = await repository.create({
        lecturerId,
        day: data.day,
        startTime,
        endTime,
        validFrom,
        validUntil
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

    if (data.day !== undefined) updateData.day = data.day;
    if (data.startTime !== undefined) updateData.startTime = nextStartTime;
    if (data.endTime !== undefined) updateData.endTime = nextEndTime;
    if (data.validFrom !== undefined) updateData.validFrom = nextValidFrom;
    if (data.validUntil !== undefined) updateData.validUntil = nextValidUntil;

    await validateNoOverlap({
        lecturerId,
        day: nextDay,
        startTime: nextStartTime,
        endTime: nextEndTime,
        validFrom: nextValidFrom,
        validUntil: nextValidUntil,
        excludeId: id
    });

    const updated = await repository.update(id, updateData);
    return mapAvailabilityResponse(updated);
};

export const deleteAvailability = async (id, lecturerId) => {
    await ensureOwnedAvailability(id, lecturerId);

    return await repository.remove(id);
};
