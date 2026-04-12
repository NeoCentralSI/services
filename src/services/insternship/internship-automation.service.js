import prisma from "../../config/prisma.js";

/**
 * Check and update the global status of an internship based on all requirements.
 * Should be called whenever a requirement status changes (grading, report, seminar).
 * 
 * Requirements for COMPLETION:
 * 1. Final Report Status is APPROVED.
 * 2. At least one seminar is COMPLETED.
 * 3. Lecturer Assessment is COMPLETED.
 * 4. Field Assessment is COMPLETED.
 */
export async function checkAndUpdateInternshipStatus(internshipId) {
    const internship = await prisma.internship.findUnique({
        where: { id: internshipId },
        include: {
            seminars: {
                where: { status: 'COMPLETED' },
                take: 1
            }
        }
    });

    // We only automate status updates for internships currently in ONGOING status
    if (!internship || internship.status !== 'ONGOING') return null;

    const isReportApproved = internship.reportStatus === 'APPROVED';
    const isSeminarCompleted = internship.seminars.length > 0;
    const isLecturerAssessmentDone = internship.lecturerAssessmentStatus === 'COMPLETED';
    const isFieldAssessmentDone = internship.fieldAssessmentStatus === 'COMPLETED';

    if (isReportApproved && isSeminarCompleted && isLecturerAssessmentDone && isFieldAssessmentDone) {
        // All conditions met! Determine COMPLETED or FAILED based on grade.
        const grade = internship.finalGrade;
        // Grades D and E are considered FAILED
        const isFailing = ['D', 'E'].includes(grade);
        
        const newStatus = isFailing ? 'FAILED' : 'COMPLETED';
        
        const updatedInternship = await prisma.internship.update({
            where: { id: internshipId },
            data: { status: newStatus }
        });
        
        console.log(`[internship-automation] Internship ${internshipId} status automatically updated to ${newStatus} (Final Grade: ${grade})`);
        
        return updatedInternship;
    }

    return null;
}
