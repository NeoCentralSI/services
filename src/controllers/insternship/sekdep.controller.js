import * as sekdepService from "../../services/insternship/sekdep.service.js";
import * as templateService from "../../services/insternship/template.service.js";
import fs from "fs/promises";
import path from "path";

/**
 * Controller to get all internship proposals for Sekdep review and assignment.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
export async function getAllProposals(req, res, next) {
    try {
        const { academicYear } = req.query;
        let academicYearId = academicYear;

        // If not provided, optionally get active academic year
        if (!academicYearId) {
            const activeAy = await req.prisma?.academicYear?.findFirst({ where: { status: 'ACTIVE' } }) ||
                await import('../../repositories/insternship/registration.repository.js').then(m => m.getActiveAcademicYear());
            if (activeAy) {
                academicYearId = activeAy.id;
            }
        }

        const data = await sekdepService.listAllProposals(academicYearId);
        res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Controller to get pending internship proposals.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
export async function getPendingProposals(req, res, next) {
    try {
        const { academicYear, q, page = 1, pageSize = 10, sortBy, sortOrder } = req.query;
        let academicYearId = academicYear;

        if (!academicYearId) {
            const activeAy = await req.prisma?.academicYear?.findFirst({ where: { status: 'ACTIVE' } }) ||
                await import('../../repositories/insternship/registration.repository.js').then(m => m.getActiveAcademicYear());
            if (activeAy) academicYearId = activeAy.id;
        }

        const skip = (parseInt(page) - 1) * parseInt(pageSize);
        const take = parseInt(pageSize);

        const { data, total } = await sekdepService.listPendingProposals({ academicYearId, q, skip, take, sortBy, sortOrder });
        res.status(200).json({ success: true, data, total });
    } catch (error) {
        next(error);
    }
}




/**
 * Controller to get full detail of a specific internship proposal for Sekdep.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
export async function getProposalDetail(req, res, next) {
    try {
        const { id } = req.params;
        const data = await sekdepService.getProposalDetail(id);
        res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Controller to get all companies with their stats.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
export async function getCompaniesWithStats(req, res, next) {
    try {
        const { q, page = 1, pageSize = 10, sortBy, sortOrder, status } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(pageSize);
        const take = parseInt(pageSize);

        const { data, total } = await sekdepService.getCompaniesStats({ q, skip, take, sortBy, sortOrder, status });
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
 * Controller to create a new company.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
export async function createCompany(req, res, next) {
    try {
        const data = await sekdepService.createCompany(req.body);
        res.status(201).json({
            success: true,
            message: "Perusahaan berhasil ditambahkan.",
            data
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Controller to update a company.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
export async function updateCompany(req, res, next) {
    try {
        const { id } = req.params;
        const data = await sekdepService.updateCompany(id, req.body);
        res.status(200).json({
            success: true,
            message: "Perusahaan berhasil diperbarui.",
            data
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Controller to delete a company.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
export async function deleteCompany(req, res, next) {
    try {
        const { id } = req.params;
        await sekdepService.deleteCompany(id);
        res.status(200).json({
            success: true,
            message: "Perusahaan berhasil dihapus."
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Controller to respond to an internship proposal.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
export async function respondToProposal(req, res, next) {
    try {
        const { id } = req.params;
        const { response, notes } = req.body;
        await sekdepService.respondToProposal(id, response, notes);
        res.status(200).json({
            success: true,
            message: `Proposal berhasil ${response === 'APPROVED_PROPOSAL' ? 'disetujui' : 'ditolak'}.`
        });
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
export async function getInternshipList(req, res, next) {
    try {
        const { academicYear, status, supervisorId, q, page = 1, pageSize = 10, sortBy, sortOrder } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(pageSize);
        const take = parseInt(pageSize);

        const { data, total } = await sekdepService.listInternships({
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
 * Controller to get full detail of an internship for Sekdep.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
export async function getInternshipDetail(req, res, next) {
    try {
        const { id } = req.params;
        const data = await sekdepService.getInternshipDetail(id);
        res.status(200).json({
            success: true,
            data
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
        const { q, page = 1, pageSize = 10, sortBy, sortOrder } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(pageSize);
        const take = parseInt(pageSize);

        const { data, total } = await sekdepService.getLecturersWorkloadList({ q, skip, take, sortBy, sortOrder });
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
 * Controller to verify an internship document.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
export async function verifyDocument(req, res, next) {
    try {
        const { id } = req.params;
        const { documentType, status, notes } = req.body;
        await sekdepService.verifyInternshipDocument(id, { documentType, status, notes });
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

        const result = await sekdepService.bulkVerifyInternshipDocuments(id, { documents, status, notes });
        res.status(200).json(result);
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

/**
 * Get template content by name for Sekdep.
 * GET /insternship/sekdep/templates/:name
 */
export async function getTemplate(req, res, next) {
    try {
        const { name } = req.params;
        const template = await templateService.getTemplateByName(name);

        if (!template) {
            return res.status(404).json({
                success: false,
                message: "Template tidak ditemukan"
            });
        }

        res.status(200).json({
            success: true,
            data: template
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Save or update template content for Sekdep.
 * POST /insternship/sekdep/templates
 */
export async function saveTemplate(req, res, next) {
    try {
        const { name } = req.body;
        const file = req.file;

        if (!name) {
            return res.status(400).json({
                success: false,
                message: "Nama template harus diisi"
            });
        }

        // Security check: Sekdep should only be able to manage SUPERVISOR_LETTER
        if (name !== "INTERNSHIP_SUPERVISOR_LETTER") {
            return res.status(403).json({
                success: false,
                message: "Anda tidak memiliki akses untuk mengubah template ini"
            });
        }

        let result;
        if (file) {
            result = await templateService.saveTemplate(name, null, "DOCX", file.path);
        } else {
            return res.status(400).json({
                success: false,
                message: "File template (.docx) harus diunggah"
            });
        }

        res.status(200).json({
            success: true,
            message: "Template berhasil disimpan",
            data: result
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Preview template for Sekdep.
 * GET /insternship/sekdep/templates/:name/preview
 */
export async function previewTemplate(req, res, next) {
    try {
        const { name } = req.params;
        const filePath = await templateService.generatePreview(name);
        const ext = path.extname(filePath);

        res.download(filePath, `preview-${name}${ext}`, async (err) => {
            if (err) console.error("Error sending preview:", err);
            try {
                await fs.unlink(filePath);
            } catch (e) {
                console.warn("Failed to delete temp preview file:", e);
            }
        });
    } catch (error) {
        next(error);
    }
}