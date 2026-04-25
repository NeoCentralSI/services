import prisma from "../config/prisma.js";

/** UTC midnight for calendar date (aligns with @db.Date storage). */
export function utcCalendarDate(y, m, d) {
    return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}

export function utcTodayCalendarStart(date = new Date()) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

/**
 * Build filter: weekday search (Indonesian / English substring).
 * Returns null = no day constraint (search did not match a weekday).
 */
export function dayFilterFromSearch(searchRaw) {
    const search = String(searchRaw || "")
        .trim()
        .toLowerCase();
    if (!search) return null;

    const pairs = [
        ["senin", "monday"],
        ["selasa", "tuesday"],
        ["rabu", "wednesday"],
        ["kamis", "thursday"],
        ["jumat", "friday"],
        ["monday", "monday"],
        ["tuesday", "tuesday"],
        ["wednesday", "wednesday"],
        ["thursday", "thursday"],
        ["friday", "friday"],
    ];

    const matched = new Set();
    for (const [label, day] of pairs) {
        if (label.includes(search) || search.includes(label)) {
            matched.add(day);
        }
    }
    if (matched.size === 0) return null;
    return { day: { in: [...matched] } };
}

export function buildListWhere(lecturerId, { status = "all", search = "" } = {}) {
    const AND = [{ lecturerId }];
    const today = utcTodayCalendarStart();

    if (status === "active") {
        AND.push({ validFrom: { lte: today } }, { validUntil: { gte: today } });
    } else if (status === "inactive") {
        AND.push({
            OR: [{ validFrom: { gt: today } }, { validUntil: { lt: today } }],
        });
    }

    const dayFilter = dayFilterFromSearch(search);
    if (dayFilter) {
        AND.push(dayFilter);
    }

    return { AND };
}

/**
 * List: count + all matching rows in one transaction; caller sorts & paginates in memory.
 * Keeps correct weekday order without raw SQL; acceptable while per-lecturer row counts stay modest.
 */
export async function findAvailabilitiesListTransaction(lecturerId, filters) {
    const where = buildListWhere(lecturerId, filters);

    return prisma.$transaction([
        prisma.lecturerAvailability.count({ where }),
        prisma.lecturerAvailability.findMany({ where }),
    ]);
}

export const findAllByLecturerId = async (lecturerId) => {
    return await prisma.lecturerAvailability.findMany({
        where: { lecturerId },
        orderBy: [{ day: "asc" }, { startTime: "asc" }],
    });
};

export const findById = async (id) => {
    return await prisma.lecturerAvailability.findUnique({
        where: { id },
    });
};

export const create = async (data) => {
    return await prisma.lecturerAvailability.create({ data });
};

export const update = async (id, data) => {
    return await prisma.lecturerAvailability.update({
        where: { id },
        data,
    });
};

export const remove = async (id) => {
    return await prisma.lecturerAvailability.delete({
        where: { id },
    });
};

export const findOverlapping = async (
    lecturerId,
    day,
    startTime,
    endTime,
    validFrom,
    validUntil,
    excludeId = null
) => {
    const where = {
        lecturerId,
        day,
        startTime: { lt: endTime },
        endTime: { gt: startTime },
        validFrom: { lt: validUntil },
        validUntil: { gt: validFrom },
    };
    if (excludeId) {
        where.id = { not: excludeId };
    }
    return await prisma.lecturerAvailability.findFirst({ where });
};

/** Identical slot (same lecturer, day, times, validity window). */
export const findExactDuplicate = async (
    lecturerId,
    day,
    startTime,
    endTime,
    validFrom,
    validUntil,
    excludeId = null
) => {
    const where = {
        lecturerId,
        day,
        startTime,
        endTime,
        validFrom,
        validUntil,
    };
    if (excludeId) {
        where.id = { not: excludeId };
    }
    return await prisma.lecturerAvailability.findFirst({ where });
};
