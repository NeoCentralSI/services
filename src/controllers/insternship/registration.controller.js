import * as registrationService from "../../services/insternship/registration.service.js";

/**
 * Controller to get all internship proposals for the current student.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
export async function getProposals(req, res, next) {
    try {
        // req.user.sub contains the user ID from the authentication middleware
        const studentId = req.user.sub;

        if (!studentId) {
            const err = new Error("User ID is missing from request");
            err.statusCode = 401;
            throw err;
        }

        const data = await registrationService.getStudentProposals(studentId);

        res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Controller to get all companies.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
export async function listCompanies(req, res, next) {
    try {
        const data = await registrationService.getCompanies();
        res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Controller to get all eligible students.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
export async function listEligibleStudents(req, res, next) {
    try {
        const data = await registrationService.getEligibleStudents();
        res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Controller to submit a new internship proposal.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
export async function submitProposal(req, res, next) {
    try {
        const studentId = req.user.sub;
        const { targetCompanyId, companyName, companyAddress, proposalDocumentId, memberIds } = req.body;

        if (!proposalDocumentId) {
            const err = new Error("Dokumen proposal harus diunggah.");
            err.statusCode = 400;
            throw err;
        }

        const data = await registrationService.submitProposal({
            coordinatorId: studentId,
            targetCompanyId,
            companyName,
            companyAddress,
            proposalDocumentId,
            memberIds
        });

        res.status(201).json({
            success: true,
            message: "Pendaftaran KP berhasil dikirim!",
            data
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Controller to get full detail of a specific internship proposal.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
export async function getProposalDetail(req, res, next) {
    try {
        const { id } = req.params;
        const data = await registrationService.getProposalDetail(id);

        res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Controller to respond to an internship proposal invitation.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
export async function respondToInvitation(req, res, next) {
    try {
        const { id: proposalId } = req.params;
        const { response } = req.body;
        const studentId = req.user.sub;

        const data = await registrationService.respondToInvitation(studentId, proposalId, response);

        res.status(200).json({
            success: true,
            message: `Undangan berhasil ${response === 'ACCEPTED' ? 'disetujui' : 'ditolak'}.`,
            data
        });
    } catch (error) {
        next(error);
    }
}
