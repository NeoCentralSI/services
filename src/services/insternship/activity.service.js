import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import fs from "fs/promises";
import path from "path";
import prisma from "../../config/prisma.js";
import { ENV } from "../../config/env.js";
import { convertDocxToPdf } from "../../utils/pdf.util.js";
import { getWorkingDays } from "../../utils/internship-date.util.js";
import { getHolidayDatesInRange } from "./holiday.service.js";
import * as activityRepository from "../../repositories/insternship/activity.repository.js";
import * as registrationRepository from "../../repositories/insternship/registration.repository.js";
import { syncInternshipCompletionStatus } from "./internshipStatus.service.js";
import { ROLES } from "../../constants/roles.js";
import { createNotificationsForUsers } from "../notification.service.js";
import { sendFcmToUsers } from "../push.service.js";
import { sendFieldAssessmentRequest } from "./sekdep.service.js";
import { terbilang, getIndonesianDayName, getIndonesianMonthName } from "../../utils/internship-document.util.js";
import { stampQRCode } from "../../utils/pdf-sign.util.js";
import crypto from "crypto";

import { generateLogbookPdfFromTemplate } from "../../utils/logbook-pdf.util.js";


/**
 * Get logbooks for current student.
 * @param {string} studentId 
 * @returns {Promise<Object>}
 */
export async function getStudentLogbooks(studentId) {
    const internship = await activityRepository.getStudentInternship(studentId);
    if (!internship) return { internship: null, logbooks: [] };

    // Extend internship to include student user info (if not already there)
    // Actually, getStudentInternship already has includes, but we need student->user.
    const internshipWithStudent = await prisma.internship.findUnique({
        where: { id: internship.id },
        include: {
            student: {
                include: {
                    user: {
                        select: {
                            fullName: true,
                            identityNumber: true
                        }
                    }
                }
            },
            proposal: {
                include: {
                    targetCompany: true,
                    internships: {
                        where: { status: { in: ['ONGOING', 'COMPLETED', 'FAILED'] } },
                        include: {
                            student: { include: { user: true } }
                        }
                    }
                }
            },
            seminars: {
                include: {
                    room: true,
                    moderatorStudent: {
                        include: {
                            user: true
                        }
                    }
                },
                orderBy: {
                    createdAt: 'desc'
                }
            },
            supervisor: {
                include: {
                    user: true
                }
            },
            reportDocument: true,
            reportFeedbackDocument: true,
            completionCertificateDoc: true,
            companyReceiptDoc: true,
            companyReportDoc: true,
            logbookDocument: true,
            fieldAssessmentTokens: {
                where: {
                    isUsed: false,
                    expiresAt: { gt: new Date() }
                },
                orderBy: { createdAt: 'desc' },
                take: 1
            }
        }
    });

    const logbooks = await activityRepository.getLogbooks(internship.id);
    
    // Calculate progress (with holidays excluded)
    let holidays = [];
    if (internshipWithStudent.actualStartDate && internshipWithStudent.actualEndDate) {
        holidays = await getHolidayDatesInRange(internshipWithStudent.actualStartDate, internshipWithStudent.actualEndDate);
    }
    const daysTotal = (internshipWithStudent.actualStartDate && internshipWithStudent.actualEndDate)
        ? getWorkingDays(internshipWithStudent.actualStartDate, internshipWithStudent.actualEndDate, holidays).length
        : 0;
    const daysFilled = logbooks.filter(lb => lb.activityDescription && lb.activityDescription.trim().length > 0).length;

    return { 
        internship: {
            ...internshipWithStudent,
            actualStartDate: internshipWithStudent.actualStartDate,
            actualEndDate: internshipWithStudent.actualEndDate,
            activeAssessmentUrl: internshipWithStudent.fieldAssessmentTokens?.[0]
                ? `${ENV.FRONTEND_URL}/field-assessment/${internshipWithStudent.fieldAssessmentTokens[0].token}`
                : null
        }, 
        logbooks,
        logbookProgress: {
            filled: daysFilled,
            total: daysTotal
        }
    };
}

/**
 * Update logbook entry with time validation.
 * @param {string} logbookId 
 * @param {string} studentId 
 * @param {string} activityDescription 
 * @returns {Promise<Object>}
 */
export async function updateLogbook(logbookId, studentId, activityDescription) {
    const logbook = await prisma.internshipLogbook.findUnique({
        where: { id: logbookId },
        include: { internship: true }
    });

    if (!logbook) throw new Error("Logbook tidak ditemukan.");
    if (logbook.internship.studentId !== studentId) throw new Error("Akses ditolak.");

    // Check if logbook is locked (student finished it or field assessment submitted)
    if (logbook.internship.isLogbookLocked) {
        throw new Error("Logbook sudah dikunci dan tidak dapat diubah lagi.");
    }
    if (logbook.internship.fieldAssessmentStatus === "COMPLETED") {
        throw new Error("Logbook sudah dikunci karena penilaian lapangan telah selesai.");
    }

    const now = new Date();
    const logbookDate = new Date(logbook.activityDate);
    logbookDate.setHours(0, 0, 0, 0);

    // Can fill from the start of activityDate until 24 hours after activityDate ends
    // If activityDate is 2024-05-20, can fill from 2024-05-20 00:00:00 until 2024-05-21 23:59:59
    const startOfRange = logbookDate;
    const endOfRange = new Date(logbookDate);
    endOfRange.setDate(endOfRange.getDate() + 1);
    endOfRange.setHours(23, 59, 59, 999);

    if (now < startOfRange || now > endOfRange) {
        throw new Error("Logbook hanya dapat diisi mulai tanggal kegiatan sampai 24 jam setelah hari tersebut berakhir.");
    }

    return activityRepository.updateLogbook(logbookId, studentId, activityDescription);
}

/**
 * Send logbook reminders to students.
 * Called by cron at 16:00 (today) and 17:00 (yesterday overdue).
 */
export async function sendLogbookReminders() {
    const now = new Date();
    const currentHour = now.getHours();
    
    // 16:00 -> Remind for today
    // 17:00 -> Remind for yesterday if not filled
    const isTodayReminder = currentHour === 16;
    const isOverdueReminder = currentHour === 17;

    if (!isTodayReminder && !isOverdueReminder) return { sentCount: 0 };

    const targetDate = new Date();
    targetDate.setHours(0, 0, 0, 0);
    if (isOverdueReminder) {
        targetDate.setDate(targetDate.getDate() - 1);
    }

    const logbooks = await prisma.internshipLogbook.findMany({
        where: {
            activityDate: targetDate,
            internship: { status: 'ONGOING' }
        },
        include: {
            internship: {
                include: {
                    student: { include: { user: true } },
                    proposal: { include: { targetCompany: true } }
                }
            }
        }
    });

    let sentCount = 0;
    for (const logbook of logbooks) {
        const studentUserId = logbook.internship.student.user.id;
        const companyName = logbook.internship.proposal?.targetCompany?.companyName || 'Perusahaan';

        if (isTodayReminder) {
            const title = "📝 Isi Logbook Hari Ini";
            const message = `Sudah selesai kegiatan hari ini di ${companyName}? Jangan lupa isi logbook ya!`;
            await sendFcmToUsers([studentUserId], {
                title,
                body: message,
                data: { type: 'internship_logbook_reminder' }
            });
            sentCount++;
        } else if (isOverdueReminder && (!logbook.activityDescription || logbook.activityDescription.trim().length === 0)) {
            const dateStr = targetDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long' });
            const title = "⚠️ Logbook Belum Diisi!";
            const message = `Logbook tanggal ${dateStr} belum diisi. Ayo segera isi sebelum batas waktu berakhir malam ini.`;
            await sendFcmToUsers([studentUserId], {
                title,
                body: message,
                data: { type: 'internship_logbook_overdue' }
            });
            sentCount++;
        }
    }

    return { sentCount };
}

/**
 * Update internship details.
 * @param {string} studentId 
 * @param {Object} data 
 * @returns {Promise<Object>}
 */
export async function updateInternshipDetails(studentId, data) {
    return activityRepository.updateInternshipDetails(studentId, data);
}

/**
 * Lock student logbook.
 * @param {string} studentId 
 * @returns {Promise<Object>}
 */
export async function lockLogbook(studentId) {
    // Check if logbook is sufficiently filled? 
    // Usually handled by frontend warning, but we can check here too if needed.
    return activityRepository.lockLogbook(studentId);
}

export async function generateLogbookPdf(studentId, signatureBase64 = null, signatureHash = null) {
    // 1. Get internship with all necessary data
    const internship = await activityRepository.getStudentInternship(studentId);
    if (!internship) {
        throw new Error("Data Kerja Praktik tidak ditemukan.");
    }
    
    // If we have no signature provided, check for existing document
    if (!signatureBase64 && internship.logbookDocumentId) {
        const doc = await prisma.document.findUnique({
            where: { id: internship.logbookDocumentId }
        });
        if (doc) {
            try {
                return await fs.readFile(path.join(process.cwd(), doc.filePath));
            } catch (err) {
                console.error("Existing logbook file not found on disk, will regenerate.");
            }
        }
    }

    // 2. Otherwise generate from template
    const logbooks = await activityRepository.getLogbooks(internship.id);
    const kopTemplate = await prisma.document.findFirst({
        where: {
            fileName: { contains: "KOP" }
        },
        orderBy: { createdAt: 'desc' }
    });

    let headerPdfBuffer = null;
    if (kopTemplate) {
        try {
            const templateBuffer = await fs.readFile(path.join(process.cwd(), kopTemplate.filePath));
            if (kopTemplate.filePath.endsWith('.docx')) {
                headerPdfBuffer = await convertDocxToPdf(templateBuffer, "KOP.docx");
            } else if (kopTemplate.filePath.endsWith('.pdf')) {
                headerPdfBuffer = templateBuffer;
            }
        } catch (err) {
            console.error("Gagal memuat template KOP:", err);
        }
    }

    return generateLogbookPdfFromTemplate({
        studentName: internship.student.user.fullName,
        studentNim: internship.student.user.identityNumber,
        companyName: internship.proposal?.targetCompany?.companyName || "-",
        fieldSupervisorName: internship.fieldSupervisorName || "-",
        academicYear: `${internship.proposal?.academicYear?.year} - ${internship.proposal?.academicYear?.semester === "ganjil" ? "Ganjil" : "Genap"}`,
        logbooks,
        signatureBase64,
        signatureHash,
        headerPdfBuffer
    });
}

/**
 * Submit an internship report revision.
 * @param {string} studentId 
 * @param {string} title 
 * @param {string} documentId 
 * @returns {Promise<Object>}
 */
export async function submitInternshipReport(studentId, title, documentId) {
    const internship = await activityRepository.getStudentInternship(studentId);
    if (!internship) {
        const error = new Error("Kegiatan Kerja Praktik aktif tidak ditemukan.");
        error.statusCode = 404;
        throw error;
    }

    const result = await activityRepository.createReport({
        internshipId: internship.id,
        title,
        documentId
    });

    // Notify Supervisor (Lecturer) only
    try {
        const studentName = internship.student?.user?.fullName || "Mahasiswa";

        // Notify Supervisor (Lecturer)
        if (internship.supervisorId) {
            const supervisorTitle = "Laporan Akhir Baru";
            const supervisorMessage = `${studentName} telah mengunggah Laporan Akhir: ${title}. Silakan verifikasi laporan tersebut.`;

            await createNotificationsForUsers([internship.supervisorId], { 
                title: supervisorTitle, 
                message: supervisorMessage 
            });
            await sendFcmToUsers([internship.supervisorId], {
                title: supervisorTitle,
                body: supervisorMessage,
                data: {
                    type: 'internship_final_report_uploaded',
                    role: 'lecturer',
                    internshipId: internship.id,
                    studentId: internship.studentId
                },
                dataOnly: true
            });
        }
    } catch (err) {
        console.error("Gagal mengirim notifikasi upload laporan akhir:", err);
    }

    return result;
}

/**
 * Submit the final fixed internship report post-seminar.
 * @param {string} studentId 
 * @param {string} documentId 
 * @returns {Promise<Object>}
 */
export async function submitFinalReport(studentId, documentId) {
    const internship = await activityRepository.getStudentInternship(studentId);
    if (!internship) {
        const error = new Error("Kegiatan Kerja Praktik aktif tidak ditemukan.");
        error.statusCode = 404;
        throw error;
    }

    const result = await activityRepository.updateFinalReport(studentId, documentId);

    // Notify Sekdep
    try {
        const sekdeps = await registrationRepository.findUsersByRole(ROLES.SEKRETARIS_DEPARTEMEN);
        const sekdepIds = sekdeps.map(s => s.id);

        if (sekdepIds.length > 0) {
            const studentName = internship.student?.user?.fullName || "Mahasiswa";
            const titleNotif = "Laporan Final KP Baru (Post-Seminar)";
            const message = `${studentName} telah mengunggah Laporan Final Fix beserta lembar pengesahan.`;

            await createNotificationsForUsers(sekdepIds, { title: titleNotif, message });
            await sendFcmToUsers(sekdepIds, {
                title: titleNotif,
                body: message,
                data: {
                    type: 'internship_reporting_document_uploaded',
                    documentType: 'reportFinal',
                    internshipId: internship.id
                },
                dataOnly: true
            });
        }
    } catch (err) {
        console.error("Gagal mengirim notifikasi upload laporan final:", err);
    }

    // Holistic Completion Check
    await syncInternshipCompletionStatus(internship.id);

    return result;
}

/**
 * Update completion certificate for an internship.
 * @param {string} studentId 
 * @param {string} documentId 
 */
export async function updateCompletionCertificate(studentId, documentId) {
    const result = await activityRepository.updateCompletionCertificate(studentId, documentId);

    // Notify Sekdep
    try {
        const internshipWithStudent = await prisma.internship.findFirst({
            where: { studentId, status: 'ONGOING' },
            include: { student: { include: { user: true } } }
        });

        if (internshipWithStudent) {
            const sekdeps = await registrationRepository.findUsersByRole(ROLES.SEKRETARIS_DEPARTEMEN);
            const sekdepIds = sekdeps.map(s => s.id);

            if (sekdepIds.length > 0) {
                const studentName = internshipWithStudent.student?.user?.fullName || "Mahasiswa";
                const titleNotif = "Sertifikat Selesai KP Baru";
                const message = `${studentName} telah mengunggah Sertifikat Selesai KP.`;

                await createNotificationsForUsers(sekdepIds, { title: titleNotif, message });
                await sendFcmToUsers(sekdepIds, {
                    title: titleNotif,
                    body: message,
                    data: {
                        type: 'internship_reporting_document_uploaded',
                        documentType: 'completionCertificate',
                        internshipId: internshipWithStudent.id
                    },
                    dataOnly: true
                });
            }
        }
    } catch (err) {
        console.error("Gagal mengirim notifikasi upload sertifikat selesai KP:", err);
    }

    return result;
}

/**
 * Submit internship company report document (laporan akhir instansi).
 * Triggers the magic link generation for field supervisor assessment.
 * @param {string} studentId 
 * @param {string} documentId 
 */
export async function submitCompanyReport(studentId, documentId) {
    const internship = await activityRepository.getStudentInternship(studentId);
    if (!internship) {
        const error = new Error("Kegiatan Kerja Praktik aktif tidak ditemukan.");
        error.statusCode = 404;
        throw error;
    }

    if (!internship.isLogbookLocked) {
        const error = new Error("Logbook harus diselesaikan (dikunci) terlebih dahulu sebelum mengunggah laporan instansi.");
        error.statusCode = 400;
        throw error;
    }

    const result = await activityRepository.updateCompanyReport(studentId, documentId);

    // Notify Sekdep
    let assessmentInfo = null;
    try {
        const internshipWithStudent = await prisma.internship.findFirst({
            where: { studentId, status: 'ONGOING' },
            include: { student: { include: { user: true } } }
        });

        if (internshipWithStudent) {
            // Trigger automatic magic link email
            try {
                assessmentInfo = await sendFieldAssessmentRequest(internshipWithStudent.id);
                console.log(`Berhasil mengirim magic link secara otomatis untuk internship: ${internshipWithStudent.id}`);
            } catch (emailErr) {
                console.error("Gagal mengirim magic link otomatis:", emailErr);
                // Kita tidak throw error agar proses upload tetap berhasil meskipun email gagal sementara
            }

            const sekdeps = await registrationRepository.findUsersByRole(ROLES.SEKRETARIS_DEPARTEMEN);
            const sekdepIds = sekdeps.map(s => s.id);

            if (sekdepIds.length > 0) {
                const studentName = internshipWithStudent.student?.user?.fullName || "Mahasiswa";
                const titleNotif = "Laporan Akhir (Instansi) Baru";
                const message = `${studentName} telah mengunggah Laporan Akhir untuk instansi. Link penilaian pembimbing lapangan otomatis dikirim.`;

                await createNotificationsForUsers(sekdepIds, { title: titleNotif, message });
                await sendFcmToUsers(sekdepIds, {
                    title: titleNotif,
                    body: message,
                    data: {
                        type: 'internship_reporting_document_uploaded',
                        documentType: 'companyReport',
                        internshipId: internshipWithStudent.id
                    },
                    dataOnly: true
                });
            }
        }
    } catch (err) {
        console.error("Gagal memproses post-upload laporan akhir instansi:", err);
    }

    return { ...result, assessmentInfo };
}

/**
 * Update company receipt for an internship.
 * @param {string} studentId 
 * @param {string} documentId 
 */
export async function updateCompanyReceipt(studentId, documentId) {
    const result = await activityRepository.updateCompanyReceipt(studentId, documentId);

    // Notify Sekdep
    try {
        const internshipWithStudent = await prisma.internship.findFirst({
            where: { studentId, status: 'ONGOING' },
            include: { student: { include: { user: true } } }
        });

        if (internshipWithStudent) {
            const sekdeps = await registrationRepository.findUsersByRole(ROLES.SEKRETARIS_DEPARTEMEN);
            const sekdepIds = sekdeps.map(s => s.id);

            if (sekdepIds.length > 0) {
                const studentName = internshipWithStudent.student?.user?.fullName || "Mahasiswa";
                const titleNotif = "Tanda Terima (KP-004) Baru";
                const message = `${studentName} telah mengunggah Tanda Terima (KP-004).`;

                await createNotificationsForUsers(sekdepIds, { title: titleNotif, message });
                await sendFcmToUsers(sekdepIds, {
                    title: titleNotif,
                    body: message,
                    data: {
                        type: 'internship_reporting_document_uploaded',
                        documentType: 'companyReceipt',
                        internshipId: internshipWithStudent.id
                    },
                    dataOnly: true
                });
            }
        }
    } catch (err) {
        console.error("Gagal mengirim notifikasi upload kwitansi perusahaan:", err);
    }

    return result;
}

/**
 * Submit logbook document for an internship.
 * @param {string} studentId 
 * @param {string} documentId 
 */
export async function submitLogbookDocument(studentId, documentId) {
    const result = await activityRepository.updateLogbookDocument(studentId, documentId);

    // Notify Sekdep
    try {
        const internshipWithStudent = await prisma.internship.findFirst({
            where: { studentId, status: 'ONGOING' },
            include: { student: { include: { user: true } } }
        });

        if (internshipWithStudent) {
            const sekdeps = await registrationRepository.findUsersByRole(ROLES.SEKRETARIS_DEPARTEMEN);
            const sekdepIds = sekdeps.map(s => s.id);

            if (sekdepIds.length > 0) {
                const studentName = internshipWithStudent.student?.user?.fullName || "Mahasiswa";
                const titleNotif = "Laporan Kegiatan (KP-002) Baru";
                const message = `${studentName} telah mengunggah Laporan Kegiatan (KP-002).`;

                await createNotificationsForUsers(sekdepIds, { title: titleNotif, message });
                await sendFcmToUsers(sekdepIds, {
                    title: titleNotif,
                    body: message,
                    data: {
                        type: 'internship_reporting_document_uploaded',
                        documentType: 'logbookDocument',
                        internshipId: internshipWithStudent.id
                    },
                    dataOnly: true
                });
            }
        }
    } catch (err) {
        console.error("Gagal mengirim notifikasi upload dokumen logbook:", err);
    }

    return result;
}

/**
 * Register student for internship seminar with schedule data.
 * Supports bulk registration for group members with the same supervisor.
 * @param {string} studentId 
 * @param {Object} scheduleData - { seminarDate, startTime, endTime, roomId, linkMeeting, moderatorStudentId, memberInternshipIds }
 * @returns {Promise<Array>}
 */
export async function registerSeminar(studentId, scheduleData) {
    const { seminarDate, startTime, endTime, roomId, moderatorStudentId, memberInternshipIds = [] } = scheduleData;

    // 1. Basic Validation
    if (!seminarDate || !startTime || !endTime || !roomId || !moderatorStudentId) {
        const error = new Error("Semua field wajib harus diisi (tanggal, waktu mulai, waktu selesai, ruangan, moderator).");
        error.statusCode = 400;
        throw error;
    }

    const start = new Date(`1970-01-01T${startTime}:00Z`);
    const end = new Date(`1970-01-01T${endTime}:00Z`);
    if (start >= end) {
        const error = new Error("Waktu mulai harus lebih awal dari waktu selesai.");
        error.statusCode = 400;
        throw error;
    }

    const date = new Date(seminarDate);
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
        const error = new Error("Seminar hanya dapat dijadwalkan pada hari kerja (Senin-Jumat).");
        error.statusCode = 400;
        throw error;
    }

    // 2. Get Requester's Internship & Group Info
    const requesterInternship = await activityRepository.getStudentInternship(studentId);
    if (!requesterInternship) {
        const error = new Error("Kegiatan Kerja Praktik aktif tidak ditemukan.");
        error.statusCode = 404;
        throw error;
    }

    // 3. Check for existing active seminars for the requester
    const existingActive = requesterInternship.seminars.find(s => ['REQUESTED', 'APPROVED'].includes(s.status));
    if (existingActive) {
        const error = new Error("Anda sudah memiliki pengajuan seminar yang aktif.");
        error.statusCode = 400;
        throw error;
    }

    // 4. Conflict Check (Room & Moderator)
    const conflict = await activityRepository.checkSeminarConflict({
        roomId,
        moderatorStudentId,
        seminarDate,
        startTime,
        endTime
    });

    if (conflict) {
        if (conflict.roomId === roomId) {
            const error = new Error(`Ruangan ${conflict.room.name} sudah dipesan oleh ${conflict.internship.student.user.fullName} pada waktu tersebut.`);
            error.statusCode = 409;
            throw error;
        }
        if (conflict.moderatorStudentId === moderatorStudentId) {
            const error = new Error(`Mahasiswa ${conflict.moderatorStudent.user.fullName} sudah terjadwal menjadi moderator di ruangan lain pada waktu tersebut.`);
            error.statusCode = 409;
            throw error;
        }
    }

    // 5. Bulk Members Validation (Same Supervisor Rule)
    const targetInternshipIds = [requesterInternship.id];
    
    if (memberInternshipIds.length > 0) {
        // Fetch group info
        const internshipWithGroup = await activityRepository.getInternshipWithGroup(requesterInternship.id);
        const allGroupMembers = internshipWithGroup.proposal.internships;
        
        for (const memberId of memberInternshipIds) {
            const member = allGroupMembers.find(m => m.id === memberId);
            if (!member) continue;
            
            // Validate same supervisor
            if (member.supervisorId !== requesterInternship.supervisorId) {
                const error = new Error(`Mahasiswa ${member.student.user.fullName} tidak dapat didaftarkan karena memiliki dosen pembimbing yang berbeda.`);
                error.statusCode = 400;
                throw error;
            }
            
            // Check if member already has active seminar
            const hasSeminar = await prisma.internshipSeminar.findFirst({
                where: {
                    internshipId: member.id,
                    status: { in: ['REQUESTED', 'APPROVED'] }
                }
            });
            
            if (!hasSeminar) {
                targetInternshipIds.push(member.id);
            }
        }
    }

    const result = await activityRepository.createSeminarRequests(targetInternshipIds, scheduleData);

    // Notify Supervisor
    try {
        if (requesterInternship.supervisorId) {
            const studentInfo = await prisma.student.findUnique({
                where: { id: studentId },
                include: { user: true }
            });

            const studentName = studentInfo?.user?.fullName || "Mahasiswa";
            const title = "Pendaftaran Seminar KP Baru";
            const message = `${studentName} telah menjadwalkan seminar KP. Silakan lakukan review jadwal.`;

            await createNotificationsForUsers([requesterInternship.supervisorId], { title, message });
            await sendFcmToUsers([requesterInternship.supervisorId], {
                title,
                body: message,
                data: {
                    type: 'internship_seminar_scheduled',
                    role: 'supervisor',
                    internshipId: requesterInternship.id
                },
                dataOnly: true
            });
        }
    } catch (err) {
        console.error("Gagal mengirim notifikasi pendaftaran seminar:", err);
    }

    return result;
}

/**
 * Get upcoming seminars (public list).
 * @returns {Promise<Array>}
 */
export async function getUpcomingSeminars() {
    return activityRepository.getUpcomingSeminars();
}

/**
 * Update seminar proposal.
 * @param {string} seminarId
 * @param {string} studentId
 * @param {Object} scheduleData
 * @returns {Promise<Object>}
 */
export async function updateSeminarProposal(seminarId, studentId, scheduleData) {
    const { seminarDate, startTime, endTime, roomId, moderatorStudentId } = scheduleData;

    if (!seminarDate || !startTime || !endTime || !roomId || !moderatorStudentId) {
        const error = new Error("Semua field wajib harus diisi.");
        error.statusCode = 400;
        throw error;
    }

    const date = new Date(seminarDate);
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
        const error = new Error("Seminar hanya dapat dijadwalkan pada hari kerja (Senin-Jumat).");
        error.statusCode = 400;
        throw error;
    }

    if (startTime >= endTime) {
        const error = new Error("Waktu mulai harus lebih awal dari waktu selesai.");
        error.statusCode = 400;
        throw error;
    }

    // Conflict Check (Room & Moderator)
    const conflict = await activityRepository.checkSeminarConflict({
        roomId,
        moderatorStudentId,
        seminarDate,
        startTime,
        endTime,
        excludeSeminarId: seminarId
    });

    if (conflict) {
        if (conflict.roomId === roomId) {
            const error = new Error(`Ruangan ${conflict.room.name} sudah dipesan oleh ${conflict.internship.student.user.fullName} pada waktu tersebut.`);
            error.statusCode = 409;
            throw error;
        }
        if (conflict.moderatorStudentId === moderatorStudentId) {
            const error = new Error(`Mahasiswa ${conflict.moderatorStudent.user.fullName} sudah terjadwal menjadi moderator di ruangan lain pada waktu tersebut.`);
            error.statusCode = 409;
            throw error;
        }
    }

    return activityRepository.updateSeminarProposal(seminarId, studentId, scheduleData);
}

/**
 * Approve a seminar request (by supervisor/lecturer).
 * @param {string} seminarId
 * @param {string} userId - Lecturer's user ID
 * @returns {Promise<Object>}
 */
export async function approveSeminar(seminarId, userId) {
    const seminar = await activityRepository.findSeminarById(seminarId);
    
    if (!seminar) {
        const error = new Error("Seminar tidak ditemukan.");
        error.statusCode = 404;
        throw error;
    }

    if (seminar.status !== 'REQUESTED') {
        const error = new Error("Hanya seminar dengan status 'Menunggu' yang dapat disetujui.");
        error.statusCode = 400;
        throw error;
    }

    // Verify that the lecturer is the supervisor of this internship
    if (seminar.internship.supervisor?.user?.id !== userId) {
        const error = new Error("Anda bukan dosen pembimbing mahasiswa ini.");
        error.statusCode = 403;
        throw error;
    }

    return activityRepository.approveSeminar(seminarId, userId);
}

/**
 * Bulk approve seminar requests.
 * @param {string[]} seminarIds 
 * @param {string} userId - Lecturer's user ID
 * @returns {Promise<Object>}
 */
export async function bulkApproveSeminars(seminarIds, userId) {
    if (!Array.isArray(seminarIds) || seminarIds.length === 0) {
        throw new Error("Daftar ID seminar tidak valid.");
    }

    // Verify each seminar
    for (const id of seminarIds) {
        const seminar = await activityRepository.findSeminarById(id);
        
        if (!seminar) {
            const error = new Error(`Seminar (ID: ${id}) tidak ditemukan.`);
            error.statusCode = 404;
            throw error;
        }

        if (seminar.status !== 'REQUESTED') {
            const error = new Error(`Seminar ${seminar.internship.student.user.fullName} bukan dalam status 'Menunggu'.`);
            error.statusCode = 400;
            throw error;
        }

        if (seminar.internship.supervisor?.user?.id !== userId) {
            const error = new Error(`Anda bukan dosen pembimbing untuk ${seminar.internship.student.user.fullName}.`);
            error.statusCode = 403;
            throw error;
        }
    }

    return activityRepository.bulkApproveSeminars(seminarIds, userId);
}

/**
 * Reject a seminar request (by supervisor/lecturer).
 * @param {string} seminarId
 * @param {string} userId - Lecturer's user ID
 * @param {string} notes - Rejection reason
 * @returns {Promise<Object>}
 */
export async function rejectSeminar(seminarId, userId, notes) {
    const seminar = await activityRepository.findSeminarById(seminarId);
    
    if (!seminar) {
        const error = new Error("Seminar tidak ditemukan.");
        error.statusCode = 404;
        throw error;
    }

    if (seminar.status !== 'REQUESTED') {
        const error = new Error("Hanya seminar dengan status 'Menunggu' yang dapat ditolak.");
        error.statusCode = 400;
        throw error;
    }

    if (seminar.internship.supervisor?.user?.id !== userId) {
        const error = new Error("Anda bukan dosen pembimbing mahasiswa ini.");
        error.statusCode = 403;
        throw error;
    }

    return activityRepository.rejectSeminar(seminarId, notes);
}

/**
 * Get seminar detail with audience info.
 * @param {string} seminarId 
 * @param {string} studentId 
 */
export async function getSeminarDetail(seminarId, studentId) {
    const seminar = await activityRepository.getSeminarDetail(seminarId);
    if (!seminar) {
        const error = new Error("Seminar tidak ditemukan.");
        error.statusCode = 404;
        throw error;
    }

    const isOwnSeminar = seminar.internship.studentId === studentId;
    const isModerator = seminar.moderatorStudentId === studentId;
    const isRegistered = seminar.audiences.some(a => a.studentId === studentId);
    const myRegistration = seminar.audiences.find(a => a.studentId === studentId);

    const response = {
        ...seminar,
        isOwnSeminar,
        isModerator,
        isRegistered,
        myRegistrationStatus: myRegistration?.status || null
    };

    // Strip supervisorNotes if not authorized (Presenter or Moderator)
    if (!isOwnSeminar && !isModerator) {
        delete response.supervisorNotes;
    }

    return response;
}

/**
 * Register student as audience for a seminar.
 * @param {string} seminarId 
 * @param {string} studentId 
 */
export async function registerAsAudience(seminarId, studentId) {
    const seminar = await activityRepository.findSeminarById(seminarId);
    if (!seminar) {
        const error = new Error("Seminar tidak ditemukan.");
        error.statusCode = 404;
        throw error;
    }

    if (!['APPROVED', 'COMPLETED'].includes(seminar.status)) {
        const error = new Error("Anda hanya dapat mendaftar pada seminar yang sudah disetujui atau selesai.");
        error.statusCode = 400;
        throw error;
    }

    if (seminar.internship.studentId === studentId) {
        const error = new Error("Anda tidak dapat mendaftar pada seminar Anda sendiri.");
        error.statusCode = 400;
        throw error;
    }

    // Time validation: Only allow registration after the seminar has started AND on the same day
    if (seminar.status === 'APPROVED') {
        const now = new Date();
        const start = new Date(seminar.seminarDate);
        const time = new Date(seminar.startTime);
        
        const isSameDay = 
            now.getFullYear() === start.getFullYear() && 
            now.getMonth() === start.getMonth() && 
            now.getDate() === start.getDate();

        // Combine date and time using UTC digits from database to match the literal intent
        start.setHours(time.getUTCHours(), time.getUTCMinutes(), 0, 0);

        if (!isSameDay || now < start) {
            const error = new Error("Absen hanya dapat dibuat pada hari pelaksanaan seminar mulai dari waktu mulai.");
            error.statusCode = 400;
            throw error;
        }
    }

    // Check existing registration
    const existing = await prisma.internshipSeminarAudience.findUnique({
        where: {
            seminarId_studentId: { seminarId, studentId }
        }
    });

    if (existing) {
        const error = new Error("Anda sudah terdaftar pada seminar ini.");
        error.statusCode = 400;
        throw error;
    }

    return activityRepository.registerSeminarAudience(seminarId, studentId);
}

/**
 * Unregister student from a seminar audience list.
 * @param {string} seminarId 
 * @param {string} studentId 
 */
export async function unregisterFromAudience(seminarId, studentId) {
    const existing = await prisma.internshipSeminarAudience.findUnique({
        where: {
            seminarId_studentId: { seminarId, studentId }
        }
    });

    if (!existing) {
        const error = new Error("Pendaftaran tidak ditemukan.");
        error.statusCode = 404;
        throw error;
    }

    if (existing.status === 'VALIDATED') {
        const error = new Error("Pendaftaran yang sudah divalidasi tidak dapat dibatalkan.");
        error.statusCode = 400;
        throw error;
    }

    return activityRepository.unregisterSeminarAudience(seminarId, studentId);
}

/**
 * Validate audience attendance (Lecturer).
 * @param {string} seminarId 
 * @param {string} targetStudentId 
 * @param {string} lecturerUserId 
 */
export async function validateAudience(seminarId, targetStudentId, lecturerUserId) {
    const seminar = await activityRepository.findSeminarById(seminarId);
    if (!seminar) {
        const error = new Error("Seminar tidak ditemukan.");
        error.statusCode = 404;
        throw error;
    }

    if (seminar.internship.supervisor?.user?.id !== lecturerUserId) {
        const error = new Error("Anda bukan dosen pembimbing untuk seminar ini.");
        error.statusCode = 403;
        throw error;
    }

    return activityRepository.validateSeminarAudience(seminarId, targetStudentId);
}

/**
 * Bulk validate audience attendance (Lecturer).
 * @param {string} seminarId
 * @param {string[]} targetStudentIds
 * @param {string} lecturerUserId
 */
export async function bulkValidateAudience(seminarId, targetStudentIds, lecturerUserId) {
    const seminar = await activityRepository.findSeminarById(seminarId);
    if (!seminar) {
        const error = new Error("Seminar tidak ditemukan.");
        error.statusCode = 404;
        throw error;
    }

    if (seminar.internship.supervisor?.user?.id !== lecturerUserId) {
        const error = new Error("Anda bukan dosen pembimbing untuk seminar ini.");
        error.statusCode = 403;
        throw error;
    }

    return activityRepository.bulkValidateSeminarAudience(seminarId, targetStudentIds);
}

/**
 * Unvalidate audience attendance (Lecturer).
 * @param {string} seminarId 
 * @param {string} targetStudentId 
 * @param {string} lecturerUserId 
 */
export async function unvalidateAudience(seminarId, targetStudentId, lecturerUserId) {
    const seminar = await activityRepository.findSeminarById(seminarId);
    if (!seminar) {
        const error = new Error("Seminar tidak ditemukan.");
        error.statusCode = 404;
        throw error;
    }

    if (seminar.internship.supervisor?.user?.id !== lecturerUserId) {
        const error = new Error("Anda bukan dosen pembimbing untuk seminar ini.");
        error.statusCode = 403;
        throw error;
    }

    return activityRepository.unvalidateSeminarAudience(seminarId, targetStudentId);
}

/**
 * Update seminar notes (berita acara) by lecturer.
 * @param {string} seminarId 
 * @param {string} notes 
 * @param {string} lecturerUserId 
 */
export async function updateSeminarNotes(seminarId, notes, lecturerUserId) {
    const seminar = await activityRepository.findSeminarById(seminarId);
    if (!seminar) {
        const error = new Error("Seminar tidak ditemukan.");
        error.statusCode = 404;
        throw error;
    }

    if (seminar.internship.supervisor?.user?.id !== lecturerUserId) {
        const error = new Error("Anda bukan dosen pembimbing untuk seminar ini.");
        error.statusCode = 403;
        throw error;
    }

    if (seminar.status === 'COMPLETED') {
        const error = new Error("Catatan tidak dapat diubah setelah seminar selesai.");
        error.statusCode = 400;
        throw error;
    }

    return activityRepository.updateSeminarNotes(seminarId, notes);
}

/**
 * Complete a seminar (Lecturer).
 * @param {string} seminarId 
 * @param {string} lecturerUserId 
 */
export async function completeSeminar(seminarId, lecturerUserId) {
    const seminar = await activityRepository.findSeminarById(seminarId);
    if (!seminar) {
        const error = new Error("Seminar tidak ditemukan.");
        error.statusCode = 404;
        throw error;
    }

    if (seminar.internship.supervisor?.user?.id !== lecturerUserId) {
        const error = new Error("Anda bukan dosen pembimbing untuk seminar ini.");
        error.statusCode = 403;
        throw error;
    }

    if (seminar.status !== 'APPROVED') {
        const error = new Error("Hanya seminar yang berstatus APPROVED yang dapat diselesaikan.");
        error.statusCode = 400;
        throw error;
    }

    const result = await activityRepository.completeSeminar(seminarId);

    // Holistic Completion Check
    await syncInternshipCompletionStatus(seminar.internshipId);

    return result;
}



