
import * as pelaksanaanRepository from "../../repositories/insternship/pelaksanaan.repository.js";
import * as seminarRepository from "../../repositories/insternship/seminar.repository.js";

import prisma from "../../config/prisma.js";
import { createNotificationsForUsers } from "../notification.service.js";
import { sendFcmToUsers } from "../push.service.js";
import { syncInternshipCompletionStatus } from "./internshipStatus.service.js";

const WIB_OFFSET_HOURS = 7;

function buildSeminarAttendanceWindow(seminarDate, startTime) {
    const date = new Date(seminarDate);
    const time = new Date(startTime);

    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const day = date.getUTCDate();

    const dayStart = new Date(Date.UTC(year, month, day, -WIB_OFFSET_HOURS, 0, 0, 0));
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const seminarStart = new Date(Date.UTC(
        year,
        month,
        day,
        time.getUTCHours() - WIB_OFFSET_HOURS,
        time.getUTCMinutes(),
        time.getUTCSeconds(),
        0
    ));

    return { dayStart, dayEnd, seminarStart };
}

/**
 * Get upcoming seminars (public list).
 * @returns {Promise<Array>}
 */
export async function getUpcomingSeminars() {
    return seminarRepository.getUpcomingSeminars();
}

/**
 * Get seminar detail with audience info.
 * @param {string} seminarId 
 * @param {string} studentId 
 */
export async function getSeminarDetail(seminarId, studentId) {
    const seminar = await seminarRepository.getSeminarDetail(seminarId);
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
 * Register student for internship seminar with schedule data.
 * Supports bulk registration for group members with the same supervisor.
 * @param {string} studentId 
 * @param {Object} scheduleData - { seminarDate, startTime, endTime, roomId, linkMeeting, moderatorStudentId, memberInternshipIds }
 * @returns {Promise<Array>}
 */
export async function registerSeminar(studentId, scheduleData) {
    const seminarDate = scheduleData.seminarDate;
    const startTime = scheduleData.startTime || scheduleData.seminarTimeStart;
    const endTime = scheduleData.endTime || scheduleData.seminarTimeEnd;
    const roomId = scheduleData.roomId || (scheduleData.room ? (await seminarRepository.findOrCreateRoomByName(scheduleData.room))?.id : null);
    const moderatorStudentId = scheduleData.moderatorStudentId || studentId;
    const memberInternshipIds = scheduleData.memberInternshipIds || [];
    const normalizedScheduleData = {
        ...scheduleData,
        seminarDate,
        startTime,
        endTime,
        roomId,
        moderatorStudentId,
        memberInternshipIds
    };

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
    const requesterInternship = await pelaksanaanRepository.getStudentInternship(studentId);
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
    const conflict = await seminarRepository.checkSeminarConflict({
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
        const internshipWithGroup = await seminarRepository.getInternshipWithGroup(requesterInternship.id);
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

    const result = await seminarRepository.createSeminarRequests(targetInternshipIds, normalizedScheduleData);

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
 * Update seminar proposal.
 * @param {string} seminarId
 * @param {string} studentId
 * @param {Object} scheduleData
 * @returns {Promise<Object>}
 */
export async function updateSeminarProposal(seminarId, studentId, scheduleData) {
    const seminarDate = scheduleData.seminarDate;
    const startTime = scheduleData.startTime || scheduleData.seminarTimeStart;
    const endTime = scheduleData.endTime || scheduleData.seminarTimeEnd;
    const roomId = scheduleData.roomId || (scheduleData.room ? (await seminarRepository.findOrCreateRoomByName(scheduleData.room))?.id : null);
    const moderatorStudentId = scheduleData.moderatorStudentId || studentId;
    const normalizedScheduleData = {
        ...scheduleData,
        seminarDate,
        startTime,
        endTime,
        roomId,
        moderatorStudentId
    };

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
    const conflict = await seminarRepository.checkSeminarConflict({
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

    return seminarRepository.updateSeminarProposal(seminarId, studentId, normalizedScheduleData);
}

/**
 * Approve a seminar request (by supervisor/lecturer).
 * @param {string} seminarId
 * @param {string} userId - Lecturer's user ID
 * @returns {Promise<Object>}
 */
export async function approveSeminar(seminarId, userId) {
    const seminar = await seminarRepository.findSeminarById(seminarId);
    
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

    const result = await seminarRepository.approveSeminar(seminarId, userId);

    // Notify student
    try {
        const title = "Seminar KP Disetujui";
        const message = `Jadwal seminar KP Anda pada tanggal ${new Date(seminar.seminarDate).toLocaleDateString('id-ID')} telah disetujui.`;
        
        await createNotificationsForUsers([seminar.internship.studentId], { title, message });
        await sendFcmToUsers([seminar.internship.studentId], {
            title,
            body: message,
            data: {
                type: 'internship_seminar_response',
                status: 'APPROVED',
                internshipId: seminar.internshipId,
                seminarId
            },
            dataOnly: true
        });
    } catch (err) {
        console.error("Gagal mengirim notifikasi persetujuan seminar:", err);
    }

    return result;
}

/**
 * Reject a seminar request (by supervisor/lecturer).
 * @param {string} seminarId
 * @param {string} userId - Lecturer's user ID
 * @param {string} notes - Rejection reason
 * @returns {Promise<Object>}
 */
export async function rejectSeminar(seminarId, userId, notes) {
    const seminar = await seminarRepository.findSeminarById(seminarId);
    
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

    const result = await seminarRepository.rejectSeminar(seminarId, notes);

    // Notify student
    try {
        const title = "Seminar KP Perlu Revisi Jadwal";
        const message = `Pengajuan seminar KP Anda ditolak/perlu revisi. Catatan: ${notes || '-'}`;
        
        await createNotificationsForUsers([seminar.internship.studentId], { title, message });
        await sendFcmToUsers([seminar.internship.studentId], {
            title,
            body: message,
            data: {
                type: 'internship_seminar_response',
                status: 'REJECTED',
                internshipId: seminar.internshipId,
                seminarId
            },
            dataOnly: true
        });
    } catch (err) {
        console.error("Gagal mengirim notifikasi penolakan seminar:", err);
    }

    return result;
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
        const seminar = await seminarRepository.findSeminarById(id);
        
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

    return seminarRepository.bulkApproveSeminars(seminarIds, userId);
}

/**
 * Update seminar notes (berita acara) by lecturer.
 * @param {string} seminarId 
 * @param {string} notes 
 * @param {string} lecturerUserId 
 */
export async function updateSeminarNotes(seminarId, notes, lecturerUserId) {
    const seminar = await seminarRepository.findSeminarById(seminarId);
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

    return seminarRepository.updateSeminarNotes(seminarId, notes);
}

/**
 * Complete a seminar (Lecturer).
 * @param {string} seminarId 
 * @param {string} lecturerUserId 
 */
export async function completeSeminar(seminarId, lecturerUserId) {
    const seminar = await seminarRepository.findSeminarById(seminarId);
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

    const result = await seminarRepository.completeSeminar(seminarId);

    // Notify student
    try {
        const title = "Seminar KP Selesai";
        const message = `Seminar KP Anda telah selesai dilaksanakan dan telah divalidasi oleh dosen pembimbing.`;
        
        await createNotificationsForUsers([seminar.internship.studentId], { title, message });
        await sendFcmToUsers([seminar.internship.studentId], {
            title,
            body: message,
            data: {
                type: 'internship_seminar_completed',
                internshipId: seminar.internshipId,
                seminarId
            },
            dataOnly: true
        });
    } catch (err) {
        console.error("Gagal mengirim notifikasi penyelesaian seminar:", err);
    }

    // Holistic Completion Check
    await syncInternshipCompletionStatus(seminar.internshipId);

    return result;
}

/**
 * Fail a seminar (Lecturer).
 * This only marks the seminar as FAILED; internship status remains governed by
 * the existing completion/deadline rules.
 * @param {string} seminarId
 * @param {string} lecturerUserId
 * @param {string|null} notes
 */
export async function failSeminar(seminarId, lecturerUserId, notes = null) {
    const seminar = await seminarRepository.findSeminarById(seminarId);
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
        const error = new Error("Hanya seminar yang berstatus APPROVED yang dapat dinyatakan gagal.");
        error.statusCode = 400;
        throw error;
    }

    const result = await seminarRepository.failSeminar(seminarId, notes);

    try {
        const title = "Seminar KP Dinyatakan Gagal";
        const message = `Seminar KP Anda dinyatakan gagal oleh dosen pembimbing.${notes ? ` Catatan: ${notes}` : ''}`;

        await createNotificationsForUsers([seminar.internship.studentId], { title, message });
        await sendFcmToUsers([seminar.internship.studentId], {
            title,
            body: message,
            data: {
                type: 'internship_seminar_failed',
                internshipId: seminar.internshipId,
                seminarId
            },
            dataOnly: true
        });
    } catch (err) {
        console.error("Gagal mengirim notifikasi seminar gagal:", err);
    }

    return result;
}

/**
 * Register student as audience for a seminar.
 * @param {string} seminarId 
 * @param {string} studentId 
 */
export async function registerAsAudience(seminarId, studentId) {
    const seminar = await seminarRepository.findSeminarById(seminarId);
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
        const { dayStart, dayEnd, seminarStart } = buildSeminarAttendanceWindow(seminar.seminarDate, seminar.startTime);
        const isSameWibDay = now >= dayStart && now < dayEnd;

        if (!isSameWibDay || now < seminarStart) {
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

    return seminarRepository.registerSeminarAudience(seminarId, studentId);
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

    return seminarRepository.unregisterSeminarAudience(seminarId, studentId);
}

/**
 * Validate audience attendance (Lecturer).
 * @param {string} seminarId 
 * @param {string} targetStudentId 
 * @param {string} lecturerUserId 
 */
export async function validateAudience(seminarId, targetStudentId, lecturerUserId) {
    const seminar = await seminarRepository.findSeminarById(seminarId);
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

    const result = await seminarRepository.validateSeminarAudience(seminarId, targetStudentId);

    // Notify student
    try {
        const title = "Kehadiran Seminar Divalidasi";
        const message = `Presensi Anda sebagai audiens di seminar ${seminar.internship.student.user.fullName} telah divalidasi oleh dosen.`;
        
        await createNotificationsForUsers([targetStudentId], { title, message });
        await sendFcmToUsers([targetStudentId], {
            title,
            body: message,
            data: {
                type: 'internship_seminar_audience_validated',
                seminarId,
                studentId: targetStudentId
            },
            dataOnly: true
        });
    } catch (err) {
        console.error("Gagal mengirim notifikasi validasi audiens:", err);
    }

    return result;
}

/**
 * Bulk validate audience attendance (Lecturer).
 * @param {string} seminarId
 * @param {string[]} targetStudentIds
 * @param {string} lecturerUserId
 */
export async function bulkValidateAudience(seminarId, targetStudentIds, lecturerUserId) {
    const seminar = await seminarRepository.findSeminarById(seminarId);
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

    const result = await seminarRepository.bulkValidateSeminarAudience(seminarId, targetStudentIds);

    // Notify each student
    try {
        const title = "Kehadiran Seminar Divalidasi";
        const message = `Presensi Anda sebagai audiens di seminar ${seminar.internship.student.user.fullName} telah divalidasi oleh dosen.`;
        
        await createNotificationsForUsers(targetStudentIds, { title, message });
        await sendFcmToUsers(targetStudentIds, {
            title,
            body: message,
            data: {
                type: 'internship_seminar_audience_validated',
                seminarId
            },
            dataOnly: true
        });
    } catch (err) {
        console.error("Gagal mengirim notifikasi bulk validasi audiens:", err);
    }

    return result;
}

/**
 * Unvalidate audience attendance (Lecturer).
 * @param {string} seminarId 
 * @param {string} targetStudentId 
 * @param {string} lecturerUserId 
 */
export async function unvalidateAudience(seminarId, targetStudentId, lecturerUserId) {
    const seminar = await seminarRepository.findSeminarById(seminarId);
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

    return seminarRepository.unvalidateSeminarAudience(seminarId, targetStudentId);
}

