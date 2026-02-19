import * as kadepService from "../../services/insternship/kadep.service.js";
import * as sekdepService from "../../services/insternship/sekdep.service.js";

/**
 * Controller to get all companies with their stats for Kadep.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
export async function getCompaniesWithStats(req, res, next) {
    try {
        const data = await sekdepService.getCompaniesStats();
        res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Controller to get all pending letters for Kadep.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
export async function getPendingLetters(req, res, next) {
    try {
        const data = await kadepService.getPendingLetters();
        res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Controller to approve/sign a letter.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
export async function approveLetter(req, res, next) {
    try {
        const { type, id, signaturePositions } = req.body;
        const userId = req.user.sub || req.user.id; // From authMiddleware (sub is standard for JWT)

        const data = await kadepService.approveLetter(userId, type, id, signaturePositions);

        res.status(200).json({
            success: true,
            message: "Surat berhasil disetujui dan ditandatangani.",
            data
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Controller to create a new company for Kadep.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
export async function createCompany(req, res, next) {
    try {
        const data = await sekdepService.createCompany(req.body);
        res.status(201).json({
            success: true,
            message: "Perusahaan berhasil ditambahkan.",
            data
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Controller to update a company for Kadep.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
export async function updateCompany(req, res, next) {
    try {
        const { id } = req.params;
        const data = await sekdepService.updateCompany(id, req.body);
        res.status(200).json({
            success: true,
            message: "Perusahaan berhasil diperbarui.",
            data
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Controller to delete a company for Kadep.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
export async function deleteCompany(req, res, next) {
    try {
        const { id } = req.params;
        await sekdepService.deleteCompany(id);
        res.status(200).json({
            success: true,
            message: "Perusahaan berhasil dihapus."
        });
    } catch (error) {
        next(error);
    }
}
