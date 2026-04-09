import crypto from "crypto";
import prisma from "../../config/prisma.js";
import { calculateFinalResults } from "./assessment.service.js";
import { createNotificationsForUsers } from "../notification.service.js";
import { sendFcmToUsers } from "../push.service.js";
import { generateFieldAssessmentPdf } from "../../utils/field-assessment-pdf.util.js";

/**
 * Validate a field assessment token.
 * Returns internship info + FIELD-type CPMKs with rubrics.
 */
export async function validateToken(token) {
    const record = await prisma.fieldAssessmentToken.findUnique({
        where: { token },
        include: {
            internship: {
                include: {
                    student: {
                        include: {
                            user: { select: { fullName: true, identityNumber: true } },
                        },
                    },
                    proposal: {
                        include: {
                            targetCompany: { select: { companyName: true, companyAddress: true } },
                            academicYear: { select: { id: true, year: true, semester: true } },
                        },
                    },
                    companyReportDoc: {
                        select: {
                            id: true,
                            fileName: true,
                            filePath: true,
                        },
                    },
                    fieldScores: true,
                },
            },
        },
    });

    if (!record) {
        const err = new Error("Link penilaian tidak valid atau tidak ditemukan.");
        err.statusCode = 404;
        throw err;
    }

    if (record.isUsed) {
        const err = new Error("Penilaian sudah pernah dikirim melalui link ini. Link tidak dapat digunakan kembali.");
        err.statusCode = 410;
        throw err;
    }

    if (new Date() > record.expiresAt) {
        const err = new Error("Link penilaian sudah kedaluwarsa. Silakan hubungi pihak kampus untuk mendapatkan link baru.");
        err.statusCode = 410;
        throw err;
    }

    const internship = record.internship;
    const academicYearId = internship.proposal.academicYear.id;

    // Fetch FIELD-type CPMKs with rubrics
    const cpmks = await prisma.internshipCpmk.findMany({
        where: {
            academicYearId,
            assessorType: "FIELD",
        },
        include: {
            rubrics: { orderBy: { minScore: "asc" } },
        },
        orderBy: { code: "asc" },
    });

    return {
        internship: {
            id: internship.id,
            studentName: internship.student.user.fullName,
            studentNim: internship.student.user.identityNumber,
            companyName: internship.proposal.targetCompany?.companyName,
            companyAddress: internship.proposal.targetCompany?.companyAddress,
            fieldSupervisorName: internship.fieldSupervisorName,
            unitSection: internship.unitSection,
            actualStartDate: internship.actualStartDate,
            actualEndDate: internship.actualEndDate,
            academicYear: `${internship.proposal.academicYear.year} - ${internship.proposal.academicYear.semester === "ganjil" ? "Ganjil" : "Genap"}`,
            companyReportDoc: internship.companyReportDoc
                ? {
                    id: internship.companyReportDoc.id,
                    fileName: internship.companyReportDoc.fileName,
                    filePath: internship.companyReportDoc.filePath,
                }
                : null,
        },
        cpmks,
        existingScores: internship.fieldScores,
    };
}

/**
 * Submit field assessment scores + signature.
 * 1. Validate token
 * 2. Save field scores
 * 3. Generate encrypted signature hash (store in DB)
 * 4. Generate PDF with embedded signature image
 * 5. Save PDF as Document
 * 6. Update internship status
 * 7. Invalidate token
 * 8. Recalculate final score
 */
export async function submitFieldAssessment(token, scores, signatureBase64) {
    // 1. Validate token
    const record = await prisma.fieldAssessmentToken.findUnique({
        where: { token },
        include: {
            internship: {
                include: {
                    student: {
                        include: { user: { select: { fullName: true, identityNumber: true, id: true } } },
                    },
                    supervisor: {
                        include: { user: { select: { fullName: true, id: true } } },
                    },
                    proposal: {
                        include: {
                            targetCompany: { select: { companyName: true } },
                            academicYear: { select: { id: true, year: true, semester: true } },
                        },
                    },
                },
            },
        },
    });

    if (!record) {
        const err = new Error("Link penilaian tidak valid.");
        err.statusCode = 404;
        throw err;
    }

    if (record.isUsed) {
        const err = new Error("Penilaian sudah pernah dikirim melalui link ini.");
        err.statusCode = 410;
        throw err;
    }

    if (new Date() > record.expiresAt) {
        const err = new Error("Link penilaian sudah kedaluwarsa.");
        err.statusCode = 410;
        throw err;
    }

    const internship = record.internship;
    const internshipId = internship.id;
    const now = new Date();

    // 2. Create signature hash (encrypted verification code)
    const signaturePayload = `${internshipId}:${token}:${now.toISOString()}`;
    const signatureHash = crypto
        .createHmac("sha256", process.env.JWT_SECRET || "field-assessment-secret")
        .update(signaturePayload)
        .digest("hex");

    // 3. Generate PDF with embedded signature image
    let pdfDocumentId = null;
    try {
        const academicYearId = internship.proposal.academicYear.id;
        const cpmks = await prisma.internshipCpmk.findMany({
            where: { academicYearId, assessorType: "FIELD" },
            include: { rubrics: { orderBy: { minScore: "asc" } } },
            orderBy: { code: "asc" },
        });

        const pdfBuffer = await generateFieldAssessmentPdf({
            studentName: internship.student.user.fullName,
            studentNim: internship.student.user.identityNumber,
            companyName: internship.proposal.targetCompany?.companyName || "-",
            fieldSupervisorName: internship.fieldSupervisorName || "-",
            unitSection: internship.unitSection || "-",
            period: `${internship.actualStartDate?.toLocaleDateString("id-ID") || "-"} s/d ${internship.actualEndDate?.toLocaleDateString("id-ID") || "-"}`,
            academicYear: `${internship.proposal.academicYear.year} - ${internship.proposal.academicYear.semester === "ganjil" ? "Ganjil" : "Genap"}`,
            cpmks,
            scores,
            signatureBase64,
            signatureHash,
            submittedAt: now,
        });

        // Save PDF as Document
        const fs = await import("fs");
        const path = await import("path");
        const uploadsDir = path.resolve("uploads/field-assessments");
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }

        const fileName = `penilaian-lapangan-${internship.student.user.identityNumber}-${Date.now()}.pdf`;
        const filePath = path.join(uploadsDir, fileName);
        fs.writeFileSync(filePath, pdfBuffer);

        const doc = await prisma.document.create({
            data: {
                fileName,
                filePath: `uploads/field-assessments/${fileName}`,
            },
        });
        pdfDocumentId = doc.id;
    } catch (pdfError) {
        console.error("Gagal membuat PDF penilaian lapangan:", pdfError);
        // Continue even if PDF fails — scores are more important
    }

    // 4. Save scores + update internship in a transaction
    await prisma.$transaction(async (tx) => {
        // Delete existing field scores for this internship (re-submit scenario)
        await tx.internshipFieldScore.deleteMany({ where: { internshipId } });

        // Insert new field scores
        if (scores.length > 0) {
            await tx.internshipFieldScore.createMany({
                data: scores.map((s) => ({
                    internshipId,
                    chosenRubricId: s.chosenRubricId,
                    score: s.score,
                })),
            });
        }

        // Update internship metadata
        const updateData = {
            fieldAssessmentStatus: "COMPLETED",
            fieldAssessmentSignatureHash: signatureHash,
            fieldAssessmentSubmittedAt: now,
        };

        if (pdfDocumentId) {
            updateData.fieldAssessmentDocId = pdfDocumentId;
        }

        await tx.internship.update({
            where: { id: internshipId },
            data: updateData,
        });

        // Mark token as used
        await tx.fieldAssessmentToken.update({
            where: { id: record.id },
            data: { isUsed: true, usedAt: now },
        });
    });

    // 5. Recalculate final results
    try {
        const results = await calculateFinalResults(internshipId);

        // Check if all FIELD CPMKs are filled
        const fieldCpmks = await prisma.internshipCpmk.findMany({
            where: {
                academicYearId: internship.proposal.academicYear.id,
                assessorType: "FIELD",
            },
        });

        const filledRubricsData = await prisma.internshipAssessmentRubric.findMany({
            where: { id: { in: scores.map((s) => s.chosenRubricId) } },
            select: { cpmkId: true },
        });

        const uniqueCpmks = new Set(filledRubricsData.map((r) => r.cpmkId));
        const assessmentComplete = uniqueCpmks.size >= fieldCpmks.length;

        await prisma.internship.update({
            where: { id: internshipId },
            data: {
                finalNumericScore: results.finalNumericScore,
                finalGrade: results.finalGrade,
                fieldAssessmentStatus: assessmentComplete ? "COMPLETED" : "APPROVED",
            },
        });
    } catch (calcError) {
        console.error("Gagal menghitung nilai akhir:", calcError);
    }

    // 6. Notify student and supervisor
    try {
        const notifyUserIds = [internship.student.user.id];
        if (internship.supervisor?.user?.id) {
            notifyUserIds.push(internship.supervisor.user.id);
        }

        const title = "Penilaian Pembimbing Lapangan Selesai";
        const message = `Pembimbing lapangan telah menyelesaikan penilaian Kerja Praktik untuk ${internship.student.user.fullName}.`;

        await createNotificationsForUsers(notifyUserIds, { title, message });
        await sendFcmToUsers(notifyUserIds, {
            title,
            body: message,
            data: {
                type: "field_assessment_completed",
                role: "student",
                internshipId,
            },
            dataOnly: true,
        });
    } catch (notifError) {
        console.error("Gagal mengirim notifikasi:", notifError);
    }

    return { internshipId, signatureHash };
}
