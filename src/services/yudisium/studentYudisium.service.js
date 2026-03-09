import prisma from "../../config/prisma.js";
import path from "path";
import { mkdir, writeFile, unlink } from "fs/promises";

const REQUIRED_SKS = 146;

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

class ConflictError extends Error {
    constructor(message) {
        super(message);
        this.name = "ConflictError";
        this.statusCode = 409;
    }
}

const findStudentContext = async (userId) => {
    const student = await prisma.student.findUnique({
        where: { id: userId },
        select: {
            id: true,
            skscompleted: true,
            mandatoryCoursesCompleted: true,
            mkwuCompleted: true,
            internshipCompleted: true,
            kknCompleted: true,
            thesis: {
                orderBy: { createdAt: "desc" },
                select: {
                    id: true,
                    title: true,
                    thesisDefences: {
                        orderBy: { createdAt: "desc" },
                        select: {
                            id: true,
                            revisionFinalizedAt: true,
                            revisionFinalizedBy: true,
                        },
                    },
                },
                take: 1,
            },
        },
    });

    if (!student) {
        throw new NotFoundError("Data mahasiswa tidak ditemukan");
    }

    const currentYudisium = await prisma.yudisium.findFirst({
        where: { status: "open" },
        orderBy: [{ registrationOpenDate: "desc" }, { createdAt: "desc" }],
        select: {
            id: true,
            name: true,
            status: true,
            registrationOpenDate: true,
            registrationCloseDate: true,
            eventDate: true,
            exitSurveyForm: {
                select: {
                    id: true,
                    name: true,
                    description: true,
                    questions: {
                        orderBy: { orderNumber: "asc" },
                        select: {
                            id: true,
                            question: true,
                            questionType: true,
                            isRequired: true,
                            orderNumber: true,
                            options: {
                                orderBy: { orderNumber: "asc" },
                                select: {
                                    id: true,
                                    optionText: true,
                                    orderNumber: true,
                                },
                            },
                        },
                    },
                },
            },
        },
    });

    const thesis = student.thesis[0] ?? null;

    return { student, currentYudisium, thesis };
};

const mapStudentExitSurveyResponse = (response) => {
    if (!response) return null;
    return {
        id: response.id,
        submittedAt: response.submittedAt,
        answers: response.answers.map((a) => ({
            id: a.id,
            questionId: a.exitSurveyQuestionId,
            optionId: a.exitSurveyOptionId,
            answerText: a.answerText,
        })),
    };
};

export const getStudentYudisiumOverview = async (userId) => {
    const { student, currentYudisium, thesis } = await findStudentContext(userId);

    const latestDefence = thesis?.thesisDefences?.[0] ?? null;

    const revisionFinalized =
        !!latestDefence?.revisionFinalizedAt && !!latestDefence?.revisionFinalizedBy;

    let submittedExitSurvey = null;
    let participant = null;
    let activeRequirements = [];

    if (currentYudisium?.id) {
        activeRequirements = await prisma.yudisiumRequirement.findMany({
            where: { isActive: true },
            orderBy: [{ order: "asc" }, { createdAt: "asc" }],
            select: {
                id: true,
                name: true,
                description: true,
                notes: true,
            },
        });
    }

    if (currentYudisium?.id && thesis?.id) {
        submittedExitSurvey = await prisma.studentExitSurveyResponse.findFirst({
            where: {
                yudisiumId: currentYudisium.id,
                thesisId: thesis.id,
            },
            select: {
                id: true,
                submittedAt: true,
            },
        });

        participant = await prisma.yudisiumParticipant.findFirst({
            where: {
                yudisiumId: currentYudisium.id,
                thesisId: thesis.id,
            },
            select: {
                yudisiumParticipantRequirements: {
                    select: {
                        yudisiumRequirementId: true,
                        status: true,
                        submittedAt: true,
                        verifiedAt: true,
                        documentId: true,
                    },
                },
            },
        });
    }

    const uploadedByRequirement = new Map(
        (participant?.yudisiumParticipantRequirements ?? []).map((item) => [
            item.yudisiumRequirementId,
            item,
        ])
    );

    const requirements = activeRequirements.map((req) => {
        const submitted = uploadedByRequirement.get(req.id);
        return {
            id: req.id,
            name: req.name,
            description: req.description,
            notes: req.notes,
            isUploaded: !!submitted,
            status: submitted ? "terunggah" : "menunggu",
            submittedAt: submitted?.submittedAt ?? null,
        };
    });

    const checklist = {
        sks: {
            label: `Menyelesaikan ${REQUIRED_SKS} SKS`,
            met: (student.skscompleted ?? 0) >= REQUIRED_SKS,
            current: student.skscompleted ?? 0,
            required: REQUIRED_SKS,
        },
        revisiSidang: {
            label: "Menyelesaikan revisi sidang TA",
            met: revisionFinalized,
            revisionFinalizedAt: latestDefence?.revisionFinalizedAt ?? null,
        },
        mataKuliahWajib: {
            label: "Lulus semua mata kuliah wajib",
            met: !!student.mandatoryCoursesCompleted,
        },
        mataKuliahMkwu: {
            label: "Lulus semua mata kuliah MKWU",
            met: !!student.mkwuCompleted,
        },
        mataKuliahKerjaPraktik: {
            label: "Lulus mata kuliah kerja praktik",
            met: !!student.internshipCompleted,
        },
        mataKuliahKkn: {
            label: "Lulus mata kuliah KKN",
            met: !!student.kknCompleted,
        },
        exitSurvey: {
            label: "Mengisi Exit Survey",
            met: !!submittedExitSurvey,
            submittedAt: submittedExitSurvey?.submittedAt ?? null,
            responseId: submittedExitSurvey?.id ?? null,
        },
    };

    const allChecklistMet = Object.values(checklist).every((item) => item.met);

    return {
        yudisium: currentYudisium,
        thesis: thesis
            ? {
                id: thesis.id,
                title: thesis.title,
            }
            : null,
        checklist,
        allChecklistMet,
        requirements,
    };
};

export const getStudentExitSurvey = async (userId) => {
    const { currentYudisium, thesis } = await findStudentContext(userId);

    if (!currentYudisium) {
        throw new NotFoundError("Belum ada periode yudisium yang berlangsung");
    }

    if (!thesis?.id) {
        throw new ValidationError("Data tugas akhir mahasiswa belum tersedia");
    }

    if (!currentYudisium.exitSurveyForm) {
        throw new NotFoundError("Exit survey belum dikonfigurasi pada periode yudisium ini");
    }

    const existingResponse = await prisma.studentExitSurveyResponse.findFirst({
        where: {
            yudisiumId: currentYudisium.id,
            thesisId: thesis.id,
        },
        include: {
            answers: true,
        },
    });

    return {
        yudisium: {
            id: currentYudisium.id,
            name: currentYudisium.name,
            status: currentYudisium.status,
        },
        form: {
            id: currentYudisium.exitSurveyForm.id,
            name: currentYudisium.exitSurveyForm.name,
            description: currentYudisium.exitSurveyForm.description,
            questions: currentYudisium.exitSurveyForm.questions,
        },
        response: mapStudentExitSurveyResponse(existingResponse),
        isSubmitted: !!existingResponse,
    };
};

export const submitStudentExitSurvey = async (userId, payload) => {
    const { currentYudisium, thesis } = await findStudentContext(userId);

    if (!currentYudisium) {
        throw new NotFoundError("Belum ada periode yudisium yang berlangsung");
    }

    if (!thesis?.id) {
        throw new ValidationError("Data tugas akhir mahasiswa belum tersedia");
    }

    if (!currentYudisium.exitSurveyForm) {
        throw new NotFoundError("Exit survey belum dikonfigurasi pada periode yudisium ini");
    }

    const existingResponse = await prisma.studentExitSurveyResponse.findFirst({
        where: {
            yudisiumId: currentYudisium.id,
            thesisId: thesis.id,
        },
    });

    if (existingResponse) {
        throw new ConflictError("Exit survey sudah pernah dikirim dan tidak dapat diubah");
    }

    const questionMap = new Map(
        currentYudisium.exitSurveyForm.questions.map((q) => [q.id, q])
    );

    const answerMap = new Map();
    for (const answer of payload.answers) {
        if (!questionMap.has(answer.questionId)) {
            throw new ValidationError("Terdapat pertanyaan yang tidak valid");
        }
        if (answerMap.has(answer.questionId)) {
            throw new ValidationError("Jawaban duplikat untuk pertanyaan yang sama tidak diperbolehkan");
        }
        answerMap.set(answer.questionId, answer);
    }

    const answerRows = [];

    for (const question of currentYudisium.exitSurveyForm.questions) {
        const answer = answerMap.get(question.id);

        if (!answer) {
            if (question.isRequired) {
                throw new ValidationError(`Pertanyaan wajib belum dijawab: ${question.question}`);
            }
            continue;
        }

        if (question.questionType === "single_choice") {
            if (!answer.optionId) {
                throw new ValidationError(`Jawaban pilihan tunggal wajib diisi: ${question.question}`);
            }
            const validOption = question.options.some((o) => o.id === answer.optionId);
            if (!validOption) {
                throw new ValidationError(`Opsi tidak valid untuk pertanyaan: ${question.question}`);
            }
            answerRows.push({
                exitSurveyQuestionId: question.id,
                exitSurveyOptionId: answer.optionId,
                answerText: null,
            });
            continue;
        }

        if (question.questionType === "multiple_choice") {
            const optionIds = Array.isArray(answer.optionIds) ? [...new Set(answer.optionIds)] : [];
            if (question.isRequired && optionIds.length === 0) {
                throw new ValidationError(`Jawaban pilihan ganda wajib diisi: ${question.question}`);
            }
            for (const optionId of optionIds) {
                const validOption = question.options.some((o) => o.id === optionId);
                if (!validOption) {
                    throw new ValidationError(`Opsi tidak valid untuk pertanyaan: ${question.question}`);
                }
                answerRows.push({
                    exitSurveyQuestionId: question.id,
                    exitSurveyOptionId: optionId,
                    answerText: null,
                });
            }
            continue;
        }

        const answerText = typeof answer.answerText === "string" ? answer.answerText.trim() : "";
        if (question.isRequired && !answerText) {
            throw new ValidationError(`Jawaban teks wajib diisi: ${question.question}`);
        }
        if (answerText) {
            answerRows.push({
                exitSurveyQuestionId: question.id,
                exitSurveyOptionId: null,
                answerText,
            });
        }
    }

    if (answerRows.length === 0) {
        throw new ValidationError("Jawaban exit survey tidak boleh kosong");
    }

    const created = await prisma.$transaction(async (tx) => {
        const response = await tx.studentExitSurveyResponse.create({
            data: {
                yudisiumId: currentYudisium.id,
                thesisId: thesis.id,
                submittedAt: new Date(),
            },
        });

        await tx.studentExitSurveyAnswer.createMany({
            data: answerRows.map((row) => ({
                studentExitSurveyResponseId: response.id,
                exitSurveyQuestionId: row.exitSurveyQuestionId,
                exitSurveyOptionId: row.exitSurveyOptionId,
                answerText: row.answerText,
            })),
        });

        return await tx.studentExitSurveyResponse.findUnique({
            where: { id: response.id },
            include: { answers: true },
        });
    });

    return {
        response: mapStudentExitSurveyResponse(created),
    };
};

export const getStudentYudisiumRequirements = async (userId) => {
    const { currentYudisium, thesis } = await findStudentContext(userId);

    if (!currentYudisium) {
        throw new NotFoundError("Belum ada periode yudisium yang berlangsung");
    }

    if (!thesis?.id) {
        throw new ValidationError("Data tugas akhir mahasiswa belum tersedia");
    }

    const activeRequirements = await prisma.yudisiumRequirement.findMany({
        where: { isActive: true },
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        select: { id: true, name: true, description: true, notes: true },
    });

    const participant = await prisma.yudisiumParticipant.findFirst({
        where: { yudisiumId: currentYudisium.id, thesisId: thesis.id },
        select: {
            id: true,
            status: true,
            yudisiumParticipantRequirements: {
                select: {
                    yudisiumRequirementId: true,
                    status: true,
                    submittedAt: true,
                    verifiedAt: true,
                    notes: true,
                    documentId: true,
                    document: { select: { id: true, fileName: true, filePath: true } },
                },
            },
        },
    });

    const uploadedMap = new Map(
        (participant?.yudisiumParticipantRequirements ?? []).map((r) => [r.yudisiumRequirementId, r])
    );

    const requirements = activeRequirements.map((req) => {
        const uploaded = uploadedMap.get(req.id);
        return {
            id: req.id,
            name: req.name,
            description: req.description,
            notes: req.notes,
            status: uploaded?.status ?? null,
            submittedAt: uploaded?.submittedAt ?? null,
            verifiedAt: uploaded?.verifiedAt ?? null,
            validationNotes: uploaded?.notes ?? null,
            document: uploaded?.document
                ? { id: uploaded.document.id, fileName: uploaded.document.fileName, filePath: uploaded.document.filePath }
                : null,
        };
    });

    return {
        yudisiumId: currentYudisium.id,
        participantId: participant?.id ?? null,
        participantStatus: participant?.status ?? null,
        requirements,
    };
};

export const uploadYudisiumDocument = async (userId, file, requirementId) => {
    if (!file) {
        throw new ValidationError("File dokumen wajib diunggah");
    }

    if (!requirementId) {
        throw new ValidationError("ID persyaratan wajib diisi");
    }

    const { currentYudisium, thesis } = await findStudentContext(userId);

    if (!currentYudisium) {
        throw new NotFoundError("Belum ada periode yudisium yang berlangsung");
    }

    if (!thesis?.id) {
        throw new ValidationError("Data tugas akhir mahasiswa belum tersedia");
    }

    const requirement = await prisma.yudisiumRequirement.findUnique({
        where: { id: requirementId },
    });

    if (!requirement || !requirement.isActive) {
        throw new ValidationError("Persyaratan yudisium tidak valid atau sudah tidak aktif");
    }

    // Get or auto-create participant on first upload
    let participant = await prisma.yudisiumParticipant.findFirst({
        where: { yudisiumId: currentYudisium.id, thesisId: thesis.id },
    });

    if (!participant) {
        participant = await prisma.yudisiumParticipant.create({
            data: {
                thesisId: thesis.id,
                yudisiumId: currentYudisium.id,
                registeredAt: new Date(),
                status: "registered",
            },
        });
    }

    // Check if already approved (block re-upload)
    const existing = await prisma.yudisiumParticipantRequirement.findUnique({
        where: {
            yudisiumParticipantId_yudisiumRequirementId: {
                yudisiumParticipantId: participant.id,
                yudisiumRequirementId: requirementId,
            },
        },
    });

    if (existing?.status === "approved") {
        throw new ConflictError("Dokumen ini sudah diverifikasi dan tidak dapat diubah");
    }

    // Prepare upload directory
    const uploadsRoot = path.join(process.cwd(), "uploads", "yudisium", currentYudisium.id, participant.id);
    await mkdir(uploadsRoot, { recursive: true });

    // Delete old file if re-uploading
    if (existing?.documentId) {
        try {
            const oldDoc = await prisma.document.findUnique({
                where: { id: existing.documentId },
                select: { filePath: true },
            });
            if (oldDoc?.filePath) {
                await unlink(path.join(process.cwd(), oldDoc.filePath));
            }
            await prisma.document.delete({ where: { id: existing.documentId } });
        } catch (delErr) {
            console.warn("Could not delete old yudisium document:", delErr.message);
        }
    }

    // Write file to disk
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `${requirement.name.replace(/\s+/g, "-").toLowerCase()}${ext}`;
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

    // Upsert participant requirement
    await prisma.yudisiumParticipantRequirement.upsert({
        where: {
            yudisiumParticipantId_yudisiumRequirementId: {
                yudisiumParticipantId: participant.id,
                yudisiumRequirementId: requirementId,
            },
        },
        create: {
            yudisiumParticipantId: participant.id,
            yudisiumRequirementId: requirementId,
            documentId: document.id,
            status: "submitted",
            submittedAt: new Date(),
        },
        update: {
            documentId: document.id,
            status: "submitted",
            submittedAt: new Date(),
            notes: null,
            verifiedAt: null,
            verifiedBy: null,
        },
    });

    return {
        documentId: document.id,
        requirementId,
        fileName: file.originalname,
        status: "submitted",
    };
};
