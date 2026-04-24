import * as service from "../services/master-data/student-cpl-score.service.js";

export const getAllStudentCplScores = async (req, res, next) => {
    try {
        const data = await service.getStudentCplScores(req.query);
        res.status(200).json({
            success: true,
            message: "Berhasil mengambil data nilai CPL mahasiswa",
            ...data,
        });
    } catch (error) {
        next(error);
    }
};

export const getStudentCplScoreById = async (req, res, next) => {
    try {
        const { studentId, cplId } = req.params;
        const data = await service.getStudentCplScoreDetail(studentId, cplId);
        res.status(200).json({
            success: true,
            message: "Berhasil mengambil detail nilai CPL mahasiswa",
            data,
        });
    } catch (error) {
        next(error);
    }
};

export const createStudentCplScore = async (req, res, next) => {
    try {
        const actorUserId = req.user?.sub;
        const data = await service.createStudentCplScoreManual(req.validated, actorUserId);
        res.status(201).json({
            success: true,
            message: "Berhasil menambahkan nilai CPL manual",
            data,
        });
    } catch (error) {
        next(error);
    }
};

export const updateStudentCplScore = async (req, res, next) => {
    try {
        const { studentId, cplId } = req.params;
        const actorUserId = req.user?.sub;
        const data = await service.updateStudentCplScoreManual(studentId, cplId, req.validated, actorUserId);
        res.status(200).json({
            success: true,
            message: "Berhasil mengubah nilai CPL manual",
            data,
        });
    } catch (error) {
        next(error);
    }
};

export const deleteStudentCplScore = async (req, res, next) => {
    try {
        const { studentId, cplId } = req.params;
        await service.deleteStudentCplScoreManual(studentId, cplId);
        res.status(200).json({
            success: true,
            message: "Berhasil menghapus nilai CPL manual",
        });
    } catch (error) {
        next(error);
    }
};

export const importStudentCplScores = async (req, res, next) => {
    try {
        if (!req.file?.buffer) {
            const err = new Error("File excel wajib diunggah");
            err.statusCode = 400;
            throw err;
        }
        const xlsx = await import("xlsx");
        const workbook = xlsx.default.read(req.file.buffer, { type: "buffer" });
        const firstSheet = workbook.SheetNames[0];
        const rows = xlsx.default.utils.sheet_to_json(workbook.Sheets[firstSheet]);
        const actorUserId = req.user?.sub;
        const data = await service.importStudentCplScoresManual(rows, actorUserId);
        res.status(200).json({
            success: true,
            message: "Import nilai CPL manual selesai",
            data,
        });
    } catch (error) {
        next(error);
    }
};

export const downloadStudentCplScoreTemplate = async (req, res, next) => {
    try {
        const buffer = service.buildTemplateWorkbookBuffer();
        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.setHeader(
            "Content-Disposition",
            'attachment; filename="student-cpl-score-template.xlsx"'
        );
        res.status(200).send(buffer);
    } catch (error) {
        next(error);
    }
};

export const exportStudentCplScores = async (req, res, next) => {
    try {
        const buffer = await service.buildExportWorkbookBuffer();
        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.setHeader(
            "Content-Disposition",
            'attachment; filename="student-cpl-scores.xlsx"'
        );
        res.status(200).send(buffer);
    } catch (error) {
        next(error);
    }
};
