import * as adminService from "../../services/insternship/admin.service.js";

/**
 * Controller to get proposals with status APPROVED_PROPOSAL for Admin.
 */
export async function getApprovedInternshipProposals(req, res, next) {
    try {
        const { academicYear } = req.query;
        const data = await adminService.getApprovedProposals(academicYear);
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
        const { academicYear } = req.query;
        const data = await adminService.getProposalsForAssignment(academicYear);
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

/**
 * Controller to verify a company response.
 */
export async function verifyCompanyResponse(req, res, next) {
    try {
        const { id: proposalId } = req.params;
        const { status, notes, acceptedMemberIds } = req.body;
        await adminService.verifyCompanyResponse(proposalId, status, notes, acceptedMemberIds);
        res.status(200).json({
            success: true,
            message: `Surat balasan berhasil ${status === 'APPROVED_PROPOSAL' ? 'diverifikasi' : 'ditolak'}.`
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Controller for admin to upload a company response document.
 * Used when the company sends the response directly to the department.
 */
export async function submitCompanyResponse(req, res, next) {
    try {
        const { id: proposalId } = req.params;
        const { documentId } = req.body;

        if (!documentId) {
            const err = new Error("ID Dokumen harus disertakan.");
            err.statusCode = 400;
            throw err;
        }

        await adminService.adminSubmitCompanyResponse(proposalId, documentId);
        res.status(200).json({
            success: true,
            message: "Surat balasan perusahaan berhasil diunggah."
        });
    } catch (error) {
        next(error);
    }
}
