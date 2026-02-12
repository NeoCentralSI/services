import * as sekdepService from "../../services/insternship/sekdep.service.js";

/**
 * Controller to get all internship proposals ready for Sekdep review.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
export async function getProposals(req, res, next) {
    try {
        const data = await sekdepService.listProposals();
        res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Controller to get full detail of a specific internship proposal for Sekdep.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
export async function getProposalDetail(req, res, next) {
    try {
        const { id } = req.params;
        const data = await sekdepService.getProposalDetail(id);
        res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Controller to get all companies with their stats.
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
 * Controller to create a new company.
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
 * Controller to update a company.
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
 * Controller to delete a company.
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
