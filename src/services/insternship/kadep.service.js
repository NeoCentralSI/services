import * as kadepRepository from "../../repositories/insternship/kadep.repository.js";
import { ROLES } from "../../constants/roles.js";
import prisma from "../../config/prisma.js";
import { sendFcmToUsers } from "../push.service.js";
import { createNotificationsForUsers } from "../notification.service.js";
import { stampQRCode } from "../../utils/pdf-sign.util.js";
import { ENV } from "../../config/env.js";
import { getWorkingDays } from "../../utils/internship-date.util.js";
import { getHolidayDatesInRange } from "./holiday.service.js";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

/**
 * Get all pending letters for Kadep.
 * After consolidation, letters are flat fields on InternshipProposal.
 * @returns {Promise<Object>}
 */
export async function getPendingLetters(academicYearId) {
    const [appLetters, assignLetters, supervisorLetters] = await Promise.all([
        kadepRepository.findPendingApplicationLetters(academicYearId),
        kadepRepository.findPendingAssignmentLetters(academicYearId),
        kadepRepository.findPendingSupervisorLetters(academicYearId)
    ]);

    const formatAppLetter = (p) => ({
        id: p.id,
        type: 'APPLICATION',
        documentNumber: p.appLetterDocNumber,
        coordinatorName: p.coordinator?.user?.fullName,
        coordinatorNim: p.coordinator?.user?.identityNumber,
        coordinatorStudentId: p.coordinatorId,
        companyName: p.targetCompany?.companyName || "—",
        coordinatorStatus: p.internships.find(i => i.studentId === p.coordinatorId)?.status || 'PENDING',
        members: p.internships
            .filter(i => i.studentId !== p.coordinatorId)
            .map(i => ({
                studentId: i.studentId,
                name: i.student?.user?.fullName,
                nim: i.student?.user?.identityNumber,
                status: i.status
            })),
        acceptedMemberCount: p.internships.filter(i => ['ACCEPTED_BY_COMPANY', 'ONGOING', 'COMPLETED'].includes(i.status)).length,
        period: p.startDatePlanned ? {
            start: p.startDatePlanned,
            end: p.endDatePlanned
        } : null,
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
        coordinatorStatus: p.internships.find(i => i.studentId === p.coordinatorId)?.status || 'PENDING',
        members: p.internships
            .filter(i => i.studentId !== p.coordinatorId)
            .map(i => ({
                studentId: i.studentId,
                name: i.student?.user?.fullName,
                nim: i.student?.user?.identityNumber,
                status: i.status
            })),
        acceptedMemberCount: p.internships.filter(i => ['ACCEPTED_BY_COMPANY', 'ONGOING', 'COMPLETED'].includes(i.status)).length,
        period: p.startDateActual ? {
            start: p.startDateActual,
            end: p.endDateActual
        } : null,
        createdAt: p.createdAt,
        signedById: p.assignLetterSignedById,
        document: p.assignLetterDoc ? {
            id: p.assignLetterDoc.id,
            fileName: p.assignLetterDoc.fileName,
            filePath: p.assignLetterDoc.filePath
        } : null
    });

    const formatSupervisorLetter = (l) => ({
        id: l.id,
        type: 'LECTURER_ASSIGNMENT',
        documentNumber: l.documentNumber,
        lecturerName: l.supervisor?.user?.fullName,
        lecturerNip: l.supervisor?.user?.identityNumber,
        memberCount: l.internships.length,
        period: {
            start: l.startDate,
            end: l.endDate
        },
        createdAt: l.createdAt,
        signedById: l.signedById,
        document: l.document ? {
            id: l.document.id,
            fileName: l.document.fileName,
            filePath: l.document.filePath
        } : null
    });

    return {
        applicationLetters: appLetters.map(formatAppLetter),
        assignmentLetters: assignLetters.map(formatAssignLetter),
        supervisorLetters: supervisorLetters.map(formatSupervisorLetter)
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

    // 2. Fetch proposal or letter based on type
    const isApp = type === 'APPLICATION';
    const isAssign = type === 'ASSIGNMENT';
    const isLecturerAssign = type === 'LECTURER_ASSIGNMENT';

    let signedById;
    let letterDoc;
    let docNumber;
    let verifyId;

    let proposal;
    if (isApp || isAssign) {
        proposal = await prisma.internshipProposal.findUnique({
            where: { id: proposalId },
            include: {
                appLetterDoc: true,
                assignLetterDoc: true,
                coordinator: { include: { user: true } },
                targetCompany: true
            }
        });

        if (!proposal) throw new Error("Proposal tidak ditemukan.");

        signedById = isApp ? proposal.appLetterSignedById : proposal.assignLetterSignedById;
        letterDoc = isApp ? proposal.appLetterDoc : proposal.assignLetterDoc;
        docNumber = isApp ? proposal.appLetterDocNumber : proposal.assignLetterDocNumber;
        verifyId = proposalId;
    } else if (isLecturerAssign) {
        const letter = await prisma.internshipSupervisorLetter.findUnique({
            where: { id: proposalId },
            include: { document: true }
        });

        if (!letter) throw new Error("Surat Tugas Dosen tidak ditemukan.");

        signedById = letter.signedById;
        letterDoc = letter.document;
        docNumber = letter.documentNumber;
        verifyId = proposalId; // In this case it's the letter ID
    } else {
        throw new Error("Tipe surat tidak valid.");
    }

    if (!docNumber) throw new Error("Surat belum dibuat.");
    if (signedById) throw new Error("Surat ini sudah ditandatangani.");

    // 3. Sign & Stamp PDF if position is provided
    if (signaturePositions && letterDoc?.filePath) {
        try {
            const absolutePath = path.resolve(letterDoc.filePath);
            const pdfBuffer = await fs.readFile(absolutePath);

            const verifyUrl = `${ENV.FRONTEND_URL}/verify/${isLecturerAssign ? 'lecturer-assignment' : 'internship-letter'}/${verifyId}`;
            const signedPdfBuffer = await stampQRCode(pdfBuffer, verifyUrl, signaturePositions);

            // Calculate SHA-256 Hash for file integrity verification
            const fileHash = crypto.createHash('sha256').update(signedPdfBuffer).digest('hex');

            // Save Hash to DB
            await prisma.document.update({
                where: { id: letterDoc.id },
                data: { fileHash }
            });

            await fs.writeFile(absolutePath, signedPdfBuffer);
        } catch (error) {
            console.error("[kadep-service] PDF Stamping and Hashing failed:", error);
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
            const holidays = await getHolidayDatesInRange(proposal.startDateActual, proposal.endDateActual);
            const workingDays = getWorkingDays(proposal.startDateActual, proposal.endDateActual, holidays);
            await kadepRepository.initializeInternshipsAndLogbooks(
                proposalId,
                workingDays
            );
        } catch (genError) {
            console.error("[kadep-service] Auto logbook generation failed:", genError);
        }
    } else if (isLecturerAssign) {
        signedProposal = await kadepRepository.signSupervisorLetter(proposalId, userId, kadepRole.id);
        // Add specific lecturer notifications here if needed
    } else {
        throw new Error("Tipe surat tidak valid.");
    }

    // 5. Notify parties
    await notifyAfterSignature(signedProposal, type);

    return signedProposal;
}

/**
 * Notify relevant parties after a letter is signed.
 * @param {Object} proposal 
 * @param {string} type 
 */
async function notifyAfterSignature(data, type) {
    try {
        if (type === 'LECTURER_ASSIGNMENT') {
            const lecturerUserId = data.supervisor?.user?.id;
            if (lecturerUserId) {
                const title = "Surat Tugas Pembimbing Ditandatangani";
                const message = `Ketua Departemen telah menandatangani Surat Tugas Pembimbing Anda (${data.documentNumber}).`;

                await createNotificationsForUsers([lecturerUserId], { title, message });
                await sendFcmToUsers([lecturerUserId], {
                    title,
                    body: message,
                    data: {
                        type: 'internship_supervisor_letter_signed',
                        letterId: data.id
                    },
                    dataOnly: true
                });
            }
            return;
        }

        const proposal = data;
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
            },
            dataOnly: true
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
