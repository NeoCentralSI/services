import * as adminRepository from "../../repositories/insternship/admin.repository.js";
import * as sekdepRepository from "../../repositories/insternship/sekdep.repository.js";
import * as notificationRepository from "../../repositories/notification.repository.js";
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
export async function getApprovedProposals(academicYearId) {
    const proposals = await adminRepository.findApprovedProposals(academicYearId);

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
            academicYearName: p.academicYear ? `${p.academicYear.year} ${p.academicYear.semester === 'ganjil' ? 'Ganjil' : 'Genap'}` : "—",
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
        proposedStartDate: p.proposedStartDate,
        proposedEndDate: p.proposedEndDate,
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
export async function getProposalsForAssignment(academicYearId) {
    const proposals = await adminRepository.findProposalsForAssignment(academicYearId);

    return proposals.map(p => {
        return {
            id: p.id,
            coordinatorName: p.coordinator?.user?.fullName,
            coordinatorNim: p.coordinator?.user?.identityNumber,
            companyName: p.targetCompany?.companyName || "—",
            members: p.internships.map(i => ({
                id: i.studentId,
                name: i.student?.user?.fullName || "N/A",
                nim: i.student?.user?.identityNumber || "N/A",
                status: i.status,
                role: i.studentId === p.coordinatorId ? 'Koordinator' : 'Anggota',
                isCoordinator: i.studentId === p.coordinatorId
            })),
            status: p.status,
            companyResponseFile: p.companyResponseDoc ? {
                id: p.companyResponseDoc.id,
                fileName: p.companyResponseDoc.fileName,
                filePath: p.companyResponseDoc.filePath
            } : null,
            letterNumber: p.assignLetterDocNumber || "—",
            letterFile: p.assignLetterDoc ? {
                id: p.assignLetterDoc.id,
                fileName: p.assignLetterDoc.fileName,
                filePath: p.assignLetterDoc.filePath
            } : null,
            appLetterFile: p.appLetterDoc ? {
                id: p.appLetterDoc.id,
                fileName: p.appLetterDoc.fileName,
                filePath: p.appLetterDoc.filePath
            } : null,
            period: p.startDateActual ? {
                start: p.startDateActual,
                end: p.endDateActual
            } : null,
            isSigned: !!p.assignLetterSignedById,
            academicYearName: p.academicYear ? `${p.academicYear.year} ${p.academicYear.semester === 'ganjil' ? 'Ganjil' : 'Genap'}` : "—",
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
        appLetterNumber: p.appLetterDocNumber || "",
        period: p.startDateActual ? {
            start: p.startDateActual,
            end: p.endDateActual
        } : null,
        letterFile: p.assignLetterDoc ? {
            id: p.assignLetterDoc.id,
            fileName: p.assignLetterDoc.fileName,
            filePath: p.assignLetterDoc.filePath
        } : null,
        isSigned: !!p.assignLetterSignedById,
        startDatePlanned: p.startDatePlanned,
        endDatePlanned: p.endDatePlanned,
        proposedStartDate: p.proposedStartDate,
        proposedEndDate: p.proposedEndDate,
        companyResponseFile: p.companyResponseDoc ? {
            id: p.companyResponseDoc.id,
            fileName: p.companyResponseDoc.fileName,
            filePath: p.companyResponseDoc.filePath
        } : null,
        companyResponseNotes: p.companyResponseNotes
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

/**
 * Verify company response and update related statuses.
 * @param {string} proposalId 
 * @param {string} status - 'APPROVED_PROPOSAL', 'REJECTED_PROPOSAL', or 'REJECTED_BY_COMPANY'
 * @param {string} [notes] 
 * @param {string[]} [acceptedMemberIds] 
 */
export async function verifyCompanyResponse(proposalId, status, notes, acceptedMemberIds) {
    const proposal = await sekdepRepository.findCompanyResponseById(proposalId);
    if (!proposal) {
        throw new Error("Pengajuan tidak ditemukan.");
    }

    const allRelevantStudentIds = [proposal.coordinatorId, ...proposal.internships.map(i => i.studentId)];

    let proposalStatus, internshipUpdates;

    if (status === 'REJECTED_BY_COMPANY') {
        proposalStatus = 'REJECTED_BY_COMPANY';
        internshipUpdates = allRelevantStudentIds.map(sid => ({
            studentId: sid,
            status: 'REJECTED_BY_COMPANY'
        }));
    } else if (status === 'REJECTED_PROPOSAL') {
        proposalStatus = null; // invalid doc, only keep WAITING status
    } else {
        if (acceptedMemberIds && Array.isArray(acceptedMemberIds)) {
            const acceptedSet = new Set(acceptedMemberIds);
            const acceptedCount = allRelevantStudentIds.filter(sid => acceptedSet.has(sid)).length;

            if (acceptedCount === allRelevantStudentIds.length) {
                proposalStatus = 'ACCEPTED_BY_COMPANY';
            } else if (acceptedCount > 0) {
                proposalStatus = 'PARTIALLY_ACCEPTED';
            } else {
                proposalStatus = 'REJECTED_BY_COMPANY';
            }

            internshipUpdates = allRelevantStudentIds.map(sid => ({
                studentId: sid,
                status: acceptedSet.has(sid) ? 'ACCEPTED_BY_COMPANY' : 'REJECTED_BY_COMPANY'
            }));
        } else {
            proposalStatus = 'ACCEPTED_BY_COMPANY';
            internshipUpdates = allRelevantStudentIds.map(sid => ({
                studentId: sid,
                status: 'ACCEPTED_BY_COMPANY'
            }));
        }
    }

    const updatedProposal = await sekdepRepository.verifyCompanyResponseTransaction(
        proposalId,
        proposalStatus,
        internshipUpdates,
        notes
    );

    // Notifications
    try {
        let title, message, notifType;

        if (status === 'REJECTED_PROPOSAL') {
            title = "Surat Balasan Ditolak Admin";
            message = "Dokumen surat balasan Anda ditolak oleh Admin (Tidak Valid/Buram). Silakan upload ulang.";
            notifType = 'internship_company_response_rejected_sekdep'; // Reusing type
        } else if (proposalStatus === 'ACCEPTED_BY_COMPANY') {
            title = "Lamaran KP Diterima Perusahaan";
            message = `Selamat! Lamaran KP Anda ke ${updatedProposal.targetCompany?.companyName} telah diterima oleh perusahaan.`;
            notifType = 'internship_proposal_accepted';
        } else if (proposalStatus === 'PARTIALLY_ACCEPTED') {
            title = "Lamaran KP Diterima Sebagian";
            message = `Lamaran KP Anda ke ${updatedProposal.targetCompany?.companyName} telah diterima sebagian. Cek status Anda di dashboard.`;
            notifType = 'internship_proposal_partially_accepted';
        } else if (proposalStatus === 'REJECTED_BY_COMPANY') {
            title = "Lamaran KP Ditolak Perusahaan";
            message = `Mohon maaf, lamaran KP Anda ke ${updatedProposal.targetCompany?.companyName} telah ditolak oleh perusahaan.`;
            notifType = 'internship_proposal_rejected_company';
        }

        if (notes) {
            message += ` Catatan: ${notes}`;
        }

        if (title && message) {
            const recipientIds = [updatedProposal.coordinatorId, ...updatedProposal.internships.map(i => i.studentId)];
            const uniqueRecipients = [...new Set(recipientIds)];

            const notifications = uniqueRecipients.map(uid => ({
                userId: uid,
                title,
                message
            }));

            await notificationRepository.createNotificationsMany(notifications);
            await sendFcmToUsers(uniqueRecipients, {
                title,
                body: message,
                data: {
                    type: notifType,
                    status: proposalStatus || status,
                    proposalId: updatedProposal.id
                },
                dataOnly: true
            });
        }
    } catch (err) {
        console.error("Gagal mengirim notifikasi verifikasi surat balasan:", err);
    }

    return updatedProposal;
}

/**
 * Admin uploads a company response document on behalf of a student.
 * This is used when the company sends the response directly to the department.
 * @param {string} proposalId
 * @param {string} documentId
 * @returns {Promise<Object>}
 */
export async function adminSubmitCompanyResponse(proposalId, documentId) {
    const proposal = await adminRepository.findProposalForAssignment(proposalId);
    if (!proposal) {
        const error = new Error("Pengajuan tidak ditemukan.");
        error.statusCode = 404;
        throw error;
    }

    if (!proposal.appLetterSignedById) {
        const error = new Error("Surat permohonan belum ditandatangani oleh Kadep.");
        error.statusCode = 400;
        throw error;
    }

    if (proposal.companyResponseDocId) {
        const error = new Error("Surat balasan sudah ada. Tidak dapat mengunggah ulang.");
        error.statusCode = 400;
        throw error;
    }

    // 1. Update the document ID
    const updatedProposalDoc = await adminRepository.updateCompanyResponseDoc(proposalId, documentId);

    // 2. AUTO VERIFY: Mark as accepted by company for all members
    const allRelevantStudentIds = [updatedProposalDoc.coordinatorId, ...updatedProposalDoc.internships.map(i => i.studentId)];
    const uniqueStudentIds = [...new Set(allRelevantStudentIds)];
    
    const internshipUpdates = uniqueStudentIds.map(sid => ({
        studentId: sid,
        status: 'ACCEPTED_BY_COMPANY'
    }));

    const updatedProposal = await sekdepRepository.verifyCompanyResponseTransaction(
        proposalId,
        'ACCEPTED_BY_COMPANY',
        internshipUpdates,
        "Diunggah dan diverifikasi otomatis oleh Admin"
    );

    // Notify students that admin has uploaded and verified the company response
    try {
        const recipientIds = uniqueStudentIds;
        const companyName = updatedProposal.targetCompany?.companyName || "perusahaan";

        const title = "Lamaran KP Diterima Perusahaan (Admin)";
        const message = `Admin telah mengunggah surat balasan dari ${companyName} dan mengonfirmasi bahwa lamaran Anda DITERIMA.`;

        await createNotificationsForUsers(recipientIds, { title, message });
        await sendFcmToUsers(recipientIds, {
            title,
            body: message,
            data: {
                type: 'internship_proposal_accepted',
                proposalId: updatedProposal.id
            },
            dataOnly: true
        });
    } catch (err) {
        console.error("Gagal mengirim notifikasi upload surat balasan oleh admin:", err);
    }

    return updatedProposal;
}
