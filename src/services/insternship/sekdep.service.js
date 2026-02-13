import * as sekdepRepository from "../../repositories/insternship/sekdep.repository.js";
import * as adminRepository from "../../repositories/insternship/admin.repository.js";
import * as notificationRepository from "../../repositories/notification.repository.js";

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
    return proposal;
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

        // Coordinator
        if (proposal.coordinator?.id) {
            notificationData.push({
                userId: proposal.coordinator.id,
                title,
                message
            });
        }

        // Members
        proposal.members.forEach(member => {
            if (member.student?.id) {
                notificationData.push({
                    userId: member.student.id,
                    title,
                    message
                });
            }
        });

        // Admin (Only if status is approved)
        if (status === 'APPROVED_BY_SEKDEP') {
            const admins = await adminRepository.findAdmins();
            const adminTitle = "Pengajuan Internship Baru (Approved)";
            const adminMessage = `Proposal Internship ke ${proposal.targetCompany.companyName} telah disetujui Sekdep dan siap diproses Surat Pengantarnya.`;

            admins.forEach(admin => {
                notificationData.push({
                    userId: admin.id,
                    title: adminTitle,
                    message: adminMessage
                });
            });
        }

        if (notificationData.length > 0) {
            await notificationRepository.createNotificationsMany(notificationData);
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
