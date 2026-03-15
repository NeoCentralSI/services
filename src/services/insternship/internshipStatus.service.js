import prisma from "../../config/prisma.js";

/**
 * Update internship statuses based on deadlines.
 * Runs as a background job to enforce reporting and seminar deadlines.
 */
export async function updateAllInternshipDeadlineStatuses() {
    const now = new Date();
    
    // 1. Get all ongoing internships with actualEndDate set
    const internships = await prisma.internship.findMany({
        where: {
            status: 'ONGOING',
            actualEndDate: { not: null }
        },
        include: {
            seminars: {
                where: { status: 'COMPLETED' },
                take: 1
            }
        }
    });

    let failedCount = 0;

    for (const internship of internships) {
        const endDate = new Date(internship.actualEndDate);
        
        // Reporting Deadline: 1 month
        const reportingDeadline = new Date(endDate);
        reportingDeadline.setMonth(reportingDeadline.getMonth() + 1);
        
        // Seminar Deadline: 2 months
        const seminarDeadline = new Date(endDate);
        seminarDeadline.setMonth(seminarDeadline.getMonth() + 2);
        
        let shouldFail = false;
        let failReason = "";

        // Check reporting deadline (FAILED if no report after 1 month)
        if (now > reportingDeadline && !internship.reportDocumentId) {
            shouldFail = true;
            failReason = "Reporting deadline exceeded (1 month)";
        }
        
        // Check seminar deadline (FAILED if no completed seminar after 2 months)
        if (!shouldFail && now > seminarDeadline && internship.seminars.length === 0) {
            shouldFail = true;
            failReason = "Seminar deadline exceeded (2 months)";
        }

        if (shouldFail) {
            await prisma.internship.update({
                where: { id: internship.id },
                data: { status: 'FAILED' }
            });
            failedCount++;
            console.log(`[internship-status] Internship ${internship.id} marked as FAILED. Reason: ${failReason}`);
        }
    }

    return { processed: internships.length, failed: failedCount };
}
