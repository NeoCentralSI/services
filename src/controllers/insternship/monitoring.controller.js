
import * as monitoringService from "../../services/insternship/monitoring.service.js";

import fsPromises from "fs/promises";
import path from "path";
import { PDFDocument } from 'pdf-lib';
import prisma from "../../config/prisma.js";
import { convertDocxToPdf, convertHtmlToPdf } from "../../utils/pdf.util.js";

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
 * Controller to get grade recap for Sekdep.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function getGradeRecap(req, res, next) {
    try {
        const { academicYearId, q, gradeStatus, sortBy, sortOrder, page = 1, pageSize = 10 } = req.query;
        const normalizedPage = Math.max(1, parseInt(page, 10) || 1);
        const normalizedPageSize = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 10));
        const skip = (normalizedPage - 1) * normalizedPageSize;

        const data = await monitoringService.getGradeRecap({
            academicYearId,
            q,
            gradeStatus,
            sortBy,
            sortOrder,
            skip,
            take: normalizedPageSize
        });

        res.status(200).json({
            success: true,
            ...data
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Download grade recap as PDF (with optional KOP template merged)
 */
export async function downloadGradeRecapPdf(req, res, next) {
    try {
        const { academicYearId, q, gradeStatus, sortBy, sortOrder } = req.query;

        // Fetch full dataset (no pagination) for export
        const { data } = await monitoringService.getGradeRecap({
            academicYearId,
            q,
            gradeStatus,
            sortBy,
            sortOrder,
            skip: 0,
            take: 10000
        });

        const cpmks = data?.cpmks || [];
        const items = data?.items || [];

        // Simple HTML table builder
        const escapeHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        const cpmkHeaders = cpmks.map(c => `<th style="text-align:center">${escapeHtml(c.code || '')}</th>`).join('');

        const rowsHtml = items.map((it, idx) => {
            const cpmkTds = cpmks.map(c => {
                const scoreObj = it.scores?.[c.id];
                const score = scoreObj && scoreObj.score != null ? Number(scoreObj.score).toLocaleString('id-ID', { maximumFractionDigits: 2 }) : '-';
                return `<td style="text-align:center">${escapeHtml(score)}</td>`;
            }).join('');

            const totalScore = it.totalScore != null ? Number(it.totalScore).toLocaleString('id-ID', { maximumFractionDigits: 2 }) : '-';
            const finalGrade = it.finalGrade || '-';

            return `<tr>
                <td style="text-align:center">${idx + 1}</td>
                <td style="text-align:center">${escapeHtml(it.studentNim)}</td>
                <td>${escapeHtml(it.studentName)}</td>
                ${cpmkTds}
                <td style="text-align:center">${escapeHtml(totalScore)}</td>
                <td style="text-align:center">${escapeHtml(finalGrade)}</td>
            </tr>`;
        }).join('');

        // Try to load Kop template (DOCX or PDF) from documents table
        let headerPdfBuffer = null;
        try {
            const kopTemplates = await prisma.document.findMany({
                where: { fileName: { contains: "KOP" } },
                orderBy: { createdAt: 'desc' },
                take: 10
            });

            for (const kopTemplate of kopTemplates) {
                if (!kopTemplate?.filePath) continue;
                try {
                    const templatePath = path.isAbsolute(kopTemplate.filePath) ? kopTemplate.filePath : path.resolve(kopTemplate.filePath);
                    const templateBuffer = await fsPromises.readFile(templatePath);
                    const lower = (kopTemplate.filePath || '').toLowerCase();
                    if (lower.endsWith('.docx')) {
                        headerPdfBuffer = await convertDocxToPdf(templateBuffer, 'KOP.docx');
                    } else if (lower.endsWith('.pdf')) {
                        headerPdfBuffer = templateBuffer;
                    }

                    if (headerPdfBuffer) break;
                } catch (err) {
                    console.warn('Failed to load KOP template file', err?.message || err);
                    continue;
                }
            }
        } catch (err) {
            console.warn('KOP lookup failed', err?.message || err);
        }

        // Build the HTML: include a top margin to leave space for KOP overlay
        const kopSpacerHeight = headerPdfBuffer ? '70px' : '0px';
        // For multi-page: use @page margin-top to reserve KOP space on every page
        const pageMarginTop = headerPdfBuffer ? '30mm' : '15mm';

        const html = `<!doctype html><html><head><meta charset="utf-8"><style>
            @page { margin: ${pageMarginTop} 15mm 20mm 15mm }
            body{font-family: 'Times New Roman', Times, serif; font-size:12px; color:#000; margin:0; padding:0}
            .kop-spacer{ height: ${kopSpacerHeight} }
            .title{ text-align:center; font-weight:bold; font-size:14px; margin-bottom:6px }
            .meta{ text-align:right; font-size:11px; margin-bottom:6px }
            table{width:100%; border-collapse:collapse; page-break-inside:auto}
            thead{display:table-header-group}
            tr{page-break-inside:avoid; page-break-after:auto}
            th, td{border:1px solid #ccc; padding:6px; font-size:11px}
            th{background:#f6f6f6}
        </style></head><body>
            <div class="kop-spacer"></div>
            <div class="title">DAFTAR REKAP NILAI KERJA PRAKTIK</div>
            <div class="meta">Tanggal Cetak: ${new Date().toLocaleDateString('id-ID')}</div>
            <table>
                <thead>
                    <tr>
                        <th>No</th>
                        <th>NIM</th>
                        <th>Nama Mahasiswa</th>
                        ${cpmkHeaders}
                        <th>Total</th>
                        <th>Grade</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>
        </body></html>`;

        // Convert HTML to PDF via Gotenberg
        const htmlPdfBuffer = await convertHtmlToPdf(html);

        let finalBuffer = htmlPdfBuffer;

        if (headerPdfBuffer) {
            // Overlay KOP onto EVERY page of the content PDF
            const headerPdf = await PDFDocument.load(headerPdfBuffer);
            const contentPdf = await PDFDocument.load(htmlPdfBuffer);
            const outPdf = await PDFDocument.create();

            // Copy all content pages
            const contentPages = await outPdf.copyPages(contentPdf, contentPdf.getPageIndices());
            contentPages.forEach(p => outPdf.addPage(p));

            // Embed the KOP page once
            const headerPage = headerPdf.getPages()[0];
            const [embeddedKop] = await outPdf.embedPdf(headerPdf, [0]);
            const { width: kopW, height: kopH } = headerPage.getSize();

            // Overlay KOP on every page
            const allPages = outPdf.getPages();
            for (const page of allPages) {
                const { width: pageW, height: pageH } = page.getSize();
                const scale = pageW / kopW;
                const scaledKopH = kopH * scale;

                page.drawPage(embeddedKop, {
                    x: 0,
                    y: pageH - scaledKopH,
                    width: pageW,
                    height: scaledKopH,
                });
            }

            const outBytes = await outPdf.save();
            finalBuffer = Buffer.from(outBytes);
        }

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="Rekap_Nilai_KP.pdf"');
        res.send(finalBuffer);
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
 * Update field supervisor and unit information for Sekdep.
 */
export async function updateInternshipFieldInfo(req, res, next) {
    try {
        const { id } = req.params;
        const { fieldSupervisorName, fieldSupervisorEmail, fieldSupervisorPhone, fieldSupervisorNip, unitSection } = req.body;
        const data = await monitoringService.updateInternshipFieldInfo(id, {
            fieldSupervisorName,
            fieldSupervisorEmail,
            fieldSupervisorPhone,
            fieldSupervisorNip,
            unitSection
        });
        res.status(200).json({
            success: true,
            message: "Informasi lapangan berhasil diperbarui.",
            data
        });
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




