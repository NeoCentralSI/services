import * as kadepRepository from "../../repositories/insternship/kadep.repository.js";
import { ROLES } from "../../constants/roles.js";
import prisma from "../../config/prisma.js";
import { sendFcmToUsers } from "../push.service.js";
import { createNotificationsForUsers } from "../notification.service.js";
import { stampQRCode } from "../../utils/pdf-sign.util.js";
import { ENV } from "../../config/env.js";
import fs from "fs/promises";
import path from "path";

/**
 * Get all pending letters for Kadep.
 * @returns {Promise<Object>}
 */
export async function getPendingLetters() {
    const [appLetters, assignLetters] = await Promise.all([
        kadepRepository.findPendingApplicationLetters(),
        kadepRepository.findPendingAssignmentLetters()
    ]);

    const formatLetter = (l, type) => ({
        id: l.id,
        type, // 'APPLICATION' or 'ASSIGNMENT'
        documentNumber: l.documentNumber,
        coordinatorName: l.proposal.coordinator?.user?.fullName,
        coordinatorNim: l.proposal.coordinator?.user?.identityNumber,
        coordinatorStudentId: l.proposal.coordinatorId,
        coordinatorStatus: l.proposal.members.find(m => m.studentId === l.proposal.coordinatorId)?.status || 'ACCEPTED',
        companyName: l.proposal.targetCompany?.companyName || "—",
        members: l.proposal.members
            .filter(m => m.studentId !== l.proposal.coordinatorId) // Exclude coordinator from members list to avoid double counting
            .map(m => ({
                studentId: m.studentId,
                name: m.student?.user?.fullName,
                nim: m.student?.user?.identityNumber,
                status: m.status
            })),
        createdAt: l.createdAt,
        signedById: l.signedById,
        document: l.document ? {
            id: l.document.id,
            fileName: l.document.fileName,
            filePath: l.document.filePath
        } : null
    });

    return {
        applicationLetters: appLetters.map(l => formatLetter(l, 'APPLICATION')),
        assignmentLetters: assignLetters.map(l => formatLetter(l, 'ASSIGNMENT'))
    };
}

/**
 * Approve (Sign) an internship letter.
 * @param {string} userId - ID of the Kadep
 * @param {string} type - 'APPLICATION' or 'ASSIGNMENT'
 * @param {string} letterId 
 * @param {Object|Array<Object>} signaturePositions - { x, y, pageNumber } or array of them
 * @returns {Promise<Object>}
 */
export async function approveLetter(userId, type, letterId, signaturePositions = null) {
    // 1. Get Kadep's Role ID
    const kadepRole = await prisma.userRole.findFirst({
        where: { name: ROLES.KETUA_DEPARTEMEN }
    });

    if (!kadepRole) throw new Error("Role Ketua Departemen tidak ditemukan.");

    // 2. Fetch letter with document info
    let letter;
    if (type === 'APPLICATION') {
        letter = await prisma.internshipApplicationLetter.findUnique({
            where: { id: letterId },
            include: { document: true, proposal: { include: { coordinator: { include: { user: true } } } } }
        });
    } else {
        letter = await prisma.internshipAssignmentLetter.findUnique({
            where: { id: letterId },
            include: { document: true, proposal: { include: { coordinator: { include: { user: true } } } } }
        });
    }

    if (!letter) throw new Error("Surat tidak ditemukan.");

    // Check if already signed
    if (letter.signedById) {
        throw new Error("Surat ini sudah ditandatangani.");
    }

    // 3. Sign & Stamp PDF if position is provided
    if (signaturePositions && letter.document?.filePath) {
        try {
            const absolutePath = path.resolve(letter.document.filePath);
            const pdfBuffer = await fs.readFile(absolutePath);

            // Construct verification URL
            const verifyUrl = `${ENV.FRONTEND_URL}/verify/internship-letter/${letter.id}`;

            const signedPdfBuffer = await stampQRCode(pdfBuffer, verifyUrl, signaturePositions);

            // Save the signed version
            await fs.writeFile(absolutePath, signedPdfBuffer);
        } catch (error) {
            console.error("[kadep-service] PDF Stamping failed:", error);
            // Non-critical error at this point, but we should probably inform the user or log it heavily
            // For now, continue with DB update even if stamping fails (legacy fallback)
        }
    }

    // 4. Sign in DB
    let signedLetter;
    if (type === 'APPLICATION') {
        signedLetter = await kadepRepository.signApplicationLetter(letterId, userId, kadepRole.id);
    } else if (type === 'ASSIGNMENT') {
        signedLetter = await kadepRepository.signAssignmentLetter(letterId, userId, kadepRole.id);
    } else {
        throw new Error("Tipe surat tidak valid.");
    }

    // 5. Notify Student (Coordinator) and Admin
    await notifyAfterSignature(signedLetter, type);

    return signedLetter;
}

/**
 * Notify relevant parties after a letter is signed.
 * @param {Object} letter 
 * @param {string} type 
 */
async function notifyAfterSignature(letter, type) {
    try {
        const coordinatorId = letter.proposal.coordinator.user.id;
        const letterTypeLabel = type === 'APPLICATION' ? 'Surat Permohonan' : 'Surat Tugas';
        const title = `${letterTypeLabel} Disetujui`;
        const message = `Kadep telah menandatangani ${letterTypeLabel} (${letter.documentNumber}) untuk KP ke ${letter.proposal.targetCompany?.companyName || "perusahaan"}.`;

        // Notify Coordinator
        await createNotificationsForUsers([coordinatorId], { title, message });
        await sendFcmToUsers([coordinatorId], {
            title,
            body: message,
            data: {
                type: 'internship_letter_signed',
                letterId: letter.id,
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
                message: `Kadep telah menyetujui ${letterTypeLabel} (${letter.documentNumber}). Silakan diproses lebih lanjut.`
            });
        }

    } catch (error) {
        console.error('[kadep-service] Notification failed:', error);
    }
}
