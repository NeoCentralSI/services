import * as registrationRepository from "../../repositories/insternship/registration.repository.js";
import * as notificationService from "../notification.service.js";
import { sendFcmToUsers } from "../push.service.js";
import { ROLES } from "../../constants/roles.js";
import { getHolidayDatesInRange } from "./holiday.service.js";
import { getWorkingDays } from "../../utils/internship-date.util.js";

/**
 * Get and format internship proposals for a specific student.
 * After consolidation, uses `internships` instead of `members`, and flat letter fields.
 * @param {string} studentId 
 * @param {string} [academicYearId]
 * @returns {Promise<Array>}
 */
export async function getStudentProposals(studentId, academicYearId) {
    const proposals = await registrationRepository.getProposalsByStudentId(studentId, academicYearId);

    return proposals.map(proposal => {
        const isCoordinator = proposal.coordinatorId === studentId;
        const roleInProposal = isCoordinator ? "Koordinator" : "Member";

        let name = proposal.coordinator?.user?.fullName || "Unknown";
        let nim = proposal.coordinator?.user?.identityNumber || "N/A";

        // If the user is a member, show their own name and NIM
        if (!isCoordinator) {
            const internshipInfo = proposal.internships.find(i => i.studentId === studentId);
            if (internshipInfo?.student?.user) {
                name = internshipInfo.student.user.fullName;
                nim = internshipInfo.student.user.identityNumber;
            }
        }

        const companyName = proposal.targetCompany?.companyName || "N/A";
        const proposalDoc = proposal.proposalDocument;

        const coordinatorInternship = proposal.internships.find(i => i.studentId === proposal.coordinatorId);
        const coordinatorStatus = coordinatorInternship ? coordinatorInternship.status : 'ACCEPTED';

        const membersList = [
            {
                id: proposal.coordinatorId,
                name: proposal.coordinator?.user?.fullName || "Unknown",
                nim: proposal.coordinator?.user?.identityNumber || "N/A",
                role: 'KOORDINATOR',
                status: coordinatorStatus
            },
            ...proposal.internships
                .filter(i => i.studentId !== proposal.coordinatorId) // just in case coordinator is in internships
                .map(i => ({
                    id: i.studentId,
                    name: i.student?.user?.fullName || "Unknown",
                    nim: i.student?.user?.identityNumber || "N/A",
                    role: 'MEMBER',
                    status: i.status
                }))
        ];

        return {
            id: proposal.id,
            nama: name,
            nim: nim,
            koordinatorAtauMember: roleInProposal,
            namaCompany: companyName,
            targetCompanyId: proposal.targetCompanyId,
            dokumenProposal: proposalDoc ? {
                id: proposalDoc.id,
                fileName: proposalDoc.fileName,
                filePath: proposalDoc.filePath
            } : null,
            dokumenSuratPermohonan: proposal.appLetterDoc ? {
                id: proposal.appLetterDoc.id,
                fileName: proposal.appLetterDoc.fileName,
                filePath: proposal.appLetterDoc.filePath
            } : null,
            dokumenSuratBalasan: proposal.companyResponseDoc ? {
                id: proposal.companyResponseDoc.id,
                fileName: proposal.companyResponseDoc.fileName,
                filePath: proposal.companyResponseDoc.filePath
            } : null,
            dokumenSuratTugas: proposal.assignLetterDoc ? {
                id: proposal.assignLetterDoc.id,
                fileName: proposal.assignLetterDoc.fileName,
                filePath: proposal.assignLetterDoc.filePath
            } : null,
            isSigned: !!proposal.appLetterSignedById,
            isAssignmentSigned: !!proposal.assignLetterSignedById,
            academicYearName: proposal.academicYear
                ? `${proposal.academicYear.year} ${proposal.academicYear.semester.charAt(0).toUpperCase() + proposal.academicYear.semester.slice(1)}`
                : '-',
            status: proposal.status,
            memberStatus: isCoordinator ? coordinatorStatus : (proposal.internships.find(i => i.studentId === studentId)?.status || 'PENDING'),
            members: membersList,
            proposedStartDate: proposal.proposedStartDate,
            proposedEndDate: proposal.proposedEndDate
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
    const { 
        coordinatorId, 
        proposalDocumentId, 
        targetCompanyId, 
        companyName, 
        companyAddress, 
        companyReason,
        proposedStartDate,
        proposedEndDate,
        memberIds = [] 
    } = data;

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

    // Get active academic year
    const activeAY = await registrationRepository.getActiveAcademicYear();
    if (!activeAY) {
        const error = new Error("Tidak ada tahun akademik yang aktif saat ini.");
        error.statusCode = 400;
        throw error;
    }

    // 3. Validate working days (min 30 days)
    const holidays = await getHolidayDatesInRange(proposedStartDate, proposedEndDate);
    const workingDays = getWorkingDays(proposedStartDate, proposedEndDate, holidays);
    if (workingDays.length < 30) {
        const error = new Error(`Jumlah hari kerja minimal adalah 30 hari. Saat ini hanya ${workingDays.length} hari.`);
        error.statusCode = 400;
        throw error;
    }

    let finalCompanyId = targetCompanyId;

    // Handle manual company input
    if (!finalCompanyId && companyName) {
        const newCompany = await registrationRepository.createCompany({
            companyName,
            companyAddress: companyAddress || "Alamat tidak tersedia",
            alasan: companyReason,
            status: 'diajukan'
        });
        finalCompanyId = newCompany.id;
    }

    if (!finalCompanyId) {
        const error = new Error("Perusahaan harus dipilih atau dimasukkan secara manual.");
        error.statusCode = 400;
        throw error;
    }

    const proposal = await registrationRepository.createProposal({
        coordinatorId,
        proposalDocumentId,
        academicYearId: activeAY.id,
        targetCompanyId: finalCompanyId,
        proposedStartDate,
        proposedEndDate,
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

            await sendFcmToUsers(memberIds, {
                title: memberTitle,
                body: memberMessage,
                data: {
                    type: 'internship_invitation',
                    proposalId: proposal.id
                },
                dataOnly: true
            });
        }

        // B. Notify Sekdep if ready (all members accepted/solo)
        await notifySekdepIfReady(proposal.id);
    } catch (notifyError) {
        console.error("Failed to send notifications:", notifyError);
    }

    return proposal;
}

/**
 * Update an internship proposal (for re-submission after rejection).
 * @param {string} proposalId 
 * @param {Object} data 
 * @returns {Promise<Object>}
 */
export async function updateProposal(proposalId, data) {
    const { 
        coordinatorId, 
        proposalDocumentId, 
        targetCompanyId, 
        companyName, 
        companyAddress, 
        companyReason,
        proposedStartDate,
        proposedEndDate,
        memberIds = [] 
    } = data;

    // 1. Verify existence and state
    const proposal = await registrationRepository.findProposalById(proposalId);
    if (!proposal) {
        const err = new Error("Proposal tidak ditemukan.");
        err.statusCode = 404;
        throw err;
    }

    if (proposal.coordinatorId !== coordinatorId) {
        const err = new Error("Hanya koordinator yang dapat mengubah proposal.");
        err.statusCode = 403;
        throw err;
    }

    if (proposal.status !== 'REJECTED_BY_SEKDEP') {
        const err = new Error("Hanya proposal yang ditolak Sekdep yang dapat diubah.");
        err.statusCode = 400;
        throw err;
    }

    // 2. Validate member eligibility (excluding current members of THIS proposal)
    const existingMemberIds = proposal.internships.map(i => i.studentId);
    if (memberIds.length > 0) {
        for (const memberId of memberIds) {
            // If they are already in this proposal, skip eligibility check against THIS proposal
            if (existingMemberIds.includes(memberId)) continue;

            const active = await registrationRepository.findActiveProposalOrInternship(memberId);
            if (active) {
                const typeLabel = active.type === 'INTERNSHIP' ? 'magang yang sedang berjalan' : 'proposal aktif';
                const error = new Error(`Mahasiswa tersebut (ID: ${memberId}) masih memiliki ${typeLabel}.`);
                error.statusCode = 400;
                throw error;
            }
        }
    }

    // 3. Validate working days (min 30 days)
    const holidays = await getHolidayDatesInRange(proposedStartDate, proposedEndDate);
    const workingDays = getWorkingDays(proposedStartDate, proposedEndDate, holidays);
    if (workingDays.length < 30) {
        const error = new Error(`Jumlah hari kerja minimal adalah 30 hari. Saat ini hanya ${workingDays.length} hari.`);
        error.statusCode = 400;
        throw error;
    }

    let finalCompanyId = targetCompanyId;
    if (!finalCompanyId && companyName) {
        const newCompany = await registrationRepository.createCompany({
            companyName,
            companyAddress: companyAddress || "Alamat tidak tersedia"
        });
        finalCompanyId = newCompany.id;
    }

    if (!finalCompanyId) {
        throw new Error("Perusahaan harus dipilih.");
    }

    // 3. Perform update
    const updated = await registrationRepository.updateProposal(proposalId, {
        proposalDocumentId,
        targetCompanyId: finalCompanyId,
        proposedStartDate,
        proposedEndDate,
        memberIds
    });

    // 4. Notifications
    try {
        const proposalCompany = companyName || updated.targetCompany?.companyName || "perusahaan";

        // Notify new members (those who weren't in the original proposal)
        const newMemberIds = memberIds.filter(id => !existingMemberIds.includes(id));
        if (newMemberIds.length > 0) {
            const title = "Undangan Grup Kerja Praktik";
            const message = `Anda telah ditambahkan sebagai anggota untuk pengajuan KP di ${proposalCompany}.`;
            await notificationService.createNotificationsForUsers(newMemberIds, { title, message });
            await sendFcmToUsers(newMemberIds, { title, body: message, data: { type: 'internship_invitation', proposalId }, dataOnly: true });
        }

        // Notify Sekdep about re-submission if ready
        await notifySekdepIfReady(proposalId);
    } catch (err) {
        console.error("Failed to send re-submission notifications:", err);
    }

    return updated;
}

/**
 * Get full detail of an internship proposal.
 * After consolidation, letter data is flat fields on the proposal.
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

    const filteredInternships = proposal.internships.filter(i => i.studentId !== proposal.coordinatorId);

    return {
        ...proposal,
        internships: filteredInternships,
        academicYearName: proposal.academicYear
            ? `${proposal.academicYear.year} ${proposal.academicYear.semester.charAt(0).toUpperCase() + proposal.academicYear.semester.slice(1)}`
            : '-',
        isSigned: !!proposal.appLetterSignedById,
        isAssignmentSigned: !!proposal.assignLetterSignedById
    };
}

/**
 * Delete an internship proposal.
 * Only rejected proposals can be deleted by the coordinator.
 * @param {string} proposalId 
 * @param {string} coordinatorId 
 * @returns {Promise<Object>}
 */
export async function deleteProposal(proposalId, coordinatorId) {
    const proposal = await registrationRepository.findProposalById(proposalId);
    if (!proposal) {
        const err = new Error("Proposal tidak ditemukan.");
        err.statusCode = 404;
        throw err;
    }

    if (proposal.coordinatorId !== coordinatorId) {
        const err = new Error("Hanya koordinator yang dapat menghapus proposal.");
        err.statusCode = 403;
        throw err;
    }

    if (proposal.status !== 'REJECTED_BY_SEKDEP') {
        const err = new Error("Hanya proposal yang ditolak Sekdep yang dapat dihapus.");
        err.statusCode = 400;
        throw err;
    }

    return registrationRepository.deleteProposal(proposalId);
}

/**
 * Respond to an internship proposal invitation.
 * After consolidation, member status is on the Internship record.
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

    const updatedInternship = await registrationRepository.updateMemberStatus(proposalId, studentId, response);

    // Notify Coordinator
    try {
        const coordinatorId = updatedInternship.proposal.coordinatorId;
        const studentName = updatedInternship.student.user.fullName;
        const companyName = updatedInternship.proposal.targetCompany?.companyName || "perusahaan";
        const actionLabel = response === 'ACCEPTED' ? 'menyetujui' : 'menolak';

        const title = `Respon Undangan KP: ${actionLabel}`;
        const message = `${studentName} telah ${actionLabel} undangan untuk bergabung dalam grup KP di ${companyName}.`;

        await notificationService.createNotificationsForUsers([coordinatorId], {
            title,
            message
        });

        await sendFcmToUsers([coordinatorId], {
            title,
            body: message,
            data: {
                type: 'internship_invitation_response',
                proposalId: proposalId,
                response: response
            },
            dataOnly: true
        });

        // Notify Sekdep if this was the last response needed
        await notifySekdepIfReady(proposalId);
    } catch (err) {
        console.error("Failed to notify coordinator:", err);
    }

    return updatedInternship;
}

/**
 * Submit a company response letter for a proposal.
 * After consolidation, updates companyResponseDocId on the proposal
 * and internship statuses.
 * @param {string} proposalId 
 * @param {string} documentId 
 * @param {string} studentId 
 * @param {string[]} acceptedMemberIds
 * @returns {Promise<Object>}
 */
export async function submitCompanyResponse(proposalId, documentId, studentId, acceptedMemberIds = []) {
    // 1. Get proposal to verify internships
    const proposal = await registrationRepository.findProposalById(proposalId);
    if (!proposal) {
        const error = new Error("Proposal tidak ditemukan.");
        error.statusCode = 404;
        throw error;
    }

    if (!proposal.appLetterSignedById) {
        const error = new Error("Surat balasan hanya bisa diunggah jika surat permohonan sudah ditandatangani oleh Kadep.");
        error.statusCode = 400;
        throw error;
    }

    // 2. Prepare internship status updates
    const internshipUpdates = [];

    // Include coordinator and all members
    const allStudentIds = [...new Set([proposal.coordinatorId, ...proposal.internships.map(i => i.studentId)])];

    for (const studentId of allStudentIds) {
        const isAccepted = acceptedMemberIds.includes(studentId);
        internshipUpdates.push({
            studentId,
            status: isAccepted ? 'ACCEPTED_BY_COMPANY' : 'REJECTED_BY_COMPANY'
        });
    }

    // 3. Update proposal and internship statuses transactionally
    const updatedProposal = await registrationRepository.createCompanyResponseTransaction({
        proposalId,
        documentId
    }, internshipUpdates);

    // Notify Sekdep
    try {
        const sekdeps = await registrationRepository.findUsersByRole(ROLES.SEKRETARIS_DEPARTEMEN);
        const sekdepIds = sekdeps.map(s => s.id);

        if (sekdepIds.length > 0) {
            const title = "Surat Balasan Perusahaan Baru";
            const message = `Seorang mahasiswa telah mengunggah surat balasan perusahaan untuk pengajuan KP.`;

            await notificationService.createNotificationsForUsers(sekdepIds, {
                title,
                message
            });

            await sendFcmToUsers(sekdepIds, {
                title,
                body: message,
                data: {
                    type: 'internship_company_response',
                    proposalId: proposalId
                },
                dataOnly: true
            });
        }
    } catch (err) {
        console.error("Failed to notify sekdep about company response:", err);
    }

    return updatedProposal;
}

/**
 * Helper to notify Sekdep only if the proposal is "ready" 
 * (all members have responded to their invitations).
 * @param {string} proposalId 
 */
async function notifySekdepIfReady(proposalId) {
    const proposal = await registrationRepository.findProposalById(proposalId);
    if (!proposal) return;

    // Check if any member is still PENDING
    const hasPendingMember = proposal.internships.some(i => i.status === 'PENDING');
    if (hasPendingMember) return;

    // Ready! Notify Sekdep
    try {
        const sekdeps = await registrationRepository.findUsersByRole(ROLES.SEKRETARIS_DEPARTEMEN);
        const sekdepIds = sekdeps.map(s => s.id);

        if (sekdepIds.length > 0) {
            const proposalCompany = proposal.targetCompany?.companyName || "perusahaan";

            // Check if this proposal has undergone a rejection before
            // We can check if it has a history or if it's currently PENDING but has appLetterDoc which points to re-submission
            // Actually, a more reliable way is checking if it ever had sekdep notes or just flag it
            const isReSubmission = !!proposal.appLetterDocId && proposal.status === 'PENDING' && proposal.updatedAt > proposal.createdAt;

            const title = isReSubmission ? "Pengajuan Kembali Proposal KP" : "Pengajuan KP Baru";
            const message = isReSubmission
                ? `Ada proposal KP ke ${proposalCompany} yang diajukan kembali setelah perbaikan.`
                : `Ada pengajuan KP baru untuk ${proposalCompany} yang memerlukan review.`;

            await notificationService.createNotificationsForUsers(sekdepIds, { title, message });
            await sendFcmToUsers(sekdepIds, {
                title,
                body: message,
                data: {
                    type: 'internship_new_proposal',
                    proposalId: proposal.id
                },
                dataOnly: true
            });
        }
    } catch (err) {
        console.error("Failed to notify Sekdep in notifySekdepIfReady:", err);
    }
}

/**
 * Calculate working days between two dates, excluding holidays and weekends.
 * @param {string} startDate 
 * @param {string} endDate 
 * @returns {Promise<number>}
 */
export async function calculateWorkingDays(startDate, endDate) {
    if (!startDate || !endDate) return 0;
    const holidays = await getHolidayDatesInRange(startDate, endDate);
    const workingDays = getWorkingDays(startDate, endDate, holidays);
    return workingDays.length;
}
