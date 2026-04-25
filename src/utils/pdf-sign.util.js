import { PDFDocument, rgb } from 'pdf-lib';
import QRCode from 'qrcode';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Stamps one or more QR codes onto a PDF document.
 * @param {Buffer} pdfBuffer - Original PDF buffer
 * @param {string} qrText - Text to encode in QR (e.g., verification URL)
 * @param {Object|Array<Object>} positions - One or more coordinate objects { x, y, pageNumber, size }
 * @returns {Promise<Buffer>} - Signed PDF buffer
 */
export async function stampQRCode(pdfBuffer, qrText, positions) {
    if (!positions) return pdfBuffer;
    const posArray = Array.isArray(positions) ? positions : [positions];

    // 1. Generate QR Code image as buffer (reusable if all are same text)
    // We'll use a standard size for embed, then scale during draw
    const baseSize = 60;
    const qrImageBuffer = await QRCode.toBuffer(qrText, {
        errorCorrectionLevel: 'H',
        type: 'png',
        margin: 1,
        width: baseSize * 4 // High res
    });

    // 2. Load PDF
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pages = pdfDoc.getPages();
    const qrImage = await pdfDoc.embedPng(qrImageBuffer);

    // 2.5 Load Logo if exists
    let logoImage = null;
    try {
        const logoPath = path.resolve(__dirname, '../assets/unand-logo.png');
        const logoBuffer = await fs.readFile(logoPath);
        logoImage = await pdfDoc.embedPng(logoBuffer);
    } catch (err) {
        console.warn("[pdf-sign] Logo UNAND tidak ditemukan, menggunakan QR standar:", err.message);
    }

    // 3. Draw each QR code
    for (const pos of posArray) {
        const { x, y, pageNumber = 1, size = 60 } = pos;

        // Validate page number
        const targetPageIndex = Math.max(0, Math.min(pageNumber - 1, pages.length - 1));
        const page = pages[targetPageIndex];
        const { height } = page.getSize();

        // Convert Y from Top-Left to Bottom-Left (PDF Standard)
        // Adjust for centering: we want (x, y) to be the CENTER of the QR code
        const pdfX = x - (size / 2);
        const pdfY = height - y - (size / 2);

        // Draw QR Code
        page.drawImage(qrImage, {
            x: pdfX,
            y: pdfY,
            width: size,
            height: size,
        });

        // Draw Logo in center if available
        if (logoImage) {
            const logoSize = size * 0.28; // Slightly larger for visibility
            const padding = size * 0.05; // White background padding

            // Draw white background for logo to make it stand out
            page.drawRectangle({
                x: pdfX + (size - (logoSize + padding)) / 2,
                y: pdfY + (size - (logoSize + padding)) / 2,
                width: logoSize + padding,
                height: logoSize + padding,
                color: rgb(1, 1, 1),
            });

            // Draw the actual logo
            page.drawImage(logoImage, {
                x: pdfX + (size - logoSize) / 2,
                y: pdfY + (size - logoSize) / 2,
                width: logoSize,
                height: logoSize
            });
        }
    }

    const signedPdfBytes = await pdfDoc.save();
    return Buffer.from(signedPdfBytes);
}
