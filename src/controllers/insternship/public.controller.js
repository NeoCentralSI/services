import prisma from "../../config/prisma.js";
import crypto from "crypto";

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
        const { type } = req.query; 
        // Determine letter type
        let letterType = type || 'APPLICATION';
        let documentNumber, dateIssued, isSigned, signedBy, signedAt, coordinatorName, coordinatorNim, companyName;

        if (letterType === 'LECTURER_ASSIGNMENT') {
            const letter = await prisma.internshipSupervisorLetter.findUnique({
                where: { id },
                include: {
                    supervisor: { include: { user: true } },
                    signedBy: true
                }
            });

            if (!letter) {
                return res.status(404).json({
                    success: false,
                    message: "Surat Tugas Dosen tidak ditemukan atau ID tidak valid."
                });
            }

            letterType = 'LECTURER_ASSIGNMENT';
            documentNumber = letter.documentNumber;
            dateIssued = letter.dateIssued || letter.createdAt;
            isSigned = !!letter.signedById;
            signedBy = letter.signedBy?.fullName || "Ketua Departemen";
            signedAt = letter.updatedAt;
            coordinatorName = letter.supervisor?.user?.fullName;
            coordinatorNim = letter.supervisor?.user?.identityNumber;
            companyName = "Departemen Sistem Informasi"; // Source of assignment
        } else {
            // Find the proposal for APPLICATION or ASSIGNMENT
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

            coordinatorName = proposal.coordinator?.user?.fullName;
            coordinatorNim = proposal.coordinator?.user?.identityNumber;
            companyName = proposal.targetCompany?.companyName;
        }

        const data = {
            id,
            type: letterType,
            documentNumber,
            dateIssued,
            coordinatorName,
            coordinatorNim,
            companyName,
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

/**
 * Controller to verify the integrity (hash) of an uploaded PDF.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
export async function checkLetterHash(req, res, next) {
    try {
        const { id } = req.params;
        const { type } = req.query; // 'APPLICATION' or 'ASSIGNMENT'
        const file = req.file;

        if (!file) {
            return res.status(400).json({ success: false, message: "File dokumen PDF tidak dilampirkan." });
        }

        let document;
        const letterType = type || 'APPLICATION';

        if (letterType === 'LECTURER_ASSIGNMENT') {
            const letter = await prisma.internshipSupervisorLetter.findUnique({
                where: { id },
                include: { document: true }
            });
            if (!letter) return res.status(404).json({ success: false, message: "Surat tidak ditemukan." });
            document = letter.document;
        } else {
            const proposal = await prisma.internshipProposal.findUnique({
                where: { id },
                include: {
                    appLetterDoc: true,
                    assignLetterDoc: true
                }
            });

            if (!proposal) {
                return res.status(404).json({ success: false, message: "Surat tidak ditemukan atau ID tidak valid." });
            }

            document = letterType === 'ASSIGNMENT' ? proposal.assignLetterDoc : proposal.appLetterDoc;
        }

        if (!document) {
             return res.status(404).json({ success: false, message: "Dokumen surat tidak ditemukan." });
        }

        if (!document.fileHash) {
             return res.status(400).json({ success: false, message: "Sistem belum mendukung verifikasi hash untuk dokumen lama ini. Mohon gunakan verifikasi visual manual." });
        }

        // Calculate SHA-256 for uploaded buffer
        const uploadedHash = crypto.createHash('sha256').update(file.buffer).digest('hex');

        const isValid = uploadedHash === document.fileHash;

        return res.status(200).json({
            success: true,
            isValid,
            message: isValid ? "Integritas dokumen sesuai (ASLI)." : "PERINGATAN: Dokumen ini telah dimanipulasi atau diubah!"
        });

    } catch (error) {
        next(error);
    }
}

/**
 * Controller to verify a seminar minutes (public).
 */
export async function verifySeminarMinutes(req, res, next) {
    try {
        const { id } = req.params;

        const seminar = await prisma.internshipSeminar.findUnique({
            where: { id },
            include: {
                internship: {
                    include: {
                        student: { include: { user: true } },
                        supervisor: { include: { user: true } }
                    }
                },
                beritaAcaraDocument: true
            }
        });

        if (!seminar) {
            return res.status(404).json({
                success: false,
                message: "Seminar tidak ditemukan atau ID tidak valid."
            });
        }

        const data = {
            id: seminar.id,
            type: 'SEMINAR_MINUTES',
            documentNumber: "Form KP-006",
            dateIssued: seminar.seminarDate,
            coordinatorName: seminar.internship?.student?.user?.fullName,
            coordinatorNim: seminar.internship?.student?.user?.identityNumber,
            isSigned: !!seminar.beritaAcaraDocumentId,
            signedBy: seminar.internship?.supervisor?.user?.fullName,
            signedAt: seminar.updatedAt
        };

        res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Controller to verify the integrity (hash) of an uploaded PDF for Seminar Minutes.
 */
export async function checkSeminarMinutesHash(req, res, next) {
    try {
        const { id } = req.params;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ success: false, message: "File dokumen PDF tidak dilampirkan." });
        }

        const seminar = await prisma.internshipSeminar.findUnique({
            where: { id },
            include: { beritaAcaraDocument: true }
        });

        if (!seminar || !seminar.beritaAcaraDocument) {
            return res.status(404).json({ success: false, message: "Berita acara tidak ditemukan." });
        }

        const document = seminar.beritaAcaraDocument;

        if (!document.fileHash) {
            return res.status(400).json({ success: false, message: "Dokumen ini belum memiliki hash verifikasi." });
        }

        const uploadedHash = crypto.createHash('sha256').update(file.buffer).digest('hex');
        const isValid = uploadedHash === document.fileHash;

        return res.status(200).json({
            success: true,
            isValid,
            message: isValid ? "Integritas dokumen sesuai (ASLI)." : "PERINGATAN: Dokumen ini telah dimanipulasi atau diubah!"
        });
    } catch (error) {
        next(error);
    }
}

