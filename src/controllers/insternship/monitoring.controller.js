
import * as pendaftaranService from "../../services/insternship/pendaftaran.service.js";
import * as penunjukanPembimbingService from "../../services/insternship/penunjukan-pembimbing.service.js";
import * as pelaksanaanService from "../../services/insternship/pelaksanaan.service.js";
import * as bimbinganService from "../../services/insternship/bimbingan.service.js";
import * as seminarService from "../../services/insternship/seminar.service.js";
import * as penilaianService from "../../services/insternship/penilaian.service.js";
import * as monitoringService from "../../services/insternship/monitoring.service.js";

import path from "path";
import fs from "fs";

// Legacy imports removed during refactor


/**
 * Controller to get all internships for Sekdep.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
export async function getInternshipList(req, res, next) {
    try {
        const { academicYear, status, supervisorId, q, page = 1, pageSize = 10, sortBy, sortOrder } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(pageSize);
        const take = parseInt(pageSize);

        const { data, total } = await monitoringService.listInternships({
            academicYearId: academicYear,
            status,
            supervisorId,
            q,
            skip,
            take,
            sortBy,
            sortOrder
        });
        res.status(200).json({
            success: true,
            data,
            total
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Controller to get full detail of an internship for Sekdep.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
export async function getInternshipDetail(req, res, next) {
    try {
        const { id } = req.params;
        const data = await monitoringService.getInternshipDetail(id);
        res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Controller to verify an internship document.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
export async function verifyDocument(req, res, next) {
    try {
        const { id } = req.params;
        const { documentType, status, notes } = req.body;
        await monitoringService.verifyInternshipDocument(id, { documentType, status, notes });
        res.status(200).json({
            success: true,
            message: "Verifikasi dokumen berhasil disimpan."
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Controller to bulk verify multiple internship documents.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
export async function bulkVerifyDocuments(req, res, next) {
    try {
        const { id } = req.params;
        const { documents, status, notes } = req.body;
        
        if (!documents || !Array.isArray(documents) || documents.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Dokumen yang akan diverifikasi harus berupa array dan tidak boleh kosong."
            });
        }

        const result = await monitoringService.bulkVerifyInternshipDocuments(id, { documents, status, notes });
        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
}

/**
 * Send field assessment link to field supervisor.
 * POST /sekdep/internships/:id/send-field-assessment
 */
export async function sendFieldAssessment(req, res, next) {
    try {
        const { id } = req.params;
        const result = await monitoringService.sendFieldAssessmentRequest(id);
        res.status(200).json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
}

/**
 * Reject the approved internship report (Sekdep).
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
export async function rejectFinalReport(req, res, next) {
    try {
        const { id } = req.params;
        const { notes } = req.body;
        
        await monitoringService.rejectFinalReport(id, notes);
        res.status(200).json({
            success: true,
            message: "Laporan akhir berhasil ditolak dan dikembalikan ke mahasiswa."
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Get internship monitoring statistics.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
export async function getMonitoringStats(req, res, next) {
    try {
        const { academicYearId } = req.query;
        const data = await monitoringService.getInternshipMonitoringStats(academicYearId);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

/**
 * Get detailed student monitoring list for deadline tracking.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
export async function getMonitoringList(req, res, next) {
    try {
        const { academicYearId } = req.query;
        const data = await monitoringService.getDetailedMonitoringList(academicYearId);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

/**
 * Controller to get all internships for Sekdep.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */


/**
 * Controller to get full detail of an internship for Sekdep.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */


/**
 * Controller to verify an internship document.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */


/**
 * Controller to bulk verify multiple internship documents.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */


/**
 * Send field assessment link to field supervisor.
 * POST /sekdep/internships/:id/send-field-assessment
 */


/**
 * Reject the approved internship report (Sekdep).
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */


/**
 * Get internship monitoring statistics.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */


/**
 * Get detailed student monitoring list for deadline tracking.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */




