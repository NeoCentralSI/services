import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import fs from "fs/promises";
import path from "path";
import prisma from "../../config/prisma.js";
import { ENV } from "../../config/env.js";
import { convertDocxToPdf } from "../../utils/pdf.util.js";
import { getWorkingDays } from "../../utils/internship-date.util.js";
import * as activityRepository from "../../repositories/insternship/activity.repository.js";
import * as registrationRepository from "../../repositories/insternship/registration.repository.js";
import { ROLES } from "../../constants/roles.js";
import { createNotificationsForUsers } from "../notification.service.js";
import { sendFcmToUsers } from "../push.service.js";
import { sendFieldAssessmentRequest } from "./sekdep.service.js";
import { checkAndUpdateInternshipStatus } from "./internship-automation.service.js";

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
                        where: { status: 'ONGOING' },
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
    
    // Calculate progress
    const daysTotal = (internshipWithStudent.actualStartDate && internshipWithStudent.actualEndDate)
        ? getWorkingDays(internshipWithStudent.actualStartDate, internshipWithStudent.actualEndDate).length
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
 * Update logbook entry.
 * @param {string} logbookId 
 * @param {string} studentId 
 * @param {string} activityDescription 
 * @returns {Promise<Object>}
 */
export async function updateLogbook(logbookId, studentId, activityDescription) {
    return activityRepository.updateLogbook(logbookId, studentId, activityDescription);
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
 * Internal helper to prepare logbook data for templates.
 */
async function prepareLogbookData(studentId) {
    const { internship, logbooks } = await getStudentLogbooks(studentId);

    if (!internship) {
        throw new Error("Data Kerja Praktik tidak ditemukan.");
    }

    const formatDate = (date) => {
        if (!date) return "-";
        return new Date(date).toLocaleDateString("id-ID", {
            day: "numeric",
            month: "long",
            year: "numeric"
        });
    };

    const templateData = {
        instansi: internship.proposal?.targetCompany?.companyName || "-",
        nama: internship.student?.user?.fullName || "-",
        nim: internship.student?.user?.identityNumber || "-",
        pembimbing: internship.fieldSupervisorName || "( ........................................ )",
        tanggal_cetak: formatDate(new Date()),
        a: logbooks.map((log, index) => ({
            no: index + 1,
            tanggal: formatDate(log.activityDate),
            kegiatan: log.activityDescription || "-"
        }))
    };

    return { internship, templateData };
}

/**
 * Internal helper to generate DOCX buffer from template.
 */
async function generateLogbookDocxBuffer(templateData) {
    // Find template for logbook
    const templateDoc = await prisma.document.findFirst({
        where: {
            documentType: {
                name: "Template Kerja Praktik"
            }
        },
        orderBy: {
            createdAt: 'desc'
        }
    });

    if (!templateDoc) {
        throw new Error("Template Logbook (DOCX) belum diunggah oleh Sekdep.");
    }

    const templatePath = path.join(process.cwd(), templateDoc.filePath);
    const content = await fs.readFile(templatePath);
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        delimiters: {
            start: "{",
            end: "}"
        }
    });

    doc.render(templateData);

    return doc.getZip().generate({
        type: "nodebuffer",
        compression: "DEFLATE",
    });
}

/**
 * Generate Logbook PDF based on DOCX template.
 * @param {string} studentId 
 * @returns {Promise<Buffer>}
 */
export async function generateLogbookPdf(studentId) {
    const { templateData } = await prepareLogbookData(studentId);
    const docxBuffer = await generateLogbookDocxBuffer(templateData);

    // Convert DOCX to PDF
    return convertDocxToPdf(docxBuffer, `Logbook_${templateData.nama}.docx`);
}

/**
 * Generate Logbook DOCX.
 * @param {string} studentId 
 * @returns {Promise<{buffer: Buffer, filename: string}>}
 */
export async function generateLogbookDocx(studentId) {
    const { templateData } = await prepareLogbookData(studentId);
    const buffer = await generateLogbookDocxBuffer(templateData);

    return {
        buffer,
        filename: `Logbook_${templateData.nama}.docx`
    };
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
    const isRegistered = seminar.audiences.some(a => a.studentId === studentId);
    const myRegistration = seminar.audiences.find(a => a.studentId === studentId);

    // Group members logic (similar to calendarEvents in frontend)
    // We can fetch group members if needed, but for now we rely on what's in the repo
    
    return {
        ...seminar,
        isOwnSeminar,
        isRegistered,
        myRegistrationStatus: myRegistration?.status || null
    };
}

/**
 * Mark a seminar as completed.
 * Only the supervisor (lecturer) for this internship can do this or a moderator.
 * For now, we allow the supervisor to do it from the dashboard.
 * @param {string} seminarId 
 * @param {string} userId - Lecturer User ID
 */
export async function completeSeminar(seminarId, userId) {
    const seminar = await activityRepository.findSeminarById(seminarId);
    if (!seminar) {
        const error = new Error("Seminar tidak ditemukan.");
        error.statusCode = 404;
        throw error;
    }

    if (seminar.status !== 'APPROVED') {
        throw new Error("Hanya seminar yang sudah disetujui yang dapat diselesaikan.");
    }

    if (seminar.internship.supervisor?.user?.id !== userId) {
        throw new Error("Anda bukan dosen pembimbing mahasiswa ini.");
    }

    const updatedSeminar = await activityRepository.completeSeminar(seminarId);

    // Call automation check
    await checkAndUpdateInternshipStatus(seminar.internshipId);

    return updatedSeminar;
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
