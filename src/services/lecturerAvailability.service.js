import * as repository from "../repositories/lecturerAvailability.repository.js";

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

/**
 * Parse "HH:mm" string into a Date with only time component (1970-01-01) in UTC.
 * Prisma @db.Time(0) stores/returns time in UTC, so we must construct UTC dates.
 */
const parseTime = (timeStr) => {
    const [hours, minutes] = timeStr.split(":").map(Number);
    return new Date(Date.UTC(1970, 0, 1, hours, minutes, 0));
};

/**
 * Parse "YYYY-MM-DD" date string into a Date object.
 */
const parseDate = (dateStr) => {
    return new Date(dateStr);
};

export const getMyAvailabilities = async (lecturerId) => {
    const data = await repository.findAllByLecturerId(lecturerId);

    return data.map((item) => ({
        id: item.id,
        day: item.day,
        startTime: item.startTime,
        endTime: item.endTime,
        validFrom: item.validFrom,
        validUntil: item.validUntil,
        isActive: item.isActive,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
    }));
};

export const createAvailability = async (lecturerId, data) => {
    const startTime = parseTime(data.startTime);
    const endTime = parseTime(data.endTime);

    if (startTime >= endTime) {
        throw new ValidationError("Waktu mulai harus sebelum waktu selesai");
    }

    const validFrom = parseDate(data.validFrom);
    const validUntil = parseDate(data.validUntil);

    if (validFrom >= validUntil) {
        throw new ValidationError("Tanggal mulai berlaku harus sebelum tanggal selesai berlaku");
    }

    // Validate: validFrom must not be in the past
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (validFrom < today) {
        throw new ValidationError("Tanggal mulai berlaku tidak boleh di masa lalu");
    }

    // Check for overlapping availability on the same day
    const overlap = await repository.findOverlapping(lecturerId, data.day, startTime, endTime);
    if (overlap) {
        throw new ValidationError("Jadwal tumpang tindih dengan ketersediaan yang sudah ada pada hari yang sama");
    }

    return await repository.create({
        lecturerId,
        day: data.day,
        startTime,
        endTime,
        validFrom,
        validUntil
    });
};

export const updateAvailability = async (id, lecturerId, data) => {
    const existing = await repository.findById(id);
    if (!existing) {
        throw new NotFoundError("Jadwal ketersediaan tidak ditemukan");
    }
    if (existing.lecturerId !== lecturerId) {
        throw new ForbiddenError("Anda tidak memiliki akses untuk mengubah jadwal ini");
    }

    const updateData = {};

    if (data.day !== undefined) updateData.day = data.day;

    if (data.startTime !== undefined || data.endTime !== undefined) {
        const startTime = data.startTime ? parseTime(data.startTime) : existing.startTime;
        const endTime = data.endTime ? parseTime(data.endTime) : existing.endTime;

        if (startTime >= endTime) {
            throw new ValidationError("Waktu mulai harus sebelum waktu selesai");
        }

        if (data.startTime !== undefined) updateData.startTime = startTime;
        if (data.endTime !== undefined) updateData.endTime = endTime;

        // Check overlap with new times
        const day = data.day || existing.day;
        const overlap = await repository.findOverlapping(lecturerId, day, startTime, endTime, id);
        if (overlap) {
            throw new ValidationError("Jadwal tumpang tindih dengan ketersediaan yang sudah ada pada hari yang sama");
        }
    }

    if (data.validFrom !== undefined || data.validUntil !== undefined) {
        const validFrom = data.validFrom ? parseDate(data.validFrom) : existing.validFrom;
        const validUntil = data.validUntil ? parseDate(data.validUntil) : existing.validUntil;

        if (validFrom >= validUntil) {
            throw new ValidationError("Tanggal mulai berlaku harus sebelum tanggal selesai berlaku");
        }

        if (data.validFrom !== undefined) updateData.validFrom = validFrom;
        if (data.validUntil !== undefined) updateData.validUntil = validUntil;
    }

    return await repository.update(id, updateData);
};

export const toggleAvailability = async (id, lecturerId) => {
    const existing = await repository.findById(id);
    if (!existing) {
        throw new NotFoundError("Jadwal ketersediaan tidak ditemukan");
    }
    if (existing.lecturerId !== lecturerId) {
        throw new ForbiddenError("Anda tidak memiliki akses untuk mengubah jadwal ini");
    }

    return await repository.update(id, { isActive: !existing.isActive });
};

export const deleteAvailability = async (id, lecturerId) => {
    const existing = await repository.findById(id);
    if (!existing) {
        throw new NotFoundError("Jadwal ketersediaan tidak ditemukan");
    }
    if (existing.lecturerId !== lecturerId) {
        throw new ForbiddenError("Anda tidak memiliki akses untuk menghapus jadwal ini");
    }

    return await repository.remove(id);
};
