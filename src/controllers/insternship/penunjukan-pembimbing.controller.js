
import * as pendaftaranService from "../../services/insternship/pendaftaran.service.js";
import * as penunjukanPembimbingService from "../../services/insternship/penunjukan-pembimbing.service.js";
import * as pelaksanaanService from "../../services/insternship/pelaksanaan.service.js";
import * as bimbinganService from "../../services/insternship/bimbingan.service.js";
import * as seminarService from "../../services/insternship/seminar.service.js";
import * as penilaianService from "../../services/insternship/penilaian.service.js";
import * as monitoringService from "../../services/insternship/monitoring.service.js";

import path from "path";
import fs from "fs";

// Legacy imports mapping to avoid breaking controller logic during refactor
import * as sekdepService from "../../services/insternship/penunjukan-pembimbing.service.js";


/**
 * Controller to assign supervisor to multiple internships in bulk.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
export async function bulkAssignSupervisor(req, res, next) {
    try {
        const { internshipIds, supervisorId } = req.body;
        await sekdepService.assignSupervisorsBulk({ internshipIds, supervisorId });
        res.status(200).json({
            success: true,
            message: "Pembimbing berhasil di-assign untuk mahasiswa terpilih."
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Controller to get lecturers with their internship workload.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
export async function getLecturersWorkload(req, res, next) {
    try {
        const { q, page = 1, pageSize = 10, sortBy, sortOrder, academicYearId } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(pageSize);
        const take = parseInt(pageSize);

        const { data, total } = await sekdepService.getLecturersWorkloadList({ q, skip, take, sortBy, sortOrder, academicYearId });
        res.status(200).json({ success: true, data, total });
    } catch (error) {
        next(error);
    }
}

/**
 * Export lecturer workload to PDF.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
export async function exportLecturersWorkloadPdf(req, res, next) {
    try {
        const pdfBuffer = await sekdepService.exportLecturerWorkloadPdf();

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", 'attachment; filename="Daftar_Bimbingan_KP.pdf"');
        res.send(pdfBuffer);
    } catch (error) {
        next(error);
    }
}

/**
 * Get detailed data for managing supervisor letter for a lecturer.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
export async function getSupervisorLetter(req, res, next) {
    try {
        const { supervisorId } = req.params;
        const data = await sekdepService.getSupervisorLetterDetail(supervisorId);
        res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Save and generate Supervisor Letter.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
export async function updateSupervisorLetter(req, res, next) {
    try {
        const { supervisorId } = req.params;
        const data = req.body;
        const result = await sekdepService.saveSupervisorLetter(supervisorId, data);
        res.status(200).json({
            success: true,
            ...result
        });
    } catch (error) {
        next(error);
    }
}

