import { PDFDocument } from 'pdf-lib';
import QRCode from 'qrcode';

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

        page.drawImage(qrImage, {
            x: pdfX,
            y: pdfY,
            width: size,
            height: size,
        });
    }

    const signedPdfBytes = await pdfDoc.save();
    return Buffer.from(signedPdfBytes);
}
