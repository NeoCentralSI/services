import {
    getParticipantCplScores,
    verifyCplScore,
    createCplRecommendation,
    updateCplRecommendationStatus,
    generateDraftSk,
    uploadSkResmi,
} from "../../services/yudisium/lecturerYudisium.service.js";

export const getCplScores = async (req, res, next) => {
    try {
        const data = await getParticipantCplScores(req.params.participantId);
        res.status(200).json({
            success: true,
            message: "Berhasil mengambil data CPL peserta",
            data,
        });
    } catch (error) {
        next(error);
    }
};

export const verifyCpl = async (req, res, next) => {
    try {
        const data = await verifyCplScore(
            req.params.participantId,
            req.params.cplId,
            req.user.id
        );
        res.status(200).json({
            success: true,
            message: "CPL berhasil divalidasi",
            data,
        });
    } catch (error) {
        next(error);
    }
};

export const createRecommendation = async (req, res, next) => {
    try {
        const { cplId, recommendation, description } = req.body;
        const data = await createCplRecommendation(req.params.participantId, cplId, {
            recommendation,
            description,
            userId: req.user.id,
        });
        res.status(201).json({
            success: true,
            message: "Rekomendasi CPL berhasil dibuat",
            data,
        });
    } catch (error) {
        next(error);
    }
};

export const updateRecommendationStatus = async (req, res, next) => {
    try {
        const { action } = req.body;
        const data = await updateCplRecommendationStatus(req.params.recommendationId, {
            action,
            userId: req.user.id,
        });
        res.status(200).json({
            success: true,
            message: `Rekomendasi berhasil di-${action}`,
            data,
        });
    } catch (error) {
        next(error);
    }
};

export const generateDraft = async (req, res, next) => {
    try {
        const pdfBuffer = await generateDraftSk(req.params.yudisiumId);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="draft-sk-yudisium.pdf"`);
        res.send(pdfBuffer);
    } catch (error) {
        next(error);
    }
};

export const uploadSk = async (req, res, next) => {
    try {
        const { eventDate, decreeNumber, decreeIssuedAt } = req.body;
        const data = await uploadSkResmi(req.params.yudisiumId, {
            file: req.file,
            eventDate,
            decreeNumber,
            decreeIssuedAt,
            userId: req.user.id,
        });
        res.status(200).json({
            success: true,
            message: "SK resmi berhasil diunggah",
            data,
        });
    } catch (error) {
        next(error);
    }
};
