import * as sekdepRepository from "../../repositories/insternship/sekdep.repository.js";
import * as adminRepository from "../../repositories/insternship/admin.repository.js";
import * as notificationRepository from "../../repositories/notification.repository.js";
import { sendFcmToUsers } from "../push.service.js";
import { createNotificationsForUsers } from "../notification.service.js";
import { convertHtmlToPdf } from "../../utils/pdf.util.js";
import * as documentService from "../document.service.js";
import prisma from "../../config/prisma.js";
import { getWorkingDays } from "../../utils/internship-date.util.js";
import { getHolidayDatesInRange } from "./holiday.service.js";
import crypto from "crypto";
import { sendMail } from "../../config/mailer.js";
import { fieldAssessmentRequestTemplate } from "../../utils/emailTemplate.js";
import { ENV } from "../../config/env.js";
import { ROLES } from "../../constants/roles.js";

/**
 * List all internship proposals with full lifecycle data for Sekdep.
 * @param {string} [academicYearId]
 * @returns {Promise<Array>}
 */
export async function listAllProposals(academicYearId) {
    const proposals = await sekdepRepository.findAllProposals(academicYearId);
    return proposals.map(mapSekdepProposal);
}

/**
 * List pending internship proposals for Sekdep.
 * @param {Object} params
 */
export async function listPendingProposals({ academicYearId, q, skip, take, sortBy, sortOrder }) {
    const proposals = await sekdepRepository.findPendingProposals({ academicYearId, q, skip, take, sortBy, sortOrder });
    const total = await sekdepRepository.countPendingProposals({ academicYearId, q });
    return {
        data: proposals.map(mapSekdepProposal),
        total
    };
}



/**
 * Helper to map proposal data for Sekdep.
 * @param {Object} proposal 
 * @returns {Object}
 */
function mapSekdepProposal(proposal) {
    return {
        id: proposal.id,
        coordinatorName: proposal.coordinator?.user?.fullName || "Unknown",
        coordinatorNim: proposal.coordinator?.user?.identityNumber || "N/A",
        companyName: proposal.targetCompany?.companyName || "N/A",
        status: proposal.status,
        proposalSekdepNotes: proposal.proposalSekdepNotes,
        companyResponseNotes: proposal.companyResponseNotes,
        academicYearName: proposal.academicYear
            ? `${proposal.academicYear.year} ${proposal.academicYear.semester.charAt(0).toUpperCase() + proposal.academicYear.semester.slice(1)}`
            : '-',
        memberCount: proposal.internships.length,
        acceptedMemberCount: proposal.internships.filter(i => ['ACCEPTED_BY_COMPANY', 'ONGOING', 'COMPLETED'].includes(i.status)).length,
        members: proposal.internships.map(i => ({
            id: i.studentId,
            name: i.student?.user?.fullName,
            nim: i.student?.user?.identityNumber,
            role: i.studentId === proposal.coordinatorId ? 'Koordinator' : 'Anggota',
            status: i.status
        })),
        createdAt: proposal.createdAt,
        updatedAt: proposal.updatedAt,
        dokumenProposal: proposal.proposalDocument ? {
            id: proposal.proposalDocument.id,
            fileName: proposal.proposalDocument.fileName,
            filePath: proposal.proposalDocument.filePath,
        } : null,
        dokumenSuratPermohonan: proposal.appLetterDoc ? {
            id: proposal.appLetterDoc.id,
            fileName: proposal.appLetterDoc.fileName,
            filePath: proposal.appLetterDoc.filePath,
        } : null,
        dokumenSuratBalasan: proposal.companyResponseDoc ? {
            id: proposal.companyResponseDoc.id,
            fileName: proposal.companyResponseDoc.fileName,
            filePath: proposal.companyResponseDoc.filePath,
        } : null,
        dokumenSuratTugas: proposal.assignLetterDoc ? {
            id: proposal.assignLetterDoc.id,
            fileName: proposal.assignLetterDoc.fileName,
            filePath: proposal.assignLetterDoc.filePath,
        } : null,
        isSigned: !!proposal.appLetterSignedById,
        isAssignmentSigned: !!proposal.assignLetterSignedById,
        proposedStartDate: proposal.proposedStartDate,
        proposedEndDate: proposal.proposedEndDate,
        startDatePlanned: proposal.startDatePlanned,
        endDatePlanned: proposal.endDatePlanned,
        startDateActual: proposal.startDateActual,
        endDateActual: proposal.endDateActual,
    };
}

/**
 * Get full detail of an internship proposal for Sekdep.
 * After consolidation, letter data is on the proposal itself.
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

    const proposal = await sekdepRepository.findProposalDetail(id);
    if (!proposal) {
        const error = new Error("Proposal tidak ditemukan.");
        error.statusCode = 404;
        throw error;
    }

    const updatedProposal = await sekdepRepository.updateProposalStatus(id, status, notes);

    // If approved, check if the target company needs to be promoted from 'diajukan' to 'save'
    if (status === 'APPROVED_PROPOSAL' && proposal.targetCompany?.status === 'diajukan') {
        await sekdepRepository.updateCompany(proposal.targetCompanyId, {
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
            const admins = await adminRepository.findAdmins();
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
 * Get all companies with their proposal counts and intern stats.
 * @param {Object} params - { q, skip, take }
 * @returns {Promise<Object>} - { data, total }
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
 * List all internships with mapping for Sekdep.
 * @param {Object} params
 * @returns {Promise<Object>} - { data, total }
 */
export async function listInternships({ academicYearId, status, supervisorId, q, skip, take, sortBy, sortOrder }) {
    const [internships, total] = await Promise.all([
        sekdepRepository.findInternships({ academicYearId, status, supervisorId, q, skip, take, sortBy, sortOrder }),
        sekdepRepository.countInternships({ academicYearId, status, supervisorId, q })
    ]);

    // Fetch holidays once for all internships in range
    const allDates = internships
        .filter(i => i.actualStartDate && i.actualEndDate)
        .flatMap(i => [new Date(i.actualStartDate), new Date(i.actualEndDate)]);
    let holidays = [];
    if (allDates.length > 0) {
        const minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
        const maxDate = new Date(Math.max(...allDates.map(d => d.getTime())));
        holidays = await getHolidayDatesInRange(minDate, maxDate);
    }

    const data = internships.map(i => ({
        id: i.id,
        nim: i.student?.user?.identityNumber,
        name: i.student?.user?.fullName,
        companyName: i.proposal?.targetCompany?.companyName || "Unknown",
        academicYearName: i.proposal?.academicYear
            ? `${i.proposal.academicYear.year} ${i.proposal.academicYear.semester.charAt(0).toUpperCase() + i.proposal.academicYear.semester.slice(1)}`
            : '-',
        supervisorName: i.supervisor?.user?.fullName || "Belum Ditentukan",
        fieldSupervisorName: i.fieldSupervisorName || "-",
        logbookProgress: {
            filled: i._count?.logbooks || 0,
            total: (i.actualStartDate && i.actualEndDate)
                ? getWorkingDays(i.actualStartDate, i.actualEndDate, holidays).length
                : 0
        },
        status: i.status,
        supervisorLetter: i.supLetter ? {
            id: i.supLetter.document?.id,
            fileName: i.supLetter.document?.fileName,
            filePath: i.supLetter.document?.filePath
        } : null,
        finalScore: i.finalNumericScore,
        finalGrade: i.finalGrade,
        createdAt: i.createdAt
    }));

    return { data, total };
}

/**
 * Get full detail of an internship for Sekdep dashboard.
 * @param {string} id 
 * @returns {Promise<Object>}
 */
export async function getInternshipDetail(id) {
    const internship = await sekdepRepository.findInternshipById(id);

    if (!internship) {
        throw new Error("Data Kerja Praktik tidak ditemukan");
    }

    const guidanceItems = internship.proposal?.academicYear?.internshipGuidanceQuestions || [];
    const uniqueWeeks = [...new Set(guidanceItems.map(q => q.weekNumber))];
    const guidanceTotal = uniqueWeeks.length > 0 ? Math.max(...uniqueWeeks) : 8;

    const formatTime = (timeStr) => {
        if (!timeStr) return null;
        const date = new Date(timeStr);
        return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }).replace(/\./g, ':');
    };

    return {
        id: internship.id,
        student: {
            nim: internship.student?.user?.identityNumber,
            name: internship.student?.user?.fullName,
            enrollmentYear: internship.student?.enrollmentYear
        },
        company: {
            name: internship.proposal?.targetCompany?.companyName || "Unknown",
            address: internship.proposal?.targetCompany?.companyAddress || "-",
            unitSection: internship.unitSection || "-"
        },
        supervisor: {
            name: internship.supervisor?.user?.fullName || "Belum Ditentukan",
            fieldSupervisor: internship.fieldSupervisorName || "Belum Ditentukan",
            fieldSupervisorEmail: internship.fieldSupervisorEmail || null
        },
        logbookProgress: {
            filled: internship._count?.logbooks || 0,
            total: await (async () => {
                if (!internship.actualStartDate || !internship.actualEndDate) return 0;
                const hols = await getHolidayDatesInRange(internship.actualStartDate, internship.actualEndDate);
                return getWorkingDays(internship.actualStartDate, internship.actualEndDate, hols).length;
            })()
        },
        guidanceProgress: {
            filled: internship.guidanceSessions?.length || 0,
            total: guidanceTotal
        },
        assessment: {
            lecturerStatus: internship.lecturerAssessmentStatus,
            fieldStatus: internship.fieldAssessmentStatus,
            finalScore: internship.finalNumericScore,
            finalGrade: internship.finalGrade
        },
        logbooks: internship.logbooks || [],
        guidanceSessions: internship.guidanceSessions || [],
        seminars: (internship.seminars || []).map(s => ({
            ...s,
            time: formatTime(s.startTime),
            moderatorName: s.moderatorStudent?.user?.fullName || "-"
        })),
        lecturerScores: (internship.lecturerScores || []).map(s => ({
            id: `${s.internshipId}-${s.chosenRubricId}`,
            score: s.score,
            cpmk: s.chosenRubric?.cpmk,
            rubricLevel: s.chosenRubric
        })),
        fieldScores: (internship.fieldScores || []).map(s => ({
            id: `${s.internshipId}-${s.chosenRubricId}`,
            score: s.score,
            cpmk: s.chosenRubric?.cpmk,
            rubricLevel: s.chosenRubric
        })),
        status: internship.status,
        academicYearName: internship.proposal?.academicYear
            ? `${internship.proposal.academicYear.year} ${internship.proposal.academicYear.semester.charAt(0).toUpperCase() + internship.proposal.academicYear.semester.slice(1)}`
            : '-',
        reportingDocuments: {
            report: {
                document: internship.reportDocument,
                status: internship.reportStatus,
                notes: internship.reportNotes,
                uploadedAt: internship.reportUploadedAt
            },
            completionCertificate: {
                document: internship.completionCertificateDoc,
                status: internship.completionCertificateStatus,
                notes: internship.completionCertificateNotes
            },
            companyReceipt: {
                document: internship.companyReceiptDoc,
                status: internship.companyReceiptStatus,
                notes: internship.companyReceiptNotes
            },
            logbookDocument: {
                document: internship.logbookDocument,
                status: internship.logbookDocumentStatus,
                notes: internship.logbookDocumentNotes
            }
        },
        supervisorLetter: internship.supLetter ? {
            document: internship.supLetter.document,
            documentNumber: internship.supLetter.documentNumber,
            dateIssued: internship.supLetter.dateIssued,
            startDate: internship.supLetter.startDate,
            endDate: internship.supLetter.endDate
        } : null,
        createdAt: internship.createdAt
    };
}

/**
 * Verify an internship document (Report, Certificate, Receipt, or Logbook).
 * @param {string} internshipId 
 * @param {Object} data - { documentType, status, notes }
 * @returns {Promise<Object>}
 */
export async function verifyInternshipDocument(internshipId, { documentType, status, notes }) {
    // Laporan akhir tidak bisa diverifikasi oleh sekdep, hanya dosen pembimbing
    if (!['completionCertificate', 'companyReceipt', 'logbookDocument'].includes(documentType)) {
        throw new Error("Jenis dokumen tidak valid.");
    }

    if (!['APPROVED', 'REVISION_NEEDED'].includes(status)) {
        throw new Error("Status verifikasi tidak valid.");
    }

    const internship = await sekdepRepository.findInternshipById(internshipId);
    if (!internship) {
        throw new Error("Data Kerja Praktik tidak ditemukan.");
    }

    const updatedInternship = await sekdepRepository.updateDocumentVerification(internshipId, { documentType, status, notes });

    // Notify student
    try {
        const docLabelMap = {
            report: 'Laporan Akhir',
            completionCertificate: 'Sertifikat Selesai KP',
            companyReceipt: 'Tanda Terima (KP-004)',
            logbookDocument: 'Laporan Kegiatan (KP-002)'
        };

        const docLabel = docLabelMap[documentType];
        const statusLabel = status === 'APPROVED' ? 'DISETUJUI' : 'PERLU REVISI';

        const title = `Verifikasi ${docLabel}`;
        let message = `Dokumen ${docLabel} Anda telah ${statusLabel.toLowerCase()} oleh Sekdep.`;
        if (notes) {
            message += ` Catatan: ${notes}`;
        }

        await notificationRepository.createNotificationsMany([{
            userId: internship.studentId,
            title,
            message
        }]);

        await sendFcmToUsers([internship.studentId], {
            title,
            body: message,
            data: {
                type: 'internship_document_verification',
                status,
                documentType,
                internshipId
            },
            dataOnly: true
        });
    } catch (err) {
        console.error("Gagal mengirim notifikasi verifikasi dokumen:", err);
    }

    return updatedInternship;
}

/**
 * Bulk verify multiple internship documents at once.
 * @param {string} internshipId 
 * @param {Object} data - { documents: [{ documentType, status, notes }], status, notes }
 * @returns {Promise<Object>}
 */
export async function bulkVerifyInternshipDocuments(internshipId, { documents, status, notes }) {
    if (!Array.isArray(documents) || documents.length === 0) {
        throw new Error("Dokumen yang akan diverifikasi harus berupa array dan tidak boleh kosong.");
    }

    // Validate all document types - laporan akhir tidak bisa diverifikasi oleh sekdep
    const validDocTypes = ['completionCertificate', 'companyReceipt', 'logbookDocument'];
    for (const doc of documents) {
        if (!validDocTypes.includes(doc.documentType)) {
            throw new Error(`Jenis dokumen tidak valid: ${doc.documentType}`);
        }
        if (!['APPROVED', 'REVISION_NEEDED'].includes(doc.status || status)) {
            throw new Error("Status verifikasi tidak valid.");
        }
    }

    const internship = await sekdepRepository.findInternshipById(internshipId);
    if (!internship) {
        throw new Error("Data Kerja Praktik tidak ditemukan.");
    }

    // Prepare documents data for bulk update
    const documentsToUpdate = documents.map(doc => ({
        documentType: doc.documentType,
        status: doc.status || status,
        notes: doc.notes !== undefined ? doc.notes : notes
    }));

    // Update all documents in a single transaction
    await sekdepRepository.bulkUpdateDocumentVerification(internshipId, documentsToUpdate);

    // Build results array
    const results = documentsToUpdate.map(doc => ({
        documentType: doc.documentType,
        status: doc.status,
        success: true
    }));

    // Notify student once for all documents
    try {
        const docLabelMap = {
            report: 'Laporan Akhir',
            completionCertificate: 'Sertifikat Selesai KP',
            companyReceipt: 'Tanda Terima (KP-004)',
            logbookDocument: 'Laporan Kegiatan (KP-002)'
        };

        const verifiedDocs = documents.map(doc => docLabelMap[doc.documentType] || doc.documentType).join(", ");
        const statusLabel = (documents[0]?.status || status) === 'APPROVED' ? 'DISETUJUI' : 'PERLU REVISI';

        const title = `Verifikasi Dokumen Pelaporan`;
        let message = `Dokumen pelaporan Anda (${verifiedDocs}) telah ${statusLabel.toLowerCase()} oleh Sekdep.`;
        if (notes) {
            message += ` Catatan: ${notes}`;
        }

        await notificationRepository.createNotificationsMany([{
            userId: internship.studentId,
            title,
            message
        }]);

        await sendFcmToUsers([internship.studentId], {
            title,
            body: message,
            data: {
                type: 'internship_document_bulk_verification',
                status: documents[0]?.status || status,
                internshipId,
                documentCount: documents.length
            },
            dataOnly: true
        });
    } catch (err) {
        console.error("Gagal mengirim notifikasi verifikasi dokumen bulk:", err);
    }

    return {
        success: true,
        message: `Berhasil memverifikasi ${documents.length} dokumen.`,
        results
    };
}

/**
 * List lecturers with their active internship workload for Sekdep.
 * @param {Object} params - { q, skip, take }
 * @returns {Promise<Object>} - { data, total }
 */
export async function getLecturersWorkloadList({ q, skip, take, sortBy, sortOrder, academicYearId }) {
    const [lecturers, total] = await Promise.all([
        sekdepRepository.findLecturersWithWorkload({ q, skip, take, sortBy, sortOrder, academicYearId }),
        sekdepRepository.countLecturersWithWorkload({ q, academicYearId })
    ]);

    const data = lecturers.map(l => ({
        id: l.id,
        name: l.user?.fullName || "Unknown",
        nip: l.user?.identityNumber || "-",
        activeInternshipCount: l._count?.internshipsSupervisored || 0,
        supervisorLetterStatus: `${l.internshipsSupervisored.filter(i => i.supLetterId).length}/${l._count?.internshipsSupervisored || 0}`
    }));

    return { data, total };
}

/**
 * Assign a supervisor to multiple internships in bulk.
 * @param {Object} params - { internshipIds, supervisorId }
 * @returns {Promise<Object>}
 */
export async function assignSupervisorsBulk({ internshipIds, supervisorId }) {
    // 1. Perform bulk update
    const result = await sekdepRepository.bulkUpdateInternshipSupervisor(internshipIds, supervisorId);

    // 2. Send Notifications to Supervisor (Lecturer) and Students
    try {
        // Get data for messages
        const internships = await sekdepRepository.findInternshipsWithStudents(internshipIds);
        const supervisor = await adminRepository.findLecturerById(supervisorId);
        const supervisorName = supervisor?.user?.fullName || "Dosen Pembimbing";

        const lecturerTitle = "Penugasan Pembimbing KP Baru";
        const studentTitle = "Pembimbing KP Telah Ditetapkan";

        const studentNames = internships.map(i => i.student?.user?.fullName || "Mahasiswa").join(", ");
        const lecturerMessage = `Anda telah ditugaskan menjadi pembimbing Kerja Praktik untuk: ${studentNames}.`;

        // Create in-app notification & FCM for Supervisor
        await createNotificationsForUsers([supervisorId], { title: lecturerTitle, message: lecturerMessage });
        await sendFcmToUsers([supervisorId], {
            title: lecturerTitle,
            body: lecturerMessage,
            data: { type: 'internship_supervisor_assigned' }
        });

        // Create notifications for each Student
        const studentNotifications = internships.map(i => ({
            userId: i.studentId,
            title: studentTitle,
            message: `Dosen pembimbing Kerja Praktik Anda telah ditetapkan: ${supervisorName}.`
        }));

        for (const notif of studentNotifications) {
            await createNotificationsForUsers([notif.userId], { title: notif.title, message: notif.message });
            await sendFcmToUsers([notif.userId], {
                title: notif.title,
                body: notif.message,
                data: { type: 'internship_supervisor_assigned' }
            });
        }
    } catch (error) {
        console.error("[assignSupervisorsBulk] Notification failed:", error.message);
        // We don't throw here to avoid failing the main transaction if notification fails
    }

    return result;
}

/**
 * Export all lecturers and their assigned students to PDF.
 * @returns {Promise<Buffer>}
 */
export async function exportLecturerWorkloadPdf() {
    const lecturers = await sekdepRepository.findAllLecturerWorkload();

    const flattened = [];
    lecturers.forEach(l => {
        const name = l.user?.fullName || "Tidak Diketahui";
        if (l.internshipsSupervisored.length === 0) {
            flattened.push({
                nim: "-",
                studentName: "-",
                lecturerName: name,
                isFirst: true,
                count: 1
            });
        } else {
            l.internshipsSupervisored.forEach((intern, index) => {
                flattened.push({
                    nim: intern.student?.user?.identityNumber || "-",
                    studentName: intern.student?.user?.fullName || "-",
                    lecturerName: name,
                    isFirst: index === 0,
                    count: l.internshipsSupervisored.length
                });
            });
        }
    });

    const rowsHtml = flattened.map(f => `
        <tr>
            <td style="border: 1px solid #000; padding: 8px; text-align: center;">${f.nim}</td>
            <td style="border: 1px solid #000; padding: 8px;">${f.studentName}</td>
            ${f.isFirst ? `<td rowspan="${f.count}" style="border: 1px solid #000; padding: 8px; vertical-align: middle;">${f.lecturerName}</td>` : ''}
        </tr>
    `).join("");

    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: 'Cambria', sans-serif; padding: 20px; }
                header { text-align: center; margin-bottom: 20px; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th { background-color: #f2f2f2; border: 1px solid #000; padding: 10px; text-align: left; }
                h1 { margin-bottom: 5px; font-size: 18px; }
                p { margin: 0; font-size: 14px; color: #555; }
            </style>
        </head>
        <body>
            <header>
                <h1>DAFTAR MAHASISWA DAN DOSEN PEMBIMBING KERJA PRAKTIK</h1>
                <p>Departemen Sistem Informasi</p>
                <p>Tanggal Cetak: ${new Date().toLocaleDateString("id-ID", { day: 'numeric', month: 'long', year: 'numeric' })}</p>
            </header>
            <table>
                <thead>
                    <tr>
                        <th style="width: 15%; text-align: center;">NIM</th>
                        <th style="width: 45%;">Nama Mahasiswa</th>
                        <th style="width: 40%;">Dosen Pembimbing</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>
        </body>
        </html>
    `;

    return convertHtmlToPdf(html);
}

/**
 * Get detailed data for managing supervisor letter for a lecturer.
 * @param {string} supervisorId 
 * @returns {Promise<Object>}
 */
export async function getSupervisorLetterDetail(supervisorId) {
    const lecturer = await sekdepRepository.findLecturerForLetter(supervisorId);

    if (!lecturer) {
        throw new Error("Dosen tidak ditemukan");
    }

    return {
        id: lecturer.id,
        lecturerName: lecturer.user?.fullName,
        lecturerNip: lecturer.user?.identityNumber,
        assignedStudents: lecturer.internshipsSupervisored.map(i => ({
            internshipId: i.id,
            nim: i.student?.user?.identityNumber,
            name: i.student?.user?.fullName,
            companyName: i.proposal?.targetCompany?.companyName || "Unknown Company",
            documents: {
                appLetterDocNumber: i.proposal?.appLetterDocNumber || null,
                assignLetterDocNumber: i.proposal?.assignLetterDocNumber || null,
                supLetterDocNumber: i.supLetter?.documentNumber || null,
                supLetterDocDateIssued: i.supLetter?.dateIssued || null,
                supLetterStartDate: i.supLetter?.startDate || null,
                supLetterEndDate: i.supLetter?.endDate || null,
                supLetterDocId: i.supLetter?.documentId || null,
                supLetterFile: i.supLetter?.document ? {
                    id: i.supLetter.document.id,
                    fileName: i.supLetter.document.fileName,
                    filePath: i.supLetter.document.filePath
                } : null
            }
        }))
    };
}

/**
 * Save and generate Supervisor Letter for selected internships.
 * @param {string} supervisorId 
 * @param {Object} data 
 * @returns {Promise<Object>}
 */
export async function saveSupervisorLetter(supervisorId, data) {
    const { documentNumber, startDate, endDate, internshipIds } = data;

    if (!internshipIds || internshipIds.length === 0) {
        throw new Error("Pilih minimal satu mahasiswa untuk di-assign surat tugas");
    }

    // 1. Fetch lecturer & selected internships
    const lecturer = await sekdepRepository.findLecturerForLetter(supervisorId);
    if (!lecturer) {
        throw new Error("Dosen tidak ditemukan");
    }

    const selectedInternships = lecturer.internshipsSupervisored.filter(i => internshipIds.includes(i.id));

    if (selectedInternships.length === 0) {
        throw new Error("Mahasiswa yang dipilih tidak valid atau bukan bimbingan dosen tersebut");
    }

    // 2. Format data for document generation
    const genData = {
        documentNumber,
        dateIssued: new Date(),
        lecturerName: lecturer.user?.fullName,
        lecturerNip: lecturer.user?.identityNumber,
        startDate,
        endDate,
        members: selectedInternships.map(i => ({
            nim: i.student?.user?.identityNumber,
            name: i.student?.user?.fullName,
            companyName: i.proposal?.targetCompany?.companyName || "Unknown"
        }))
    };

    // 3. Document Number Validation
    const existingLetter = await sekdepRepository.findSupervisorLetterByNumber(documentNumber);
    if (existingLetter && existingLetter.supervisorId !== supervisorId) {
        const error = new Error(`Nomor surat "${documentNumber}" sudah digunakan untuk dosen lain: ${existingLetter.supervisor?.user?.fullName}.`);
        error.statusCode = 409;
        throw error;
    }

    // 4. Generate document (PDF)
    const documentId = await documentService.generateSupervisorLetter(genData);

    // 5. Upsert the letter object
    const supLetter = await sekdepRepository.upsertSupervisorLetter({
        documentNumber,
        dateIssued: new Date(),
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        supervisorId,
        documentId
    });

    // 6. Link selected internships to the letter
    const result = await sekdepRepository.linkInternshipsToLetter(internshipIds, supLetter.id);

    // 7. Notify Kadep
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
            const title = "Surat Tugas Pembimbing Baru";
            const message = `Sekretaris Departemen telah meng-generate Surat Tugas Pembimbing KP untuk ${lecturer.user?.fullName}. Mohon segera ditandatangani.`;

            await createNotificationsForUsers(kadepUserIds, { title, message });
            await sendFcmToUsers(kadepUserIds, {
                title,
                body: message,
                data: {
                    type: 'internship_lecturer_assignment_generated',
                    supervisorId
                },
                dataOnly: true
            });
        }
    } catch (err) {
        console.error("[saveSupervisorLetter] Gagal mengirim notifikasi ke Kadep:", err);
    }

    return {
        message: "Surat Tugas Pembimbing berhasil digenerate dan disimpan",
        updatedCount: result.count
    };
}

/**
 * Generate a field assessment token and send email to field supervisor.
 */
export async function sendFieldAssessmentRequest(internshipId) {
    const internship = await prisma.internship.findUnique({
        where: { id: internshipId },
        include: {
            student: {
                include: { user: { select: { fullName: true, identityNumber: true } } },
            },
            proposal: {
                include: {
                    targetCompany: { select: { companyName: true } },
                    academicYear: { select: { year: true, semester: true } },
                },
            },
        },
    });

    if (!internship) {
        throw Object.assign(new Error("Internship tidak ditemukan."), { statusCode: 404 });
    }

    if (!internship.fieldSupervisorEmail) {
        throw Object.assign(new Error("Email pembimbing lapangan belum diisi oleh mahasiswa."), { statusCode: 400 });
    }

    // Invalidate existing unused tokens
    await prisma.fieldAssessmentToken.updateMany({
        where: { internshipId, isUsed: false },
        data: { isUsed: true, usedAt: new Date() },
    });

    // Generate new token and 6-digit PIN
    const token = crypto.randomUUID();
    const pin = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await prisma.fieldAssessmentToken.create({
        data: {
            internshipId,
            token,
            pin,
            expiresAt,
        },
    });

    // Construct assessment URL
    const assessmentUrl = `${ENV.FRONTEND_URL}/field-assessment/${token}`;

    // Send email
    const emailHtml = fieldAssessmentRequestTemplate({
        appName: ENV.APP_NAME || "Neo Central DSI",
        supervisorName: internship.fieldSupervisorName || "Bapak/Ibu",
        studentName: internship.student.user.fullName,
        studentNim: internship.student.user.identityNumber,
        companyName: internship.proposal.targetCompany?.companyName || "-",
        academicYear: `${internship.proposal.academicYear.year} - ${internship.proposal.academicYear.semester === "ganjil" ? "Ganjil" : "Genap"}`,
        assessmentUrl,
        pin,
        expiresInDays: 7,
    });

    await sendMail({
        to: internship.fieldSupervisorEmail,
        subject: `Permintaan Penilaian Kerja Praktik - ${internship.student.user.fullName}`,
        html: emailHtml,
    });

    return {
        message: "Link penilaian berhasil dikirim ke email pembimbing lapangan.",
        email: internship.fieldSupervisorEmail,
        assessmentUrl,
        expiresAt,
    };
}

/**
 * Sekdep rejects the final fixed report causing the student to have to re-upload.
 * @param {string} internshipId 
 * @param {string} notes 
 * @returns {Promise<Object>}
 */
export async function rejectFinalReport(internshipId, notes) {
    const internship = await prisma.internship.findUnique({
        where: { id: internshipId },
        include: { student: { include: { user: true } } }
    });

    if (!internship) {
        const error = new Error("Data Kerja Praktik tidak ditemukan.");
        error.statusCode = 404;
        throw error;
    }

    if (internship.reportFinalStatus !== 'APPROVED') {
        const error = new Error("Laporan final belum diunggah atau tidak dalam status yang dapat ditolak.");
        error.statusCode = 400;
        throw error;
    }

    const result = await prisma.internship.update({
        where: { id: internshipId },
        data: {
            reportFinalStatus: 'REVISION_NEEDED',
            reportFinalNotes: notes
        }
    });

    // Notify student
    try {
        const studentId = internship.studentId;
        const title = "Laporan Final Ditolak Sekretaris Departemen";
        const message = `Laporan Final KP Anda dikembalikan. Catatan: ${notes || 'Silakan unggah ulang dokumen yang benar.'}`;

        await createNotificationsForUsers([studentId], { title, message });
        await sendFcmToUsers([studentId], {
            title,
            body: message,
            data: {
                type: 'internship_final_report_rejected',
                internshipId
            },
            dataOnly: true
        });
    } catch (err) {
        console.error("Gagal mengirim notifikasi penolakan laporan final:", err);
    }

    return result;
}
