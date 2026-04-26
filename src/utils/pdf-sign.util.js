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
            const logoScaleFactor = 0.22; // Slightly smaller weight for better aesthetics
            const logoSize = size * logoScaleFactor;
            const padding = size * 0.04; 

            // Get original dimensions to maintain aspect ratio
            const { width: origW, height: origH } = logoImage.scale(1);
            const aspectRatio = origW / origH;
            
            let logoWidth = logoSize;
            let logoHeight = logoSize / aspectRatio;
            
            // Adjust if height is the dominant dimension
            if (logoHeight > logoSize) {
                logoHeight = logoSize;
                logoWidth = logoSize * aspectRatio;
            }

            // Calculate center positions
            const centerX = pdfX + size / 2;
            const centerY = pdfY + size / 2;

            // Draw slightly rounded white background for the logo
            const bgSize = logoSize + padding;
            const r = bgSize * 0.18; // corner radius
            const bgX = centerX - bgSize / 2;
            const bgY = centerY - bgSize / 2;

            // Horizontal rect
            page.drawRectangle({ x: bgX + r, y: bgY, width: bgSize - 2 * r, height: bgSize, color: rgb(1, 1, 1) });
            // Vertical rect
            page.drawRectangle({ x: bgX, y: bgY + r, width: bgSize, height: bgSize - 2 * r, color: rgb(1, 1, 1) });
            // 4 corners
            page.drawCircle({ x: bgX + r, y: bgY + r, size: r, color: rgb(1, 1, 1) });
            page.drawCircle({ x: bgX + bgSize - r, y: bgY + r, size: r, color: rgb(1, 1, 1) });
            page.drawCircle({ x: bgX + r, y: bgY + bgSize - r, size: r, color: rgb(1, 1, 1) });
            page.drawCircle({ x: bgX + bgSize - r, y: bgY + bgSize - r, size: r, color: rgb(1, 1, 1) });
            

            // Draw the actual logo maintaining aspect ratio
            page.drawImage(logoImage, {
                x: centerX - logoWidth / 2,
                y: centerY - logoHeight / 2,
                width: logoWidth,
                height: logoHeight
            });
        }
    }

    const signedPdfBytes = await pdfDoc.save();
    return Buffer.from(signedPdfBytes);
}
