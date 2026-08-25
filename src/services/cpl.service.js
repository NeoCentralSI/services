import * as repository from "../repositories/cpl.repository.js";
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

const toCplResponse = (item) => ({
    id: item.id,
    curriculumId: item.curriculumId,
    code: item.code,
    description: item.description,
    minimalScore: item.minimalScore,
    version: item.version,
    isActive: item.isActive,
    hasRelatedScores:
        item.hasRelatedScores !== undefined
            ? item.hasRelatedScores
            : item._count?.studentCplScores > 0,
    studentCplScoreCount: item._count?.studentCplScores ?? 0,
    curriculum: item.curriculum ? {
        id: item.curriculum.id,
        name: item.curriculum.name,
        startYear: item.curriculum.startYear,
        endYear: item.curriculum.endYear,
    } : null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
});

const normalizeSource = (source) => {
    if (!source) return undefined;
    const upper = String(source).toUpperCase();
    if (upper === "SIA") return "SIA";
    if (upper === "MANUAL") return "manual";
    if (upper === "manual") return "manual";
    return undefined;
};

const normalizeStatus = (status) => {
    if (!status) return undefined;
    const value = String(status).toLowerCase();
    if (["calculated", "validated", "finalized"].includes(value)) return value;
    return undefined;
};

const computeResult = (score, minimalScore) => (score >= minimalScore ? "Lulus" : "Tidak Lulus");

const normalizeCplCode = (value) => String(value || "").trim().toUpperCase();

const toCplStudentScoreResponse = (item) => ({
    cplId: item.cplId,
    studentId: item.studentId,
    score: item.score,
    source: item.source,
    sourceLabel: item.source === "SIA" ? "SIA" : "Manual",
    status: item.status,
    result: computeResult(item.score, item.cpl?.minimalScore ?? 0),
    cpl: item.cpl
        ? {
              id: item.cpl.id,
              code: item.cpl.code,
              description: item.cpl.description,
              minimalScore: item.cpl.minimalScore,
              version: item.cpl.version,
              isActive: item.cpl.isActive,
              curriculumId: item.cpl.curriculumId,
              curriculumName: item.cpl.curriculum?.name,
          }
        : null,
    student: item.student
        ? {
              id: item.student.id,
              fullName: item.student.user?.fullName,
              identityNumber: item.student.user?.identityNumber,
              email: item.student.user?.email,
          }
        : null,
    inputBy: item.inputLecturer
        ? {
              id: item.inputLecturer.id,
              fullName: item.inputLecturer.user?.fullName,
              identityNumber: item.inputLecturer.user?.identityNumber,
          }
        : null,
    validatedBy: item.validatorLecturer
        ? {
              id: item.validatorLecturer.id,
              fullName: item.validatorLecturer.user?.fullName,
              identityNumber: item.validatorLecturer.user?.identityNumber,
          }
        : null,
    validatedAt: item.validatedAt,
    finalizedAt: item.finalizedAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
});

export const getAllCpls = async (params) => {
    const { data, total } = await repository.findAll(params);
    return {
        data: data.map(toCplResponse),
        total,
    };
};

export const getCplById = async (id) => {
    const data = await repository.findById(id);
    if (!data) {
        throw new NotFoundError("Data CPL tidak ditemukan");
    }
    return toCplResponse(data);
};

export const createCpl = async (data) => {
    const code = normalizeCplCode(data.code);
    const newIsActive = data.isActive !== false;
    if (newIsActive && code && data.curriculumId) {
        const existing = await repository.findActiveByCodeAndCurriculum(code, data.curriculumId);
        if (existing) {
            throw new ValidationError(
                `Tidak dapat membuat CPL. Versi aktif dengan kode "${code}" sudah ada di kurikulum ini. Buat versi baru sebagai tidak aktif terlebih dahulu.`
            );
        }
    }

    const latestVersion = await repository.findLatestVersionByCodeAndCurriculum(
        code,
        data.curriculumId
    );
    const version = (latestVersion?.version || 0) + 1;

    let created;
    try {
        created = await repository.create({
            curriculumId: data.curriculumId,
            code,
            description: data.description.trim(),
            minimalScore: data.minimalScore,
            version,
            isActive: data.isActive !== undefined ? data.isActive : true,
        });
    } catch (error) {
        if (error?.code === "P2002") {
            throw new ValidationError(
                `Versi CPL "${code}" berubah saat diproses. Silakan ulangi pembuatan versi.`
            );
        }
        throw error;
    }

    const createdWithRelations = await repository.findById(created.id);
    return toCplResponse(createdWithRelations);
};

export const updateCpl = async (id, data) => {
    const existing = await repository.findById(id);
    if (!existing) {
        throw new NotFoundError("Data CPL tidak ditemukan");
    }

    const hasRelatedScores = existing._count.studentCplScores > 0;
    if (hasRelatedScores) {
        throw new ValidationError(
            "CPL yang sudah memiliki nilai mahasiswa tidak dapat diubah sama sekali"
        );
    }

    if (
        data.curriculumId !== undefined &&
        data.curriculumId !== existing.curriculumId
    ) {
        throw new ValidationError(
            "Kurikulum merupakan identitas versi CPL dan tidak dapat diubah. Hapus lalu buat ulang CPL jika belum digunakan."
        );
    }

    if (
        data.code !== undefined &&
        normalizeCplCode(data.code) !== existing.code
    ) {
        throw new ValidationError(
            "Kode merupakan identitas versi CPL dan tidak dapat diubah. Hapus lalu buat ulang CPL jika belum digunakan."
        );
    }

    const updateData = {};

    if (data.description !== undefined) updateData.description = data.description.trim();
    if (data.minimalScore !== undefined) updateData.minimalScore = data.minimalScore;

    if (Object.keys(updateData).length === 0) {
        return toCplResponse({
            ...existing,
            hasRelatedScores,
        });
    }

    const updated = await repository.update(id, updateData);
    const updatedWithRelations = await repository.findById(updated.id);
    return toCplResponse(updatedWithRelations);
};

export const toggleCpl = async (id) => {
    const existing = await repository.findById(id);
    if (!existing) {
        throw new NotFoundError("Data CPL tidak ditemukan");
    }

    const nextIsActive = !existing.isActive;

    if (nextIsActive && existing.code && existing.curriculumId) {
        const activeDuplicate = await repository.findActiveByCodeAndCurriculum(existing.code, existing.curriculumId, id);
        if (activeDuplicate) {
            throw new ValidationError(
                `Tidak dapat mengaktifkan ulang CPL. Versi aktif dengan kode "${existing.code}" sudah ada di kurikulum ini`
            );
        }
    }

    const updated = await repository.update(id, { isActive: nextIsActive });
    const updatedWithRelations = await repository.findById(updated.id);
    return toCplResponse(updatedWithRelations);
};

export const deleteCpl = async (id) => {
    const existing = await repository.findById(id);
    if (!existing) {
        throw new NotFoundError("Data CPL tidak ditemukan");
    }

    const hasRelated = await repository.hasRelatedScores(id);
    if (hasRelated) {
        throw new ValidationError(
            "Tidak dapat menghapus CPL karena sudah memiliki nilai CPL mahasiswa"
        );
    }

    return await repository.remove(id);
};

export const getCplStudents = async (cplId, params = {}) => {
    const cpl = await repository.findById(cplId);
    if (!cpl) {
        throw new NotFoundError("Data CPL tidak ditemukan");
    }

    const filters = {
        search: params.search || "",
        source: normalizeSource(params.source),
        status: normalizeStatus(params.status),
    };

    const rows = await repository.findStudentScoresByCplId(cplId, filters);
    return {
        cpl: toCplResponse(cpl),
        data: rows.map(toCplStudentScoreResponse),
        total: rows.length,
    };
};

export const getCplStudentOptions = async (cplId, search = "") => {
    const cpl = await repository.findById(cplId);
    if (!cpl) {
        throw new NotFoundError("Data CPL tidak ditemukan");
    }

    const rows = await repository.findStudentsNotInLogicalCpl(
        cpl.curriculumId,
        cpl.code,
        search
    );
    return rows.map((row) => ({
        id: row.id,
        fullName: row.user?.fullName,
        identityNumber: row.user?.identityNumber,
        email: row.user?.email,
    }));
};

export const createCplStudentScore = async (cplId, payload, actorUserId) => {
    const cpl = await repository.findById(cplId);
    if (!cpl) {
        throw new NotFoundError("Data CPL tidak ditemukan");
    }

    const existingLogicalScores = await repository.findStudentScoresByLogicalCpl(
        payload.studentId,
        cpl.curriculumId,
        cpl.code
    );
    if (existingLogicalScores.length > 0) {
        throw new ValidationError(
            `Mahasiswa sudah memiliki nilai ${cpl.code} pada versi lain atau versi ini`
        );
    }

    const student = await repository.findStudentById(payload.studentId);
    if (!student) {
        throw new ValidationError("Mahasiswa tidak ditemukan");
    }

    const status = payload.status || "finalized";

    const created = await repository.createStudentScore({
        studentId: payload.studentId,
        cplId,
        score: payload.score,
        source: "manual",
        status: status,
        inputBy: actorUserId || null,
        validatedBy: status === "validated" ? (actorUserId || null) : null,
        validatedAt: status === "validated" ? new Date() : null,
        finalizedAt: status === "finalized" ? new Date() : null,
    });

    const row = await repository.findStudentScoreByCplAndStudent(created.cplId, created.studentId);
    return toCplStudentScoreResponse(row);
};

export const updateCplStudentScore = async (cplId, studentId, payload, actorUserId) => {
    const existing = await repository.findStudentScoreByCplAndStudent(cplId, studentId);
    if (!existing) {
        throw new NotFoundError("Data nilai CPL mahasiswa tidak ditemukan");
    }

    if (existing.source === "SIA") {
        throw new ValidationError("Nilai dari SIA tidak dapat diubah secara manual");
    }

    const newStatus = payload.status || existing.status;

    await repository.updateStudentScore(cplId, studentId, {
        score: payload.score,
        status: newStatus,
        inputBy: existing.inputBy || actorUserId || null,
        validatedBy:
            newStatus === "validated" && existing.status !== "validated"
                ? (actorUserId || null)
                : existing.validatedBy,
        validatedAt:
            newStatus === "validated" && existing.status !== "validated"
                ? new Date()
                : existing.validatedAt,
        finalizedAt:
            newStatus === "finalized" && existing.status !== "finalized"
                ? new Date()
                : existing.finalizedAt,
    });

    const updated = await repository.findStudentScoreByCplAndStudent(cplId, studentId);
    return toCplStudentScoreResponse(updated);
};

export const deleteCplStudentScore = async (cplId, studentId) => {
    const existing = await repository.findStudentScoreByCplAndStudent(cplId, studentId);
    if (!existing) {
        throw new NotFoundError("Data nilai CPL mahasiswa tidak ditemukan");
    }

    if (existing.source === "SIA") {
        throw new ValidationError("Nilai dari SIA tidak dapat dihapus secara manual");
    }

    await repository.removeStudentScore(cplId, studentId);
};

export const importCplStudentScores = async (cplId, rows = [], actorUserId) => {
    const cpl = await repository.findById(cplId);
    if (!cpl) {
        throw new NotFoundError("Data CPL tidak ditemukan");
    }

    if (!rows.length) {
        throw new ValidationError("File import kosong");
    }

    let successCount = 0;
    const failedRows = [];

    for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index] || {};
        const rowNumber = index + 2;
        const nimRaw =
            row.NIM ?? row.nim ?? row["Nomor Induk Mahasiswa"] ?? row["Nomor Induk"] ?? "";
        const scoreRaw = row["Skor CPL"] ?? row.score ?? row.Score ?? row["Nilai CPL"];
        const nim = String(nimRaw || "").trim();

        if (!nim) {
            failedRows.push({ row: rowNumber, message: "NIM wajib diisi" });
            continue;
        }

        const score = Number(scoreRaw);
        if (!Number.isFinite(score) || !Number.isInteger(score) || score < 0 || score > 100) {
            failedRows.push({ row: rowNumber, message: "Skor CPL harus bilangan bulat 0-100" });
            continue;
        }

        const student = await repository.findStudentByIdentityNumber(nim);
        if (!student) {
            failedRows.push({ row: rowNumber, message: `Mahasiswa dengan NIM ${nim} tidak ditemukan` });
            continue;
        }

        const existingLogicalScores = await repository.findStudentScoresByLogicalCpl(
            student.id,
            cpl.curriculumId,
            cpl.code
        );
        if (existingLogicalScores.length > 0) {
            failedRows.push({
                row: rowNumber,
                message: `Nilai ${cpl.code} untuk NIM ${nim} sudah ada pada versi lain atau versi ini`,
            });
            continue;
        }

        await repository.createStudentScore({
            studentId: student.id,
            cplId,
            score,
            source: "manual",
            status: "finalized",
            inputBy: actorUserId || null,
            finalizedAt: new Date(),
        });
        successCount += 1;
    }

    return {
        cpl: toCplResponse(cpl),
        totalRows: rows.length,
        successCount,
        failedCount: failedRows.length,
        failedRows,
    };
};

const formatExportRows = (rows = []) => {
    const statusLabels = {
        calculated: "Sedang Dihitung",
        validated: "Valid",
        finalized: "Final",
    };

    return rows.map((row, index) => {
        const minimalScore = row.cpl?.minimalScore ?? 0;
        const result = computeResult(row.score, minimalScore);
        return {
            No: index + 1,
            "Kode CPL": row.cpl?.code ?? "-",
            "Versi CPL": row.cpl?.version ?? "-",
            Kurikulum: row.cpl?.curriculum?.name ?? "-",
            "Deskripsi CPL": row.cpl?.description ?? "-",
            "Nama Mahasiswa": row.student?.user?.fullName ?? "-",
            NIM: row.student?.user?.identityNumber ?? "-",
            "Skor CPL": row.score,
            "Skor Minimal": minimalScore,
            Hasil: result,
            Sumber: row.source === "SIA" ? "SIA" : "Manual",
            Status: statusLabels[row.status] || row.status,
            "Input Oleh": row.inputLecturer?.user?.fullName ?? "-",
            "Tervalidasi Oleh": row.validatorLecturer?.user?.fullName ?? "-",
            "Tanggal Validasi": row.validatedAt,
            "Tanggal Finalisasi": row.finalizedAt,
        };
    });
};

const sanitizeFilenameSegment = (value, fallback) => {
    const sanitized = String(value || "")
        .normalize("NFKD")
        .replace(/[^A-Za-z0-9 _-]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    return sanitized || fallback;
};

const getExportDate = () => new Date().toISOString().slice(0, 10);

export const buildCplStudentScoresExportWorkbookBuffer = async (cplId) => {
    const cpl = await repository.findById(cplId);
    if (!cpl) {
        throw new NotFoundError("Data CPL tidak ditemukan");
    }

    const rows = await repository.findCplScoresForExport(cplId);
    const formatted = formatExportRows(rows);
    const workbook = xlsx.utils.book_new();
    const worksheet = xlsx.utils.json_to_sheet(formatted);
    xlsx.utils.book_append_sheet(workbook, worksheet, "Nilai CPL");

    const curriculumName = sanitizeFilenameSegment(cpl.curriculum?.name, "Kurikulum");
    const cplCode = sanitizeFilenameSegment(cpl.code, "CPL");
    return {
        filename: `Nilai CPL - ${curriculumName} - ${cplCode} - Versi ${cpl.version} - ${getExportDate()}.xlsx`,
        buffer: xlsx.write(workbook, { type: "buffer", bookType: "xlsx" }),
    };
};

export const buildAllCplScoresExportWorkbookBuffer = async () => {
    const rows = await repository.findAllCplScoresForExport();
    const formatted = formatExportRows(rows);
    const workbook = xlsx.utils.book_new();
    const worksheet = xlsx.utils.json_to_sheet(formatted);
    xlsx.utils.book_append_sheet(workbook, worksheet, "Semua Nilai CPL");

    return {
        filename: `Rekap Nilai CPL - Semua Mahasiswa - ${getExportDate()}.xlsx`,
        buffer: xlsx.write(workbook, { type: "buffer", bookType: "xlsx" }),
    };
};
