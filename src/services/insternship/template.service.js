import prisma from "../../config/prisma.js";
import path from "path";
import fs from "fs/promises";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { convertDocxToPdf } from "../../utils/pdf.util.js";

/**
 * Get a template by name.
 * @param {string} name
 * @returns {Promise<Object>}
 */
export async function getTemplateByName(name) {
    let template = await prisma.documentTemplate.findUnique({
        where: { name }
    });

    // If not found, return null (or we could seed a default here)
    return template;
}

/**
 * Save or update a template.
 * @param {string} name
 * @param {string} content - HTML content (optional if DOCX)
 * @param {string} type - HTML or DOCX
 * @param {string} filePath - Path to DOCX file (optional if HTML)
 * @returns {Promise<Object>}
 */
export async function saveTemplate(name, content, type = "HTML", filePath = null) {
    // If we're updating and providing a new file, we should delete the old one
    // But upsert doesn't give us the old record easily unless we fetch first.
    // However, if we do fetch first:
    const oldTemplate = await prisma.documentTemplate.findUnique({ where: { name } });
    if (oldTemplate && oldTemplate.filePath && filePath && oldTemplate.filePath !== filePath) {
        try {
            await fs.unlink(path.resolve(oldTemplate.filePath));
        } catch (err) {
            console.warn(`Failed to delete old template file: ${oldTemplate.filePath}`, err);
        }
    }

    const template = await prisma.documentTemplate.upsert({
        where: { name },
        update: {
            content,
            type,
            filePath
        },
        create: {
            name,
            content,
            type,
            filePath
        }
    });

    return template;
}

/**
 * Delete a template.
 * @param {string} name
 */
export async function deleteTemplate(name) {
    await prisma.documentTemplate.delete({
        where: { name }
    });
}

/**
 * Generate a PDF preview for a template with dummy data.
 * @param {string} name 
 * @returns {Promise<string>} Path to the generated PDF
 */
export async function generatePreview(name) {
    const template = await getTemplateByName(name);
    if (!template || !template.filePath) {
        throw new Error("Template DOCX tidak ditemukan");
    }

    const templatePath = path.resolve(template.filePath);
    const content = await fs.readFile(templatePath);

    // SKIP Templating to show raw tags
    // doc.render(dummyData);
    // const docxBuffer = doc.getZip().generate({ type: "nodebuffer" });

    // Use raw content directly
    const docxBuffer = content;

    // Convert to PDF using Gotenberg
    const pdfBuffer = await convertDocxToPdf(docxBuffer, `${name}.docx`);

    // Save PDF to temp file
    const tempPdfPath = path.join("uploads", `temp_preview_${Date.now()}.pdf`);

    // Ensure uploads directory exists
    try {
        await fs.access(path.dirname(tempPdfPath));
    } catch {
        await fs.mkdir(path.dirname(tempPdfPath), { recursive: true });
    }

    await fs.writeFile(tempPdfPath, pdfBuffer);

    return tempPdfPath;
}

