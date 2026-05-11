import prisma from "../../config/prisma.js";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import path from "path";
import { mkdir, writeFile } from "fs/promises";

class NotFoundError extends Error {
    constructor(message) {
        super(message);
        this.name = "NotFoundError";
        this.statusCode = 404;
    }
}

class ValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = "ValidationError";
        this.statusCode = 400;
    }
}

// ──────────────────── CPL Scores ────────────────────

export const getParticipantCplScores = async (participantId) => {
    const participant = await prisma.yudisiumParticipant.findUnique({
        where: { id: participantId },
        select: {
            id: true,
            status: true,
            thesis: {
                select: {
                    student: { select: { id: true } },
                },
            },
        },
    });

    if (!participant) {
        throw new NotFoundError("Peserta yudisium tidak ditemukan");
    }

    const studentId = participant.thesis?.student?.id;
    if (!studentId) {
        throw new NotFoundError("Data mahasiswa tidak ditemukan");
    }

    const cpls = await prisma.cpl.findMany({
        where: { isActive: true },
        orderBy: { displayOrder: "asc" },
        select: {
            id: true,
            code: true,
            description: true,
            minimalScore: true,
        },
    });

    const scores = await prisma.studentCplScore.findMany({
        where: { studentId },
        select: {
            cplId: true,
            score: true,
            status: true,
        },
    });

    const scoreMap = new Map(scores.map((s) => [s.cplId, s]));

    const recommendations = await prisma.yudisiumCplRecommendation.findMany({
        where: { yudisiumParticipantId: participantId },
        select: {
            id: true,
            cplId: true,
            reccomendation: true,
            description: true,
            status: true,
            resolvedAt: true,
            createdAt: true,
            creator: { select: { fullName: true } },
            resolver: { select: { fullName: true } },
        },
        orderBy: { createdAt: "asc" },
    });

    const cplScores = cpls.map((cpl) => {
        const sc = scoreMap.get(cpl.id);
        const passed = sc ? sc.score >= cpl.minimalScore : false;
        return {
            cplId: cpl.id,
            code: cpl.code,
            description: cpl.description,
            score: sc?.score ?? null,
            minimalScore: cpl.minimalScore,
            status: sc?.status ?? "calculated",
            passed,
        };
    });

    return {
        participantId,
        participantStatus: participant.status,
        cplScores,
        recommendations: recommendations.map((r) => ({
            id: r.id,
            cplId: r.cplId,
            recommendation: r.reccomendation,
            description: r.description,
            status: r.status,
            resolvedAt: r.resolvedAt,
            createdAt: r.createdAt,
            createdBy: r.creator?.fullName ?? null,
            resolvedBy: r.resolver?.fullName ?? null,
        })),
    };
};

// ──────────────────── Verify CPL Score ────────────────────

export const verifyCplScore = async (participantId, cplId, userId) => {
    const participant = await prisma.yudisiumParticipant.findUnique({
        where: { id: participantId },
        select: {
            id: true,
            status: true,
            thesis: { select: { student: { select: { id: true } } } },
        },
    });

    if (!participant) {
        throw new NotFoundError("Peserta yudisium tidak ditemukan");
    }

    const studentId = participant.thesis?.student?.id;
    if (!studentId) {
        throw new NotFoundError("Data mahasiswa tidak ditemukan");
    }

    const score = await prisma.studentCplScore.findUnique({
        where: { studentId_cplId: { studentId, cplId } },
    });

    if (!score) {
        throw new NotFoundError("Skor CPL mahasiswa tidak ditemukan");
    }

    if (score.status === "verified") {
        throw new ValidationError("CPL ini sudah tervalidasi");
    }

    await prisma.studentCplScore.update({
        where: { studentId_cplId: { studentId, cplId } },
        data: {
            status: "verified",
            verifiedBy: userId,
            verifiedAt: new Date(),
        },
    });

    // Check if ALL active CPLs are now verified for this student
    const activeCpls = await prisma.cpl.findMany({
        where: { isActive: true },
        select: { id: true },
    });

    const allScores = await prisma.studentCplScore.findMany({
        where: { studentId },
        select: { cplId: true, status: true },
    });

    const scoreStatusMap = new Map(allScores.map((s) => [s.cplId, s.status]));
    const allVerified = activeCpls.every(
        (cpl) => scoreStatusMap.get(cpl.id) === "verified"
    );

    // If all CPL verified and participant is under_review, transition to approved
    if (allVerified && participant.status === "under_review") {
        await prisma.yudisiumParticipant.update({
            where: { id: participantId },
            data: { status: "approved" },
        });
    }

    return { cplId, status: "verified", allCplVerified: allVerified };
};

// ──────────────────── Create CPL Recommendation ────────────────────

export const createCplRecommendation = async (participantId, cplId, { recommendation, description, userId }) => {
    const participant = await prisma.yudisiumParticipant.findUnique({
        where: { id: participantId },
        select: { id: true },
    });

    if (!participant) {
        throw new NotFoundError("Peserta yudisium tidak ditemukan");
    }

    const cpl = await prisma.cpl.findUnique({ where: { id: cplId } });
    if (!cpl) {
        throw new NotFoundError("CPL tidak ditemukan");
    }

    const created = await prisma.yudisiumCplRecommendation.create({
        data: {
            yudisiumParticipantId: participantId,
            cplId,
            reccomendation: recommendation || null,
            description: description || null,
            status: "in_progress",
            createdBy: userId,
        },
    });

    return { id: created.id, status: created.status };
};

// ──────────────────── Resolve / Unresolve CPL Recommendation ────────────────────

export const updateCplRecommendationStatus = async (recommendationId, { action, userId }) => {
    const rec = await prisma.yudisiumCplRecommendation.findUnique({
        where: { id: recommendationId },
    });

    if (!rec) {
        throw new NotFoundError("Rekomendasi CPL tidak ditemukan");
    }

    if (action === "resolve") {
        if (rec.status === "resolved") {
            throw new ValidationError("Rekomendasi sudah berstatus resolved");
        }
        await prisma.yudisiumCplRecommendation.update({
            where: { id: recommendationId },
            data: {
                status: "resolved",
                resolvedBy: userId,
                resolvedAt: new Date(),
            },
        });
        return { id: recommendationId, status: "resolved" };
    }

    if (action === "unresolve") {
        if (rec.status !== "resolved") {
            throw new ValidationError("Hanya rekomendasi resolved yang bisa di-unresolve");
        }
        await prisma.yudisiumCplRecommendation.update({
            where: { id: recommendationId },
            data: {
                status: "in_progress",
                resolvedBy: null,
                resolvedAt: null,
            },
        });
        return { id: recommendationId, status: "in_progress" };
    }

    throw new ValidationError('Action harus "resolve" atau "unresolve"');
};

// ──────────────────── Generate Draft SK ────────────────────

export const generateDraftSk = async (yudisiumId) => {
    const yudisium = await prisma.yudisium.findUnique({
        where: { id: yudisiumId },
        select: {
            id: true,
            name: true,
            status: true,
            eventDate: true,
            participants: {
                select: {
                    id: true,
                    status: true,
                    thesis: {
                        select: {
                            title: true,
                            student: {
                                select: {
                                    user: {
                                        select: { fullName: true, identityNumber: true },
                                    },
                                },
                            },
                        },
                    },
                },
                orderBy: { registeredAt: "asc" },
            },
        },
    });

    if (!yudisium) {
        throw new NotFoundError("Periode yudisium tidak ditemukan");
    }

    // Build PDF with pdf-lib
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontSize = 10;
    const margin = 50;

    const addPage = () => {
        const page = pdfDoc.addPage([595, 842]); // A4
        return page;
    };

    let page = addPage();
    const { width, height } = page.getSize();
    let y = height - margin;

    const drawText = (text, { x = margin, size = fontSize, f = font, color = rgb(0, 0, 0) } = {}) => {
        if (y < margin + 30) {
            page = addPage();
            y = height - margin;
        }
        page.drawText(text, { x, y, size, font: f, color });
        y -= size + 4;
    };

    // Header
    drawText("DRAFT SURAT KEPUTUSAN YUDISIUM", { size: 14, f: fontBold, x: margin });
    y -= 10;
    drawText(`Periode: ${yudisium.name}`, { size: 11 });
    drawText(`Tanggal Generate: ${new Date().toLocaleDateString("id-ID", { dateStyle: "long" })}`, { size: 11 });
    if (yudisium.eventDate) {
        drawText(`Tanggal Yudisium: ${new Date(yudisium.eventDate).toLocaleDateString("id-ID", { dateStyle: "long" })}`, { size: 11 });
    }
    y -= 15;

    // Participant table header
    drawText("DAFTAR PESERTA YUDISIUM", { size: 12, f: fontBold });
    y -= 5;

    // Table header
    const colX = [margin, margin + 30, margin + 130, margin + 280, margin + 420];
    const headers = ["No", "NIM", "Nama", "Judul TA", "Status"];
    headers.forEach((h, i) => {
        page.drawText(h, { x: colX[i], y, size: 9, font: fontBold });
    });
    y -= 14;

    // Draw line
    page.drawLine({
        start: { x: margin, y: y + 10 },
        end: { x: width - margin, y: y + 10 },
        thickness: 0.5,
    });

    const STATUS_LABELS = {
        registered: "Terdaftar",
        under_review: "Dalam Review",
        approved: "Disetujui",
        rejected: "Ditolak",
        finalized: "Selesai",
    };

    yudisium.participants.forEach((p, idx) => {
        if (y < margin + 30) {
            page = addPage();
            y = height - margin;
        }

        const nim = p.thesis?.student?.user?.identityNumber || "-";
        const name = p.thesis?.student?.user?.fullName || "-";
        const title = p.thesis?.title || "-";
        const truncTitle = title.length > 30 ? title.substring(0, 27) + "..." : title;
        const status = STATUS_LABELS[p.status] || p.status;

        const rowData = [String(idx + 1), nim, name, truncTitle, status];
        rowData.forEach((text, i) => {
            page.drawText(text, { x: colX[i], y, size: 8, font });
        });
        y -= 13;
    });

    y -= 20;
    drawText(`Total Peserta: ${yudisium.participants.length}`, { size: 10, f: fontBold });

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
};

// ──────────────────── Upload SK Resmi ────────────────────

export const uploadSkResmi = async (yudisiumId, { file, eventDate, decreeNumber, decreeIssuedAt, userId }) => {
    if (!file) {
        throw new ValidationError("File SK wajib diunggah");
    }

    const yudisium = await prisma.yudisium.findUnique({
        where: { id: yudisiumId },
    });

    if (!yudisium) {
        throw new NotFoundError("Periode yudisium tidak ditemukan");
    }

    // Save file to disk
    const uploadsRoot = path.join(process.cwd(), "uploads", "yudisium", yudisiumId);
    await mkdir(uploadsRoot, { recursive: true });

    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `sk-resmi-${yudisiumId}${ext}`;
    const absolutePath = path.join(uploadsRoot, safeName);
    await writeFile(absolutePath, file.buffer);

    const relPath = path.relative(process.cwd(), absolutePath).replace(/\\/g, "/");

    // Create document record
    const document = await prisma.document.create({
        data: {
            userId,
            fileName: file.originalname,
            filePath: relPath,
        },
    });

    // Update yudisium
    const updateData = {
        documentId: document.id,
        decreeUploadedBy: userId,
    };

    if (eventDate) {
        updateData.eventDate = new Date(eventDate);
    }
    if (decreeNumber) {
        updateData.decreeNumber = decreeNumber;
    }
    if (decreeIssuedAt) {
        updateData.decreeIssuedAt = new Date(decreeIssuedAt);
    }

    await prisma.yudisium.update({
        where: { id: yudisiumId },
        data: updateData,
    });

    return {
        documentId: document.id,
        fileName: file.originalname,
    };
};
