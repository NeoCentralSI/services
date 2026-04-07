import prisma from "../../config/prisma.js";
import * as repository from "../../repositories/insternship/assessment.repository.js";
import { createNotificationsForUsers } from "../notification.service.js";
import { sendFcmToUsers } from "../push.service.js";

/**
 * Get assessment criteria and existing scores for a lecturer.
 */
export async function getAssessmentForLecturer(lecturerId, internshipId) {
    const data = await repository.findInternshipAssessmentData(internshipId);
    if (!data) throw new Error("Internship tidak ditemukan");

    // Verify lecturer is the supervisor
    // We can check if the internship supervisorId matches lecturerId
    const internshipWithSup = await prisma.internship.findUnique({
        where: { id: internshipId },
        select: { supervisorId: true }
    });

    if (internshipWithSup.supervisorId !== lecturerId) {
        throw new Error("Anda tidak memiliki akses untuk menilai bimbingan ini.");
    }

    return data;
}

/**
 * Calculate final numeric score and grade based on all scores (Lecturer + Field).
 */
export async function calculateFinalResults(internshipId) {
    const internship = await prisma.internship.findUnique({
        where: { id: internshipId },
        include: {
            lecturerScores: {
                include: { chosenRubric: { include: { cpmk: true } } }
            },
            fieldScores: {
                include: { chosenRubric: { include: { cpmk: true } } }
            }
        }
    });

    const lecturerScores = internship.lecturerScores || [];
    const fieldScores = internship.fieldScores || [];

    let finalNumericScore = 0;

    // Lecturer scores
    lecturerScores.forEach(s => {
        finalNumericScore += (s.score * s.chosenRubric.cpmk.weight / 100);
    });

    // Field scores
    fieldScores.forEach(s => {
        finalNumericScore += (s.score * s.chosenRubric.cpmk.weight / 100);
    });

    
    // Grade Mapping (Standard)
    let finalGrade = "E";
    if (finalNumericScore >= 85) finalGrade = "A";
    else if (finalNumericScore >= 80) finalGrade = "A-";
    else if (finalNumericScore >= 75) finalGrade = "B+";
    else if (finalNumericScore >= 70) finalGrade = "B";
    else if (finalNumericScore >= 65) finalGrade = "B-";
    else if (finalNumericScore >= 60) finalGrade = "C+";
    else if (finalNumericScore >= 55) finalGrade = "C";
    else if (finalNumericScore >= 40) finalGrade = "D";

    return {
        finalNumericScore: parseFloat(finalNumericScore.toFixed(2)),
        finalGrade
    };
}

/**
 * Submit lecturer assessment.
 */
export async function submitLecturerAssessment(lecturerId, internshipId, scores) {
    // 1. Verify supervised student
    const internship = await prisma.internship.findUnique({
        where: { id: internshipId },
        select: { supervisorId: true, proposal: { select: { academicYearId: true } } }
    });

    if (!internship || internship.supervisorId !== lecturerId) {
        throw new Error("Akses ditolak.");
    }

    // 2. Save scores
    // Format: [{ chosenRubricId, score }]
    await repository.upsertLecturerScores(internshipId, scores);

    // 3. Recalculate final results
    const results = await calculateFinalResults(internshipId);

    // 4. Check if all lecturer CPMKs are filled
    const lecturerCpmks = await prisma.internshipCpmk.findMany({
        where: { 
            academicYearId: internship.proposal.academicYearId,
            assessorType: 'LECTURER'
        }
    });

    const filledLecturerRubricIds = scores.map(s => s.chosenRubricId);
    // Find how many unique lecturer CPMKs have scores
    const filledRubricsData = await prisma.internshipAssessmentRubric.findMany({
        where: { id: { in: filledLecturerRubricIds } },
        select: { cpmkId: true }
    });
    
    const uniqueCpmksWithScore = new Set(filledRubricsData.map(r => r.cpmkId));
    const lecturerAssessmentStatus = uniqueCpmksWithScore.size >= lecturerCpmks.length ? 'COMPLETED' : 'ONGOING';

    // 5. Update Internship record
    const result = await repository.updateInternshipResults(internshipId, {
        finalNumericScore: results.finalNumericScore,
        finalGrade: results.finalGrade,
        lecturerAssessmentStatus
    });

    // 6. Notify Student if COMPLETED
    if (lecturerAssessmentStatus === 'COMPLETED') {
        try {
            const title = "Penilaian KP Selesai";
            const message = "Dosen pembimbing telah selesai melakukan penilaian Kerja Praktik Anda.";
            await createNotificationsForUsers([result.studentId], { title, message });
            await sendFcmToUsers([result.studentId], {
                title,
                body: message,
                data: {
                    type: 'internship_grading_completed',
                    role: 'student',
                    internshipId: result.id
                },
                dataOnly: true
            });
        } catch (err) {
            console.error("Gagal mengirim notifikasi penilaian selesai:", err);
        }
    }

    return result;
}
