import * as templateService from "../../services/insternship/template.service.js";
import mammoth from "mammoth";
import fs from "fs/promises";
import path from "path";

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
