import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import fs from "fs/promises";
import path from "path";
import prisma from "../../config/prisma.js";
import { convertDocxToPdf } from "../../utils/pdf.util.js";
import * as activityRepository from "../../repositories/insternship/activity.repository.js";
import * as registrationRepository from "../../repositories/insternship/registration.repository.js";
import { ROLES } from "../../constants/roles.js";
import { createNotificationsForUsers } from "../notification.service.js";
import { sendFcmToUsers } from "../push.service.js";

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
                    targetCompany: true
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
            reportFeedbackDocument: true
        }
    });

    const logbooks = await activityRepository.getLogbooks(internship.id);
    return { 
        internship: {
            ...internshipWithStudent,
            actualStartDate: internshipWithStudent.actualStartDate,
            actualEndDate: internshipWithStudent.actualEndDate,
        }, 
        logbooks 
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
 * Register student for internship seminar.
 * @param {string} studentId 
 * @returns {Promise<Object>}
 */
export async function registerSeminar(studentId) {
    return activityRepository.createSeminarRequest(studentId);
}
