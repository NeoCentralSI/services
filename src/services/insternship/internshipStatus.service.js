import prisma from "../../config/prisma.js";
import { createNotificationsForUsers } from "../notification.service.js";
import { sendFcmToUsers } from "../push.service.js";

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

/**
 * Synchronize and update internship status to COMPLETED if all requirements are met.
 * Requirements:
 * 1. Lecturer Assessment Status: COMPLETED
 * 2. Field Assessment Status: COMPLETED
 * 3. At least one seminar with status: COMPLETED
 * 4. Logbook Document (KP-002) Status: APPROVED
 * 5. Company Receipt (KP-004) Status: APPROVED
 * 6. Final Report (KP-005) Status: APPROVED
 * 
 * Note: Completion Certificate is optional as per user request.
 * 
 * @param {string} internshipId 
 */
export async function syncInternshipCompletionStatus(internshipId) {
    const internship = await prisma.internship.findUnique({
        where: { id: internshipId },
        include: {
            seminars: {
                where: { status: 'COMPLETED' },
                take: 1
            }
        }
    });

    if (!internship || internship.status !== 'ONGOING') return;

    const isLecturerAssessmentDone = internship.lecturerAssessmentStatus === 'COMPLETED';
    const isFieldAssessmentDone = internship.fieldAssessmentStatus === 'COMPLETED';
    const isSeminarDone = internship.seminars.length > 0;

    // Documents check
    const isLogbookApproved = internship.logbookDocumentStatus === 'APPROVED';
    const isReceiptApproved = internship.companyReceiptStatus === 'APPROVED';
    const isFinalReportApproved = internship.reportFinalStatus === 'APPROVED';

    const allRequirementsMet = 
        isLecturerAssessmentDone && 
        isFieldAssessmentDone && 
        isSeminarDone && 
        isLogbookApproved && 
        isReceiptApproved && 
        isFinalReportApproved;

    if (allRequirementsMet) {
        await prisma.internship.update({
            where: { id: internshipId },
            data: { 
                status: 'COMPLETED',
            }
        });
        console.log(`[internship-status] Internship ${internshipId} marked as COMPLETED.`);

        // Notify Student
        try {
            const title = "Selamat! Kerja Praktik Selesai";
            const message = "Kerja Praktik Anda telah dinyatakan SELESAI (COMPLETED). Seluruh nilai dan dokumen telah diverifikasi.";
            
            await createNotificationsForUsers([internship.studentId], { title, message });
            await sendFcmToUsers([internship.studentId], {
                title,
                body: message,
                data: {
                    type: 'internship_completed',
                    internshipId: internship.id
                },
                dataOnly: true
            });
        } catch (err) {
            console.error("Gagal mengirim notifikasi penyelesaian KP:", err);
        }
    }
}
