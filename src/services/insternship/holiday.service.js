import * as holidayRepository from "../../repositories/insternship/holiday.repository.js";

/**
 * Get all holidays with optional year filter.
 * @param {Object} [params]
 * @param {string} [params.year]
 * @returns {Promise<Array>}
 */
export async function getAllHolidays({ year } = {}) {
    return holidayRepository.findAll({ year });
}

/**
 * Get holidays within a date range (for working days calculation).
 * @param {Date|string} startDate
 * @param {Date|string} endDate
 * @returns {Promise<Date[]>} Array of holiday Date objects
 */
export async function getHolidayDatesInRange(startDate, endDate) {
    const holidays = await holidayRepository.findInRange(startDate, endDate);
    return holidays.map((h) => h.holidayDate);
}

/**
 * Create a holiday.
 * @param {Object} data - { holidayDate, name }
 * @returns {Promise<Object>}
 */
export async function createHoliday(data) {
    if (!data.holidayDate) {
        const error = new Error("Tanggal libur wajib diisi.");
        error.statusCode = 400;
        throw error;
    }

    try {
        return await holidayRepository.create(data);
    } catch (err) {
        if (err.code === "P2002") {
            const error = new Error("Tanggal libur tersebut sudah terdaftar.");
            error.statusCode = 409;
            throw error;
        }
        throw err;
    }
}

/**
 * Create multiple holidays at once.
 * @param {Array<{holidayDate: string, name?: string}>} holidays
 * @returns {Promise<Object>}
 */
export async function createManyHolidays(holidays) {
    if (!Array.isArray(holidays) || holidays.length === 0) {
        const error = new Error("Daftar tanggal libur tidak boleh kosong.");
        error.statusCode = 400;
        throw error;
    }

    return holidayRepository.createMany(holidays);
}

/**
 * Update a holiday.
 * @param {string} id
 * @param {Object} data
 * @returns {Promise<Object>}
 */
export async function updateHoliday(id, data) {
    try {
        return await holidayRepository.update(id, data);
    } catch (err) {
        if (err.code === "P2025") {
            const error = new Error("Hari libur tidak ditemukan.");
            error.statusCode = 404;
            throw error;
        }
        if (err.code === "P2002") {
            const error = new Error("Tanggal libur tersebut sudah terdaftar.");
            error.statusCode = 409;
            throw error;
        }
        throw err;
    }
}

/**
 * Delete a holiday.
 * @param {string} id
 * @returns {Promise<Object>}
 */
export async function deleteHoliday(id) {
    try {
        return await holidayRepository.remove(id);
    } catch (err) {
        if (err.code === "P2025") {
            const error = new Error("Hari libur tidak ditemukan.");
            error.statusCode = 404;
            throw error;
        }
        throw err;
    }
}
