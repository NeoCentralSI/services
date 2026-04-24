import * as repository from "../../repositories/student-cpl-score.repository.js";
import xlsx from "xlsx";

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

const mapScore = (item) => ({
    studentId: item.studentId,
    cplId: item.cplId,
    score: item.score,
    source: item.source,
    status: item.status,
    inputBy: item.inputBy,
    inputAt: item.inputAt,
    verifiedBy: item.verifiedBy,
    verifiedAt: item.verifiedAt,
    finalizedAt: item.finalizedAt,
    updatedAt: item.updatedAt,
    student: item.student
        ? {
            id: item.student.id,
            fullName: item.student.user?.fullName ?? null,
            identityNumber: item.student.user?.identityNumber ?? null,
            email: item.student.user?.email ?? null,
        }
        : null,
    cpl: item.cpl
        ? {
            id: item.cpl.id,
            code: item.cpl.code,
            description: item.cpl.description,
            minimalScore: item.cpl.minimalScore,
            isActive: item.cpl.isActive,
        }
        : null,
    inputUser: item.inputUser
        ? {
            id: item.inputUser.id,
            fullName: item.inputUser.fullName,
            identityNumber: item.inputUser.identityNumber,
        }
        : null,
    verifier: item.verifier
        ? {
            id: item.verifier.id,
            fullName: item.verifier.fullName,
            identityNumber: item.verifier.identityNumber,
        }
        : null,
});

const normalizeSource = (source) => {
    if (!source) return undefined;
    if (source === "SIA" || source === "manual") return source;
    if (String(source).toUpperCase() === "MANUAL") return "manual";
    throw new ValidationError("Source harus SIA atau MANUAL");
};

const validateScoreValue = (score) => {
    if (!Number.isInteger(score) || score < 0 || score > 100) {
        throw new ValidationError("Skor harus bilangan bulat dalam rentang 0-100");
    }
};

const ensureStudentExists = async (studentId) => {
    const student = await repository.findStudentById(studentId);
    if (!student) throw new NotFoundError("Mahasiswa tidak ditemukan");
    return student;
};

const ensureActiveCplExists = async (cplId) => {
    const cpl = await repository.findCplById(cplId);
    if (!cpl) throw new NotFoundError("CPL tidak ditemukan");
    if (!cpl.isActive) throw new ValidationError("CPL tidak aktif");
    return cpl;
};

const ensureNoExistingScore = async (studentId, cplId) => {
    const existing = await repository.findById(studentId, cplId);
    if (existing) {
        throw new ValidationError(
            `Nilai CPL untuk studentId ${studentId} dan cplId ${cplId} sudah ada (source: ${existing.source})`
        );
    }
};

const ensureManualEditableRecord = (existing) => {
    if (!existing) {
        throw new NotFoundError("Data nilai CPL mahasiswa tidak ditemukan");
    }
    if (existing.source !== "manual") {
        throw new ValidationError("Data sumber SIA tidak dapat diubah atau dihapus");
    }
};

export const getStudentCplScores = async (filters = {}) => {
    const rows = await repository.findAll({
        studentId: filters.studentId,
        cplId: filters.cplId,
        source: normalizeSource(filters.source),
        status: filters.status,
    });
    return { data: rows.map(mapScore), total: rows.length };
};

export const getStudentCplScoreDetail = async (studentId, cplId) => {
    const row = await repository.findById(studentId, cplId);
    if (!row) throw new NotFoundError("Data nilai CPL mahasiswa tidak ditemukan");
    return mapScore(row);
};

export const createStudentCplScoreManual = async (payload, actorUserId) => {
    validateScoreValue(payload.score);
    await ensureStudentExists(payload.studentId);
    await ensureActiveCplExists(payload.cplId);
    await ensureNoExistingScore(payload.studentId, payload.cplId);

    await repository.create({
        studentId: payload.studentId,
        cplId: payload.cplId,
        score: payload.score,
        source: "manual",
        status: "calculated",
        inputBy: actorUserId,
        inputAt: new Date(),
    });

    const created = await repository.findById(payload.studentId, payload.cplId);
    return mapScore(created);
};

export const updateStudentCplScoreManual = async (studentId, cplId, payload, actorUserId) => {
    validateScoreValue(payload.score);
    const existing = await repository.findById(studentId, cplId);
    ensureManualEditableRecord(existing);

    if (existing.finalizedAt) {
        throw new ValidationError("Data yang sudah difinalisasi tidak dapat diubah");
    }

    await repository.update(studentId, cplId, {
        score: payload.score,
        inputBy: actorUserId,
        inputAt: new Date(),
        verifiedBy: null,
        verifiedAt: null,
        finalizedAt: null,
        status: "calculated",
    });

    const updated = await repository.findById(studentId, cplId);
    return mapScore(updated);
};

export const deleteStudentCplScoreManual = async (studentId, cplId) => {
    const existing = await repository.findById(studentId, cplId);
    ensureManualEditableRecord(existing);
    await repository.remove(studentId, cplId);
};

export const importStudentCplScoresManual = async (rows, actorUserId) => {
    if (!Array.isArray(rows) || rows.length === 0) {
        throw new ValidationError("File import kosong atau tidak valid");
    }

    const result = {
        total: rows.length,
        success: 0,
        failed: 0,
        failedRows: [],
    };

    for (let i = 0; i < rows.length; i += 1) {
        const rowNumber = i + 2;
        const row = rows[i] ?? {};

        try {
            const studentId = String(row.studentId ?? row["studentId"] ?? "").trim();
            const cplCode = String(row.cplCode ?? row["cplCode"] ?? "").trim();
            const score = Number(row.score ?? row["score"]);

            if (!studentId) throw new ValidationError("studentId wajib diisi");
            if (!cplCode) throw new ValidationError("cplCode wajib diisi");
            validateScoreValue(score);

            await ensureStudentExists(studentId);
            const cpl = await repository.findCplByCode(cplCode);
            if (!cpl) throw new ValidationError(`CPL aktif dengan kode ${cplCode} tidak ditemukan`);
            await ensureNoExistingScore(studentId, cpl.id);

            await repository.create({
                studentId,
                cplId: cpl.id,
                score,
                source: "manual",
                status: "calculated",
                inputBy: actorUserId,
                inputAt: new Date(),
            });

            result.success += 1;
        } catch (error) {
            result.failed += 1;
            result.failedRows.push({
                row: rowNumber,
                studentId: row.studentId ?? null,
                cplCode: row.cplCode ?? null,
                error: error.message,
            });
        }
    }

    return result;
};

export const buildTemplateWorkbookBuffer = () => {
    const rows = [{ studentId: "", cplCode: "", score: "" }];
    const worksheet = xlsx.utils.json_to_sheet(rows, {
        header: ["studentId", "cplCode", "score"],
    });
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "Template");
    return xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
};

export const buildExportWorkbookBuffer = async () => {
    const { data } = await getStudentCplScores({});
    const rows = data.map((item) => ({
        studentId: item.studentId,
        studentName: item.student?.fullName ?? "",
        studentNim: item.student?.identityNumber ?? "",
        cplCode: item.cpl?.code ?? "",
        score: item.score,
        source: item.source === "manual" ? "MANUAL" : item.source,
        status: item.status,
    }));
    const worksheet = xlsx.utils.json_to_sheet(rows);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "Student CPL Scores");
    return xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
};
