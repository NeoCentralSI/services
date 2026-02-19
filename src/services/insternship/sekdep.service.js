import * as sekdepRepository from "../../repositories/insternship/sekdep.repository.js";
import * as adminRepository from "../../repositories/insternship/admin.repository.js";
import * as notificationRepository from "../../repositories/notification.repository.js";
import { sendFcmToUsers } from "../push.service.js";

/**
 * List all internship proposals ready for Sekdep review.
 * A proposal is ready if no members have a PENDING status.
 * @returns {Promise<Array>}
 */
export async function listProposals() {
    const proposals = await sekdepRepository.findProposalsReadyForSekdep();

    // Map to a consistent format for the frontend
    return proposals.map(proposal => {
        const appLetter = proposal.applicationLetters?.[0];

        return {
            id: proposal.id,
            coordinatorName: proposal.coordinator?.user?.fullName || "Unknown",
            coordinatorNim: proposal.coordinator?.user?.identityNumber || "N/A",
            companyName: proposal.targetCompany?.companyName || "N/A",
            status: proposal.status,
            memberCount: proposal.members.length + 1,
            createdAt: proposal.createdAt,
            dokumenProposal: proposal.proposalDocument ? {
                id: proposal.proposalDocument.id,
                fileName: proposal.proposalDocument.fileName,
                filePath: proposal.proposalDocument.filePath,
            } : null,
            dokumenSuratPermohonan: appLetter?.document ? {
                id: appLetter.document.id,
                fileName: appLetter.document.fileName,
                filePath: appLetter.document.filePath,
            } : null,
        };
    });
}

/**
 * Get full detail of an internship proposal for Sekdep.
 * @param {string} id 
 * @returns {Promise<Object>}
 */
export async function getProposalDetail(id) {
    const proposal = await sekdepRepository.findProposalDetail(id);
    if (!proposal) {
        const error = new Error("Proposal tidak ditemukan.");
        error.statusCode = 404;
        throw error;
    }

    const appLetter = proposal.applicationLetters?.[0];

    return {
        ...proposal,
        isSigned: !!appLetter?.signedById,
        companyResponses: proposal.companyResponses?.map(res => ({
            ...res,
            updatedAt: res.updatedAt || res.createdAt
        }))
    };
}

/**
 * Respond to an internship proposal.
 * @param {string} id 
 * @param {'APPROVED_BY_SEKDEP' | 'REJECTED_BY_SEKDEP'} status 
 * @param {string} [notes]
 * @returns {Promise<Object>}
 */
export async function respondToProposal(id, status, notes) {
    if (!['APPROVED_BY_SEKDEP', 'REJECTED_BY_SEKDEP'].includes(status)) {
        const error = new Error("Status respon tidak valid.");
        error.statusCode = 400;
        throw error;
    }

    const proposal = await sekdepRepository.findProposalDetail(id);
    if (!proposal) {
        const error = new Error("Proposal tidak ditemukan.");
        error.statusCode = 404;
        throw error;
    }

    const updatedProposal = await sekdepRepository.updateProposalStatus(id, status, notes);

    // Create notifications for coordinator and members
    try {
        const statusLabel = status === 'APPROVED_BY_SEKDEP' ? 'DISETUJUI' : 'DITOLAK';
        const title = `Proposal Internship ${statusLabel}`;
        let message = `Proposal Internship Anda ke ${proposal.targetCompany.companyName} telah ${statusLabel.toLowerCase()} oleh Sekdep.`;

        if (status === 'REJECTED_BY_SEKDEP' && notes) {
            message += ` Catatan: ${notes}`;
        }

        const notificationData = [];
        const recipientIds = [];

        // Coordinator
        if (proposal.coordinator?.id) {
            notificationData.push({
                userId: proposal.coordinator.id,
                title,
                message
            });
            recipientIds.push(proposal.coordinator.id);
        }

        // Members
        proposal.members.forEach(member => {
            if (member.student?.id) {
                notificationData.push({
                    userId: member.student.id,
                    title,
                    message
                });
                recipientIds.push(member.student.id);
            }
        });

        // Save in-app notifications
        if (notificationData.length > 0) {
            await notificationRepository.createNotificationsMany(notificationData);

            // Send Push Notifications to students
            await sendFcmToUsers(recipientIds, {
                title,
                body: message,
                data: {
                    type: 'internship_proposal_response',
                    status,
                    proposalId: id
                }
            });
        }

        // Admin (Only if status is approved)
        if (status === 'APPROVED_BY_SEKDEP') {
            const admins = await adminRepository.findAdmins();
            const adminTitle = "Pengajuan Internship Baru (Approved)";
            const adminMessage = `Proposal Internship ke ${proposal.targetCompany.companyName} telah disetujui Sekdep dan siap diproses Surat Pengantarnya.`;
            const adminUserIds = admins.map(a => a.id);

            const adminNotifications = admins.map(admin => ({
                userId: admin.id,
                title: adminTitle,
                message: adminMessage
            }));

            if (adminNotifications.length > 0) {
                await notificationRepository.createNotificationsMany(adminNotifications);

                // Send Push Notifications to admins
                await sendFcmToUsers(adminUserIds, {
                    title: adminTitle,
                    body: adminMessage,
                    data: {
                        type: 'internship_proposal_approved_admin',
                        proposalId: id
                    }
                });
            }
        }
    } catch (notifError) {
        console.error("Gagal mengirim notifikasi:", notifError);
        // We don't throw here to ensure the proposal response is still returned
    }

    return updatedProposal;
}

/**
 * Get all companies with their proposal counts and intern stats.
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
 * Service to create a new company.
 * @param {Object} data 
 * @returns {Promise<Object>}
 */
export async function createCompany(data) {
    if (!data.companyName || !data.companyAddress) {
        const error = new Error("Nama dan alamat perusahaan wajib diisi.");
        error.statusCode = 400;
        throw error;
    }
    return sekdepRepository.createCompany(data);
}

/**
 * Service to update a company.
 * @param {string} id 
 * @param {Object} data 
 * @returns {Promise<Object>}
 */
export async function updateCompany(id, data) {
    const company = await sekdepRepository.updateCompany(id, data);
    if (!company) {
        const error = new Error("Perusahaan tidak ditemukan.");
        error.statusCode = 404;
        throw error;
    }
    return company;
}

/**
 * Service to delete a company.
 * @param {string} id 
 * @returns {Promise<Object>}
 */
export async function deleteCompany(id) {
    return sekdepRepository.deleteCompany(id);
}

/**
 * List all internship proposals with uploaded company responses.
 * @returns {Promise<Array>}
 */
export async function listCompanyResponses() {
    const proposals = await sekdepRepository.findProposalsWithCompanyResponse();

    return proposals.map(proposal => {
        const response = proposal.companyResponses[0]; // Latests response
        return {
            id: proposal.id,
            responseId: response?.id,
            coordinatorName: proposal.coordinator?.user?.fullName || "Unknown",
            coordinatorNim: proposal.coordinator?.user?.identityNumber || "N/A",
            companyName: proposal.targetCompany?.companyName || "N/A",
            status: proposal.status,
            responseStatus: response?.status,
            sekdepNotes: response?.sekdepNotes,
            memberCount: proposal.members.length + 1,
            members: [
                {
                    id: proposal.coordinatorId,
                    name: proposal.coordinator?.user?.fullName,
                    nim: proposal.coordinator?.user?.identityNumber,
                    role: 'Koordinator',
                    status: 'PENDING' // Coordinator status is tied to proposal, defaulting to PENDING here for UI
                },
                ...proposal.members.map(m => ({
                    id: m.studentId,
                    name: m.student?.user?.fullName,
                    nim: m.student?.user?.identityNumber,
                    role: 'Anggota',
                    status: m.status
                }))
            ],
            updatedAt: proposal.updatedAt,
            dokumenSuratBalasan: response?.document ? {
                id: response.document.id,
                fileName: response.document.fileName,
                filePath: response.document.filePath,
            } : null,
            dokumenSuratTugas: proposal.assignmentLetters?.[0]?.document ? {
                id: proposal.assignmentLetters[0].document.id,
                fileName: proposal.assignmentLetters[0].document.fileName,
                filePath: proposal.assignmentLetters[0].document.filePath,
            } : null,
        };
    });
}

/**
 * Verify a company response.
 * @param {string} responseId 
 * @param {string} status - 'APPROVED_BY_SEKDEP' (Valid Doc), 'REJECTED_BY_SEKDEP' (Invalid Doc), 'REJECTED_BY_COMPANY' (Valid Doc, Content Rejection)
 * @param {string} [notes] 
 * @param {string[]} [acceptedMemberIds]
 * @returns {Promise<Object>}
 */
export async function verifyCompanyResponse(responseId, status, notes, acceptedMemberIds) {
    // Basic validation
    // REJECTED_BY_COMPANY is a virtual status from frontend to indicate the letter says "Rejected"
    if (!['APPROVED_BY_SEKDEP', 'REJECTED_BY_SEKDEP', 'REJECTED_BY_COMPANY'].includes(status)) {
        throw new Error("Status verifikasi tidak valid.");
    }

    const response = await sekdepRepository.findCompanyResponseById(responseId);
    if (!response) {
        throw new Error("Surat balasan tidak ditemukan.");
    }

    let responseStatus = status;
    let proposalStatus = null;
    let memberUpdates = [];

    // Map virtual status to DB status for Response
    if (status === 'REJECTED_BY_COMPANY') {
        responseStatus = 'APPROVED_BY_SEKDEP'; // The document itself is valid/verified
    }

    if (status !== 'REJECTED_BY_SEKDEP') {
        // If document is valid (Approved or Rejected by Company)
        // We need to determine Proposal/Member updates

        const proposal = response.proposal;
        const currentMembers = proposal.members; // Assuming this includes all relevant students
        // Note: If coordinator is not in `members`, we might miss them. 
        // Ideally `members` includes everyone. If not, logic needs adjustment.
        // Assuming `members` is the source of truth for students applying.

        if (status === 'REJECTED_BY_COMPANY') {
            proposalStatus = 'REJECTED_BY_COMPANY';
            memberUpdates = currentMembers.map(m => ({
                studentId: m.studentId,
                status: 'REJECTED_BY_COMPANY'
            }));
        } else {
            // Status is APPROVED_BY_SEKDEP (meaning Acceptance Letter)
            if (acceptedMemberIds && Array.isArray(acceptedMemberIds)) {
                // Partial or Full Acceptance based on IDs
                const acceptedSet = new Set(acceptedMemberIds);
                const acceptedCount = currentMembers.filter(m => acceptedSet.has(m.studentId)).length;

                if (acceptedCount === currentMembers.length) {
                    proposalStatus = 'ACCEPTED_BY_COMPANY';
                } else if (acceptedCount > 0) {
                    proposalStatus = 'PARTIALLY_ACCEPTED';
                } else {
                    // Accepted list is empty but status wasn't RejectedByCompany?
                    // Could be user made a mistake or it's a rejection.
                    proposalStatus = 'REJECTED_BY_COMPANY';
                }

                memberUpdates = currentMembers.map(m => ({
                    studentId: m.studentId,
                    status: acceptedSet.has(m.studentId) ? 'ACCEPTED_BY_COMPANY' : 'REJECTED_BY_COMPANY'
                }));
            } else {
                // Backward compatibility or simple "Accept All"
                proposalStatus = 'ACCEPTED_BY_COMPANY';
                memberUpdates = currentMembers.map(m => ({
                    studentId: m.studentId,
                    status: 'ACCEPTED_BY_COMPANY'
                }));
            }
        }
    } else {
        // REJECTED_BY_SEKDEP (Doc Invalid)
        // No proposal status update? Or revert to pending?
        // Usually we just mark response as rejected.
    }

    const updatedResponse = await sekdepRepository.verifyCompanyResponseTransaction(
        responseId,
        responseStatus,
        proposalStatus,
        memberUpdates,
        notes
    );

    // Notify students
    try {
        const proposal = updatedResponse.proposal;
        // Determine notification title/message based on Outcome
        let title, message, notifType;

        if (status === 'REJECTED_BY_SEKDEP') {
            title = "Surat Balasan Ditolak Sekdep";
            message = "Dokumen surat balasan Anda ditolak oleh Sekdep (Tidak Valid/Buram). Silakan upload ulang.";
            notifType = 'internship_company_response_rejected_sekdep';
        } else if (proposalStatus === 'ACCEPTED_BY_COMPANY') {
            title = "Lamaran KP Diterima Perusahaan";
            message = `Selamat! Lamaran KP Anda ke ${proposal.targetCompany?.companyName} telah diterima oleh perusahaan.`;
            notifType = 'internship_proposal_accepted';
        } else if (proposalStatus === 'PARTIALLY_ACCEPTED') {
            title = "Lamaran KP Diterima Sebagian";
            message = `Lamaran KP Anda ke ${proposal.targetCompany?.companyName} telah diterima sebagian. Cek status Anda di dashboard.`;
            notifType = 'internship_proposal_partially_accepted';
        } else if (proposalStatus === 'REJECTED_BY_COMPANY') {
            title = "Lamaran KP Ditolak Perusahaan";
            message = `Mohon maaf, lamaran KP Anda ke ${proposal.targetCompany?.companyName} telah ditolak oleh perusahaan.`;
            notifType = 'internship_proposal_rejected_company';
        }

        if (notes) {
            message += ` Catatan: ${notes}`;
        }

        if (title && message) {
            const recipientIds = [proposal.coordinatorId, ...proposal.members.map(m => m.studentId)];
            const uniqueRecipients = [...new Set(recipientIds)]; // Ensure unique

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
                    proposalId: proposal.id
                }
            });
        }

        // Notify Admin if Accepted (Full or Partial)
        if (['ACCEPTED_BY_COMPANY', 'PARTIALLY_ACCEPTED'].includes(proposalStatus)) {
            const admins = await adminRepository.findAdmins();
            const adminTitle = "Surat Balasan Disetujui (Diterima Perusahaan)";
            const adminMessage = `Surat balasan dari ${proposal.targetCompany?.companyName} diterima. Silakan proses Surat Tugas.`;
            const adminUserIds = admins.map(a => a.id);

            const adminNotifications = admins.map(admin => ({
                userId: admin.id,
                title: adminTitle,
                message: adminMessage
            }));

            if (adminNotifications.length > 0) {
                await notificationRepository.createNotificationsMany(adminNotifications);
                await sendFcmToUsers(adminUserIds, {
                    title: adminTitle,
                    body: adminMessage,
                    data: {
                        type: 'internship_company_response_approved_admin',
                        proposalId: proposal.id
                    }
                });
            }
        }
    } catch (err) {
        console.error("Gagal mengirim notifikasi verifikasi surat balasan:", err);
    }

    return updatedResponse;
}
