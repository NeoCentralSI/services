import {
    getAdminYudisiumEvents,
    getAdminYudisiumParticipants,
    getAdminYudisiumParticipantDetail,
    validateYudisiumDocument,
} from "../../services/yudisium/admin-yudisium.service.js";

export const getEvents = async (req, res, next) => {
    try {
        const data = await getAdminYudisiumEvents();
        res.status(200).json({
            success: true,
            message: "Berhasil mengambil daftar yudisium",
            data,
        });
    } catch (error) {
        next(error);
    }
};

export const getParticipants = async (req, res, next) => {
    try {
        const data = await getAdminYudisiumParticipants(req.params.yudisiumId);
        res.status(200).json({
            success: true,
            message: "Berhasil mengambil daftar peserta yudisium",
            data,
        });
    } catch (error) {
        next(error);
    }
};

export const getParticipantDetail = async (req, res, next) => {
    try {
        const data = await getAdminYudisiumParticipantDetail(req.params.participantId);
        res.status(200).json({
            success: true,
            message: "Berhasil mengambil detail peserta yudisium",
            data,
        });
    } catch (error) {
        next(error);
    }
};

export const validateDocument = async (req, res, next) => {
    try {
        const { participantId, requirementId } = req.params;
        const { action, notes } = req.body;
        const userId = req.user.id;
        const data = await validateYudisiumDocument(participantId, requirementId, {
            action,
            notes,
            userId,
        });
        res.status(200).json({
            success: true,
            message: `Dokumen berhasil di-${action === "approve" ? "setujui" : "tolak"}`,
            data,
        });
    } catch (error) {
        next(error);
    }
};
