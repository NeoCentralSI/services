import * as adminRepository from "../../repositories/insternship/admin.repository.js";
import * as sekdepRepository from "../../repositories/insternship/sekdep.repository.js";
import * as documentService from "../document.service.js";
import prisma from "../../config/prisma.js";
import { sendFcmToUsers } from "../push.service.js";
import { createNotificationsForUsers } from "../notification.service.js";
import { ROLES } from "../../constants/roles.js";

/**
 * Get all internship proposals that need "Surat Pengantar" (Approved by Sekdep).
 * After consolidation, application letter fields are on the proposal itself.
 * @returns {Promise<Array>}
 */
export async function getApprovedProposals() {
    const proposals = await adminRepository.findApprovedProposals();

    return proposals.map(p => {
        return {
            id: p.id,
            coordinatorName: p.coordinator?.user?.fullName,
            coordinatorNim: p.coordinator?.user?.identityNumber,
            companyName: p.targetCompany?.companyName || "—",
            companyAddress: p.targetCompany?.companyAddress || "—",
            members: p.internships.map(i => ({
                name: i.student?.user?.fullName,
                nim: i.student?.user?.identityNumber,
                isCoordinator: i.studentId === p.coordinatorId
            })),
            letterNumber: p.appLetterDocNumber || "—",
            letterFile: p.appLetterDoc ? {
                id: p.appLetterDoc.id,
                fileName: p.appLetterDoc.fileName,
                filePath: p.appLetterDoc.filePath
            } : null,
            period: p.startDatePlanned ? {
                start: p.startDatePlanned,
                end: p.endDatePlanned
            } : null,
            isSigned: !!p.appLetterSignedById,
            updatedAt: p.updatedAt
        };
    });
}

/**
 * Get all companies with their proposal counts and intern stats for Admin.
 * Reuses the repository logic from Sekdep.
 * @returns {Promise<Array>}
 */
export async function getCompaniesStats({ q, skip, take, sortBy, sortOrder, status } = {}) {
    const [companies, total] = await Promise.all([
        sekdepRepository.findCompaniesWithStats({ q, skip, take, sortBy, sortOrder, status }),
        sekdepRepository.countCompanies({ q, status })
    ]);

    const data = companies.map(company => {
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

    return { data, total };
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

    return {
        id: p.id,
        coordinatorName: p.coordinator?.user?.fullName,
        coordinatorNim: p.coordinator?.user?.identityNumber,
        companyName: p.targetCompany?.companyName || "—",
        companyAddress: p.targetCompany?.companyAddress || "—",
        members: p.internships.map(i => ({
            name: i.student?.user?.fullName,
            nim: i.student?.user?.identityNumber,
            isCoordinator: i.studentId === p.coordinatorId
        })),
        letterNumber: p.appLetterDocNumber || "",
        period: p.startDatePlanned ? {
            start: p.startDatePlanned,
            end: p.endDatePlanned
        } : null,
        letterFile: p.appLetterDoc ? {
            id: p.appLetterDoc.id,
            fileName: p.appLetterDoc.fileName,
            filePath: p.appLetterDoc.filePath
        } : null,
        isSigned: !!p.appLetterSignedById
    };
}

/**
 * Save/update SP details for a proposal.
 * @param {string} id 
 * @param {Object} data 
 * @returns {Promise<Object>}
 */
export async function saveApplicationLetter(id, data) {
    // 1. Fetch full data & check if already signed
    const proposal = await adminRepository.findProposalForLetter(id);
    if (!proposal) {
        throw new Error("Pengajuan tidak ditemukan.");
    }

    if (proposal.appLetterSignedById) {
        throw new Error("Dokumen sudah ditandatangani. Data tidak dapat diubah kembali.");
    }

    // 2. Save/Update letter fields on the proposal
    const updatedProposal = await adminRepository.updateApplicationLetter(id, data);
    const genData = {
        documentNumber: data.documentNumber,
        dateIssued: updatedProposal.appLetterDateIssued || new Date(),
        companyName: proposal.targetCompany?.companyName || "Unknown Company",
        companyAddress: proposal.targetCompany?.companyAddress || "Unknown Address",
        startDate: data.startDatePlanned,
        endDate: data.endDatePlanned,
        coordinatorId: proposal.coordinatorId,
        members: proposal.internships.map(i => ({
            name: i.student?.user?.fullName,
            nim: i.student?.user?.identityNumber,
            isCoordinator: i.studentId === proposal.coordinatorId
        }))
    };

    // 3. Generate Document
    const documentId = await documentService.generateApplicationLetter(id, genData);

    // 4. Update proposal with documentId
    await adminRepository.updateLetterDocumentId(id, documentId);

    // 5. Notify Kadep
    await notifyKadepForLetterGeneration(proposal, data.documentNumber);

    return updatedProposal;
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

        await createNotificationsForUsers(kadepUserIds, { title, message });
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
        return {
            id: p.id,
            coordinatorName: p.coordinator?.user?.fullName,
            coordinatorNim: p.coordinator?.user?.identityNumber,
            companyName: p.targetCompany?.companyName || "—",
            members: p.internships.map(i => ({
                name: i.student?.user?.fullName,
                nim: i.student?.user?.identityNumber,
                isCoordinator: i.studentId === p.coordinatorId
            })),
            letterNumber: p.assignLetterDocNumber || "—",
            letterFile: p.assignLetterDoc ? {
                id: p.assignLetterDoc.id,
                fileName: p.assignLetterDoc.fileName,
                filePath: p.assignLetterDoc.filePath
            } : null,
            period: p.startDateActual ? {
                start: p.startDateActual,
                end: p.endDateActual
            } : null,
            isSigned: !!p.assignLetterSignedById,
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

    return {
        id: p.id,
        coordinatorName: p.coordinator?.user?.fullName,
        coordinatorNim: p.coordinator?.user?.identityNumber,
        companyName: p.targetCompany?.companyName || "—",
        companyAddress: p.targetCompany?.companyAddress || "—",
        members: p.internships.map(i => ({
            name: i.student?.user?.fullName,
            nim: i.student?.user?.identityNumber,
            isCoordinator: i.studentId === p.coordinatorId
        })),
        letterNumber: p.assignLetterDocNumber || "",
        period: p.startDateActual ? {
            start: p.startDateActual,
            end: p.endDateActual
        } : null,
        letterFile: p.assignLetterDoc ? {
            id: p.assignLetterDoc.id,
            fileName: p.assignLetterDoc.fileName,
            filePath: p.assignLetterDoc.filePath
        } : null,
        isSigned: !!p.assignLetterSignedById
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

    // Check company response doc exists
    if (!proposal.companyResponseDocId) {
        throw new Error("Surat balasan perusahaan tidak ditemukan.");
    }

    if (proposal.assignLetterSignedById) {
        throw new Error("Dokumen sudah ditandatangani. Data tidak dapat diubah kembali.");
    }

    // 2. Save/Update letter fields on the proposal
    const updatedProposal = await adminRepository.updateAssignmentLetter(id, data);

    // 3. Prepare data for document generation
    const genData = {
        documentNumber: data.documentNumber,
        dateIssued: updatedProposal.assignLetterDateIssued || new Date(),
        companyName: proposal.targetCompany?.companyName || "Unknown Company",
        companyAddress: proposal.targetCompany?.companyAddress || "Unknown Address",
        startDate: data.startDateActual,
        endDate: data.endDateActual,
        coordinatorId: proposal.coordinatorId,
        members: proposal.internships.map(i => ({
            name: i.student?.user?.fullName,
            nim: i.student?.user?.identityNumber,
            isCoordinator: i.studentId === proposal.coordinatorId
        }))
    };

    // 4. Generate Document
    const documentId = await documentService.generateAssignmentLetter(id, genData);

    // 5. Update proposal with assignment letter documentId
    await adminRepository.updateAssignmentLetterDocumentId(id, documentId);

    // 6. Notify Kadep
    await notifyKadepForAssignmentLetter(proposal, data.documentNumber);

    return updatedProposal;
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

        await createNotificationsForUsers(kadepUserIds, { title, message });
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
