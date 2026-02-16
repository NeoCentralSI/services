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

    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
    });

    // Dummy data for preview
    const dummyData = {
        nomor_surat: "B/123/UN16.03.D/OT.00.01/2026",
        tanggal_surat: "16 Februari 2026",
        nama_perusahaan: "PT. Teknologi Indonesia",
        alamat_perusahaan: "Jl. Industri No. 45, Jakarta Selatan",
        penerima_surat: "HR Manager",
        tanggal_mulai: "1 Maret 2026",
        tanggal_selesai: "31 Mei 2026",
        mahasiswa: [
            { nama: "Budi Santoso", nim: "2111521001" },
            { nama: "Siti Aminah", nim: "2111522005" }
        ],
        koordinator_kp: "Dr. Eng. Rahmadoni",
        nip_koordinator: "198001012010121001"
    };

    doc.render(dummyData);

    const docxBuffer = doc.getZip().generate({ type: "nodebuffer" });

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

