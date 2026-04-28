import crypto from "crypto";
import prisma from "../../config/prisma.js";
import { calculateFinalResults } from "./assessment.service.js";
import { createNotificationsForUsers } from "../notification.service.js";
import { sendFcmToUsers } from "../push.service.js";
import { generateFieldAssessmentPdf } from "../../utils/field-assessment-pdf.util.js";
import { generateLogbookPdf } from "./activity.service.js";

/**
 * Validate a field assessment token.
 * If pin is provided, verifies it and returns full data (CPMKs, Logbooks, etc).
 * If no pin or wrong pin, returns minimal student info.
 */
export async function validateToken(token, pin = null) {
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
                    logbooks: {
                        orderBy: { activityDate: "asc" },
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

    if (new Date() > record.expiresAt) {
        const err = new Error("Link penilaian sudah kedaluwarsa. Silakan hubungi pihak kampus untuk mendapatkan link baru.");
        err.statusCode = 410;
        throw err;
    }

    const internship = record.internship;
    const isVerified = pin && record.pin === pin;

    // Minimal data for PIN screen
    const result = {
        internship: {
            id: internship.id,
            studentName: internship.student.user.fullName,
            studentNim: internship.student.user.identityNumber,
            companyName: internship.proposal.targetCompany?.companyName,
            isUsed: record.isUsed,
        },
        needsPin: !isVerified,
        isVerified,
    };

    if (!isVerified) {
        return result;
    }

    // Full data for authenticated portal
    const academicYearId = internship.proposal.academicYear.id;

    // Fetch FIELD-type CPMKs with rubrics
    const cpmks = await prisma.internshipCpmk.findMany({
        where: {
            academicYearId,
            assessorType: "FIELD",
        },
        include: {
            rubrics: { orderBy: { minScore: "desc" } },
        },
        orderBy: { code: "desc" },
    });

    Object.assign(result.internship, {
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
        logbooks: internship.logbooks,
        fieldAssessmentStatus: internship.fieldAssessmentStatus,
        fieldAssessmentSubmittedAt: internship.fieldAssessmentSubmittedAt,
    });

    result.cpmks = cpmks;
    result.existingScores = internship.fieldScores;

    return result;
}

/**
 * Verify PIN for a token.
 */
export async function verifyPin(token, pin) {
    const record = await prisma.fieldAssessmentToken.findUnique({
        where: { token },
        select: { pin: true },
    });

    if (!record) {
        const err = new Error("Token tidak valid.");
        err.statusCode = 404;
        throw err;
    }

    if (record.pin !== pin) {
        const err = new Error("PIN yang Anda masukkan salah.");
        err.statusCode = 401;
        throw err;
    }

    return true;
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

    // 3. Generate Assessment PDF
    let pdfDocumentId = null;
    let logbookPdfDocumentId = null;
    try {
        const academicYearId = internship.proposal.academicYear.id;
        const cpmks = await prisma.internshipCpmk.findMany({
            where: { academicYearId, assessorType: "FIELD" },
            include: { rubrics: { orderBy: { minScore: "desc" } } },
            orderBy: { code: "desc" },
        });

        // Find "KOP" template from SOP manager
        const kopTemplate = await prisma.document.findFirst({
            where: {
                fileName: { contains: "KOP" }
            },
            orderBy: { createdAt: 'desc' }
        });

        let headerPdfBuffer = null;
        if (kopTemplate) {
            try {
                const fs = await import("fs/promises");
                const path = await import("path");
                const templateBuffer = await fs.readFile(path.join(process.cwd(), kopTemplate.filePath));
                if (kopTemplate.filePath.endsWith('.docx')) {
                    const { convertDocxToPdf } = await import("../../utils/pdf.util.js");
                    headerPdfBuffer = await convertDocxToPdf(templateBuffer, "KOP.docx");
                } else if (kopTemplate.filePath.endsWith('.pdf')) {
                    headerPdfBuffer = templateBuffer;
                }
            } catch (err) {
                console.error("Gagal memuat template KOP untuk penilaian lapangan:", err);
            }
        }

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
            headerPdfBuffer,
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
    }

    // 3b. Generate Certified Logbook PDF (KP-002)
    try {
        const certifiedLogbookBuffer = await generateLogbookPdf(internship.student.user.id, signatureBase64, signatureHash);

        // Save Logbook PDF as Document
        const fs = await import("fs");
        const path = await import("path");
        const uploadsDir = path.resolve("uploads/logbooks");
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }

        const fileName = `logbook-certified-${internship.student.user.identityNumber}-${Date.now()}.pdf`;
        const filePath = path.join(uploadsDir, fileName);
        fs.writeFileSync(filePath, Buffer.from(certifiedLogbookBuffer));

        const doc = await prisma.document.create({
            data: {
                fileName,
                filePath: `uploads/logbooks/${fileName}`,
            },
        });
        logbookPdfDocumentId = doc.id;
    } catch (logbookError) {
        console.error("Gagal membuat PDF logbook tersertifikasi:", logbookError);
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
            logbookFieldSignatureHash: signatureHash,
            logbookFieldSignedAt: now,
            logbookDocumentStatus: "APPROVED",
        };

        if (pdfDocumentId) {
            updateData.fieldAssessmentDocId = pdfDocumentId;
        }

        if (logbookPdfDocumentId) {
            updateData.logbookDocumentId = logbookPdfDocumentId;
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
