import * as service from "../services/cpl.service.js";

export const getAll = async (req, res, next) => {
    try {
        const { data, total } = await service.getAllCpls(req.query);
        res.status(200).json({
            success: true,
            message: "Berhasil mengambil data CPL",
            data,
            total,
        });
    } catch (error) {
        next(error);
    }
};

export const getById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const data = await service.getCplById(id);
        res.status(200).json({
            success: true,
            message: "Berhasil mengambil detail CPL",
            data,
        });
    } catch (error) {
        next(error);
    }
};

export const create = async (req, res, next) => {
    try {
        const data = await service.createCpl(req.validated);
        res.status(201).json({
            success: true,
            message: "Berhasil menambah data CPL",
            data,
        });
    } catch (error) {
        next(error);
    }
};

export const update = async (req, res, next) => {
    try {
        const { id } = req.params;
        const data = await service.updateCpl(id, req.validated);
        res.status(200).json({
            success: true,
            message: "Berhasil mengubah data CPL",
            data,
        });
    } catch (error) {
        next(error);
    }
};

export const toggle = async (req, res, next) => {
    try {
        const { id } = req.params;
        const data = await service.toggleCpl(id);
        res.status(200).json({
            success: true,
            message: data.isActive ? "CPL berhasil diaktifkan" : "CPL berhasil dinonaktifkan",
            data,
        });
    } catch (error) {
        next(error);
    }
};

export const remove = async (req, res, next) => {
    try {
        const { id } = req.params;
        await service.deleteCpl(id);
        res.status(200).json({
            success: true,
            message: "Berhasil menghapus data CPL",
        });
    } catch (error) {
        next(error);
    }
};

export const getCplStudents = async (req, res, next) => {
    try {
        const { id } = req.params;
        const data = await service.getCplStudents(id, req.query);
        res.status(200).json({
            success: true,
            message: "Berhasil mengambil daftar mahasiswa pada CPL",
            ...data,
        });
    } catch (error) {
        next(error);
    }
};

export const getCplStudentOptions = async (req, res, next) => {
    try {
        const { id } = req.params;
        const data = await service.getCplStudentOptions(id, req.query?.search || "");
        res.status(200).json({
            success: true,
            message: "Berhasil mengambil opsi mahasiswa untuk CPL",
            data,
        });
    } catch (error) {
        next(error);
    }
};

export const createCplStudentScore = async (req, res, next) => {
    try {
        const { id } = req.params;
        const actorUserId = req.user?.sub || req.user?.id;
        const data = await service.createCplStudentScore(id, req.validated, actorUserId);
        res.status(201).json({
            success: true,
            message: "Berhasil menambahkan nilai CPL mahasiswa",
            data,
        });
    } catch (error) {
        next(error);
    }
};

export const updateCplStudentScore = async (req, res, next) => {
    try {
        const { id, studentId } = req.params;
        const actorUserId = req.user?.sub || req.user?.id;
        const data = await service.updateCplStudentScore(id, studentId, req.validated, actorUserId);
        res.status(200).json({
            success: true,
            message: "Berhasil mengubah nilai CPL mahasiswa",
            data,
        });
    } catch (error) {
        next(error);
    }
};

export const deleteCplStudentScore = async (req, res, next) => {
    try {
        const { id, studentId } = req.params;
        await service.deleteCplStudentScore(id, studentId);
        res.status(200).json({
            success: true,
            message: "Berhasil menghapus nilai CPL mahasiswa",
        });
    } catch (error) {
        next(error);
    }
};

export const importCplStudentScores = async (req, res, next) => {
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
        const { id } = req.params;
        const actorUserId = req.user?.sub || req.user?.id;

        const data = await service.importCplStudentScores(id, rows, actorUserId);
        res.status(200).json({
            success: true,
            message: "Import nilai CPL per mahasiswa selesai",
            data,
        });
    } catch (error) {
        next(error);
    }
};

export const exportCplStudentScores = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { buffer, filename } = await service.buildCplStudentScoresExportWorkbookBuffer(id);
        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.status(200).send(buffer);
    } catch (error) {
        next(error);
    }
};

export const exportAllCplScores = async (req, res, next) => {
    try {
        const { buffer, filename } = await service.buildAllCplScoresExportWorkbookBuffer();
        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.status(200).send(buffer);
    } catch (error) {
        next(error);
    }
};
