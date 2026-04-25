import * as holidayService from "../../services/insternship/holiday.service.js";

/**
 * Get all holidays.
 */
export async function getHolidays(req, res, next) {
    try {
        const { year } = req.query;
        const data = await holidayService.getAllHolidays({ year });
        res.status(200).json({
            success: true,
            data,
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Create a single holiday.
 */
export async function createHoliday(req, res, next) {
    try {
        const data = await holidayService.createHoliday(req.body);
        res.status(201).json({
            success: true,
            message: "Hari libur berhasil ditambahkan.",
            data,
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Create multiple holidays at once.
 */
export async function createManyHolidays(req, res, next) {
    try {
        const { holidays } = req.body;
        const result = await holidayService.createManyHolidays(holidays);
        res.status(201).json({
            success: true,
            message: `${result.count} hari libur berhasil ditambahkan.`,
            data: result,
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Update a holiday.
 */
export async function updateHoliday(req, res, next) {
    try {
        const { id } = req.params;
        const data = await holidayService.updateHoliday(id, req.body);
        res.status(200).json({
            success: true,
            message: "Hari libur berhasil diperbarui.",
            data,
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Delete a holiday.
 */
export async function deleteHoliday(req, res, next) {
    try {
        const { id } = req.params;
        await holidayService.deleteHoliday(id);
        res.status(200).json({
            success: true,
            message: "Hari libur berhasil dihapus.",
        });
    } catch (error) {
        next(error);
    }
}
