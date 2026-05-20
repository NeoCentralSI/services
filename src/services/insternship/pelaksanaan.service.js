
import * as pelaksanaanRepository from "../../repositories/insternship/pelaksanaan.repository.js";
import * as registrationRepository from "../../repositories/insternship/pendaftaran.repository.js";

import crypto from "crypto";
import { ENV } from "../../config/env.js";
import { sendMail } from "../../config/mailer.js";
import prisma from "../../config/prisma.js";
import { ROLES } from "../../constants/roles.js";
import { fieldAssessmentRequestTemplate } from "../../utils/emailTemplate.js";
import { createNotificationsForUsers } from "../notification.service.js";
import { sendFcmToUsers } from "../push.service.js";


/**
 * Lock student logbook.
 * @param {string} studentId 
 * @returns {Promise<Object>}
 */
export async function lockLogbook(studentId) {
    // Check if logbook is sufficiently filled? 
    // Usually handled by frontend warning, but we can check here too if needed.
    return pelaksanaanRepository.lockLogbook(studentId);
}

/**
 * Get logbooks for the current student's internship.
 * @param {string} studentId
 * @returns {Promise<Array>}
 */
export async function getStudentLogbooks(studentId) {
    return pelaksanaanRepository.getStudentLogbooks(studentId);
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

    return pelaksanaanRepository.updateLogbook(logbookId, studentId, activityDescription);
}

/**
 * Update internship details.
 * @param {string} studentId 
 * @param {Object} data 
 * @returns {Promise<Object>}
 */
export async function updateInternshipDetails(studentId, data) {
    return pelaksanaanRepository.updateInternshipDetails(studentId, data);
}

/**
 * Submit or update the internship report for lecturer verification.
 * Reusing an existing documentId supports title-only edits.
 * @param {string} studentId
 * @param {string} title
 * @param {string} documentId
 */
export async function submitInternshipReport(studentId, title, documentId) {
    const internship = await pelaksanaanRepository.getStudentInternship(studentId);
    if (!internship) {
        const error = new Error("Kegiatan Kerja Praktik aktif tidak ditemukan.");
        error.statusCode = 404;
        throw error;
    }

    if (internship.reportStatus === "APPROVED") {
        const error = new Error("Laporan akhir sudah disetujui dan tidak dapat diubah.");
        error.statusCode = 400;
        throw error;
    }

    const result = await pelaksanaanRepository.createReport({
        internshipId: internship.id,
        title,
        documentId
    });

    try {
        if (internship.supervisorId) {
            const studentName = internship.student?.user?.fullName || "Mahasiswa";
            const titleNotif = "Laporan Akhir KP Baru";
            const message = `${studentName} telah mengirim laporan akhir untuk diverifikasi.`;

            await createNotificationsForUsers([internship.supervisorId], { title: titleNotif, message });
            await sendFcmToUsers([internship.supervisorId], {
                title: titleNotif,
                body: message,
                data: {
                    type: "internship_final_report_submitted",
                    internshipId: internship.id
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
 * Update completion certificate for an internship.
 * @param {string} studentId 
 * @param {string} documentId 
 */
export async function updateCompletionCertificate(studentId, documentId) {
    const result = await pelaksanaanRepository.updateCompletionCertificate(studentId, documentId);

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
 * Update company receipt for an internship.
 * @param {string} studentId 
 * @param {string} documentId 
 */
export async function updateCompanyReceipt(studentId, documentId) {
    const result = await pelaksanaanRepository.updateCompanyReceipt(studentId, documentId);

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
 * Submit internship company report document (laporan akhir instansi).
 * Triggers the magic link generation for field supervisor assessment.
 * @param {string} studentId 
 * @param {string} documentId 
 */
export async function submitCompanyReport(studentId, documentId) {
    const internship = await pelaksanaanRepository.getStudentInternship(studentId);
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

    const result = await pelaksanaanRepository.updateCompanyReport(studentId, documentId);

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

