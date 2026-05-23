import * as pendaftaranRepository from "../../repositories/insternship/pendaftaran.repository.js";
import * as penunjukanPembimbingRepository from "../../repositories/insternship/penunjukan-pembimbing.repository.js";
import * as pelaksanaanRepository from "../../repositories/insternship/pelaksanaan.repository.js";
import * as bimbinganRepository from "../../repositories/insternship/bimbingan.repository.js";
import * as seminarRepository from "../../repositories/insternship/seminar.repository.js";
import * as penilaianRepository from "../../repositories/insternship/penilaian.repository.js";
import * as sekdepRepository from "../../repositories/insternship/monitoring.repository.js";
import * as notificationRepository from "../../repositories/notification.repository.js";
import { syncInternshipCompletionStatus } from "./internshipStatus.service.js";

import * as notificationService from "../notification.service.js";
import { sendFcmToUsers } from "../push.service.js";
import { ROLES } from "../../constants/roles.js";
import { getWorkingDays } from "../../utils/internship-date.util.js";
import { getHolidayDatesInRange } from "./pendaftaran.service.js";
import axios from "axios";
import path from "path";
import fs from "fs";
import mammoth from "mammoth";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import crypto from "crypto";
import prisma from "../../config/prisma.js";
import { ENV } from "../../config/env.js";
import { sendMail } from "../../config/mailer.js";
import { fieldAssessmentRequestTemplate } from "../../utils/emailTemplate.js";




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
    const seminarMinutesDocument = (internship.seminars || [])
        .find(seminar => seminar.status === 'COMPLETED' && seminar.beritaAcaraDocument)
        ?.beritaAcaraDocument || null;

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
            finalGrade: internship.finalGrade,
            isLogbookLocked: internship.isLogbookLocked
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
                document: internship.companyReportDoc,
                status: ['COMPLETED', 'APPROVED'].includes(internship.fieldAssessmentStatus)
                    ? 'APPROVED'
                    : internship.companyReportStatus,
                notes: internship.companyReportNotes,
                uploadedAt: null
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
            },
            fieldAssessmentDocument: {
                document: internship.fieldAssessmentDoc,
                status: internship.fieldAssessmentStatus,
                notes: internship.fieldAssessmentNotes
            },
            beritaAcara: {
                document: seminarMinutesDocument,
                status: seminarMinutesDocument ? 'APPROVED' : null,
                notes: null
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
 * Update field supervisor and unit information for Sekdep.
 * @param {string} internshipId
 * @param {Object} data
 * @returns {Promise<Object>}
 */
export async function updateInternshipFieldInfo(internshipId, data) {
    const internship = await prisma.internship.findUnique({
        where: { id: internshipId }
    });

    if (!internship) {
        const error = new Error("Data Kerja Praktik tidak ditemukan.");
        error.statusCode = 404;
        throw error;
    }

    if (internship.fieldAssessmentStatus === "COMPLETED") {
        const error = new Error("Penilaian lapangan sudah selesai sehingga informasi lapangan tidak dapat diubah.");
        error.statusCode = 400;
        throw error;
    }

    const normalizeString = (value) => typeof value === "string" ? value.trim() : "";
    const payload = {
        fieldSupervisorName: normalizeString(data?.fieldSupervisorName),
        fieldSupervisorEmail: normalizeString(data?.fieldSupervisorEmail),
        unitSection: normalizeString(data?.unitSection)
    };

    if (!payload.fieldSupervisorName || !payload.fieldSupervisorEmail || !payload.unitSection) {
        const error = new Error("Nama pembimbing lapangan, email pembimbing lapangan, dan unit kerja wajib diisi.");
        error.statusCode = 400;
        throw error;
    }

    return prisma.internship.update({
        where: { id: internshipId },
        data: payload
    });
}

/**
 * Sekdep rejects the approved internship report causing the student to have to re-upload.
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

    if (internship.reportStatus !== 'APPROVED') {
        const error = new Error("Laporan final belum diunggah atau tidak dalam status yang dapat ditolak.");
        error.statusCode = 400;
        throw error;
    }

    const result = await prisma.internship.update({
        where: { id: internshipId },
        data: {
            reportStatus: 'REVISION_NEEDED',
            reportNotes: notes
        }
    });

    // Notify student
    try {
        const studentId = internship.studentId;
        const title = "Laporan Akhir Ditolak Sekretaris Departemen";
        const message = `Laporan Akhir KP Anda dikembalikan. Catatan: ${notes || 'Silakan unggah ulang dokumen yang benar.'}`;

        await notificationService.createNotificationsForUsers([studentId], { title, message });
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

const getTwoMonthsAgo = () => {
    const d = new Date();
    d.setMonth(d.getMonth() - 2);
    return d;
};

export const getInternshipMonitoringStats = async (academicYearId) => {
    const twoMonthsAgo = getTwoMonthsAgo();

    const where = {
        ...(academicYearId && academicYearId !== 'all' ? {
            proposal: {
                academicYearId: academicYearId
            }
        } : {})
    };

    // 1. Basic Counts
    const stats = await prisma.internship.groupBy({
        by: ['status'],
        where: where,
        _count: {
            id: true
        }
    });

    const statusCounts = stats.reduce((acc, item) => {
        acc[item.status] = item._count.id;
        return acc;
    }, {});

    // 2. Waiting Verification (Any document needs verification)
    const waitingVerificationCount = await prisma.internship.count({
        where: {
            ...where,
            OR: [
                { companyReceiptStatus: 'SUBMITTED' },
                { logbookDocumentStatus: 'SUBMITTED' },
                { completionCertificateStatus: 'SUBMITTED' },
                { reportStatus: 'SUBMITTED' }
            ]
        }
    });

    // 3. Overdue (> 2 months since actualEndDate)
    const overdueCount = await prisma.internship.count({
        where: {
            ...where,
            status: { not: 'COMPLETED' },
            actualEndDate: {
                lt: twoMonthsAgo
            }
        }
    });

    // 4. Status Distribution for Chart
    const allStatuses = ['PENDING', 'ONGOING', 'COMPLETED', 'FAILED'];
    const distribution = allStatuses.map(s => ({
        name: s,
        value: statusCounts[s] || 0
    }));

    return {
        summary: {
            totalOngoing: statusCounts['ONGOING'] || 0,
            waitingVerification: waitingVerificationCount,
            overdue: overdueCount,
            completed: statusCounts['COMPLETED'] || 0
        },
        distribution
    };
};

export const getDetailedMonitoringList = async (academicYearId) => {
    const today = new Date();

    const where = {
        status: { not: 'COMPLETED' },
        actualEndDate: { not: null },
        ...(academicYearId && academicYearId !== 'all' ? {
            proposal: {
                academicYearId: academicYearId
            }
        } : {})
    };

    const internships = await prisma.internship.findMany({
        where: where,
        include: {
            student: {
                include: {
                    user: true
                }
            },
            supervisor: {
                include: {
                    user: true
                }
            },
            seminars: {
                where: {
                    status: 'COMPLETED'
                },
                take: 1
            }
        },
        orderBy: {
            actualEndDate: 'asc'
        }
    });

    return internships.map(item => {
        const endDate = new Date(item.actualEndDate);
        const diffInMs = today - endDate;
        const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

        let deadlineStatus = 'Aman';
        if (diffInDays > 60) {
            deadlineStatus = 'Terlambat';
        } else if (diffInDays > 45) {
            deadlineStatus = 'Peringatan';
        }

        return {
            id: item.id,
            name: item.student.user.fullName,
            nim: item.student.identityNumber,
            supervisor: item.supervisor?.user.fullName || 'Belum Ditunjuk',
            endDate: item.actualEndDate,
            daysPast: diffInDays,
            status: deadlineStatus,
            progress: {
                field: item.fieldAssessmentStatus === 'COMPLETED',
                lecturer: item.lecturerAssessmentStatus === 'COMPLETED',
                seminar: item.seminars.length > 0,
                report: item.reportStatus === 'APPROVED'
            }
        };
    });
};

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
 * Verify an internship document (Report, Certificate, Receipt, or Logbook).
 * @param {string} internshipId 
 * @param {Object} data - { documentType, status, notes }
 * @returns {Promise<Object>}
 */
export async function verifyInternshipDocument(internshipId, { documentType, status, notes }) {
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

    // Holistic Completion Check
    await syncInternshipCompletionStatus(internshipId);

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

    // Validate all document types
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

    // Holistic Completion Check
    await syncInternshipCompletionStatus(internshipId);

    return {
        success: true,
        message: `Berhasil memverifikasi ${documents.length} dokumen.`,
        results
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

    if (!internship.isLogbookLocked) {
        throw Object.assign(new Error("Logbook harus dikunci terlebih dahulu sebelum link penilaian dikirim."), { statusCode: 400 });
    }

    if (!internship.companyReportDocId) {
        throw Object.assign(new Error("Laporan instansi harus diunggah terlebih dahulu sebelum link penilaian dikirim."), { statusCode: 400 });
    }

    if (["COMPLETED", "APPROVED"].includes(internship.fieldAssessmentStatus)) {
        throw Object.assign(new Error("Penilaian lapangan sudah selesai sehingga link penilaian tidak perlu dikirim ulang."), { statusCode: 400 });
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



