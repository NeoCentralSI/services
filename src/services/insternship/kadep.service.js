import * as kadepRepository from "../../repositories/insternship/kadep.repository.js";
import { ROLES } from "../../constants/roles.js";
import prisma from "../../config/prisma.js";
import { sendFcmToUsers } from "../push.service.js";
import { createNotificationsForUsers } from "../notification.service.js";
import { stampQRCode } from "../../utils/pdf-sign.util.js";
import { ENV } from "../../config/env.js";
import { getWorkingDays } from "../../utils/internship-date.util.js";
import fs from "fs/promises";
import path from "path";

/**
 * Get all pending letters for Kadep.
 * After consolidation, letters are flat fields on InternshipProposal.
 * @returns {Promise<Object>}
 */
export async function getPendingLetters(academicYearId) {
    const [appLetters, assignLetters] = await Promise.all([
        kadepRepository.findPendingApplicationLetters(academicYearId),
        kadepRepository.findPendingAssignmentLetters(academicYearId)
    ]);

    const formatAppLetter = (p) => ({
        id: p.id,
        type: 'APPLICATION',
        documentNumber: p.appLetterDocNumber,
        coordinatorName: p.coordinator?.user?.fullName,
        coordinatorNim: p.coordinator?.user?.identityNumber,
        coordinatorStudentId: p.coordinatorId,
        companyName: p.targetCompany?.companyName || "—",
        members: p.internships
            .filter(i => i.studentId !== p.coordinatorId)
            .map(i => ({
                studentId: i.studentId,
                name: i.student?.user?.fullName,
                nim: i.student?.user?.identityNumber,
                status: i.status
            })),
        createdAt: p.createdAt,
        signedById: p.appLetterSignedById,
        document: p.appLetterDoc ? {
            id: p.appLetterDoc.id,
            fileName: p.appLetterDoc.fileName,
            filePath: p.appLetterDoc.filePath
        } : null
    });

    const formatAssignLetter = (p) => ({
        id: p.id,
        type: 'ASSIGNMENT',
        documentNumber: p.assignLetterDocNumber,
        coordinatorName: p.coordinator?.user?.fullName,
        coordinatorNim: p.coordinator?.user?.identityNumber,
        coordinatorStudentId: p.coordinatorId,
        companyName: p.targetCompany?.companyName || "—",
        members: p.internships
            .filter(i => i.studentId !== p.coordinatorId)
            .map(i => ({
                studentId: i.studentId,
                name: i.student?.user?.fullName,
                nim: i.student?.user?.identityNumber,
                status: i.status
            })),
        createdAt: p.createdAt,
        signedById: p.assignLetterSignedById,
        document: p.assignLetterDoc ? {
            id: p.assignLetterDoc.id,
            fileName: p.assignLetterDoc.fileName,
            filePath: p.assignLetterDoc.filePath
        } : null
    });

    return {
        applicationLetters: appLetters.map(formatAppLetter),
        assignmentLetters: assignLetters.map(formatAssignLetter)
    };
}

/**
 * Approve (Sign) an internship letter.
 * After consolidation, letters are fields on InternshipProposal.
 * @param {string} userId - ID of the Kadep
 * @param {string} type - 'APPLICATION' or 'ASSIGNMENT'
 * @param {string} proposalId - ID of the proposal
 * @param {Object|Array<Object>} signaturePositions - { x, y, pageNumber } or array of them
 * @returns {Promise<Object>}
 */
export async function approveLetter(userId, type, proposalId, signaturePositions = null) {
    // 1. Get Kadep's Role ID
    const kadepRole = await prisma.userRole.findFirst({
        where: { name: ROLES.KETUA_DEPARTEMEN }
    });

    if (!kadepRole) throw new Error("Role Ketua Departemen tidak ditemukan.");

    // 2. Fetch proposal with document info
    const proposal = await prisma.internshipProposal.findUnique({
        where: { id: proposalId },
        include: {
            appLetterDoc: true,
            assignLetterDoc: true,
            coordinator: { include: { user: true } },
            targetCompany: true
        }
    });

    if (!proposal) throw new Error("Proposal tidak ditemukan.");

    // Determine which letter fields to check
    const isApp = type === 'APPLICATION';
    const signedById = isApp ? proposal.appLetterSignedById : proposal.assignLetterSignedById;
    const letterDoc = isApp ? proposal.appLetterDoc : proposal.assignLetterDoc;
    const docNumber = isApp ? proposal.appLetterDocNumber : proposal.assignLetterDocNumber;

    if (!docNumber) throw new Error("Surat belum dibuat.");
    if (signedById) throw new Error("Surat ini sudah ditandatangani.");

    // 3. Sign & Stamp PDF if position is provided
    if (signaturePositions && letterDoc?.filePath) {
        try {
            const absolutePath = path.resolve(letterDoc.filePath);
            const pdfBuffer = await fs.readFile(absolutePath);

            const verifyUrl = `${ENV.FRONTEND_URL}/verify/internship-letter/${proposalId}`;
            const signedPdfBuffer = await stampQRCode(pdfBuffer, verifyUrl, signaturePositions);

            await fs.writeFile(absolutePath, signedPdfBuffer);
        } catch (error) {
            console.error("[kadep-service] PDF Stamping failed:", error);
        }
    }

    // 4. Sign in DB
    let signedProposal;
    if (isApp) {
        signedProposal = await kadepRepository.signApplicationLetter(proposalId, userId, kadepRole.id);
    } else if (type === 'ASSIGNMENT') {
        signedProposal = await kadepRepository.signAssignmentLetter(proposalId, userId, kadepRole.id);

        // Auto-generate Logbooks for all members
        try {
            const workingDays = getWorkingDays(proposal.startDateActual, proposal.endDateActual);
            await kadepRepository.initializeInternshipsAndLogbooks(
                proposalId,
                workingDays
            );
        } catch (genError) {
            console.error("[kadep-service] Auto logbook generation failed:", genError);
        }
    } else {
        throw new Error("Tipe surat tidak valid.");
    }

    // 5. Notify Student (Coordinator) and Admin
    await notifyAfterSignature(signedProposal, type);

    return signedProposal;
}

/**
 * Notify relevant parties after a letter is signed.
 * @param {Object} proposal 
 * @param {string} type 
 */
async function notifyAfterSignature(proposal, type) {
    try {
        const coordinatorId = proposal.coordinator.user.id;
        const letterTypeLabel = type === 'APPLICATION' ? 'Surat Permohonan' : 'Surat Tugas';
        const docNumber = type === 'APPLICATION' ? proposal.appLetterDocNumber : proposal.assignLetterDocNumber;
        const title = `${letterTypeLabel} Disetujui`;
        const message = `Kadep telah menandatangani ${letterTypeLabel} (${docNumber}) untuk KP ke ${proposal.targetCompany?.companyName || "perusahaan"}.`;

        // Notify Coordinator
        await createNotificationsForUsers([coordinatorId], { title, message });
        await sendFcmToUsers([coordinatorId], {
            title,
            body: message,
            data: {
                type: 'internship_letter_signed',
                proposalId: proposal.id,
                letterType: type
            }
        });

        // Notify Admin
        const admins = await prisma.user.findMany({
            where: {
                userHasRoles: {
                    some: {
                        role: { name: ROLES.ADMIN },
                        status: 'active'
                    }
                }
            },
            select: { id: true }
        });

        const adminIds = admins.map(a => a.id);
        if (adminIds.length > 0) {
            await createNotificationsForUsers(adminIds, {
                title: `${letterTypeLabel} Telah Ditandatangani`,
                message: `Kadep telah menyetujui ${letterTypeLabel} (${docNumber}). Silakan diproses lebih lanjut.`
            });
        }

    } catch (error) {
        console.error('[kadep-service] Notification failed:', error);
    }
}
