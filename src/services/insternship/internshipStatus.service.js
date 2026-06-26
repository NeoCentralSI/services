import prisma from "../../config/prisma.js";
import { createNotificationsForUsers } from "../notification.service.js";
import { sendFcmToUsers } from "../push.service.js";

const FAILING_FINAL_GRADES = new Set(["D", "E"]);

function isFailingFinalGrade(finalGrade) {
    return FAILING_FINAL_GRADES.has(String(finalGrade || "").trim().toUpperCase());
}

function hasCompletionRequirements(internship) {
    const isLecturerAssessmentDone = internship.lecturerAssessmentStatus === 'COMPLETED';
    const isFieldAssessmentDone = internship.fieldAssessmentStatus === 'COMPLETED';
    const isSeminarDone = internship.seminars.length > 0;
    const isLogbookApproved = internship.logbookDocumentStatus === 'APPROVED';
    const isReceiptApproved = internship.companyReceiptStatus === 'APPROVED';
    const isFinalReportApproved = internship.reportStatus === 'APPROVED';

    return isLecturerAssessmentDone &&
        isFieldAssessmentDone &&
        isSeminarDone &&
        isLogbookApproved &&
        isReceiptApproved &&
        isFinalReportApproved;
}

async function notifyInternshipFailed(internship, failReason) {
    try {
        const title = "Status Kerja Praktik: GAGAL";
        const isGradeFailure = failReason === "LOW_FINAL_GRADE";
        const message = isGradeFailure
            ? `Status KP Anda diubah menjadi GAGAL karena nilai akhir ${internship.finalGrade || "-"} belum memenuhi batas kelulusan. Anda dapat melakukan pendaftaran KP kembali.`
            : `Status KP Anda diubah menjadi GAGAL karena ${failReason === 'Reporting deadline exceeded (1 month)' ? 'batas waktu pelaporan (1 bulan) telah terlampaui' : 'batas waktu seminar (2 bulan) telah terlampaui'}. Silakan hubungi Sekretaris Departemen.`;

        await createNotificationsForUsers([internship.studentId], { title, message });
        await sendFcmToUsers([internship.studentId], {
            title,
            body: message,
            data: {
                type: 'internship_status_failed',
                internshipId: internship.id,
                reason: failReason
            },
            dataOnly: true
        });
    } catch (err) {
        console.error("Gagal mengirim notifikasi kegagalan KP:", err);
    }
}

async function notifyInternshipCompleted(internship) {
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

/**
 * Update internship statuses based on deadlines and final completion results.
 * Runs as a background job to enforce reporting/seminar deadlines and catch
 * completed assessments whose final grade should make the internship fail.
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
    let completedCount = 0;
    let gradeFailedCount = 0;

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

            await notifyInternshipFailed(internship, failReason);

            failedCount++;
            console.log(`[internship-status] Internship ${internship.id} marked as FAILED. Reason: ${failReason}`);
            continue;
        }

        if (hasCompletionRequirements(internship)) {
            if (isFailingFinalGrade(internship.finalGrade)) {
                await prisma.internship.update({
                    where: { id: internship.id },
                    data: { status: 'FAILED' }
                });
                await notifyInternshipFailed(internship, "LOW_FINAL_GRADE");
                failedCount++;
                gradeFailedCount++;
                console.log(`[internship-status] Internship ${internship.id} marked as FAILED. Reason: final grade ${internship.finalGrade}`);
                continue;
            }

            await prisma.internship.update({
                where: { id: internship.id },
                data: { status: 'COMPLETED' }
            });
            await notifyInternshipCompleted(internship);
            completedCount++;
            console.log(`[internship-status] Internship ${internship.id} marked as COMPLETED.`);
        }
    }

    return {
        processed: internships.length,
        failed: failedCount,
        gradeFailed: gradeFailedCount,
        completed: completedCount
    };
}

/**
 * Synchronize and update internship status to COMPLETED or FAILED if all requirements are met.
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

    const allRequirementsMet = hasCompletionRequirements(internship);

    if (allRequirementsMet) {
        const targetStatus = isFailingFinalGrade(internship.finalGrade) ? 'FAILED' : 'COMPLETED';

        await prisma.internship.update({
            where: { id: internshipId },
            data: { 
                status: targetStatus,
            }
        });
        console.log(`[internship-status] Internship ${internshipId} marked as ${targetStatus}.`);

        if (targetStatus === 'FAILED') {
            await notifyInternshipFailed(internship, "LOW_FINAL_GRADE");
        } else {
            await notifyInternshipCompleted(internship);
        }
    }
}
