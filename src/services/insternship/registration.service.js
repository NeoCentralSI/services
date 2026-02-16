import * as registrationRepository from "../../repositories/insternship/registration.repository.js";
import * as notificationService from "../notification.service.js";
import { sendFcmToUsers } from "../push.service.js";
import { ROLES } from "../../constants/roles.js";

/**
 * Get and format internship proposals for a specific student.
 * @param {string} studentId 
 * @returns {Promise<Array>}
 */
export async function getStudentProposals(studentId) {
    const proposals = await registrationRepository.getProposalsByStudentId(studentId);

    return proposals.map(proposal => {
        const isCoordinator = proposal.coordinatorId === studentId;
        const roleInProposal = isCoordinator ? "Koordinator" : "Member";

        let name = proposal.coordinator?.user?.fullName || "Unknown";
        let nim = proposal.coordinator?.user?.identityNumber || "N/A";

        // If the user is a member, show their own name and NIM instead of the coordinator's
        if (!isCoordinator) {
            const memberInfo = proposal.members.find(m => m.studentId === studentId);
            if (memberInfo?.student?.user) {
                name = memberInfo.student.user.fullName;
                nim = memberInfo.student.user.identityNumber;
            }
        }

        const companyName = proposal.targetCompany?.companyName || "N/A";
        const proposalDoc = proposal.proposalDocument;

        const appLetter = proposal.applicationLetters?.[0];
        const appLetterDoc = appLetter?.document;

        return {
            id: proposal.id,
            nama: name,
            nim: nim,
            koordinatorAtauMember: roleInProposal,
            namaCompany: companyName,
            dokumenProposal: proposalDoc ? {
                id: proposalDoc.id,
                fileName: proposalDoc.fileName,
                filePath: proposalDoc.filePath
            } : null,
            dokumenSuratPermohonan: appLetterDoc ? {
                id: appLetterDoc.id,
                fileName: appLetterDoc.fileName,
                filePath: appLetterDoc.filePath
            } : null,
            status: proposal.status,
            memberStatus: isCoordinator ? 'ACCEPTED' : (proposal.members.find(m => m.studentId === studentId)?.status || 'PENDING')
        };
    }).filter(p => p.memberStatus !== 'REJECTED');
}

/**
 * Get list of companies.
 * @returns {Promise<Array>}
 */
export async function getCompanies() {
    return registrationRepository.getAllCompanies();
}

/**
 * Get list of eligible students (>= 90 SKS).
 * @returns {Promise<Array>}
 */
export async function getEligibleStudents() {
    const students = await registrationRepository.getEligibleStudents();
    return students.map(s => ({
        id: s.id,
        fullName: s.user.fullName,
        identityNumber: s.user.identityNumber,
        skscompleted: s.skscompleted
    }));
}

/**
 * Submit an internship proposal.
 * @param {Object} data 
 * @returns {Promise<Object>}
 */
export async function submitProposal(data) {
    const { coordinatorId, proposalDocumentId, targetCompanyId, companyName, companyAddress, memberIds = [] } = data;

    // 1. Validate coordinator state
    const activeCoordinator = await registrationRepository.findActiveProposalOrInternship(coordinatorId);
    if (activeCoordinator) {
        const typeLabel = activeCoordinator.type === 'INTERNSHIP' ? 'magang yang sedang berjalan' : 'proposal aktif';
        const error = new Error(`Anda masih memiliki ${typeLabel}. Tidak dapat mengajukan proposal baru.`);
        error.statusCode = 400;
        throw error;
    }

    // 2. Validate members state
    if (memberIds.length > 0) {
        for (const memberId of memberIds) {
            const activeMember = await registrationRepository.findActiveProposalOrInternship(memberId);
            if (activeMember) {
                const typeLabel = activeMember.type === 'INTERNSHIP' ? 'magang yang sedang berjalan' : 'proposal aktif';
                const error = new Error(`Mahasiswa tersebut (ID: ${memberId}) masih memiliki ${typeLabel}.`);
                error.statusCode = 400;
                throw error;
            }
        }
    }

    let finalCompanyId = targetCompanyId;

    // Handle manual company input
    if (!finalCompanyId && companyName) {
        const newCompany = await registrationRepository.createCompany({
            companyName,
            companyAddress: companyAddress || "Alamat tidak tersedia"
        });
        finalCompanyId = newCompany.id;
    }

    if (!finalCompanyId) {
        const error = new Error("Perusahaan harus dipilih atau dimasukkan secara manual.");
        error.statusCode = 400;
        throw error;
    }

    // Get active academic year
    const activeAY = await registrationRepository.getActiveAcademicYear();
    if (!activeAY) {
        const error = new Error("Tidak ada tahun akademik yang aktif saat ini.");
        error.statusCode = 400;
        throw error;
    }

    const proposal = await registrationRepository.createProposal({
        coordinatorId,
        proposalDocumentId,
        academicYearId: activeAY.id,
        targetCompanyId: finalCompanyId,
        memberIds
    });

    // 4. Send Notifications
    try {
        const proposalCompany = companyName || proposal.targetCompany?.companyName || "perusahaan";

        // A. Notify Members (if any)
        if (memberIds.length > 0) {
            const memberTitle = "Undangan Grup Kerja Praktik";
            const memberMessage = `Anda telah ditambahkan sebagai anggota untuk pengajuan KP di ${proposalCompany}.`;

            await notificationService.createNotificationsForUsers(memberIds, {
                title: memberTitle,
                message: memberMessage
            });

            // Send Push Notifications to members
            await sendFcmToUsers(memberIds, {
                title: memberTitle,
                body: memberMessage,
                data: {
                    type: 'internship_invitation',
                    proposalId: proposal.id
                }
            });
        }

        // B. Notify Sekdep
        const sekdeps = await registrationRepository.findUsersByRole(ROLES.SEKRETARIS_DEPARTEMEN);
        const sekdepIds = sekdeps.map(s => s.id);

        if (sekdepIds.length > 0) {
            const sekdepTitle = "Pengajuan KP Baru";
            const sekdepMessage = `Ada pengajuan KP baru untuk ${proposalCompany} yang memerlukan review.`;

            await notificationService.createNotificationsForUsers(sekdepIds, {
                title: sekdepTitle,
                message: sekdepMessage
            });

            // Send Push Notifications to Sekdep
            await sendFcmToUsers(sekdepIds, {
                title: sekdepTitle,
                body: sekdepMessage,
                data: {
                    type: 'internship_new_proposal',
                    proposalId: proposal.id
                }
            });
        }
    } catch (notifyError) {
        console.error("Failed to send notifications:", notifyError);
        // We don't throw here to ensure the proposal creation itself is considered successful
    }

    return proposal;
}

/**
 * Get full detail of an internship proposal.
 * @param {string} id 
 * @returns {Promise<Object>}
 */
export async function getProposalDetail(id) {
    const proposal = await registrationRepository.findProposalById(id);
    if (!proposal) {
        const error = new Error("Proposal tidak ditemukan.");
        error.statusCode = 404;
        throw error;
    }

    // Reuse formatting logic or create specialized one if needed
    // For now, returning the raw data with relations is often better for a "Detail" page
    // but we can format it to be consistent with getStudentProposals if desired.

    return proposal;
}

/**
 * Respond to an internship proposal invitation.
 * @param {string} studentId 
 * @param {string} proposalId 
 * @param {string} response 
 * @returns {Promise<Object>}
 */
export async function respondToInvitation(studentId, proposalId, response) {
    if (!['ACCEPTED', 'REJECTED'].includes(response)) {
        const error = new Error("Respon tidak valid.");
        error.statusCode = 400;
        throw error;
    }

    const updatedMember = await registrationRepository.updateMemberStatus(proposalId, studentId, response);

    // Notify Coordinator
    try {
        const coordinatorId = updatedMember.proposal.coordinatorId;
        const studentName = updatedMember.student.user.fullName;
        const companyName = updatedMember.proposal.targetCompany?.companyName || "perusahaan";
        const actionLabel = response === 'ACCEPTED' ? 'menyetujui' : 'menolak';

        const title = `Respon Undangan KP: ${actionLabel}`;
        const message = `${studentName} telah ${actionLabel} undangan untuk bergabung dalam grup KP di ${companyName}.`;

        await notificationService.createNotificationsForUsers([coordinatorId], {
            title,
            message
        });

        // Send Push Notification to Coordinator
        await sendFcmToUsers([coordinatorId], {
            title,
            body: message,
            data: {
                type: 'internship_invitation_response',
                proposalId: proposalId,
                response: response
            }
        });
    } catch (err) {
        console.error("Failed to notify coordinator:", err);
    }

    return updatedMember;
}
