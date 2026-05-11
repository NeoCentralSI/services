import {
    getStudentYudisiumOverview,
    getStudentExitSurvey,
    submitStudentExitSurvey,
    getStudentYudisiumRequirements,
    uploadYudisiumDocument,
} from "../../services/yudisium/student-yudisium.service.js";

export const getOverview = async (req, res, next) => {
    try {
        const data = await getStudentYudisiumOverview(req.user.sub);
        res.status(200).json({
            success: true,
            message: "Berhasil mengambil overview yudisium mahasiswa",
            data,
        });
    } catch (error) {
        next(error);
    }
};

export const getExitSurvey = async (req, res, next) => {
    try {
        const data = await getStudentExitSurvey(req.user.sub);
        res.status(200).json({
            success: true,
            message: "Berhasil mengambil data exit survey mahasiswa",
            data,
        });
    } catch (error) {
        next(error);
    }
};

export const submitExitSurvey = async (req, res, next) => {
    try {
        const data = await submitStudentExitSurvey(req.user.sub, req.validated);
        res.status(201).json({
            success: true,
            message: "Berhasil mengirim exit survey",
            data,
        });
    } catch (error) {
        next(error);
    }
};

export const getRequirements = async (req, res, next) => {
    try {
        const data = await getStudentYudisiumRequirements(req.user.sub);
        res.status(200).json({
            success: true,
            message: "Berhasil mengambil daftar persyaratan yudisium",
            data,
        });
    } catch (error) {
        next(error);
    }
};

export const uploadDocument = async (req, res, next) => {
    try {
        const data = await uploadYudisiumDocument(
            req.user.sub,
            req.file,
            req.body.requirementId
        );
        res.status(200).json({
            success: true,
            message: "Berhasil mengunggah dokumen yudisium",
            data,
        });
    } catch (error) {
        next(error);
    }
};
