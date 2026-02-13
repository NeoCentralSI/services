import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import fs from "fs";
import path from "path";
import prisma from "../config/prisma.js";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function generateApplicationLetter(proposalId, data) {
    try {
        // 1. Load the template
        const templatePath = path.join(__dirname, "../templates/template-surat-permohonan.docx");
        const content = fs.readFileSync(templatePath, "binary");

        const zip = new PizZip(content);
        const doc = new Docxtemplater(zip, {
            paragraphLoop: true,
            linebreaks: true,
        });

        // 2. Prepare data
        // Expecting data to contain:
        // - documentNumber
        // - dateIssued (Date object or string)
        // - companyName
        // - companyAddress
        // - startDate
        // - endDate
        // - members: [{ name, nim }]

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
            mahasiswa: data.members.map(m => ({
                nama: m.name,
                nim: m.nim
            }))
        };

        // 3. Render the document
        doc.render(templateData);

        // 4. Generate buffer
        const buf = doc.getZip().generate({
            type: "nodebuffer",
            compression: "DEFLATE",
        });

        // 5. Save to file
        const uploadsDir = path.join(process.cwd(), "uploads", "internship", "generated");
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }

        const fileName = `Surat_Permohonan_${data.documentNumber.replace(/[^a-zA-Z0-9]/g, "_")}.docx`;
        const filePath = path.join(uploadsDir, fileName);
        const relativeFilePath = `uploads/internship/generated/${fileName}`;

        fs.writeFileSync(filePath, buf);

        // 6. Save to Document table
        // We need a userId to associate with. Use the coordinator's ID or system?
        // Let's use the coordinator's ID if available, otherwise generic.
        // For now, assuming coordinatorId is passed in data or we fetch it.

        // Ensure DocumentType exists
        let docType = await prisma.documentType.findFirst({ where: { name: "Surat Permohonan KP" } });
        if (!docType) {
            docType = await prisma.documentType.create({ data: { name: "Surat Permohonan KP" } });
        }

        const document = await prisma.document.create({
            data: {
                fileName: fileName,
                filePath: relativeFilePath,
                documentTypeId: docType.id,
                userId: data.coordinatorId // Make sure to pass this
            }
        });

        return document.id;

    } catch (error) {
        console.error("Error generating document:", error);
        throw new Error("Gagal membuat dokumen surat: " + error.message);
    }
}
