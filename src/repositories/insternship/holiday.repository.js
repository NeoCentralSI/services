import prisma from "../../config/prisma.js";

/**
 * Get all holidays, ordered by date ascending.
 * @param {Object} [params]
 * @param {string} [params.year] - Filter by year (optional)
 * @returns {Promise<Array>}
 */
export async function findAll({ year } = {}) {
    const where = {};
    if (year) {
        const startOfYear = new Date(`${year}-01-01`);
        const endOfYear = new Date(`${parseInt(year) + 1}-01-01`);
        where.holidayDate = {
            gte: startOfYear,
            lt: endOfYear,
        };
    }

    return prisma.internshipHoliday.findMany({
        where,
        orderBy: { holidayDate: "asc" },
    });
}

/**
 * Get holidays within a date range.
 * @param {Date|string} startDate
 * @param {Date|string} endDate
 * @returns {Promise<Array>}
 */
export async function findInRange(startDate, endDate) {
    return prisma.internshipHoliday.findMany({
        where: {
            holidayDate: {
                gte: new Date(startDate),
                lte: new Date(endDate),
            },
        },
        orderBy: { holidayDate: "asc" },
    });
}

/**
 * Create a holiday.
 * @param {Object} data - { holidayDate, name }
 * @returns {Promise<Object>}
 */
export async function create(data) {
    return prisma.internshipHoliday.create({
        data: {
            holidayDate: new Date(data.holidayDate),
            name: data.name || null,
        },
    });
}

/**
 * Create multiple holidays at once.
 * @param {Array<{holidayDate: string, name?: string}>} holidays
 * @returns {Promise<Object>}
 */
export async function createMany(holidays) {
    return prisma.internshipHoliday.createMany({
        data: holidays.map((h) => ({
            holidayDate: new Date(h.holidayDate),
            name: h.name || null,
        })),
        skipDuplicates: true,
    });
}

/**
 * Update a holiday.
 * @param {string} id
 * @param {Object} data - { holidayDate, name }
 * @returns {Promise<Object>}
 */
export async function update(id, data) {
    const updateData = {};
    if (data.holidayDate) updateData.holidayDate = new Date(data.holidayDate);
    if (data.name !== undefined) updateData.name = data.name;

    return prisma.internshipHoliday.update({
        where: { id },
        data: updateData,
    });
}

/**
 * Delete a holiday by ID.
 * @param {string} id
 * @returns {Promise<Object>}
 */
export async function remove(id) {
    return prisma.internshipHoliday.delete({
        where: { id },
    });
}
