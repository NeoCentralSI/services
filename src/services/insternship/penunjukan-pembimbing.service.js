import * as pendaftaranRepository from "../../repositories/insternship/pendaftaran.repository.js";
import * as penunjukanPembimbingRepository from "../../repositories/insternship/penunjukan-pembimbing.repository.js";
import * as pelaksanaanRepository from "../../repositories/insternship/pelaksanaan.repository.js";
import * as bimbinganRepository from "../../repositories/insternship/bimbingan.repository.js";
import * as seminarRepository from "../../repositories/insternship/seminar.repository.js";
import * as penilaianRepository from "../../repositories/insternship/penilaian.repository.js";
import * as monitoringRepository from "../../repositories/insternship/monitoring.repository.js";

import * as notificationService from "../notification.service.js";
import * as documentService from "../document.service.js";
import { sendFcmToUsers } from "../push.service.js";
import { ROLES } from "../../constants/roles.js";
import { convertHtmlToPdf } from "../../utils/pdf.util.js";
import axios from "axios";
import path from "path";
import fs from "fs";
import mammoth from "mammoth";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import crypto from "crypto";
import prisma from "../../config/prisma.js";

/**
 * List lecturers with their active internship workload for Sekdep.
 * @param {Object} params - { q, skip, take }
 * @returns {Promise<Object>} - { data, total }
 */
export async function getLecturersWorkloadList({ q, skip, take, sortBy, sortOrder, academicYearId }) {
    const [lecturers, total] = await Promise.all([
        penunjukanPembimbingRepository.findLecturersWithWorkload({ q, skip, take, sortBy, sortOrder, academicYearId }),
        penunjukanPembimbingRepository.countLecturersWithWorkload({ q, academicYearId })
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
    const result = await penunjukanPembimbingRepository.bulkUpdateInternshipSupervisor(internshipIds, supervisorId);

    // 2. Send Notifications to Supervisor (Lecturer) and Students
    try {
        // Get data for messages
        const internships = await penunjukanPembimbingRepository.findInternshipsWithStudents(internshipIds);
        const supervisor = await penunjukanPembimbingRepository.findLecturerForLetter(supervisorId);
        const supervisorName = supervisor?.user?.fullName || "Dosen Pembimbing";

        const lecturerTitle = "Penugasan Pembimbing KP Baru";
        const studentTitle = "Pembimbing KP Telah Ditetapkan";

        const studentNames = internships.map(i => i.student?.user?.fullName || "Mahasiswa").join(", ");
        const lecturerMessage = `Anda telah ditugaskan menjadi pembimbing Kerja Praktik untuk: ${studentNames}.`;

        // Create in-app notification & FCM for Supervisor
        await notificationService.createNotificationsForUsers([supervisorId], { title: lecturerTitle, message: lecturerMessage });
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
            await notificationService.createNotificationsForUsers([notif.userId], { title: notif.title, message: notif.message });
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
    const lecturers = await penunjukanPembimbingRepository.findAllLecturerWorkload();

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
    const lecturer = await penunjukanPembimbingRepository.findLecturerForLetter(supervisorId);

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
    const lecturer = await penunjukanPembimbingRepository.findLecturerForLetter(supervisorId);
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
    const existingLetter = await penunjukanPembimbingRepository.findSupervisorLetterByNumber(documentNumber);
    if (existingLetter && existingLetter.supervisorId !== supervisorId) {
        const error = new Error(`Nomor surat "${documentNumber}" sudah digunakan untuk dosen lain: ${existingLetter.supervisor?.user?.fullName}.`);
        error.statusCode = 409;
        throw error;
    }

    // 4. Generate document (PDF)
    const documentId = await documentService.generateSupervisorLetter(genData);

    // 5. Upsert the letter object
    const supLetter = await penunjukanPembimbingRepository.upsertSupervisorLetter({
        documentNumber,
        dateIssued: new Date(),
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        supervisorId,
        documentId
    });

    // 6. Link selected internships to the letter
    const result = await penunjukanPembimbingRepository.linkInternshipsToLetter(internshipIds, supLetter.id);

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

            await notificationService.createNotificationsForUsers(kadepUserIds, { title, message });
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
