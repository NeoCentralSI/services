import prisma from "../../config/prisma.js";

/**
 * Controller to verify an internship letter (public).
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
export async function verifyLetter(req, res, next) {
    try {
        const { id } = req.params;

        // Search in both Application and Assignment letters
        let letter = await prisma.internshipApplicationLetter.findUnique({
            where: { id },
            include: {
                proposal: {
                    include: {
                        coordinator: { include: { user: true } },
                        targetCompany: true
                    }
                },
                signedBy: { include: { user: true } }
            }
        });

        let type = 'APPLICATION';

        if (!letter) {
            letter = await prisma.internshipAssignmentLetter.findUnique({
                where: { id },
                include: {
                    proposal: {
                        include: {
                            coordinator: { include: { user: true } },
                            targetCompany: true
                        }
                    },
                    signedBy: { include: { user: true } }
                }
            });
            type = 'ASSIGNMENT';
        }

        if (!letter) {
            return res.status(404).json({
                success: false,
                message: "Dokumen tidak ditemukan atau ID tidak valid."
            });
        }

        const data = {
            id: letter.id,
            type,
            documentNumber: letter.documentNumber,
            dateIssued: letter.dateIssued || letter.createdAt,
            coordinatorName: letter.proposal.coordinator?.user?.fullName,
            coordinatorNim: letter.proposal.coordinator?.user?.identityNumber,
            companyName: letter.proposal.targetCompany?.companyName,
            isSigned: !!letter.signedById,
            signedBy: letter.signedBy?.user?.fullName,
            signedAt: letter.updatedAt // Approximating sign time as last update
        };

        res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        next(error);
    }
}
