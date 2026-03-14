import prisma from "../../config/prisma.js";
import * as guidanceRepo from "../../repositories/insternship/guidance.repository.js";
import * as notificationService from "../notification.service.js";
import { sendFcmToUsers } from "../push.service.js";

/**
 * Get active academic year helper.
 */
async function getActiveYear() {
    const activeYear = await prisma.academicYear.findFirst({
        where: { isActive: true }
    });
    if (!activeYear) {
        const error = new Error("Tidak ada tahun ajaran aktif di sistem.");
        error.statusCode = 400;
        throw error;
    }
    return activeYear;
}

// ==================== Student Questions ====================

/**
 * Get all guidance questions grouped by week.
 * @param {string} academicYearId
 * @returns {Promise<Array>}
 */
export async function getAllQuestions(academicYearId) {
    let ayId = academicYearId;
    if (!ayId) {
        const active = await prisma.academicYear.findFirst({ where: { isActive: true } });
        ayId = active?.id;
    }
    return guidanceRepo.findAllQuestions(ayId);
}

/**
 * Create a new student guidance question.
 * @param {Object} data - { weekNumber, questionText, orderIndex, academicYearId }
 * @returns {Promise<Object>}
 */
export async function createQuestion(data) {
    if (!data.questionText || !data.weekNumber) {
        const error = new Error("Minggu dan teks pertanyaan wajib diisi.");
        error.statusCode = 400;
        throw error;
    }

    let ayId = data.academicYearId;
    if (!ayId) {
        const active = await getActiveYear();
        ayId = active.id;
    }

    return guidanceRepo.createQuestion({
        weekNumber: parseInt(data.weekNumber),
        questionText: data.questionText,
        orderIndex: parseInt(data.orderIndex) || 0,
        academicYearId: ayId
    });
}

/**
 * Update a student guidance question.
 * @param {string} id
 * @param {Object} data
 * @returns {Promise<Object>}
 */
export async function updateQuestion(id, data) {
    const updateData = {};
    if (data.questionText !== undefined) updateData.questionText = data.questionText;
    if (data.weekNumber !== undefined) updateData.weekNumber = parseInt(data.weekNumber);
    if (data.orderIndex !== undefined) updateData.orderIndex = parseInt(data.orderIndex);
    return guidanceRepo.updateQuestion(id, updateData);
}

/**
 * Delete a student guidance question.
 * @param {string} id
 * @returns {Promise<Object>}
 */
export async function deleteQuestion(id) {
    return guidanceRepo.deleteQuestion(id);
}

// ==================== Lecturer Criteria ====================

/**
 * Get all lecturer criteria.
 * @param {string} academicYearId
 * @returns {Promise<Array>}
 */
export async function getAllCriteria(academicYearId) {
    let ayId = academicYearId;
    if (!ayId) {
        const active = await prisma.academicYear.findFirst({ where: { isActive: true } });
        ayId = active?.id;
    }
    return guidanceRepo.findAllCriteria(ayId);
}

/**
 * Create a new lecturer criteria.
 * @param {Object} data - { criteriaName, weekNumber, inputType, orderIndex, academicYearId, options }
 * @returns {Promise<Object>}
 */
export async function createCriteria(data) {
    if (!data.criteriaName || !data.weekNumber || !data.inputType) {
        const error = new Error("Nama kriteria, minggu, dan tipe input wajib diisi.");
        error.statusCode = 400;
        throw error;
    }
    if (!["EVALUATION", "TEXT"].includes(data.inputType)) {
        const error = new Error("Tipe input harus EVALUATION atau TEXT.");
        error.statusCode = 400;
        throw error;
    }

    let ayId = data.academicYearId;
    if (!ayId) {
        const active = await getActiveYear();
        ayId = active.id;
    }

    return guidanceRepo.createCriteria({
        criteriaName: data.criteriaName,
        weekNumber: parseInt(data.weekNumber),
        inputType: data.inputType,
        orderIndex: parseInt(data.orderIndex) || 0,
        options: data.options,
        academicYearId: ayId
    });
}

/**
 * Update a lecturer criteria.
 * @param {string} id
 * @param {Object} data
 * @returns {Promise<Object>}
 */
export async function updateCriteria(id, data) {
    const updateData = {};
    if (data.criteriaName !== undefined) updateData.criteriaName = data.criteriaName;
    if (data.weekNumber !== undefined) updateData.weekNumber = parseInt(data.weekNumber);
    if (data.inputType !== undefined) {
        if (!["EVALUATION", "TEXT"].includes(data.inputType)) {
            const error = new Error("Tipe input harus EVALUATION atau TEXT.");
            error.statusCode = 400;
            throw error;
        }
        updateData.inputType = data.inputType;
    }
    if (data.orderIndex !== undefined) updateData.orderIndex = parseInt(data.orderIndex);
    if (data.options !== undefined) updateData.options = data.options;
    return guidanceRepo.updateCriteria(id, updateData);
}

/**
 * Delete a lecturer criteria.
 * @param {string} id
 * @returns {Promise<Object>}
 */
export async function deleteCriteria(id) {
    return guidanceRepo.deleteCriteria(id);
}

// ==================== Student Guidance ====================

/**
 * Get student's guidance timeline and status.
 */
export async function getStudentGuidance(studentId) {
    const internship = await guidanceRepo.findStudentInternshipWithGuidance(studentId);
    if (!internship) {
        throw new Error("Kegiatan Kerja Praktik aktif tidak ditemukan.");
    }

    if (!internship.actualStartDate) {
        throw new Error("Tanggal mulai KP belum diset. Silakan hubungi pembimbing atau admin.");
    }

    const startDate = new Date(internship.actualStartDate);
    const today = new Date();

    // 3. Identify weeks that have data (questions, criteria, or existing sessions)
    const ayId = internship.proposal?.academicYearId;
    const [questions, criteria, sessions] = await Promise.all([
        guidanceRepo.findAllQuestions(ayId),
        guidanceRepo.findAllCriteria(ayId),
        guidanceRepo.findGuidanceSessions(internship.id)
    ]);

    const activeWeeksSet = new Set([
        ...questions.map(q => q.weekNumber),
        ...criteria.map(c => c.weekNumber),
        ...sessions.map(s => s.weekNumber)
    ]);

    const activeWeeks = Array.from(activeWeeksSet).sort((a, b) => a - b);

    const timeline = [];
    for (const w of activeWeeks) {
        const weekStartDate = new Date(startDate);
        weekStartDate.setDate(startDate.getDate() + (w - 1) * 7);

        const weekEndDate = new Date(weekStartDate);
        weekEndDate.setDate(weekStartDate.getDate() + 6);

        const session = sessions.find(s => s.weekNumber === w);
        const weekQuestions = questions.filter(q => q.weekNumber === w);
        const weekCriteria = criteria.filter(c => c.weekNumber === w);

        let status = "NOT_AVAILABLE";
        if (today >= weekStartDate) {
            if (session?.status === "SUBMITTED" || session?.status === "APPROVED" || session?.status === "LATE") {
                status = session.status;
            } else if (today > weekEndDate) {
                status = "LATE";
            } else {
                status = "OPEN";
            }
        }

        timeline.push({
            weekNumber: w,
            startDate: weekStartDate,
            endDate: weekEndDate,
            status,
            questions: weekQuestions.map(q => ({
                id: q.id,
                questionText: q.questionText,
                answer: session?.studentAnswers?.find(a => a.questionId === q.id)?.answerText || ""
            })),
            lecturerEvaluation: session?.lecturerAnswers?.map(la => ({
                criteriaId: la.criteriaId,
                criteriaName: la.criteria?.criteriaName || "",
                evaluationValue: la.evaluationValue,
                answerText: la.answerText,
                inputType: la.criteria?.inputType || "TEXT"
            })) || []
        });
    }

    const currentWeekIdx = Math.floor((today - startDate) / (7 * 24 * 60 * 60 * 1000)) + 1;

    // Format report data for student guidance
    const reportData = {
        status: internship.reportStatus || null,
        title: internship.reportTitle || null,
        notes: internship.reportNotes || null,
        uploadedAt: internship.reportUploadedAt ? internship.reportUploadedAt.toISOString() : null,
        document: internship.reportDocument || null,
        feedbackDocument: internship.reportFeedbackDocument || null
    };

    return {
        internshipId: internship.id,
        studentName: internship.student.user.fullName,
        studentNim: internship.student.user.identityNumber,
        supervisorName: internship.supervisor?.user?.fullName || null,
        currentWeek: currentWeekIdx,
        report: reportData,
        finalScore: internship.finalNumericScore || null,
        finalGrade: internship.finalGrade || null,
        timeline
    };
}

/**
 * Submit student answers for a specific week.
 */
export async function submitGuidance(studentId, weekNumber, answers) {
    const internship = await guidanceRepo.findStudentInternshipWithGuidance(studentId);
    if (!internship) throw new Error("Internship tidak ditemukan.");

    const session = await guidanceRepo.ensureGuidanceSession(internship.id, parseInt(weekNumber));

    // Save each answer
    for (const [questionId, answerText] of Object.entries(answers)) {
        await guidanceRepo.upsertStudentAnswer({
            guidanceSessionId: session.id,
            questionId,
            weekNumber: parseInt(weekNumber),
            answerText
        });
    }

    // 1. Get internship and week details to check deadline
    const startDate = new Date(internship.actualStartDate);
    const weekEndDate = new Date(startDate);
    weekEndDate.setDate(startDate.getDate() + (parseInt(weekNumber) - 1) * 7 + 6);
    weekEndDate.setHours(23, 59, 59, 999);

    const today = new Date();
    const finalStatus = today > weekEndDate ? "LATE" : "SUBMITTED";

    // Update status and submission date
    const updatedSession = await guidanceRepo.updateSessionStatus(session.id, finalStatus);

    // 2. Notify Supervisor
    try {
        if (internship.supervisorId) {
            const studentName = internship.student?.user?.fullName || "Mahasiswa";
            const title = "Bimbingan Mahasiswa Baru";
            const message = `${studentName} telah mengunggah bimbingan Minggu ${weekNumber}.`;

            await notificationService.createNotificationsForUsers([internship.supervisorId], { title, message });
            await sendFcmToUsers([internship.supervisorId], {
                title,
                body: message,
                data: {
                    type: 'internship_guidance:submitted',
                    internshipId,
                    weekNumber
                },
                dataOnly: true
            });
        }
    } catch (err) {
        console.error("Failed to notify supervisor about guidance submission:", err);
    }

    return updatedSession;
}

// ==================== Lecturer Guidance ====================

/**
 * Get all students supervised by the lecturer, with their guidance progress.
 */
export async function getSupervisedStudents(lecturerId) {
    const internships = await guidanceRepo.findSupervisedInternships(lecturerId);

    return internships.map(internship => {
        const student = internship.student.user;
        const totalWeeks = internship.actualStartDate && internship.actualEndDate
            ? Math.ceil((internship.actualEndDate.getTime() - internship.actualStartDate.getTime()) / (1000 * 60 * 60 * 24 * 7))
            : 0;

        const sessions = internship.guidanceSessions || [];
        const submittedCount = sessions.filter(s => s.status === "SUBMITTED").length;
        const approvedCount = sessions.filter(s => s.status === "APPROVED").length;

        const academicYear = internship.proposal?.academicYear;
        const academicYearName = academicYear
            ? `${academicYear.year} ${academicYear.semester.charAt(0).toUpperCase() + academicYear.semester.slice(1)}`
            : '-';

        return {
            internshipId: internship.id,
            studentName: student.fullName,
            studentNim: student.identityNumber,
            companyName: internship.proposal.targetCompany?.companyName || "N/A",
            academicYearName,
            startDate: internship.actualStartDate,
            endDate: internship.actualEndDate,
            status: internship.status,
            progress: {
                totalWeeks,
                submittedCount,
                approvedCount
            },
            report: {
                status: internship.reportStatus,
                title: internship.reportTitle,
                notes: internship.reportNotes,
                uploadedAt: internship.reportUploadedAt,
                document: internship.reportDocument
            },
            finalScore: internship.finalNumericScore,
            finalGrade: internship.finalGrade
        };
    });
}

/**
 * Get the guidance timeline for a supervised student.
 */
export async function getLecturerGuidanceTimeline(lecturerId, internshipId) {
    // 1. Verify internship belongs to this lecturer
    const internship = await guidanceRepo.findSupervisedInternshipById(internshipId, lecturerId);

    if (!internship) {
        const err = new Error("Internship tidak ditemukan atau bukan bimbingan Anda.");
        err.statusCode = 404;
        throw err;
    }

    // Format report data (always include, even if dates are missing)
    const reportData = {
        status: internship.reportStatus || null,
        title: internship.reportTitle || null,
        notes: internship.reportNotes || null,
        uploadedAt: internship.reportUploadedAt ? internship.reportUploadedAt.toISOString() : null,
        document: internship.reportDocument || null,
        feedbackDocument: internship.reportFeedbackDocument || null
    };

    if (!internship.actualStartDate || !internship.actualEndDate) {
        return {
            internshipId,
            studentName: internship.student.user.fullName,
            studentNim: internship.student.user.identityNumber,
            currentWeek: 0,
            timeline: [],
            report: reportData,
            finalScore: internship.finalNumericScore || null,
            finalGrade: internship.finalGrade || null
        };
    }

    // 2. Fetch configured weeks/sessions
    const ayId = internship.proposal?.academicYearId;
    const [questions, criteria, sessions] = await Promise.all([
        guidanceRepo.findAllQuestions(ayId),
        guidanceRepo.findAllCriteria(ayId),
        guidanceRepo.findGuidanceSessions(internshipId)
    ]);

    const activeWeeksSet = new Set([
        ...questions.map(q => q.weekNumber),
        ...criteria.map(c => c.weekNumber),
        ...sessions.map(s => s.weekNumber)
    ]);

    const activeWeeks = Array.from(activeWeeksSet).sort((a, b) => a - b);

    const startDate = new Date(internship.actualStartDate);
    const today = new Date();
    const currentWeekIdx = Math.ceil((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 7));

    const timeline = [];
    for (const w of activeWeeks) {
        const weekStart = new Date(startDate);
        weekStart.setDate(startDate.getDate() + (w - 1) * 7);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);

        const session = sessions.find(s => s.weekNumber === w);
        let status = "NOT_AVAILABLE";
        
        if (session) {
            status = session.status;
        } else if (today >= weekStart) {
            status = today > weekEnd ? "LATE" : "OPEN";
        }

        timeline.push({
            weekNumber: w,
            startDate: weekStart.toISOString(),
            endDate: weekEnd.toISOString(),
            status,
            submissionDate: session?.submissionDate ? session.submissionDate.toISOString() : null,
        });
    }

    return {
        internshipId,
        studentName: internship.student.user.fullName,
        studentNim: internship.student.user.identityNumber,
        currentWeek: currentWeekIdx,
        report: reportData,
        finalScore: internship.finalNumericScore || null,
        finalGrade: internship.finalGrade || null,
        timeline
    };
}

/**
 * Get detailed guidance information for a specific week (for lecturer evaluation).
 */
export async function getGuidanceWeekDetail(lecturerId, internshipId, weekNumber) {
    const numWeek = parseInt(weekNumber);
    
    // 1. Verify internship belongs to this lecturer
    const internship = await guidanceRepo.findSupervisedInternshipById(internshipId, lecturerId);
    if (!internship) {
        const err = new Error("Internship tidak ditemukan atau bukan bimbingan Anda.");
        err.statusCode = 404;
        throw err;
    }

    // 2. Fetch session details
    const session = await guidanceRepo.findGuidanceSessionWithDetails(internshipId, numWeek);
    
    // 3. Fetch master criteria for this week
    const ayId = internship.proposal?.academicYearId;
    const allCriteria = await guidanceRepo.findAllCriteria(ayId);
    const weekCriteria = allCriteria.filter(c => c.weekNumber === numWeek);

    // 4. Transform data for FE
    return {
        internshipId,
        studentName: internship.student.user.fullName,
        studentNim: internship.student.user.identityNumber,
        weekNumber: numWeek,
        sessionStatus: session?.status || "NOT_AVAILABLE",
        submissionDate: session?.submissionDate || null,
        studentAnswers: session?.studentAnswers?.map(a => ({
            questionText: a.question.questionText,
            answerText: a.answerText
        })) || [],
        lecturerEvaluation: weekCriteria.map(c => {
            const answer = session?.lecturerAnswers?.find(la => la.criteriaId === c.id);
            return {
                criteriaId: c.id,
                criteriaName: c.criteriaName,
                inputType: c.inputType,
                options: c.options,
                evaluationValue: answer?.evaluationValue || null,
                answerText: answer?.answerText || ""
            };
        })
    };
}

/**
 * Submit lecturer evaluation for a specific week.
 */
export async function submitLecturerEvaluation(lecturerId, internshipId, weekNumber, evaluationData) {
    const numWeek = parseInt(weekNumber);
    const { evaluations } = evaluationData;
    const status = "APPROVED";

    // 1. Verify supervised student
    const internship = await guidanceRepo.findSupervisedInternshipById(internshipId, lecturerId);
    if (!internship) {
        const err = new Error("Internship tidak ditemukan atau bukan bimbingan Anda.");
        err.statusCode = 404;
        throw err;
    }

    // 2. Ensure guidance session exists
    const session = await guidanceRepo.ensureGuidanceSession(internshipId, numWeek);

    // 3. Save each evaluation answer
    for (const [criteriaId, data] of Object.entries(evaluations)) {
        await guidanceRepo.upsertLecturerAnswer({
            guidanceSessionId: session.id,
            criteriaId,
            weekNumber: numWeek,
            evaluationValue: data.evaluationValue,
            answerText: data.answerText
        });
    }

    // 4. Update session status
    const updatedSession = await guidanceRepo.updateSessionStatus(session.id, status);

    // 5. Notify Student
    try {
        const studentId = internship.studentId;
        const title = "Evaluasi Bimbingan Diterima";
        const message = `Dosen pembimbing telah memberikan evaluasi untuk bimbingan Minggu ${weekNumber}.`;

        await notificationService.createNotificationsForUsers([studentId], { title, message });
        await sendFcmToUsers([studentId], {
            title,
            body: message,
            data: {
                type: 'internship_guidance:approved',
                internshipId,
                weekNumber
            },
            dataOnly: true
        });
    } catch (err) {
        console.error("Failed to notify student about guidance evaluation:", err);
    }

    return updatedSession;
}

/**
 * Verify final report by supervisor (lecturer).
 * @param {string} lecturerId 
 * @param {string} internshipId 
 * @param {Object} data - { status, notes }
 * @returns {Promise<Object>}
 */
export async function verifyFinalReport(lecturerId, internshipId, { status, notes, feedbackFile }) {
    if (!['APPROVED', 'REVISION_NEEDED'].includes(status)) {
        const error = new Error("Status verifikasi tidak valid.");
        error.statusCode = 400;
        throw error;
    }

    // Verify internship belongs to this lecturer
    const internship = await guidanceRepo.findSupervisedInternshipById(internshipId, lecturerId);
    if (!internship) {
        const error = new Error("Internship tidak ditemukan atau bukan bimbingan Anda.");
        error.statusCode = 404;
        throw error;
    }

    // Check if report exists
    if (!internship.reportStatus || internship.reportStatus !== 'SUBMITTED') {
        const error = new Error("Laporan akhir belum diunggah atau tidak dalam status SUBMITTED.");
        error.statusCode = 400;
        throw error;
    }

    // Handle feedback file upload (only for REVISION_NEEDED)
    let feedbackDocumentId = null;
    if (feedbackFile && status === 'REVISION_NEEDED') {
        const fs = await import('fs');
        const path = await import('path');
        
        // Delete old feedback file if exists
        if (internship.reportFeedbackDocumentId) {
            try {
                const oldDoc = await prisma.document.findUnique({
                    where: { id: internship.reportFeedbackDocumentId },
                    select: { filePath: true }
                });
                if (oldDoc?.filePath) {
                    const oldFilePath = path.join(process.cwd(), oldDoc.filePath);
                    if (fs.existsSync(oldFilePath)) {
                        fs.unlinkSync(oldFilePath);
                    }
                }
                await prisma.document.delete({
                    where: { id: internship.reportFeedbackDocumentId }
                });
            } catch (delErr) {
                console.warn("Gagal menghapus file feedback lama:", delErr.message);
            }
        }

        // Create upload directory
        const uploadsDir = path.join(process.cwd(), "uploads", "internship", internshipId, "feedback");
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }

        // Generate unique filename
        const uniqueId = Date.now().toString(36);
        const fileName = `${uniqueId}-${feedbackFile.originalName}`;
        const relativeFilePath = `uploads/internship/${internshipId}/feedback/${fileName}`;
        const filePath = path.join(uploadsDir, fileName);

        // Write file to disk
        fs.writeFileSync(filePath, feedbackFile.buffer);

        // Create document record
        const document = await prisma.document.create({
            data: {
                userId: lecturerId,
                fileName: feedbackFile.originalName,
                filePath: relativeFilePath,
            }
        });

        feedbackDocumentId = document.id;
    } else if (status === 'APPROVED' && internship.reportFeedbackDocumentId) {
        // If approving, optionally delete feedback file (or keep for history)
        // For now, we keep it for history
    }

    // Update report verification
    const updateData = {
        reportStatus: status,
        reportNotes: notes || null
    };
    
    if (feedbackDocumentId !== null) {
        updateData.reportFeedbackDocumentId = feedbackDocumentId;
    }

    const updatedInternship = await prisma.internship.update({
        where: { id: internshipId },
        data: updateData,
        include: {
            reportFeedbackDocument: true
        }
    });

    // Notify student
    try {
        const statusLabel = status === 'APPROVED' ? 'DISETUJUI' : 'PERLU REVISI';
        const title = `Verifikasi Laporan Akhir`;
        let message = `Laporan Akhir Anda telah ${statusLabel.toLowerCase()} oleh Dosen Pembimbing.`;
        if (notes) {
            message += ` Catatan: ${notes}`;
        }
        if (feedbackFile && status === 'REVISION_NEEDED') {
            message += ` Dosen telah mengunggah file PDF dengan highlight untuk referensi Anda.`;
        }

        await notificationService.createNotificationsMany([{
            userId: internship.studentId,
            title,
            message
        }]);

        await sendFcmToUsers([internship.studentId], {
            title,
            body: message,
            data: {
                type: 'internship_final_report_verification',
                role: 'student',
                status,
                internshipId
            },
            dataOnly: true
        });
    } catch (err) {
        console.error("Gagal mengirim notifikasi verifikasi laporan akhir:", err);
    }

    return updatedInternship;
}

/**
 * Duplicates all guidance questions and lecturer criteria from one academic year to another.
 */
export async function copyGuidance(fromYearId, toYearId) {
    if (!fromYearId || !toYearId) throw new Error("Tahun ajaran asal dan tujuan wajib diisi");
    if (fromYearId === toYearId) throw new Error("Tahun ajaran asal dan tujuan tidak boleh sama");

    // Check if target year exists
    const targetYear = await prisma.academicYear.findUnique({ where: { id: toYearId } });
    if (!targetYear) throw new Error("Tahun ajaran tujuan tidak ditemukan");

    const sourceQuestions = await prisma.internshipGuidanceQuestion.findMany({
        where: { academicYearId: fromYearId }
    });

    const sourceCriteria = await prisma.internshipGuidanceLecturerCriteria.findMany({
        where: { academicYearId: fromYearId },
        include: { options: true }
    });

    if (sourceQuestions.length === 0 && sourceCriteria.length === 0) {
        throw new Error("Tidak ada data bimbingan untuk diduplikasi dari tahun ajaran asal");
    }

    return await prisma.$transaction(async (tx) => {
        // Copy Questions
        if (sourceQuestions.length > 0) {
            await tx.internshipGuidanceQuestion.createMany({
                data: sourceQuestions.map(q => ({
                    weekNumber: q.weekNumber,
                    questionText: q.questionText,
                    orderIndex: q.orderIndex,
                    academicYearId: toYearId
                }))
            });
        }

        // Copy Criteria & Options
        for (const criteria of sourceCriteria) {
            const newCriteria = await tx.internshipGuidanceLecturerCriteria.create({
                data: {
                    criteriaName: criteria.criteriaName,
                    weekNumber: criteria.weekNumber,
                    inputType: criteria.inputType,
                    orderIndex: criteria.orderIndex,
                    academicYearId: toYearId
                }
            });

            if (criteria.options && criteria.options.length > 0) {
                await tx.internshipGuidanceLecturerCriteriaOption.createMany({
                    data: criteria.options.map(o => ({
                        criteriaId: newCriteria.id,
                        optionText: o.optionText,
                        orderIndex: o.orderIndex
                    }))
                });
            }
        }

        return { questionsCopied: sourceQuestions.length, criteriaCopied: sourceCriteria.length };
    });
}
