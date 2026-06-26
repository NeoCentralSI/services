

import fs from "fs/promises";
import path from "path";

// Legacy imports mapping to avoid breaking controller logic during refactor
import * as adminService from "../../services/insternship/pendaftaran.service.js";
import * as holidayService from "../../services/insternship/pendaftaran.service.js";
import * as kadepService from "../../services/insternship/pendaftaran.service.js";
import * as registrationService from "../../services/insternship/pendaftaran.service.js";
import * as sekdepService from "../../services/insternship/pendaftaran.service.js";
import * as templateService from "../../services/insternship/pendaftaran.service.js";
import * as pendaftaranRepository from "../../repositories/insternship/pendaftaran.repository.js";

async function getActiveAcademicYearFromRequest(req) {
    return req.prisma?.academicYear?.findFirst({ where: { isActive: true } }) ||
        pendaftaranRepository.getActiveAcademicYear();
}

/**
 * Controller to get all internship proposals for the current student.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
export async function getProposals(req, res, next) {
    try {
        // req.user.sub contains the user ID from the authentication middleware
        const studentId = req.user.sub;

        if (!studentId) {
            const err = new Error("User ID is missing from request");
            err.statusCode = 401;
            throw err;
        }
        const { academicYear } = req.query;
        const academicYearId = academicYear;

        const data = await registrationService.getStudentProposals(studentId, academicYearId);

        res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Controller to get all companies.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
export async function listCompanies(req, res, next) {
    try {
        const data = await registrationService.getCompanies();
        res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Controller to get all eligible students.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
export async function listEligibleStudents(req, res, next) {
    try {
        const data = await registrationService.getEligibleStudents();
        res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Controller to submit a new internship proposal.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
export async function submitProposal(req, res, next) {
    try {
        const studentId = req.user.sub;
        const { targetCompanyId, newCompany, proposalDocumentId, memberIds, proposedStartDate, proposedEndDate } = req.body;
        const companyName = newCompany?.companyName;
        const companyAddress = newCompany?.address;
        const companyReason = newCompany?.alasan;

        if (!proposalDocumentId) {
            const err = new Error("Dokumen proposal harus diunggah.");
            err.statusCode = 400;
            throw err;
        }

        const data = await registrationService.submitProposal({
            coordinatorId: studentId,
            targetCompanyId,
            companyName,
            companyAddress,
            companyReason,
            proposalDocumentId,
            proposedStartDate,
            proposedEndDate,
            memberIds
        });

        res.status(201).json({
            success: true,
            message: "Pendaftaran KP berhasil dikirim!",
            data
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Controller to update/resubmit an internship proposal.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
export async function updateProposal(req, res, next) {
    try {
        const studentId = req.user.sub;
        const { id: proposalId } = req.params;
        const { targetCompanyId, newCompany, proposalDocumentId, memberIds = [], proposedStartDate, proposedEndDate } = req.body;
        const companyName = newCompany?.companyName;
        const companyAddress = newCompany?.address;
        const companyReason = newCompany?.alasan;

        const data = await registrationService.updateProposal(proposalId, {
            coordinatorId: studentId,
            targetCompanyId,
            companyName,
            companyAddress,
            companyReason,
            proposalDocumentId,
            proposedStartDate,
            proposedEndDate,
            memberIds
        });

        res.status(200).json({
            success: true,
            message: "Proposal berhasil diperbarui dan diajukan kembali.",
            data
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Controller to delete an internship proposal.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
export async function deleteProposal(req, res, next) {
    try {
        const studentId = req.user.sub;
        const { id: proposalId } = req.params;

        await registrationService.deleteProposal(proposalId, studentId);

        res.status(200).json({
            success: true,
            message: "Proposal berhasil dihapus."
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Controller to get full detail of a specific internship proposal.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
export async function getStudentProposalDetail(req, res, next) {
    try {
        const { id } = req.params;
        const data = await registrationService.getStudentProposalDetail(id);

        res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Controller to respond to an internship proposal invitation.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
export async function respondToInvitation(req, res, next) {
    try {
        const { id: proposalId } = req.params;
        const { response } = req.body;
        const studentId = req.user.sub;

        const data = await registrationService.respondToInvitation(studentId, proposalId, response);

        res.status(200).json({
            success: true,
            message: `Undangan berhasil ${response === 'ACCEPTED' ? 'disetujui' : 'ditolak'}.`,
            data
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Controller to submit a company response letter.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
export async function submitCompanyResponse(req, res, next) {
    try {
        const { id: proposalId } = req.params;
        const { documentId, acceptedMemberIds } = req.body;
        const studentId = req.user.sub;

        if (!documentId) {
            const err = new Error("ID Dokumen harus disertakan.");
            err.statusCode = 400;
            throw err;
        }

        const data = await registrationService.submitCompanyResponse(proposalId, documentId, studentId, acceptedMemberIds);

        res.status(200).json({
            success: true,
            message: "Surat balasan berhasil diunggah.",
            data
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Controller to calculate working days.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
export async function getWorkingDays(req, res, next) {
    try {
        const { startDate, endDate } = req.query;
        if (!startDate || !endDate) {
            return res.status(400).json({ success: false, message: "Start date and end date are required." });
        }
        const count = await registrationService.calculateWorkingDays(startDate, endDate);
        res.status(200).json({ success: true, data: count });
    } catch (error) {
        next(error);
    }
}

/**
 * Get all holidays.
 */
export async function getHolidays(req, res, next) {
    try {
        const { year } = req.query;
        const data = await holidayService.getAllHolidays({ year });
        res.status(200).json({
            success: true,
            data,
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Create a single holiday.
 */
export async function createHoliday(req, res, next) {
    try {
        const data = await holidayService.createHoliday(req.body);
        res.status(201).json({
            success: true,
            message: "Hari libur berhasil ditambahkan.",
            data,
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Create multiple holidays at once.
 */
export async function createManyHolidays(req, res, next) {
    try {
        const { holidays } = req.body;
        const result = await holidayService.createManyHolidays(holidays);
        res.status(201).json({
            success: true,
            message: `${result.count} hari libur berhasil ditambahkan.`,
            data: result,
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Update a holiday.
 */
export async function updateHoliday(req, res, next) {
    try {
        const { id } = req.params;
        const data = await holidayService.updateHoliday(id, req.body);
        res.status(200).json({
            success: true,
            message: "Hari libur berhasil diperbarui.",
            data,
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Delete a holiday.
 */
export async function deleteHoliday(req, res, next) {
    try {
        const { id } = req.params;
        await holidayService.deleteHoliday(id);
        res.status(200).json({
            success: true,
            message: "Hari libur berhasil dihapus.",
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Sync holidays from public API for a given year.
 */
export async function syncHolidays(req, res, next) {
    try {
        const { year } = req.query;
        const result = await holidayService.syncHolidays(year);
        res.status(200).json({
            success: true,
            message: `Sinkronisasi selesai: ${result.created} hari libur baru ditambahkan, ${result.updated} diperbarui.`,
            data: result,
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Get template content by name.
 * GET /insternship/templates/:name
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
 * Save or update template content.
 * POST /insternship/templates
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

        let result;
        if (file) {
            // Saving a DOCX template (File Only)
            result = await templateService.saveTemplate(name, null, "DOCX", file.path);
        } else {
            return res.status(400).json({
                success: false,
                message: "File template (.docx) harus diuplaod"
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
 * Save or update template content.
 * POST /insternship/templates
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
        // File missing on disk — return 404 so frontend can handle gracefully
        if (error.code === "FILE_NOT_FOUND" || error.code === "ENOENT") {
            return res.status(404).json({
                success: false,
                message: error.message || "File template tidak ditemukan di server."
            });
        }
        next(error);
    }
}

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
            const activeAy = await getActiveAcademicYearFromRequest(req);
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
            const activeAy = await getActiveAcademicYearFromRequest(req);
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
 * Get template content by name for Sekdep.
 * GET /insternship/sekdep/templates/:name
 */


/**
 * Preview template for Sekdep.
 * GET /insternship/sekdep/templates/:name/preview
 */


/**
 * Save or update template content for Sekdep.
 * POST /insternship/sekdep/templates
 */
export async function saveSekdepTemplate(req, res, next) {
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
            result = await templateService.saveSekdepTemplate(name, null, "DOCX", file.path);
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
 * Controller to get proposals that need "Surat Tugas" for Admin.
 */
export async function getAssignmentProposals(req, res, next) {
    try {
        const { academicYear } = req.query;
        const data = await adminService.getProposalsForAssignment(academicYear);
        res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Controller to get proposals with status APPROVED_PROPOSAL for Admin.
 */
export async function getApprovedInternshipProposals(req, res, next) {
    try {
        const { academicYear } = req.query;
        const data = await adminService.getApprovedProposals(academicYear);
        res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Controller to get assignment letter detail.
 */
export async function getAssignmentLetterDetail(req, res, next) {
    try {
        const { id } = req.params;
        const data = await adminService.getAssignmentLetterDetail(id);
        res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Controller to update assignment letter details.
 */
export async function updateAssignmentLetter(req, res, next) {
    try {
        const { id } = req.params;
        const data = await adminService.saveAssignmentLetter(id, req.body);
        res.status(200).json({
            success: true,
            message: "Data surat tugas berhasil diperbarui.",
            data
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Controller to get detail for a single proposal letter management.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
export async function getProposalLetterDetail(req, res, next) {
    try {
        const { id } = req.params;
        const data = await adminService.getProposalLetterDetail(id);
        res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Controller to update application letter details.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
export async function updateProposalLetter(req, res, next) {
    try {
        const { id } = req.params;
        const payload = {
            ...req.body,
            // Keep backward compatibility with existing clients/tests.
            letterNumber: req.body.letterNumber ?? req.body.documentNumber,
            startDatePlanned: req.body.startDatePlanned ?? req.body.proposedStartDate,
            endDatePlanned: req.body.endDatePlanned ?? req.body.proposedEndDate
        };

        const data = await adminService.saveApplicationLetter(id, payload);
        res.status(200).json({
            success: true,
            message: "Data surat pengantar berhasil diperbarui.",
            data
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Controller for admin to upload a company response document.
 * Used when the company sends the response directly to the department.
 */
export async function adminSubmitCompanyResponse(req, res, next) {
    try {
        const { id: proposalId } = req.params;
        const { documentId, acceptedMemberIds } = req.body;

        if (!documentId) {
            const err = new Error("ID Dokumen harus disertakan.");
            err.statusCode = 400;
            throw err;
        }

        await adminService.adminSubmitCompanyResponse(proposalId, documentId, acceptedMemberIds);
        res.status(200).json({
            success: true,
            message: "Surat balasan perusahaan berhasil diunggah dan diverifikasi."
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Controller to verify a company response.
 */
export async function verifyCompanyResponse(req, res, next) {
    try {
        const { id: proposalId } = req.params;
        const { status, notes, acceptedMemberIds } = req.body;
        await adminService.verifyCompanyResponse(proposalId, status, notes, acceptedMemberIds);
        res.status(200).json({
            success: true,
            message: `Surat balasan berhasil ${status === 'APPROVED_PROPOSAL' ? 'diverifikasi' : 'ditolak'}.`
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Controller to get all pending letters for Kadep.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
export async function getPendingLetters(req, res, next) {
    try {
        const { academicYear } = req.query;
        const data = await kadepService.getPendingLetters(academicYear);
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

