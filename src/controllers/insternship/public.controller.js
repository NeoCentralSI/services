import prisma from "../../config/prisma.js";

/**
 * Controller to verify an internship letter (public).
 * After consolidation, letter data is on InternshipProposal.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
export async function verifyLetter(req, res, next) {
    try {
        const { id } = req.params;
        const { type } = req.query; // 'APPLICATION' or 'ASSIGNMENT'

        // Find the proposal by ID
        const proposal = await prisma.internshipProposal.findUnique({
            where: { id },
            include: {
                coordinator: { include: { user: true } },
                targetCompany: true,
                appLetterSignedBy: { include: { user: true } },
                assignLetterSignedBy: { include: { user: true } }
            }
        });

        if (!proposal) {
            return res.status(404).json({
                success: false,
                message: "Dokumen tidak ditemukan atau ID tidak valid."
            });
        }

        // Determine letter type
        let letterType = type || 'APPLICATION';
        let documentNumber, dateIssued, isSigned, signedBy, signedAt;

        if (letterType === 'ASSIGNMENT' && proposal.assignLetterDocNumber) {
            documentNumber = proposal.assignLetterDocNumber;
            dateIssued = proposal.assignLetterDateIssued || proposal.createdAt;
            isSigned = !!proposal.assignLetterSignedById;
            signedBy = proposal.assignLetterSignedBy?.user?.fullName;
            signedAt = proposal.updatedAt;
        } else if (proposal.appLetterDocNumber) {
            letterType = 'APPLICATION';
            documentNumber = proposal.appLetterDocNumber;
            dateIssued = proposal.appLetterDateIssued || proposal.createdAt;
            isSigned = !!proposal.appLetterSignedById;
            signedBy = proposal.appLetterSignedBy?.user?.fullName;
            signedAt = proposal.updatedAt;
        } else {
            return res.status(404).json({
                success: false,
                message: "Dokumen surat tidak ditemukan pada proposal ini."
            });
        }

        const data = {
            id: proposal.id,
            type: letterType,
            documentNumber,
            dateIssued,
            coordinatorName: proposal.coordinator?.user?.fullName,
            coordinatorNim: proposal.coordinator?.user?.identityNumber,
            companyName: proposal.targetCompany?.companyName,
            isSigned,
            signedBy,
            signedAt
        };

        res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        next(error);
    }
}
