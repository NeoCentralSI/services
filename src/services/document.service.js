import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import fs from "fs/promises";
import path from "path";
import prisma from "../config/prisma.js";
import { fileURLToPath } from "url";
import HTMLToDOCX from "html-to-docx";
import { convertDocxToPdf } from "../utils/pdf.util.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Basic HTML to OOXML converter for basic formatting (p, b, i, br).
 */
function htmlToOOXML(html) {
    if (!html) return "";

    // Convert to very simple OOXML fragments
    let content = html
        .replace(/&nbsp;/g, " ")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    // Restore basic tags as OOXML
    content = content
        .replace(/&lt;p&gt;/gi, '<w:p><w:r><w:t xml:space="preserve">')
        .replace(/&lt;\/p&gt;/gi, '</w:t></w:r></w:p>')
        .replace(/&lt;br\s*\/?&gt;/gi, '<w:br/>')
        .replace(/&lt;strong&gt;(.*?)&lt;\/strong&gt;/gi, '</w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">$1</w:t></w:r><w:r><w:t xml:space="preserve">')
        .replace(/&lt;b&gt;(.*?)&lt;\/b&gt;/gi, '</w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">$1</w:t></w:r><w:r><w:t xml:space="preserve">')
        .replace(/&lt;em&gt;(.*?)&lt;\/em&gt;/gi, '</w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">$1</w:t></w:r><w:r><w:t xml:space="preserve">')
        .replace(/&lt;i&gt;(.*?)&lt;\/i&gt;/gi, '</w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">$1</w:t></w:r><w:r><w:t xml:space="preserve">');

    return content;
}

export async function generateApplicationLetter(proposalId, data) {
    try {
        const TEMPLATE_NAME = "INTERNSHIP_APPLICATION_LETTER";
        const dbTemplate = await prisma.documentTemplate.findUnique({
            where: { name: TEMPLATE_NAME }
        });

        const formatDate = (date) => {
            if (!date) return "";
            return new Date(date).toLocaleDateString("id-ID", {
                day: "numeric",
                month: "long",
                year: "numeric"
            });
        };

        const templateData = {
            nomor_surat: data.documentNumber,
            tanggal_surat: formatDate(data.dateIssued),
            nama_perusahaan: data.companyName,
            alamat_perusahaan: data.companyAddress,
            tanggal_mulai: formatDate(data.startDate),
            tanggal_selesai: formatDate(data.endDate),
            // Pass array for loops {@mahasiswa} is not needed, just {#mahasiswa}
            mahasiswa: data.members.map((m, i) => ({
                no: i + 1,
                nim: m.nim,
                nama: m.name,
                prodi: "Sistem Informasi"
            })),
            mahasiswa_list: data.members.map(m => `<li>${m.name} (${m.nim})</li>`).join(""),
            // Keep this but users should prefer the loop
            mahasiswa_table: `
                <table border="1" style="width: 100%; border-collapse: collapse; text-align: left;">
                    <thead>
                        <tr style="background-color: #f2f2f2;">
                            <th style="padding: 8px; border: 1px solid black; text-align: center; width: 40px;">No</th>
                            <th style="padding: 8px; border: 1px solid black; text-align: center; width: 120px;">NIM</th>
                            <th style="padding: 8px; border: 1px solid black; text-align: center;">Nama</th>
                            <th style="padding: 8px; border: 1px solid black; text-align: center;">Program Studi</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.members.map((m, i) => `
                            <tr>
                                <td style="padding: 8px; border: 1px solid black; text-align: center;">${i + 1}</td>
                                <td style="padding: 8px; border: 1px solid black; text-align: center;">${m.nim}</td>
                                <td style="padding: 8px; border: 1px solid black;">${m.name}</td>
                                <td style="padding: 8px; border: 1px solid black;">Sistem Informasi</td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            `
        };

        let buf;

        if (dbTemplate && dbTemplate.type === "DOCX" && dbTemplate.filePath) {
            // Use DOCX template with docxtemplater
            try {
                const templatePath = path.resolve(dbTemplate.filePath);
                const content = await fs.readFile(templatePath);
                const zip = new PizZip(content);
                const doc = new Docxtemplater(zip, {
                    paragraphLoop: true,
                    linebreaks: true,
                });

                // Prepare content from editor (HTML) to Word XML
                const bodyXML = htmlToOOXML(dbTemplate.content);

                // Prepare data for docxtemplater
                const docxData = {
                    ...templateData,
                    isi_surat: bodyXML // Note: User needs to use {@isi_surat} in Word for XML injection
                };

                doc.render(docxData);

                buf = doc.getZip().generate({
                    type: "nodebuffer",
                    compression: "DEFLATE",
                });
            } catch (error) {
                console.error("Docxtemplater error:", error);
                throw new Error("Gagal generate dokumen dari template DOCX: " + error.message);
            }
        } else if (dbTemplate) {
            // Use HTML template from DB
            let htmlContent = dbTemplate.content;

            // Replace placeholders
            htmlContent = htmlContent.replace(/\{nomor_surat\}/g, templateData.nomor_surat);
            htmlContent = htmlContent.replace(/\{tanggal_surat\}/g, templateData.tanggal_surat);
            htmlContent = htmlContent.replace(/\{nama_perusahaan\}/g, templateData.nama_perusahaan);
            htmlContent = htmlContent.replace(/\{alamat_perusahaan\}/g, templateData.alamat_perusahaan);
            htmlContent = htmlContent.replace(/\{tanggal_mulai\}/g, templateData.tanggal_mulai);
            htmlContent = htmlContent.replace(/\{tanggal_selesai\}/g, templateData.tanggal_selesai);

            // Handle lists and tables
            htmlContent = htmlContent.replace(/\{mahasiswa\}/g, `<ul>${templateData.mahasiswa_list}</ul>`);
            htmlContent = htmlContent.replace(/\{mahasiswa_table\}/g, templateData.mahasiswa_table);

            buf = await HTMLToDOCX(htmlContent, null, {
                table: { row: { cantSplit: true } },
                footer: true,
                pageNumber: true,
            });
        } else {
            // Fallback to legacy static file if DB template is missing
            const templatePath = path.join(process.cwd(), "uploads", "internship", "templates", "template-surat-permohonan.docx");
            try {
                const content = await fs.readFile(templatePath);
                const zip = new PizZip(content);
                const doc = new Docxtemplater(zip, {
                    paragraphLoop: true,
                    linebreaks: true,
                });

                const docxData = {
                    ...templateData,
                    mahasiswa: data.members.map(m => ({ nama: m.name, nim: m.nim }))
                };

                doc.render(docxData);
                buf = doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });
            } catch (e) {
                // Final fallback if even static file is missing
                buf = await HTMLToDOCX("<p>Template tidak ditemukan.</p>");
            }
        }

        // --- Gotenberg PDF Conversion ---
        // At this point, 'buf' is a DOCX buffer. We convert it to PDF.
        const pdfBuffer = await convertDocxToPdf(buf, `Surat Permohonan_${data.companyName}.docx`);

        // 5. Save to file
        const uploadsDir = path.join(process.cwd(), "uploads", "internship", "generated");
        // Ensure directory exists
        await fs.mkdir(uploadsDir, { recursive: true });

        const fileName = `Surat Permohonan_${data.companyName.replace(/[\/\\?%*:|"<>]/g, "-")}_${Date.now()}.pdf`;
        const filePath = path.join(uploadsDir, fileName);
        const relativeFilePath = `uploads/internship/generated/${fileName}`;

        await fs.writeFile(filePath, pdfBuffer);

        // 6. Save to Document table
        let docType = await prisma.documentType.findFirst({ where: { name: "Surat Permohonan KP" } });
        if (!docType) {
            docType = await prisma.documentType.create({ data: { name: "Surat Permohonan KP" } });
        }

        const document = await prisma.document.create({
            data: {
                fileName: fileName,
                filePath: relativeFilePath,
                documentTypeId: docType.id,
                userId: data.coordinatorId
            }
        });

        return document.id;

    } catch (error) {
        console.error("Error generating document:", error);
        throw new Error("Gagal membuat dokumen surat: " + error.message);
    }
}

