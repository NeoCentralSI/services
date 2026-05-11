import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/**
 * Generate a professional Logbook (KP-002) PDF.
 * Merges a custom Header PDF (KOP) with dynamic table and signatures.
 */
export async function generateLogbookPdfFromTemplate(opts) {
    const {
        studentName,
        studentNim,
        companyName,
        fieldSupervisorName,
        academicYear,
        logbooks,
        signatureBase64,
        signatureHash,
        headerPdfBuffer, // PDF buffer from Gotenberg (KOP.docx)
    } = opts;

    let pdfDoc;
    if (headerPdfBuffer) {
        pdfDoc = await PDFDocument.load(headerPdfBuffer);
    } else {
        pdfDoc = await PDFDocument.create();
    }

    const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const fontBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

    const W = 595.28; // A4
    const H = 841.89;
    const ML = 50;
    const MR = 50;
    const MT = 50;
    const MB = 60;
    const contentW = W - ML - MR;

    let pages = pdfDoc.getPages();
    let page = pages[pages.length - 1];
    
    // Find starting Y position
    // If we have a header, we start below the existing content
    let curY = H - MT;
    if (headerPdfBuffer) {
        // Further reduced gap from 180 to 155 for a tighter look
        curY = H - 155; 
    }

    // Helper: add text
    function drawText(text, x, y, size, f = font, color = rgb(0, 0, 0)) {
        page.drawText(text, { x, y, size, font: f, color });
    }

    // Helper: new page if needed
    function ensureSpace(needed) {
        if (curY - needed < MB) {
            page = pdfDoc.addPage([W, H]);
            curY = H - MT;
            return true;
        }
        return false;
    }

    // ===== TITLE =====
    drawText("LAPORAN KEGIATAN HARIAN (LOGBOOK)", (W - fontBold.widthOfTextAtSize("LAPORAN KEGIATAN HARIAN (LOGBOOK)", 12)) / 2, curY, 12, fontBold);
    curY -= 25;

    // ===== STUDENT INFO =====
    const infoRows = [
        ["Nama Mahasiswa", studentName],
        ["NIM", studentNim],
        ["Instansi KP", companyName],
        ["Tahun Akademik", academicYear],
    ];

    for (const [label, value] of infoRows) {
        drawText(label, ML, curY, 10, fontBold);
        drawText(":", ML + 120, curY, 10);
        drawText(value || "-", ML + 130, curY, 10);
        curY -= 15;
    }

    curY -= 20;

    // ===== LOGBOOK TABLE =====
    const colWidths = [30, 90, 375];
    const headers = ["No", "Tanggal", "Deskripsi Kegiatan"];

    function drawCell(x, y, w, h, text, isHeader = false, align = "left") {
        const f = isHeader ? fontBold : font;
        const sz = 9;
        
        // Handle multi-line text and calculate required height
        const maxW = w - 12; // increased padding
        const words = String(text || "").split(" ");
        const lines = [];
        let currentLine = "";

        for (const word of words) {
            const testLine = currentLine ? currentLine + " " + word : word;
            if (f.widthOfTextAtSize(testLine, sz) > maxW) {
                lines.push(currentLine);
                currentLine = word;
            } else {
                currentLine = testLine;
            }
        }
        lines.push(currentLine);

        const lineHeight = 14; // increased from 12 for better readability
        const totalTextH = (lines.length * lineHeight) + 10; // added padding
        const cellH = Math.max(h, totalTextH);

        page.drawRectangle({
            x, y: y - cellH, width: w, height: cellH,
            borderColor: rgb(0, 0, 0), borderWidth: 0.5,
            color: isHeader ? rgb(0.95, 0.95, 0.95) : rgb(1, 1, 1)
        });

        let textY = y - (isHeader ? (cellH + sz) / 2 : 14); // Vertically center header or top-align body
        if (isHeader && lines.length === 1) {
            textY = y - (cellH / 2) - (sz / 2) + 2;
        }

        for (const line of lines) {
            const tw = f.widthOfTextAtSize(line, sz);
            const tx = align === "center" ? x + (w - tw) / 2 : x + 6;
            page.drawText(line, { x: tx, y: textY, size: sz, font: f });
            textY -= lineHeight;
        }

        return cellH;
    }

    // Draw Header
    let cx = ML;
    for (let i = 0; i < headers.length; i++) {
        drawCell(cx, curY, colWidths[i], 22, headers[i], true, "center");
        cx += colWidths[i];
    }
    curY -= 22;

    // Draw Rows
    for (let i = 0; i < logbooks.length; i++) {
        const log = logbooks[i];
        const dateStr = new Date(log.activityDate).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
        const desc = log.activityDescription || "-";

        // Pre-calculate heights to ensure they stay together
        const f = font;
        const sz = 9;
        const maxW = colWidths[2] - 12;
        const words = String(desc).split(" ");
        let lineCount = 1;
        let currentLine = "";
        for (const word of words) {
            const testLine = currentLine ? currentLine + " " + word : word;
            if (f.widthOfTextAtSize(testLine, sz) > maxW) {
                lineCount++;
                currentLine = word;
            } else {
                currentLine = testLine;
            }
        }
        const estH = (lineCount * 14) + 10;
        
        if (ensureSpace(estH)) {
            // Redraw header on new page
            cx = ML;
            for (let j = 0; j < headers.length; j++) {
                drawCell(cx, curY, colWidths[j], 22, headers[j], true, "center");
                cx += colWidths[j];
            }
            curY -= 22;
        }

        // Draw cells
        const actualH = drawCell(ML + colWidths[0] + colWidths[1], curY, colWidths[2], 20, desc);
        drawCell(ML, curY, colWidths[0], actualH, String(i + 1), false, "center");
        drawCell(ML + colWidths[0], curY, colWidths[1], actualH, dateStr, false, "center");
        
        curY -= actualH;
    }

    // ===== SIGNATURE SECTION =====
    ensureSpace(180);
    curY -= 30;

    const sigDate = new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
    const rightX = W - MR - 150;

    drawText(`Padang, ${sigDate}`, rightX, curY, 10);
    curY -= 15;
    drawText("Mengetahui,", rightX, curY, 10);
    curY -= 12;
    drawText("Pembimbing Lapangan,", rightX, curY, 10);
    curY -= 5;

    if (signatureBase64) {
        try {
            const base64Data = signatureBase64.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");
            const sigBytes = Buffer.from(base64Data, "base64");
            const sigImage = signatureBase64.includes("image/png") ? await pdfDoc.embedPng(sigBytes) : await pdfDoc.embedJpg(sigBytes);
            
            const sigW = 100;
            const sigH = (sigImage.height / sigImage.width) * sigW;
            
            page.drawImage(sigImage, {
                x: rightX,
                y: curY - sigH,
                width: sigW,
                height: sigH,
            });
            curY -= sigH + 5;
        } catch (e) {
            console.error("Gagal embed signature:", e);
            curY -= 50;
        }
    } else {
        curY -= 50;
    }

    const nameText = fieldSupervisorName || "( ........................................ )";
    drawText(nameText, rightX, curY, 10, fontBold);
    
    // Underline name
    const nameW = fontBold.widthOfTextAtSize(nameText, 10);
    page.drawLine({
        start: { x: rightX, y: curY - 2 },
        end: { x: rightX + nameW, y: curY - 2 },
        thickness: 0.5,
    });

    // ===== FOOTER VERIFIKASI =====
    curY = MB - 20;
    drawText("Dokumen ini disahkan secara digital. Kode Verifikasi:", ML, curY, 7, font, rgb(0.5, 0.5, 0.5));
    drawText(signatureHash || "-", ML, curY - 10, 6, font, rgb(0.5, 0.5, 0.5));

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
}
