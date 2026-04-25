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
    code: item.code,
    description: item.description,
    minimalScore: item.minimalScore,
    isActive: item.isActive,
    hasRelatedScores:
        item.hasRelatedScores !== undefined
            ? item.hasRelatedScores
            : item._count?.studentCplScores > 0,
    studentCplScoreCount: item._count?.studentCplScores ?? 0,
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
    if (["calculated", "verified", "finalized"].includes(value)) return value;
    return undefined;
};

const computeResult = (score, minimalScore) => (score >= minimalScore ? "Lulus" : "Tidak Lulus");

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
              isActive: item.cpl.isActive,
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
    inputBy: item.inputUser
        ? {
              id: item.inputUser.id,
              fullName: item.inputUser.fullName,
              identityNumber: item.inputUser.identityNumber,
          }
        : null,
    verifiedBy: item.verifier
        ? {
              id: item.verifier.id,
              fullName: item.verifier.fullName,
              identityNumber: item.verifier.identityNumber,
          }
        : null,
    verifiedAt: item.verifiedAt,
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
    const newIsActive = data.isActive !== false;
    if (newIsActive && data.code) {
        const existing = await repository.findActiveByCode(data.code);
        if (existing) {
            throw new ValidationError(
                `Tidak dapat membuat CPL. Versi aktif dengan kode "${data.code}" sudah ada`
            );
        }
    }

    const created = await repository.create({
        code: data.code,
        description: data.description,
        minimalScore: data.minimalScore,
        isActive: data.isActive !== undefined ? data.isActive : true,
    });

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

    const updateData = {};

    if (data.code !== undefined) {
        if (existing.isActive) {
            const activeDuplicate = await repository.findActiveByCode(data.code, id);
            if (activeDuplicate) {
                throw new ValidationError(
                    `Tidak dapat mengubah kode. Versi aktif dengan kode "${data.code}" sudah ada`
                );
            }
        }
        updateData.code = data.code;
    }

    if (data.description !== undefined) updateData.description = data.description;
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

    if (nextIsActive && existing.code) {
        const activeDuplicate = await repository.findActiveByCode(existing.code, id);
        if (activeDuplicate) {
            throw new ValidationError(
                `Tidak dapat mengaktifkan ulang CPL. Versi aktif dengan kode "${existing.code}" sudah ada`
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

    const rows = await repository.findStudentsNotInCpl(cplId, search);
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

    const existing = await repository.findStudentScoreByCplAndStudent(cplId, payload.studentId);
    if (existing) {
        throw new ValidationError("Mahasiswa sudah memiliki nilai pada CPL ini");
    }

    const student = await repository.findStudentById(payload.studentId);
    if (!student) {
        throw new ValidationError("Mahasiswa tidak ditemukan");
    }

    const created = await repository.createStudentScore({
        studentId: payload.studentId,
        cplId,
        score: payload.score,
        source: "manual",
        status: payload.status || "finalized",
        inputBy: actorUserId || null,
        finalizedAt: payload.status === "finalized" ? new Date() : null,
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

    await repository.updateStudentScore(cplId, studentId, {
        score: payload.score,
        status: payload.status || "finalized",
        inputBy: actorUserId || existing.inputBy || null,
        verifiedBy: payload.status === "verified" ? (actorUserId || null) : null,
        verifiedAt: payload.status === "verified" ? new Date() : null,
        finalizedAt: payload.status === "finalized" ? new Date() : null,
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

        const existing = await repository.findStudentScoreByCplAndStudent(cplId, student.id);
        if (existing) {
            failedRows.push({ row: rowNumber, message: `Nilai untuk NIM ${nim} sudah ada di CPL ini` });
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
    return rows.map((row, index) => {
        const minimalScore = row.cpl?.minimalScore ?? 0;
        const result = computeResult(row.score, minimalScore);
        return {
            No: index + 1,
            "Kode CPL": row.cpl?.code ?? "-",
            "Deskripsi CPL": row.cpl?.description ?? "-",
            "Nama Mahasiswa": row.student?.user?.fullName ?? "-",
            NIM: row.student?.user?.identityNumber ?? "-",
            "Skor CPL": row.score,
            "Skor Minimal": minimalScore,
            Hasil: result,
            Sumber: row.source === "SIA" ? "SIA" : "Manual",
            Status: row.status,
            "Input Oleh": row.inputUser?.fullName ?? "-",
            "Terverifikasi Oleh": row.verifier?.fullName ?? "-",
            "Tanggal Verifikasi": row.verifiedAt,
            "Tanggal Finalisasi": row.finalizedAt,
        };
    });
};

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

    const safeCode = (cpl.code || "CPL").replace(/[^A-Za-z0-9_-]/g, "_");
    return {
        filename: `nilai-cpl-${safeCode}.xlsx`,
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
        filename: "nilai-cpl-semua.xlsx",
        buffer: xlsx.write(workbook, { type: "buffer", bookType: "xlsx" }),
    };
};
