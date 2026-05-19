
import * as registrationRepository from "../../repositories/insternship/pendaftaran.repository.js";
import * as notificationRepository from "../../repositories/notification.repository.js";
const holidayRepository = registrationRepository;
const kadepRepository = registrationRepository;

import crypto from "crypto";
import fs from "fs";
import * as fsPromises from "fs/promises";
import path from "path";
import { ENV } from "../../config/env.js";
import prisma from "../../config/prisma.js";
import { ROLES } from "../../constants/roles.js";
import { getWorkingDays } from "../../utils/internship-date.util.js";
import { stampQRCode } from "../../utils/pdf-sign.util.js";
import * as documentService from "../document.service.js";
import * as notificationService from "../notification.service.js";
import { sendFcmToUsers } from "../push.service.js";

const HOLIDAY_API_BASE = "https://libur.deno.dev/api";

async function notifySekdepIfReady(proposalId) {
    const proposal = await registrationRepository.findProposalById(proposalId);
    if (!proposal) return;

    const memberRecords = proposal.internships.filter(i => i.studentId !== proposal.coordinatorId);
    const allMembersAccepted = memberRecords.every(i => i.status === 'ACCEPTED');

    if (!allMembersAccepted) return;

    const sekdeps = await registrationRepository.findUsersByRole(ROLES.SEKRETARIS_DEPARTEMEN);
    const sekdepIds = sekdeps.map(s => s.id);
    if (sekdepIds.length === 0) return;

    const companyName = proposal.targetCompany?.companyName || "perusahaan";
    const title = "Pengajuan KP Siap Direview";
    const message = `Pengajuan KP baru ke ${companyName} siap untuk ditinjau.`;

    await notificationService.createNotificationsForUsers(sekdepIds, { title, message });
    await sendFcmToUsers(sekdepIds, {
        title,
        body: message,
        data: {
            type: 'internship_proposal_ready_for_sekdep',
            proposalId
        },
        dataOnly: true
    });
}

async function notifyAfterSignature(signedEntity, type) {
    if (!signedEntity) return;

    try {
        if (type === 'APPLICATION' || type === 'ASSIGNMENT') {
            const recipientIds = [
                signedEntity.coordinatorId,
                ...(signedEntity.internships || []).map(i => i.studentId)
            ].filter(Boolean);

            const uniqueRecipientIds = [...new Set(recipientIds)];
            if (uniqueRecipientIds.length === 0) return;

            const title = type === 'APPLICATION'
                ? "Surat Permohonan KP Ditandatangani"
                : "Surat Tugas KP Ditandatangani";
            const message = type === 'APPLICATION'
                ? "Surat permohonan KP Anda telah ditandatangani oleh Kadep."
                : "Surat tugas KP Anda telah ditandatangani oleh Kadep.";

            await notificationService.createNotificationsForUsers(uniqueRecipientIds, { title, message });
            await sendFcmToUsers(uniqueRecipientIds, {
                title,
                body: message,
                data: {
                    type: 'internship_letter_signed',
                    letterType: type,
                    proposalId: signedEntity.id
                },
                dataOnly: true
            });
        }
    } catch (err) {
        console.error("Failed to notify after signature:", err);
    }
}


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

    if (proposal.status !== 'REJECTED_PROPOSAL' && proposal.status !== 'PENDING') {
        const err = new Error("Hanya proposal dengan status menunggu atau ditolak Sekdep yang dapat diubah.");
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

    if (proposal.status !== 'REJECTED_PROPOSAL') {
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

/**
 * Get all holidays with optional year filter.
 * @param {Object} [params]
 * @param {string} [params.year]
 * @returns {Promise<Array>}
 */
export async function getAllHolidays({ year } = {}) {
    return holidayRepository.findAll({ year });
}

/**
 * Get holidays within a date range (for working days calculation).
 * @param {Date|string} startDate
 * @param {Date|string} endDate
 * @returns {Promise<Date[]>} Array of holiday Date objects
 */
export async function getHolidayDatesInRange(startDate, endDate) {
    const holidays = await holidayRepository.findInRange(startDate, endDate);
    return holidays.map((h) => h.holidayDate);
}

/**
 * Create a holiday.
 * @param {Object} data - { holidayDate, name }
 * @returns {Promise<Object>}
 */
export async function createHoliday(data) {
    if (!data.holidayDate) {
        const error = new Error("Tanggal libur wajib diisi.");
        error.statusCode = 400;
        throw error;
    }

    try {
        return await holidayRepository.create(data);
    } catch (err) {
        if (err.code === "P2002") {
            const error = new Error("Tanggal libur tersebut sudah terdaftar.");
            error.statusCode = 409;
            throw error;
        }
        throw err;
    }
}

/**
 * Create multiple holidays at once.
 * @param {Array<{holidayDate: string, name?: string}>} holidays
 * @returns {Promise<Object>}
 */
export async function createManyHolidays(holidays) {
    if (!Array.isArray(holidays) || holidays.length === 0) {
        const error = new Error("Daftar tanggal libur tidak boleh kosong.");
        error.statusCode = 400;
        throw error;
    }

    return holidayRepository.createMany(holidays);
}

/**
 * Update a holiday.
 * @param {string} id
 * @param {Object} data
 * @returns {Promise<Object>}
 */
export async function updateHoliday(id, data) {
    try {
        return await holidayRepository.update(id, data);
    } catch (err) {
        if (err.code === "P2025") {
            const error = new Error("Hari libur tidak ditemukan.");
            error.statusCode = 404;
            throw error;
        }
        if (err.code === "P2002") {
            const error = new Error("Tanggal libur tersebut sudah terdaftar.");
            error.statusCode = 409;
            throw error;
        }
        throw err;
    }
}

/**
 * Delete a holiday.
 * @param {string} id
 * @returns {Promise<Object>}
 */
export async function deleteHoliday(id) {
    try {
        return await holidayRepository.remove(id);
    } catch (err) {
        if (err.code === "P2025") {
            const error = new Error("Hari libur tidak ditemukan.");
            error.statusCode = 404;
            throw error;
        }
        throw err;
    }
}

/**
 * Sync holidays from public API (libur.deno.dev) to local database.
 * Uses upsert so existing dates are updated (name only), new dates are created.
 * API returns ALL years, so we filter by the requested year here.
 * @param {string|number} year - The year to sync (e.g. "2026")
 * @returns {Promise<{ created: number, updated: number, total: number }>}
 */
export async function syncHolidays(year) {
    if (!year) {
        const error = new Error("Tahun wajib diisi untuk sinkronisasi.");
        error.statusCode = 400;
        throw error;
    }

    let apiData;

    try {
        const response = await fetch(HOLIDAY_API_BASE);
        if (!response.ok) {
            const error = new Error(`Gagal mengambil data dari API hari libur (status ${response.status}).`);
            error.statusCode = 502;
            throw error;
        }
        apiData = await response.json();
    } catch (err) {
        if (err.statusCode) throw err;
        const error = new Error("Tidak dapat terhubung ke API hari libur. Periksa koneksi internet.");
        error.statusCode = 503;
        throw error;
    }

    if (!Array.isArray(apiData) || apiData.length === 0) {
        return { created: 0, updated: 0, total: 0 };
    }

    // libur.deno.dev returns { date, name, is_national_holiday }
    // Filter hanya untuk tahun yang diminta
    const filtered = apiData.filter((item) => {
        if (!item.date) return false;
        return item.date.startsWith(String(year));
    });

    if (filtered.length === 0) {
        return { created: 0, updated: 0, total: 0 };
    }

    return holidayRepository.syncMany(filtered);
}

/**
 * Get a template by name.
 * @param {string} name
 * @returns {Promise<Object>}
 */
export async function getTemplateByName(name) {
    let template = await prisma.documentTemplate.findUnique({
        where: { name }
    });

    // If not found, return null (or we could seed a default here)
    return template;
}

/**
 * Save or update a template.
 * @param {string} name
 * @param {string} content - HTML content (optional if DOCX)
 * @param {string} type - HTML or DOCX
 * @param {string} filePath - Path to DOCX file (optional if HTML)
 * @returns {Promise<Object>}
 */
export async function saveTemplate(name, content, type = "HTML", filePath = null) {
    // If we're updating and providing a new file, we should delete the old one
    // But upsert doesn't give us the old record easily unless we fetch first.
    // However, if we do fetch first:
    const oldTemplate = await prisma.documentTemplate.findUnique({ where: { name } });
    if (oldTemplate && oldTemplate.filePath && filePath && oldTemplate.filePath !== filePath) {
        try {
            await fs.unlink(path.resolve(oldTemplate.filePath));
        } catch (err) {
            console.warn(`Failed to delete old template file: ${oldTemplate.filePath}`, err);
        }
    }

    const template = await prisma.documentTemplate.upsert({
        where: { name },
        update: {
            content,
            type,
            filePath
        },
        create: {
            name,
            content,
            type,
            filePath
        }
    });

    return template;
}

/**
 * Delete a template.
 * @param {string} name
 */
export async function deleteTemplate(name) {
    await prisma.documentTemplate.delete({
        where: { name }
    });
}

/**
 * Generate a PDF preview for a template with dummy data.
 * @param {string} name 
 * @returns {Promise<string>} Path to the generated PDF
 */
export async function generatePreview(name) {
    const template = await getTemplateByName(name);
    if (!template || !template.filePath) {
        throw new Error("Template DOCX tidak ditemukan");
    }

    const templatePath = path.resolve(template.filePath);

    // Check if the file actually exists on disk
    try {
        await fs.access(templatePath);
    } catch {
        const err = new Error("File template tidak ditemukan di server. Silakan upload ulang.");
        err.code = "FILE_NOT_FOUND";
        throw err;
    }

    const content = await fs.readFile(templatePath);

    // SKIP Templating to show raw tags
    // doc.render(dummyData);
    // const docxBuffer = doc.getZip().generate({ type: "nodebuffer" });

    // Use raw content directly
    const docxBuffer = content;

    // Convert to PDF using Gotenberg
    const pdfBuffer = await convertDocxToPdf(docxBuffer, `${name}.docx`);

    // Save PDF to temp file
    const tempPdfPath = path.join("uploads", `temp_preview_${Date.now()}.pdf`);

    // Ensure uploads directory exists
    try {
        await fs.access(path.dirname(tempPdfPath));
    } catch {
        await fs.mkdir(path.dirname(tempPdfPath), { recursive: true });
    }

    await fs.writeFile(tempPdfPath, pdfBuffer);

    return tempPdfPath;
}



/**
 * Respond to an internship proposal.
 * @param {string} id 
 * @param {'APPROVED_PROPOSAL' | 'REJECTED_PROPOSAL'} status 
 * @param {string} [notes]
 * @returns {Promise<Object>}
 */
export async function respondToProposal(id, status, notes) {
    if (!['APPROVED_PROPOSAL', 'REJECTED_PROPOSAL'].includes(status)) {
        const error = new Error("Status respon tidak valid.");
        error.statusCode = 400;
        throw error;
    }

    const proposal = await registrationRepository.findProposalById(id);
    if (!proposal) {
        const error = new Error("Proposal tidak ditemukan.");
        error.statusCode = 404;
        throw error;
    }

    const updatedProposal = await registrationRepository.updateProposalStatus(id, status, notes);

    // If approved, check if the target company needs to be promoted from 'diajukan' to 'save'
    if (status === 'APPROVED_PROPOSAL' && proposal.targetCompany?.status === 'diajukan') {
        await registrationRepository.updateCompany(proposal.targetCompanyId, {
            status: 'save'
        });
    }

    // Create notifications for coordinator and internship students
    try {
        const statusLabel = status === 'APPROVED_PROPOSAL' ? 'DISETUJUI' : 'DITOLAK';
        const title = `Proposal Internship ${statusLabel}`;
        let message = `Proposal Internship Anda ke ${proposal.targetCompany.companyName} telah ${statusLabel.toLowerCase()} oleh Sekdep.`;

        if (status === 'REJECTED_PROPOSAL' && notes) {
            message += ` Catatan: ${notes}`;
        }

        const recipientIds = [];
        if (proposal.coordinator?.id) recipientIds.push(proposal.coordinator.id);
        proposal.internships.forEach(internship => {
            if (internship.student?.id) recipientIds.push(internship.student.id);
        });

        const uniqueRecipientIds = [...new Set(recipientIds)];

        const notificationData = uniqueRecipientIds.map(uid => ({
            userId: uid,
            title,
            message
        }));

        // Save in-app notifications
        if (notificationData.length > 0) {
            await notificationRepository.createNotificationsMany(notificationData);

            await sendFcmToUsers(uniqueRecipientIds, {
                title,
                body: message,
                data: {
                    type: 'internship_proposal_response',
                    status,
                    proposalId: id
                },
                dataOnly: true
            });
        }

        // Admin (Only if status is approved)
        if (status === 'APPROVED_PROPOSAL') {
            const admins = await registrationRepository.findUsersByRole(ROLES.ADMIN);
            const adminTitle = "Pengajuan Internship Baru (Approved)";
            const adminMessage = `Proposal Internship ke ${proposal.targetCompany.companyName} telah disetujui Sekdep and siap diproses Surat Pengantarnya.`;
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
                        type: 'internship_proposal_approved_admin',
                        proposalId: id
                    },
                    dataOnly: true
                });
            }
        }
    } catch (notifError) {
        console.error("Gagal mengirim notifikasi:", notifError);
    }

    return updatedProposal;
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
    return registrationRepository.createCompany(data);
}

/**
 * Service to update a company.
 * @param {string} id 
 * @param {Object} data 
 * @returns {Promise<Object>}
 */
export async function updateCompany(id, data) {
    const company = await registrationRepository.updateCompany(id, data);
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
    return registrationRepository.deleteCompany(id);
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
 * Verify company response and update related statuses.
 * @param {string} proposalId 
 * @param {string} status - 'APPROVED_PROPOSAL', 'REJECTED_PROPOSAL', or 'REJECTED_BY_COMPANY'
 * @param {string} [notes] 
 * @param {string[]} [acceptedMemberIds] 
 */
export async function verifyCompanyResponse(proposalId, status, notes, acceptedMemberIds) {
    const proposal = await registrationRepository.findCompanyResponseById(proposalId);
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

    const updatedProposal = await registrationRepository.verifyCompanyResponseTransaction(
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
 * Get all pending letters for Kadep.
 * After consolidation, letters are flat fields on InternshipProposal.
 * @returns {Promise<Object>}
 */
export async function getPendingLetters(academicYearId) {
    const [appLetters, assignLetters, supervisorLetters] = await Promise.all([
        kadepRepository.findPendingApplicationLetters(academicYearId),
        kadepRepository.findPendingAssignmentLetters(academicYearId),
        kadepRepository.findPendingSupervisorLetters()
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
            const pdfBuffer = await fsPromises.readFile(absolutePath);

            const verifyUrl = `${ENV.FRONTEND_URL}/verify/${isLecturerAssign ? 'lecturer-assignment' : 'internship-letter'}/${verifyId}`;
            const signedPdfBuffer = await stampQRCode(pdfBuffer, verifyUrl, signaturePositions);

            // Calculate SHA-256 Hash for file integrity verification
            const fileHash = crypto.createHash('sha256').update(signedPdfBuffer).digest('hex');

            // Save Hash to DB
            await prisma.document.update({
                where: { id: letterDoc.id },
                data: { fileHash }
            });

            await fsPromises.writeFile(absolutePath, signedPdfBuffer);
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
            await kadepRepository.initializeInternshipsAndLogbooks(proposalId, workingDays);
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
 * List all proposals by academic year.
 * @param {string} academicYearId
 * @returns {Promise<Array>}
 */
export async function listAllProposals(academicYearId) {
    const proposals = await registrationRepository.findAllProposals(academicYearId);
    return proposals.map(p => ({
        id: p.id,
        nim: p.coordinator?.user?.identityNumber,
        name: p.coordinator?.user?.fullName,
        companyName: p.targetCompany?.companyName || "Unknown",
        academicYearName: p.academicYear
            ? `${p.academicYear.year} ${p.academicYear.semester.charAt(0).toUpperCase() + p.academicYear.semester.slice(1)}`
            : '-',
        status: p.status,
        createdAt: p.createdAt
    }));
}

function formatDocument(doc) {
    return doc ? {
        id: doc.id,
        fileName: doc.fileName,
        filePath: doc.filePath
    } : null;
}

function formatSekdepProposalItem(p) {
    const internships = p.internships || [];
    const internshipStatuses = internships.map(i => i.status);
    const displayStatus = internshipStatuses.length > 0 && internshipStatuses.every(status => status === 'COMPLETED')
        ? 'COMPLETED'
        : internshipStatuses.some(status => status === 'ONGOING')
            ? 'ONGOING'
            : p.status;
    const members = internships.map(i => ({
        id: i.studentId,
        name: i.student?.user?.fullName || "-",
        nim: i.student?.user?.identityNumber || "-",
        role: i.studentId === p.coordinatorId ? "KOORDINATOR" : "MEMBER",
        status: i.status
    }));

    return {
        id: p.id,
        coordinatorName: p.coordinator?.user?.fullName || "-",
        coordinatorNim: p.coordinator?.user?.identityNumber || "-",
        companyName: p.targetCompany?.companyName || "Unknown",
        academicYearName: p.academicYear
            ? `${p.academicYear.year} ${p.academicYear.semester.charAt(0).toUpperCase() + p.academicYear.semester.slice(1)}`
            : "-",
        status: displayStatus,
        proposalStatus: p.status,
        proposalSekdepNotes: p.proposalSekdepNotes,
        companyResponseNotes: p.companyResponseNotes,
        memberCount: internships.length,
        acceptedMemberCount: internships.filter(i =>
            ['ACCEPTED', 'ACCEPTED_BY_COMPANY', 'ONGOING', 'COMPLETED'].includes(i.status)
        ).length,
        members,
        dokumenProposal: formatDocument(p.proposalDocument),
        dokumenSuratPermohonan: formatDocument(p.appLetterDoc),
        dokumenSuratBalasan: formatDocument(p.companyResponseDoc),
        dokumenSuratTugas: formatDocument(p.assignLetterDoc),
        isSigned: !!p.appLetterSignedById,
        isAssignmentSigned: !!p.assignLetterSignedById,
        proposedStartDate: p.proposedStartDate,
        proposedEndDate: p.proposedEndDate,
        startDatePlanned: p.startDatePlanned,
        endDatePlanned: p.endDatePlanned,
        startDateActual: p.startDateActual,
        endDateActual: p.endDateActual,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt
    };
}

/**
 * List pending proposals for Sekdep.
 */
export async function listPendingProposals({ academicYearId, q, skip, take, sortBy, sortOrder }) {
    const [proposals, total] = await Promise.all([
        registrationRepository.findPendingProposals({ academicYearId, q, skip, take, sortBy, sortOrder }),
        registrationRepository.countPendingProposals({ academicYearId, q })
    ]);

    const data = proposals.map(formatSekdepProposalItem);

    return { data, total };
}

/**
 * Get companies stats.
 */
export async function getCompaniesStats({ q, skip, take, sortBy, sortOrder, status } = {}) {
    const [companies, total] = await Promise.all([
        registrationRepository.findCompaniesWithStats({ q, skip, take, sortBy, sortOrder, status }),
        registrationRepository.countCompanies({ q, status })
    ]);

    const data = companies.map(c => {
        const studentIds = c.internshipProposals
            .flatMap(p => p.internships.map(i => i.studentId));
        const uniqueStudentCount = new Set(studentIds).size;

        return {
            id: c.id,
            companyName: c.companyName,
            companyAddress: c.companyAddress,
            alasan: c.alasan,
            status: c.status,
            proposalCount: c._count?.internshipProposals || 0,
            internCount: uniqueStudentCount
        };
    });

    return { data, total };
}

/**
 * Get approved proposals for Admin letter management.
 */
export async function getApprovedProposals(academicYearId) {
    const proposals = await registrationRepository.findApprovedProposals(academicYearId);
    return proposals.map(p => ({
        id: p.id,
        nim: p.coordinator?.user?.identityNumber,
        name: p.coordinator?.user?.fullName,
        companyName: p.targetCompany?.companyName || "Unknown",
        academicYearName: p.academicYear
            ? `${p.academicYear.year} ${p.academicYear.semester.charAt(0).toUpperCase() + p.academicYear.semester.slice(1)}`
            : '-',
        status: p.status,
        appLetterFile: p.appLetterDoc ? {
            id: p.appLetterDoc.id,
            fileName: p.appLetterDoc.fileName,
            filePath: p.appLetterDoc.filePath
        } : null,
        isSigned: !!p.appLetterSignedById,
        createdAt: p.createdAt
    }));
}

/**
 * Get proposals for assignment letter generation.
 */
export async function getProposalsForAssignment(academicYearId) {
    const proposals = await registrationRepository.findProposalsForAssignment(academicYearId);
    return proposals.map(p => ({
        id: p.id,
        nim: p.coordinator?.user?.identityNumber,
        name: p.coordinator?.user?.fullName,
        companyName: p.targetCompany?.companyName || "Unknown",
        academicYearName: p.academicYear
            ? `${p.academicYear.year} ${p.academicYear.semester.charAt(0).toUpperCase() + p.academicYear.semester.slice(1)}`
            : '-',
        status: p.status,
        assignLetterFile: p.assignLetterDoc ? {
            id: p.assignLetterDoc.id,
            fileName: p.assignLetterDoc.fileName,
            filePath: p.assignLetterDoc.filePath
        } : null,
        isSigned: !!p.assignLetterSignedById,
        createdAt: p.createdAt
    }));
}

/**
 * Save assignment letter details and generate doc.
 */
export async function saveAssignmentLetter(id, data) {
    const { letterNumber, startDatePlanned, endDatePlanned, proposedStartDate, proposedEndDate } = data;

    // 1. Update letter details
    const updated = await registrationRepository.updateAssignmentLetter(id, {
        letterNumber,
        startDatePlanned: startDatePlanned ? new Date(startDatePlanned) : null,
        endDatePlanned: endDatePlanned ? new Date(endDatePlanned) : null,
        proposedStartDate: proposedStartDate ? new Date(proposedStartDate) : null,
        proposedEndDate: proposedEndDate ? new Date(proposedEndDate) : null
    });

    // 2. Fetch full detail for document generation
    const proposal = await registrationRepository.findProposalForAssignment(id);

    // 3. Format data for Word Template
    const genData = {
        documentNumber: letterNumber,
        dateIssued: new Date(),
        coordinatorId: proposal.coordinatorId,
        companyName: proposal.targetCompany?.companyName,
        companyAddress: proposal.targetCompany?.companyAddress,
        startDate: startDatePlanned ? new Date(startDatePlanned) : (proposedStartDate ? new Date(proposedStartDate) : null),
        endDate: endDatePlanned ? new Date(endDatePlanned) : (proposedEndDate ? new Date(proposedEndDate) : null),
        coordinatorName: proposal.coordinator?.user?.fullName,
        coordinatorNim: proposal.coordinator?.user?.identityNumber,
        members: proposal.internships.map(i => ({
            name: i.student?.user?.fullName,
            nim: i.student?.user?.identityNumber,
            isCoordinator: i.studentId === proposal.coordinatorId
        }))
    };

    // 4. Generate docx/pdf via documentService
    const documentId = await documentService.generateAssignmentLetter(id, genData);

    // 5. Update proposal with documentId
    await registrationRepository.updateAssignmentLetterDocumentId(id, documentId);

    // 6. Notify Kadep
    try {
        const kadeps = await prisma.user.findMany({
            where: {
                userHasRoles: {
                    some: {
                        role: {
                            name: ROLES.KETUA_DEPARTEMEN
                        }
                    }
                }
            },
            select: { id: true }
        });

        const kadepUserIds = kadeps.map(k => k.id);
        if (kadepUserIds.length > 0) {
            const title = "Surat Tugas KP Baru";
            const message = `Admin telah meng-generate Surat Tugas KP untuk pengajuan ke ${proposal.targetCompany?.companyName}. Mohon segera ditandatangani.`;

            await notificationService.createNotificationsForUsers(kadepUserIds, { title, message });
            await sendFcmToUsers(kadepUserIds, {
                title,
                body: message,
                data: {
                    type: 'internship_assignment_letter_generated',
                    proposalId: id
                },
                dataOnly: true
            });
        }
    } catch (err) {
        console.error("Gagal mengirim notifikasi ke Kadep:", err);
    }

    return updated;
}

/**
 * Save application letter details and generate doc.
 */
export async function saveApplicationLetter(id, data) {
    const { letterNumber, proposedStartDate, proposedEndDate, actualStartDate, actualEndDate } = data;

    // 1. Update letter details
    const updated = await registrationRepository.updateApplicationLetter(id, {
        letterNumber,
        proposedStartDate: proposedStartDate ? new Date(proposedStartDate) : null,
        proposedEndDate: proposedEndDate ? new Date(proposedEndDate) : null,
        actualStartDate: actualStartDate ? new Date(actualStartDate) : null,
        actualEndDate: actualEndDate ? new Date(actualEndDate) : null
    });

    // 2. Fetch full detail for document generation
    const proposal = await registrationRepository.findProposalForLetter(id);

    // 3. Format data for Word Template
    const genData = {
        documentNumber: letterNumber,
        dateIssued: new Date(),
        coordinatorId: proposal.coordinatorId,
        companyName: proposal.targetCompany?.companyName,
        companyAddress: proposal.targetCompany?.companyAddress,
        startDate: proposedStartDate ? new Date(proposedStartDate) : null,
        endDate: proposedEndDate ? new Date(proposedEndDate) : null,
        coordinatorName: proposal.coordinator?.user?.fullName,
        coordinatorNim: proposal.coordinator?.user?.identityNumber,
        members: proposal.internships.map(i => ({
            name: i.student?.user?.fullName,
            nim: i.student?.user?.identityNumber,
            isCoordinator: i.studentId === proposal.coordinatorId
        }))
    };

    // 4. Generate docx/pdf via documentService
    const documentId = await documentService.generateApplicationLetter(id, genData);

    // 5. Update proposal with documentId
    await registrationRepository.updateLetterDocumentId(id, documentId);

    // 6. Notify Kadep
    try {
        const kadeps = await prisma.user.findMany({
            where: {
                userHasRoles: {
                    some: {
                        role: {
                            name: ROLES.KETUA_DEPARTEMEN
                        }
                    }
                }
            },
            select: { id: true }
        });

        const kadepUserIds = kadeps.map(k => k.id);
        if (kadepUserIds.length > 0) {
            const title = "Surat Permohonan KP Baru";
            const message = `Admin telah meng-generate Surat Permohonan KP untuk pengajuan ke ${proposal.targetCompany?.companyName}. Mohon segera ditandatangani.`;

            await notificationService.createNotificationsForUsers(kadepUserIds, { title, message });
            await sendFcmToUsers(kadepUserIds, {
                title,
                body: message,
                data: {
                    type: 'internship_application_letter_generated',
                    proposalId: id
                },
                dataOnly: true
            });
        }
    } catch (err) {
        console.error("Gagal mengirim notifikasi ke Kadep:", err);
    }

    return updated;
}

/**
 * Admin uploads company response document.
 */
export async function adminSubmitCompanyResponse(proposalId, documentId) {
    const result = await registrationRepository.updateCompanyResponseDoc(proposalId, documentId);

    try {
        const proposal = await registrationRepository.findProposalById(proposalId);
        const recipientIds = [proposal.coordinatorId, ...proposal.internships.map(i => i.studentId)];

        const title = "Surat Balasan Diunggah Admin";
        const message = `Admin telah mengunggah surat balasan dari perusahaan ${proposal.targetCompany?.companyName || 'tujuan'}. Silakan cek status pengajuan Anda.`;

        await notificationService.createNotificationsForUsers(recipientIds, { title, message });
        await sendFcmToUsers(recipientIds, {
            title,
            body: message,
            data: {
                type: 'internship_company_response_uploaded_admin',
                proposalId
            },
            dataOnly: true
        });
    } catch (err) {
        console.error("Failed to notify student of admin response upload:", err);
    }

    return result;
}

