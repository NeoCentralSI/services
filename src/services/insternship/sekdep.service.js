import * as sekdepRepository from "../../repositories/insternship/sekdep.repository.js";
import * as adminRepository from "../../repositories/insternship/admin.repository.js";
import * as notificationRepository from "../../repositories/notification.repository.js";
import { sendFcmToUsers } from "../push.service.js";
import { createNotificationsForUsers } from "../notification.service.js";
import { convertHtmlToPdf } from "../../utils/pdf.util.js";

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
 * List proposals waiting for response verification for Sekdep.
 * @param {Object} params
 */
export async function listPendingResponses({ academicYearId, q, skip, take, sortBy, sortOrder }) {
    const proposals = await sekdepRepository.findPendingResponses({ academicYearId, q, skip, take, sortBy, sortOrder });
    const total = await sekdepRepository.countPendingResponses({ academicYearId, q });
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
        companyResponseSekdepNotes: proposal.companyResponseSekdepNotes,
        sekdepNotes: proposal.companyResponseSekdepNotes, // Built for backward compat
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
            const adminMessage = `Proposal Internship ke ${proposal.targetCompany.companyName} telah disetujui Sekdep dan siap diproses Surat Pengantarnya.`;
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
 * Verify a company response.
 * After consolidation, takes proposalId instead of responseId. Updates proposal
 * status and internship statuses.
 * @param {string} proposalId 
 * @param {string} status - 'APPROVED_BY_SEKDEP', 'REJECTED_BY_SEKDEP', 'REJECTED_BY_COMPANY'
 * @param {string} [notes] 
 * @param {string[]} [acceptedMemberIds]
 * @returns {Promise<Object>}
 */
export async function verifyCompanyResponse(proposalId, status, notes, acceptedMemberIds) {
    if (!['APPROVED_PROPOSAL', 'REJECTED_PROPOSAL', 'REJECTED_BY_COMPANY'].includes(status)) {
        throw new Error("Status verifikasi tidak valid.");
    }

    const proposal = await sekdepRepository.findCompanyResponseById(proposalId);
    if (!proposal) {
        throw new Error("Proposal tidak ditemukan.");
    }

    let proposalStatus = null;
    let internshipUpdates = [];
    const currentInternships = proposal.internships;

    // Ensure coordinator is included in updates if needed
    const allRelevantStudentIds = [...new Set([proposal.coordinatorId, ...currentInternships.map(i => i.studentId)])];

    if (status === 'REJECTED_BY_COMPANY') {
        proposalStatus = 'REJECTED_BY_COMPANY';
        internshipUpdates = allRelevantStudentIds.map(sid => ({
            studentId: sid,
            status: 'REJECTED_BY_COMPANY'
        }));
    } else if (status === 'REJECTED_PROPOSAL') {
        // Doc Invalid — no proposal/member status changes
        proposalStatus = null;
    } else {
        // APPROVED_PROPOSAL (Acceptance Letter)
        if (acceptedMemberIds && Array.isArray(acceptedMemberIds)) {
            const acceptedSet = new Set(acceptedMemberIds);

            // Note: Coordinator is usually implicitly accepted if they are the one uploading, 
            // but we follow the provided acceptedMemberIds which should include them.
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
            // Accept All
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

    // Notify students
    try {
        let title, message, notifType;

        if (status === 'REJECTED_PROPOSAL') {
            title = "Surat Balasan Ditolak Sekdep";
            message = "Dokumen surat balasan Anda ditolak oleh Sekdep (Tidak Valid/Buram). Silakan upload ulang.";
            notifType = 'internship_company_response_rejected_sekdep';
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

        // Notify Admin if Accepted (Full or Partial)
        if (['ACCEPTED_BY_COMPANY', 'PARTIALLY_ACCEPTED'].includes(proposalStatus)) {
            const admins = await adminRepository.findAdmins();
            const adminTitle = "Surat Balasan Disetujui (Diterima Perusahaan)";
            const adminMessage = `Surat balasan dari ${updatedProposal.targetCompany?.companyName} diterima. Silakan proses Surat Tugas.`;
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
                        proposalId: updatedProposal.id
                    },
                    dataOnly: true
                });
            }
        }
    } catch (err) {
        console.error("Gagal mengirim notifikasi verifikasi surat balasan:", err);
    }

    return updatedProposal;
}

/**
 * List all internships with mapping for Sekdep.
 * @param {Object} params
 * @returns {Promise<Object>} - { data, total }
 */
export async function listInternships({ academicYearId, status, q, skip, take, sortBy, sortOrder }) {
    const [internships, total] = await Promise.all([
        sekdepRepository.findInternships({ academicYearId, status, q, skip, take, sortBy, sortOrder }),
        sekdepRepository.countInternships({ academicYearId, status, q })
    ]);

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
            total: i.logbooks?.length || 0
        },
        status: i.status,
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
            fieldSupervisor: internship.fieldSupervisorName || "Belum Ditentukan"
        },
        logbookProgress: {
            filled: internship._count?.logbooks || 0,
            total: internship.logbooks?.length || 0
        },
        guidanceProgress: {
            filled: internship.guidanceSessions?.length || 0,
            total: 8 // Assuming 8 is standard, can adjust
        },
        seminar: internship.seminars?.[0] ? {
            id: internship.seminars[0].id,
            status: "Selesai" // Placeholder logic
        } : null,
        assessment: {
            lecturerStatus: internship.lecturerAssessmentStatus,
            fieldStatus: internship.fieldAssessmentStatus,
            finalScore: internship.finalNumericScore,
            finalGrade: internship.finalGrade
        },
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
export async function getLecturersWorkloadList({ q, skip, take, sortBy, sortOrder }) {
    const [lecturers, total] = await Promise.all([
        sekdepRepository.findLecturersWithWorkload({ q, skip, take, sortBy, sortOrder }),
        sekdepRepository.countLecturersWithWorkload({ q })
    ]);

    const data = lecturers.map(l => ({
        id: l.id,
        name: l.user?.fullName || "Unknown",
        nip: l.user?.identityNumber || "-",
        activeInternshipCount: l._count?.internshipsSupervisored || 0
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
