import * as adminRepository from "../../repositories/insternship/admin.repository.js";
import * as sekdepRepository from "../../repositories/insternship/sekdep.repository.js";
import * as documentService from "../document.service.js";
import prisma from "../../config/prisma.js";
import { sendFcmToUsers } from "../push.service.js";
import { createNotificationsForUsers } from "../notification.service.js";
import { ROLES } from "../../constants/roles.js";

/**
 * Get all internship proposals that need "Surat Pengantar" (Approved by Sekdep).
 * @returns {Promise<Array>}
 */
export async function getApprovedProposals() {
    const proposals = await adminRepository.findApprovedProposals();

    return proposals.map(p => {
        const latestLetter = p.applicationLetters?.[0] || null;

        return {
            id: p.id,
            coordinatorName: p.coordinator?.user?.fullName,
            coordinatorNim: p.coordinator?.user?.identityNumber,
            companyName: p.targetCompany?.companyName || "—",
            companyAddress: p.targetCompany?.companyAddress || "—",
            members: [
                {
                    name: p.coordinator?.user?.fullName,
                    nim: p.coordinator?.user?.identityNumber,
                    isCoordinator: true
                },
                ...p.members.map(m => ({
                    name: m.student?.user?.fullName,
                    nim: m.student?.user?.identityNumber,
                    isCoordinator: false
                }))
            ],
            letterNumber: latestLetter?.documentNumber || "—",
            letterFile: latestLetter?.document ? {
                id: latestLetter.document.id,
                fileName: latestLetter.document.fileName,
                filePath: latestLetter.document.filePath
            } : null,
            // Assuming date range is in the application letter or proposal?
            // Re-checking schema: InternshipApplicationLetter has startDatePlanned and endDatePlanned
            period: latestLetter ? {
                start: latestLetter.startDatePlanned,
                end: latestLetter.endDatePlanned
            } : null,
            isSigned: !!latestLetter?.signedById,
            updatedAt: p.updatedAt
        };
    });
}

/**
 * Get all companies with their proposal counts and intern stats for Admin.
 * Reuses the repository logic from Sekdep.
 * @returns {Promise<Array>}
 */
export async function getCompaniesStats() {
    const companies = await sekdepRepository.findCompaniesWithStats();

    return companies.map(company => {
        // Count unique students who have an internship record with this company
        const internIds = company.internshipProposals.flatMap(p =>
            p.internships.map(i => i.studentId)
        );
        const uniqueInternCount = new Set(internIds).size;

        return {
            id: company.id,
            companyName: company.companyName,
            address: company.companyAddress,
            status: company.status,
            proposalCount: company._count?.internshipProposals || 0,
            internCount: uniqueInternCount
        };
    });
}

/**
 * Get detailed info of a proposal for SP management.
 * @param {string} id 
 * @returns {Promise<Object>}
 */
export async function getProposalLetterDetail(id) {
    const p = await adminRepository.findProposalForLetter(id);
    if (!p) {
        const error = new Error("Pengajuan tidak ditemukan.");
        error.statusCode = 404;
        throw error;
    }

    const latestLetter = p.applicationLetters?.[0] || null;

    return {
        id: p.id,
        coordinatorName: p.coordinator?.user?.fullName,
        coordinatorNim: p.coordinator?.user?.identityNumber,
        companyName: p.targetCompany?.companyName || "—",
        companyAddress: p.targetCompany?.companyAddress || "—",
        members: [
            {
                name: p.coordinator?.user?.fullName,
                nim: p.coordinator?.user?.identityNumber,
                isCoordinator: true
            },
            ...p.members.map(m => ({
                name: m.student?.user?.fullName,
                nim: m.student?.user?.identityNumber,
                isCoordinator: false
            }))
        ],
        letterNumber: latestLetter?.documentNumber || "",
        period: latestLetter ? {
            start: latestLetter.startDatePlanned,
            end: latestLetter.endDatePlanned
        } : null,
        letterFile: latestLetter?.document ? {
            id: latestLetter.document.id,
            fileName: latestLetter.document.fileName,
            filePath: latestLetter.document.filePath
        } : null,
        isSigned: !!latestLetter?.signedById
    };
}

/**
 * Save/update SP details for a proposal.
 * @param {string} id 
 * @param {Object} data 
 * @returns {Promise<Object>}
 */
export async function saveApplicationLetter(id, data) {
    // 1. Fetch full data for document generation & check if already signed
    const proposal = await adminRepository.findProposalForLetter(id);
    if (!proposal) {
        throw new Error("Pengajuan tidak ditemukan.");
    }

    const latestLetter = proposal.applicationLetters?.[0];
    if (latestLetter?.signedById) {
        throw new Error("Dokumen sudah ditandatangani. Data tidak dapat diubah kembali.");
    }

    // 2. Save/Update letter record
    const letter = await adminRepository.updateApplicationLetter(id, data);
    const genData = {
        documentNumber: data.documentNumber,
        dateIssued: letter.dateIssued || new Date(),
        companyName: proposal.targetCompany?.companyName || "Unknown Company",
        companyAddress: proposal.targetCompany?.companyAddress || "Unknown Address",
        startDate: data.startDatePlanned,
        endDate: data.endDatePlanned,
        coordinatorId: proposal.coordinatorId,
        members: [
            {
                name: proposal.coordinator?.user?.fullName,
                nim: proposal.coordinator?.user?.identityNumber
            },
            ...proposal.members.map(m => ({
                name: m.student?.user?.fullName,
                nim: m.student?.user?.identityNumber
            }))
        ]
    };

    // 4. Generate Document
    const documentId = await documentService.generateApplicationLetter(id, genData);

    // 5. Update letter with documentId
    await adminRepository.updateLetterDocumentId(letter.id, documentId);

    // 6. Notify Kadep
    await notifyKadepForLetterGeneration(proposal, data.documentNumber);

    return letter;
}

/**
 * Notify Kadep (Ketua Departemen) when a letter is generated.
 * @param {Object} proposal 
 * @param {string} documentNumber 
 */
async function notifyKadepForLetterGeneration(proposal, documentNumber) {
    try {
        const kadepUsers = await prisma.user.findMany({
            where: {
                userHasRoles: {
                    some: {
                        role: { name: ROLES.KETUA_DEPARTEMEN },
                        status: 'active',
                    },
                },
            },
            select: { id: true },
        });

        if (kadepUsers.length === 0) return;

        const kadepUserIds = kadepUsers.map((u) => u.id);
        const title = "Surat Permohonan KP Baru";
        const message = `Admin telah men-generate Surat Permohonan KP (${documentNumber}) untuk proposal ke ${proposal.targetCompany?.companyName || "—"}. Silakan periksa untuk tanda tangan.`;

        // Create in-app notifications
        await createNotificationsForUsers(kadepUserIds, { title, message });

        // Send FCM push notification
        await sendFcmToUsers(kadepUserIds, {
            title,
            body: message,
            data: {
                type: 'internship_letter_generated',
                proposalId: proposal.id,
                companyName: proposal.targetCompany?.companyName || '',
                documentNumber: documentNumber
            },
        });
    } catch (error) {
        console.error('[admin-service] Failed to notify kadep for letter generation:', error);
    }
}

/**
 * Get all internship proposals that have an approved company response.
 * @returns {Promise<Array>}
 */
export async function getProposalsForAssignment() {
    const proposals = await adminRepository.findProposalsForAssignment();

    return proposals.map(p => {
        const latestLetter = p.assignmentLetters?.[0] || null;
        const latestResponse = p.companyResponses?.[0] || null;

        return {
            id: p.id,
            coordinatorName: p.coordinator?.user?.fullName,
            coordinatorNim: p.coordinator?.user?.identityNumber,
            companyName: p.targetCompany?.companyName || "—",
            members: [
                {
                    name: p.coordinator?.user?.fullName,
                    nim: p.coordinator?.user?.identityNumber,
                    isCoordinator: true
                },
                ...p.members.map(m => ({
                    name: m.student?.user?.fullName,
                    nim: m.student?.user?.identityNumber,
                    isCoordinator: false
                }))
            ],
            letterNumber: latestLetter?.documentNumber || "—",
            letterFile: latestLetter?.document ? {
                id: latestLetter.document.id,
                fileName: latestLetter.document.fileName,
                filePath: latestLetter.document.filePath
            } : null,
            period: latestLetter ? {
                start: latestLetter.startDateActual,
                end: latestLetter.endDateActual
            } : null,
            responseId: latestResponse?.id,
            isSigned: !!latestLetter?.signedById,
            updatedAt: p.updatedAt
        };
    });
}

/**
 * Get detailed info of a proposal for Assignment Letter management.
 * @param {string} id 
 * @returns {Promise<Object>}
 */
export async function getAssignmentLetterDetail(id) {
    const p = await adminRepository.findProposalForAssignment(id);
    if (!p) {
        const error = new Error("Pengajuan tidak ditemukan.");
        error.statusCode = 404;
        throw error;
    }

    const latestLetter = p.assignmentLetters?.[0] || null;
    const latestResponse = p.companyResponses?.[0] || null;

    return {
        id: p.id,
        coordinatorName: p.coordinator?.user?.fullName,
        coordinatorNim: p.coordinator?.user?.identityNumber,
        companyName: p.targetCompany?.companyName || "—",
        companyAddress: p.targetCompany?.companyAddress || "—",
        members: [
            {
                name: p.coordinator?.user?.fullName,
                nim: p.coordinator?.user?.identityNumber,
                isCoordinator: true
            },
            ...p.members.map(m => ({
                name: m.student?.user?.fullName,
                nim: m.student?.user?.identityNumber,
                isCoordinator: false
            }))
        ],
        letterNumber: latestLetter?.documentNumber || "",
        period: latestLetter ? {
            start: latestLetter.startDateActual,
            end: latestLetter.endDateActual
        } : null,
        letterFile: latestLetter?.document ? {
            id: latestLetter.document.id,
            fileName: latestLetter.document.fileName,
            filePath: latestLetter.document.filePath
        } : null,
        responseId: latestResponse?.id,
        isSigned: !!latestLetter?.signedById
    };
}

/**
 * Save/update Assignment Letter details for a proposal.
 * @param {string} id 
 * @param {Object} data 
 * @returns {Promise<Object>}
 */
export async function saveAssignmentLetter(id, data) {
    // 1. Fetch full data
    const proposal = await adminRepository.findProposalForAssignment(id);
    if (!proposal) {
        throw new Error("Pengajuan tidak ditemukan.");
    }

    const latestResponse = proposal.companyResponses?.[0];
    if (!latestResponse) {
        throw new Error("Surat balasan perusahaan tidak ditemukan.");
    }

    const latestLetter = proposal.assignmentLetters?.[0];
    if (latestLetter?.signedById) {
        throw new Error("Dokumen sudah ditandatangani. Data tidak dapat diubah kembali.");
    }

    // 2. Save/Update letter record
    const letter = await adminRepository.updateAssignmentLetter(id, latestResponse.id, data);

    // 3. Prepare data for document generation
    const genData = {
        documentNumber: data.documentNumber,
        dateIssued: letter.dateIssued || new Date(),
        companyName: proposal.targetCompany?.companyName || "Unknown Company",
        companyAddress: proposal.targetCompany?.companyAddress || "Unknown Address",
        startDate: data.startDateActual,
        endDate: data.endDateActual,
        coordinatorId: proposal.coordinatorId,
        members: [
            {
                name: proposal.coordinator?.user?.fullName,
                nim: proposal.coordinator?.user?.identityNumber
            },
            ...proposal.members.map(m => ({
                name: m.student?.user?.fullName,
                nim: m.student?.user?.identityNumber
            }))
        ]
    };

    // 4. Generate Document
    const documentId = await documentService.generateAssignmentLetter(id, genData);

    // 5. Update letter with documentId
    await adminRepository.updateAssignmentLetterDocumentId(letter.id, documentId);

    // 6. Notify Kadep
    await notifyKadepForAssignmentLetter(proposal, data.documentNumber);

    return letter;
}

/**
 * Notify Kadep (Ketua Departemen) when an assignment letter is generated.
 * @param {Object} proposal 
 * @param {string} documentNumber 
 */
async function notifyKadepForAssignmentLetter(proposal, documentNumber) {
    try {
        const kadepUsers = await prisma.user.findMany({
            where: {
                userHasRoles: {
                    some: {
                        role: { name: ROLES.KETUA_DEPARTEMEN },
                        status: 'active',
                    },
                },
            },
            select: { id: true },
        });

        if (kadepUsers.length === 0) return;

        const kadepUserIds = kadepUsers.map((u) => u.id);
        const title = "Surat Tugas KP Baru";
        const message = `Admin telah men-generate Surat Tugas KP (${documentNumber}) untuk proposal ke ${proposal.targetCompany?.companyName || "—"}. Silakan periksa untuk tanda tangan.`;

        // Create in-app notifications
        await createNotificationsForUsers(kadepUserIds, { title, message });

        // Send FCM push notification
        await sendFcmToUsers(kadepUserIds, {
            title,
            body: message,
            data: {
                type: 'internship_letter_generated',
                proposalId: proposal.id,
                companyName: proposal.targetCompany?.companyName || '',
                documentNumber: documentNumber
            },
        });
    } catch (error) {
        console.error('[admin-service] Failed to notify kadep for assignment letter generation:', error);
    }
}
