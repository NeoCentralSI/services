
import * as penilaianRepository from "../../repositories/insternship/penilaian.repository.js";

import crypto from "crypto";
import prisma from "../../config/prisma.js";
import { generateFieldAssessmentPdf } from "../../utils/field-assessment-pdf.util.js";
import { generateLogbookPdfFromTemplate } from "../../utils/logbook-pdf.util.js";
import { createNotificationsForUsers } from "../notification.service.js";
import { sendFcmToUsers } from "../push.service.js";
import { syncInternshipCompletionStatus } from "./internshipStatus.service.js";


/**
 * Get assessment criteria and existing scores for a lecturer.
 */
export async function getAssessmentForLecturer(lecturerId, internshipId) {
    const data = await penilaianRepository.findInternshipAssessmentData(internshipId);
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
    if (finalNumericScore >= 80) finalGrade = "A";
    else if (finalNumericScore >= 75) finalGrade = "A-";
    else if (finalNumericScore >= 70) finalGrade = "B+";
    else if (finalNumericScore >= 65) finalGrade = "B";
    else if (finalNumericScore >= 60) finalGrade = "B-";
    else if (finalNumericScore >= 55) finalGrade = "C+";
    else if (finalNumericScore >= 50) finalGrade = "C";
    else if (finalNumericScore >= 45) finalGrade = "D";

    return {
        finalNumericScore: parseFloat(finalNumericScore.toFixed(2)),
        finalGrade
    };
}

async function loadKopHeaderPdfForFieldAssessment() {
    const kopTemplates = await prisma.document.findMany({
        where: {
            fileName: { contains: "KOP" }
        },
        orderBy: { createdAt: "desc" },
        take: 10
    });

    for (const kopTemplate of kopTemplates) {
        if (!kopTemplate?.filePath) continue;

        try {
            const fs = await import("fs/promises");
            const path = await import("path");
            const { convertDocxToPdf } = await import("../../utils/pdf.util.js");
            const templatePath = path.isAbsolute(kopTemplate.filePath)
                ? kopTemplate.filePath
                : path.resolve(kopTemplate.filePath);
            const templateBuffer = await fs.readFile(templatePath);
            const lowerFilePath = kopTemplate.filePath.toLowerCase();

            if (lowerFilePath.endsWith(".docx")) {
                return convertDocxToPdf(templateBuffer, "KOP.docx");
            }

            if (lowerFilePath.endsWith(".pdf")) {
                return templateBuffer;
            }
        } catch (error) {
            const missingFile = error?.code === "ENOENT";
            const message = missingFile
                ? `Template KOP tidak ditemukan (${kopTemplate.filePath}), penilaian lapangan dan logbook dibuat tanpa KOP.`
                : `Template KOP gagal dimuat (${kopTemplate.filePath}), penilaian lapangan dan logbook dibuat tanpa KOP.`;
            console.warn(message);
        }
    }

    return null;
}

async function generateLogbookPdf(studentUserId, signatureBase64, signatureHash) {
    const internship = await prisma.internship.findFirst({
        where: {
            studentId: studentUserId,
            status: { in: ["ONGOING", "COMPLETED", "FAILED"] }
        },
        include: {
            student: {
                include: { user: { select: { fullName: true, identityNumber: true } } }
            },
            proposal: {
                include: {
                    targetCompany: { select: { companyName: true } },
                    academicYear: { select: { year: true, semester: true } }
                }
            },
            logbooks: {
                orderBy: { activityDate: "asc" }
            }
        },
        orderBy: [
            { updatedAt: "desc" },
            { createdAt: "desc" }
        ]
    });

    if (!internship) {
        throw new Error("Kegiatan Kerja Praktik aktif tidak ditemukan untuk membuat logbook.");
    }

    const headerPdfBuffer = await loadKopHeaderPdfForFieldAssessment();

    return generateLogbookPdfFromTemplate({
        studentName: internship.student.user.fullName,
        studentNim: internship.student.user.identityNumber,
        companyName: internship.proposal.targetCompany?.companyName || "-",
        fieldSupervisorName: internship.fieldSupervisorName || "-",
        academicYear: `${internship.proposal.academicYear.year} - ${internship.proposal.academicYear.semester === "ganjil" ? "Ganjil" : "Genap"}`,
        logbooks: internship.logbooks || [],
        signatureBase64,
        signatureHash,
        headerPdfBuffer
    });
}

/**
 * Submit lecturer assessment.
 */
export async function submitLecturerAssessment(lecturerId, internshipId, scores) {
    // 1. Verify supervised student
    const internship = await prisma.internship.findUnique({
        where: { id: internshipId },
        select: { 
            supervisorId: true, 
            lecturerAssessmentStatus: true,
            proposal: { select: { academicYearId: true } } 
        }
    });

    if (!internship || internship.supervisorId !== lecturerId) {
        throw new Error("Akses ditolak.");
    }

    if (internship.lecturerAssessmentStatus === 'COMPLETED') {
        throw new Error("Penilaian sudah pernah dikirim dan tidak dapat diubah lagi.");
    }

    // 2. Save scores
    // Format: [{ chosenRubricId, score }]
    await penilaianRepository.upsertLecturerScores(internshipId, scores);

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
    const result = await penilaianRepository.updateInternshipResults(internshipId, {
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

    // 7. Holistic Completion Check
    await syncInternshipCompletionStatus(internshipId);

    return result;
}

/**
 * Get all internship CPMKs.
 */
export async function getAllCpmks(academicYearId) {
    let ayId = academicYearId;
    if (!ayId) {
        const active = await prisma.academicYear.findFirst({ where: { isActive: true } });
        ayId = active?.id;
    }
    return await penilaianRepository.findAllCpmks(ayId);
}

/**
 * Get internship CPMK by ID.
 */
export async function getCpmkById(id) {
    const data = await penilaianRepository.findCpmkById(id);
    if (!data) throw new NotFoundError("Data CPMK tidak ditemukan");
    return data;
}

/**
 * Create internship CPMK.
 */
export async function createCpmk(data) {
    let ayId = data.academicYearId;
    if (!ayId) {
        const active = await getActiveYear();
        ayId = active.id;
    }

    // Check code uniqueness within academic year
    const existing = await penilaianRepository.findCpmkByCode(data.code, ayId);
    if (existing) throw new ConflictError(`Kode CPMK "${data.code}" sudah digunakan pada tahun ajaran ini`);

    // Weight validation
    const weight = parseFloat(data.weight);
    if (isNaN(weight) || weight <= 0) throw new ValidationError("Bobot harus berupa angka positif");
    if (weight > 100) throw new ValidationError("Bobot tidak boleh melebihi 100%");

    const currentTotal = await penilaianRepository.calculateTotalWeight(ayId);
    if (currentTotal + weight > 100) {
        throw new ValidationError(`Total bobot melebihi 100% (Saat ini: ${currentTotal}%, Ditambah: ${weight}%, Sisa: ${100 - currentTotal}%)`);
    }

    return await penilaianRepository.createCpmk({
        code: data.code,
        name: data.name,
        weight: weight,
        assessorType: data.assessorType,
        academicYearId: ayId
    });
}

/**
 * Update internship CPMK.
 */
export async function updateCpmk(id, data) {
    const existingCpmk = await penilaianRepository.findCpmkById(id);
    if (!existingCpmk) throw new NotFoundError("Data CPMK tidak ditemukan");

    if (data.code && data.code !== existingCpmk.code) {
        const duplicate = await penilaianRepository.findCpmkByCode(data.code, existingCpmk.academicYearId, id);
        if (duplicate) throw new ConflictError(`Kode CPMK "${data.code}" sudah digunakan pada tahun ajaran ini`);
    }

    const updateData = {};
    if (data.code !== undefined) updateData.code = data.code;
    if (data.name !== undefined) updateData.name = data.name;
    
    if (data.weight !== undefined) {
        const weight = parseFloat(data.weight);
        if (isNaN(weight) || weight <= 0) throw new ValidationError("Bobot harus berupa angka positif");
        if (weight > 100) throw new ValidationError("Bobot tidak boleh melebihi 100%");

        const currentTotalExcludeSelf = await penilaianRepository.calculateTotalWeight(existingCpmk.academicYearId, id);
        if (currentTotalExcludeSelf + weight > 100) {
            throw new ValidationError(`Total bobot melebihi 100% (CPMK lain: ${currentTotalExcludeSelf}%, Bobot baru: ${weight}%, Maksimal sisa: ${100 - currentTotalExcludeSelf}%)`);
        }
        updateData.weight = weight;
    }

    if (data.assessorType !== undefined) updateData.assessorType = data.assessorType;

    return await penilaianRepository.updateCpmk(id, updateData);
}

/**
 * Delete internship CPMK.
 */
export async function deleteCpmk(id) {
    const existing = await penilaianRepository.findCpmkById(id);
    if (!existing) throw new NotFoundError("Data CPMK tidak ditemukan");

    const hasRelated = await penilaianRepository.hasRelatedScores(id);
    if (hasRelated) {
        throw new ConflictError("Tidak dapat menghapus CPMK karena sudah memiliki data penilaian terkait");
    }

    return await penilaianRepository.deleteCpmk(id);
}

/**
 * Create rubric.
 */
export async function createRubric(data) {
    const cpmk = await penilaianRepository.findCpmkById(data.cpmkId);
    if (!cpmk) throw new NotFoundError("CPMK tidak ditemukan");

    return await penilaianRepository.createRubric({
        cpmkId: data.cpmkId,
        levelName: data.levelName,
        rubricLevelDescription: data.rubricLevelDescription,
        minScore: parseFloat(data.minScore),
        maxScore: parseFloat(data.maxScore)
    });
}

/**
 * Update rubric.
 */
export async function updateRubric(id, data) {
    const existing = await penilaianRepository.findRubricById(id);
    if (!existing) throw new NotFoundError("Rubrik tidak ditemukan");

    const updateData = {};
    if (data.levelName !== undefined) updateData.levelName = data.levelName;
    if (data.rubricLevelDescription !== undefined) updateData.rubricLevelDescription = data.rubricLevelDescription;
    if (data.minScore !== undefined) updateData.minScore = parseFloat(data.minScore);
    if (data.maxScore !== undefined) updateData.maxScore = parseFloat(data.maxScore);

    return await penilaianRepository.updateRubric(id, updateData);
}

/**
 * Delete rubric.
 */
export async function deleteRubric(id) {
    const existing = await penilaianRepository.findRubricById(id);
    if (!existing) throw new NotFoundError("Rubrik tidak ditemukan");
    
    // Optional: check if rubrics has score
    // For now we don't have direct score-rubric link in InternshipLecturerScore except as foreign key
    // repository.hasRelatedScores(existing.cpmkId) could be used as a proxy

    return await penilaianRepository.deleteRubric(id);
}

/**
 * Bulk update rubrics for a CPMK.
 */
export async function bulkUpdateRubrics(cpmkId, rubrics) {
    const cpmk = await penilaianRepository.findCpmkById(cpmkId);
    if (!cpmk) throw new NotFoundError("CPMK tidak ditemukan");

    // Validation of scores ranges: No overlaps, min < max, non-negative
    if (rubrics.length > 0) {
        // Sort by minScore to ease overlap checking
        const sorted = [...rubrics].sort((a, b) => parseFloat(a.minScore) - parseFloat(b.minScore));

        for (let i = 0; i < sorted.length; i++) {
            const current = sorted[i];
            const min = parseFloat(current.minScore);
            const max = parseFloat(current.maxScore);

            if (isNaN(min) || isNaN(max)) {
                throw new ValidationError(`Skor pada level "${current.levelName}" harus berupa angka`);
            }
            if (min < 0 || max < 0) {
                throw new ValidationError(`Skor pada level "${current.levelName}" tidak boleh negatif`);
            }
            if (min >= max) {
                throw new ValidationError(`Skor minimum (${min}) harus lebih kecil dari skor maksimum (${max}) pada level "${current.levelName}"`);
            }

            // Check overlap with next rubric
            if (i < sorted.length - 1) {
                const next = sorted[i + 1];
                const nextMin = parseFloat(next.minScore);
                if (max > nextMin) {
                    throw new ValidationError(`Range skor tumpang tindih antara level "${current.levelName}" (${min}-${max}) dan "${next.levelName}" (mulai dari ${nextMin})`);
                }
            }
        }
    }

    const formattedRubrics = rubrics.map(r => ({
        levelName: r.levelName,
        rubricLevelDescription: r.rubricLevelDescription,
        minScore: parseFloat(r.minScore),
        maxScore: parseFloat(r.maxScore)
    }));

    return await penilaianRepository.replaceRubrics(cpmkId, formattedRubrics);
}

/**
 * Duplicates all CPMKs and their rubrics from one academic year to another.
 */
export async function copyCpmks(fromYearId, toYearId) {
    if (!fromYearId || !toYearId) throw new ValidationError("Tahun ajaran asal dan tujuan wajib diisi");
    if (fromYearId === toYearId) throw new ValidationError("Tahun ajaran asal dan tujuan tidak boleh sama");

    // Check if target year exists
    const targetYear = await prisma.academicYear.findUnique({ where: { id: toYearId } });
    if (!targetYear) throw new NotFoundError("Tahun ajaran tujuan tidak ditemukan");

    // Get source CPMKs with rubrics
    const sourceCpmks = await prisma.internshipCpmk.findMany({
        where: { academicYearId: fromYearId },
        include: { rubrics: true }
    });

    if (sourceCpmks.length === 0) throw new ValidationError("Tidak ada data CPMK untuk diduplikasi dari tahun ajaran asal");

    // Transaction to ensure atomicity
    return await prisma.$transaction(async (tx) => {
        const results = [];

        for (const sourceCpmk of sourceCpmks) {
            // Create new CPMK
            const newCpmk = await tx.internshipCpmk.create({
                data: {
                    code: sourceCpmk.code,
                    name: sourceCpmk.name,
                    weight: sourceCpmk.weight,
                    assessorType: sourceCpmk.assessorType,
                    academicYearId: toYearId
                }
            });

            // Create rubrics for the new CPMK
            if (sourceCpmk.rubrics && sourceCpmk.rubrics.length > 0) {
                await tx.internshipAssessmentRubric.createMany({
                    data: sourceCpmk.rubrics.map(r => ({
                        cpmkId: newCpmk.id,
                        levelName: r.levelName,
                        rubricLevelDescription: r.rubricLevelDescription,
                        minScore: r.minScore,
                        maxScore: r.maxScore
                    }))
                });
            }

            results.push(newCpmk);
        }

        return results;
    });
}

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
        fieldAssessmentNotes: internship.fieldAssessmentNotes,
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
export async function submitFieldAssessment(token, scores, signatureBase64, notes = null) {
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
    const normalizedNotes = typeof notes === "string" && notes.trim() ? notes.trim() : null;

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

        const headerPdfBuffer = await loadKopHeaderPdfForFieldAssessment();

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
            notes: normalizedNotes,
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
            companyReportStatus: "APPROVED",
            fieldAssessmentSignatureHash: signatureHash,
            fieldAssessmentSubmittedAt: now,
            fieldAssessmentNotes: normalizedNotes,
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

    // 7. Holistic Completion Check
    await syncInternshipCompletionStatus(internshipId);

    return { internshipId, signatureHash };
}

