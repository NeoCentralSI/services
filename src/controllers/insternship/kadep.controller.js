import * as kadepService from "../../services/insternship/kadep.service.js";

/**
 * Controller to get all pending letters for Kadep.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
export async function getPendingLetters(req, res, next) {
    try {
        const data = await kadepService.getPendingLetters();
        res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Controller to approve/sign a letter.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
export async function approveLetter(req, res, next) {
    try {
        const { type, id, signaturePositions } = req.body;
        const userId = req.user.sub || req.user.id; // From authMiddleware (sub is standard for JWT)

        const data = await kadepService.approveLetter(userId, type, id, signaturePositions);

        res.status(200).json({
            success: true,
            message: "Surat berhasil disetujui dan ditandatangani.",
            data
        });
    } catch (error) {
        next(error);
    }
}
