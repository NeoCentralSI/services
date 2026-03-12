import * as adminService from "../../services/insternship/admin.service.js";

/**
 * Controller to get proposals with status APPROVED_PROPOSAL for Admin.
 */
export async function getApprovedInternshipProposals(req, res, next) {
    try {
        const data = await adminService.getApprovedProposals();
        res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Controller to get all companies with their stats for Admin.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
export async function getCompaniesWithStats(req, res, next) {
    try {
        const { q, page = 1, pageSize = 10, sortBy, sortOrder, status } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(pageSize);
        const take = parseInt(pageSize);

        const { data, total } = await adminService.getCompaniesStats({ q, skip, take, sortBy, sortOrder, status });
        res.status(200).json({
            success: true,
            data,
            total
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Controller to get detail for a single proposal letter management.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
export async function getProposalLetterDetail(req, res, next) {
    try {
        const { id } = req.params;
        const data = await adminService.getProposalLetterDetail(id);
        res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Controller to update application letter details.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
export async function updateProposalLetter(req, res, next) {
    try {
        const { id } = req.params;
        const data = await adminService.saveApplicationLetter(id, req.body);
        res.status(200).json({
            success: true,
            message: "Data surat pengantar berhasil diperbarui.",
            data
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Controller to get proposals that need "Surat Tugas" for Admin.
 */
export async function getAssignmentProposals(req, res, next) {
    try {
        const data = await adminService.getProposalsForAssignment();
        res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Controller to get assignment letter detail.
 */
export async function getAssignmentLetterDetail(req, res, next) {
    try {
        const { id } = req.params;
        const data = await adminService.getAssignmentLetterDetail(id);
        res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Controller to update assignment letter details.
 */
export async function updateAssignmentLetter(req, res, next) {
    try {
        const { id } = req.params;
        const data = await adminService.saveAssignmentLetter(id, req.body);
        res.status(200).json({
            success: true,
            message: "Data surat tugas berhasil diperbarui.",
            data
        });
    } catch (error) {
        next(error);
    }
}
