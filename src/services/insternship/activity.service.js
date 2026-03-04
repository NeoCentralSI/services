import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import fs from "fs/promises";
import path from "path";
import prisma from "../../config/prisma.js";
import { convertDocxToPdf } from "../../utils/pdf.util.js";
import * as activityRepository from "../../repositories/insternship/activity.repository.js";

/**
 * Get logbooks for current student.
 * @param {string} studentId 
 * @returns {Promise<Object>}
 */
export async function getStudentLogbooks(studentId) {
    const internship = await activityRepository.getStudentInternship(studentId);
    if (!internship) return { internship: null, logbooks: [] };

    // Extend internship to include student name and identity number
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
            }
        }
    });

    const logbooks = await activityRepository.getLogbooks(internship.id);
    return { internship: internshipWithStudent, logbooks };
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
 * Generate Logbook PDF based on DOCX template.
 * @param {string} studentId 
 * @returns {Promise<Buffer>}
 */
export async function generateLogbookPdf(studentId) {
    const { internship, logbooks } = await getStudentLogbooks(studentId);

    if (!internship) {
        throw new Error("Data Kerja Praktik tidak ditemukan.");
    }

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

    doc.render(templateData);

    const docxBuffer = doc.getZip().generate({
        type: "nodebuffer",
        compression: "DEFLATE",
    });

    // Convert DOCX to PDF
    return convertDocxToPdf(docxBuffer, `Logbook_${templateData.studentName}.docx`);
}
