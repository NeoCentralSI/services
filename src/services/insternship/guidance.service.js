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

    // Fetch master questions and existing sessions
    const masterQuestions = await guidanceRepo.findAllQuestions(internship.academicYearId);
    const sessions = await guidanceRepo.findGuidanceSessions(internship.id);

    // Get the maximum week number defined by Sekdep
    const maxWeek = masterQuestions.reduce((max, q) => Math.max(max, q.weekNumber), 0);

    const timeline = [];
    for (let w = 1; w <= maxWeek; w++) {
        const weekStartDate = new Date(startDate);
        weekStartDate.setDate(startDate.getDate() + (w - 1) * 7);

        const weekEndDate = new Date(weekStartDate);
        weekEndDate.setDate(weekStartDate.getDate() + 6);

        const session = sessions.find(s => s.weekNumber === w);
        const questions = masterQuestions.filter(q => q.weekNumber === w);

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
            questions: questions.map(q => ({
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

    return {
        internshipId: internship.id,
        supervisorName: internship.supervisor?.user?.fullName || null,
        currentWeek: Math.floor((today - startDate) / (7 * 24 * 60 * 60 * 1000)) + 1,
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

        return {
            internshipId: internship.id,
            studentName: student.fullName,
            studentNim: student.identityNumber,
            companyName: internship.proposal.targetCompany?.companyName || "N/A",
            startDate: internship.actualStartDate,
            endDate: internship.actualEndDate,
            status: internship.status,
            progress: {
                totalWeeks,
                submittedCount,
                approvedCount
            }
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

    if (!internship.actualStartDate || !internship.actualEndDate) {
        return {
            internshipId,
            studentName: internship.student.user.fullName,
            studentNim: internship.student.user.identityNumber,
            currentWeek: 0,
            timeline: []
        };
    }

    // 2. Fetch configured weeks from questions and criteria
    const [questions, criteria] = await Promise.all([
        guidanceRepo.findAllQuestions(internship.academicYearId),
        guidanceRepo.findAllCriteria(internship.academicYearId)
    ]);

    const maxQuestionsWeek = questions.reduce((max, q) => Math.max(max, q.weekNumber), 0);
    const maxCriteriaWeek = criteria.reduce((max, c) => Math.max(max, c.weekNumber), 0);
    const maxConfiguredWeek = Math.max(maxQuestionsWeek, maxCriteriaWeek);

    // 3. Generate generic timeline calculation for students
    const startDate = new Date(internship.actualStartDate);
    const endDate = new Date(internship.actualEndDate);
    const internshipWeeksCount = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 7));
    
    // Limits the timeline to the maximum configured week
    const totalWeeksCount = Math.min(internshipWeeksCount, maxConfiguredWeek);

    const currentWeekIdx = Math.ceil((new Date().getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 7));
    const currentWeek = currentWeekIdx > totalWeeksCount ? totalWeeksCount : (currentWeekIdx < 1 ? 1 : currentWeekIdx);

    const sessions = await guidanceRepo.findGuidanceSessions(internshipId);

    const timeline = [];
    for (let i = 1; i <= totalWeeksCount; i++) {
        const weekStart = new Date(startDate);
        weekStart.setDate(startDate.getDate() + (i - 1) * 7);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);

        const session = sessions.find(s => s.weekNumber === i);
        let status = "NOT_AVAILABLE";
        
        if (session) {
            status = session.status;
        } else if (i <= currentWeek) {
            status = "OPEN";
            if (i < currentWeek) {
                status = "LATE";
            }
        }

        timeline.push({
            weekNumber: i,
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
        currentWeek,
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
    const allCriteria = await guidanceRepo.findAllCriteria(internship.academicYearId);
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
