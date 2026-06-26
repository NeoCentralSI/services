import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

function formatDate(value) {
    if (!value) return "-";
    return new Date(value).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
    });
}

function formatTime(value) {
    if (!value) return "-";
    const date = new Date(value);
    return `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")} WIB`;
}

function wrapText(font, text, size, maxWidth) {
    const words = String(text || "-").split(/\s+/);
    const lines = [];
    let line = "";

    for (const word of words) {
        const testLine = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(testLine, size) > maxWidth && line) {
            lines.push(line);
            line = word;
        } else {
            line = testLine;
        }
    }

    if (line) lines.push(line);
    return lines.length ? lines : ["-"];
}

export async function generateSeminarMinutesPdf(opts) {
    const {
        studentName,
        studentNim,
        companyName,
        supervisorName,
        moderatorName,
        roomName,
        seminarDate,
        startTime,
        endTime,
        notes,
        audiences = [],
        headerPdfBuffer,
    } = opts;

    const pdfDoc = headerPdfBuffer ? await PDFDocument.load(headerPdfBuffer) : await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const fontBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

    const W = 595.28;
    const H = 841.89;
    const ML = 50;
    const MR = 50;
    const MT = 50;
    const MB = 80;
    const contentW = W - ML - MR;

    let page = pdfDoc.getPages()[pdfDoc.getPageCount() - 1] || pdfDoc.addPage([W, H]);
    let curY = headerPdfBuffer ? H - 155 : H - MT;

    function drawText(text, x, y, size, f = font, color = rgb(0, 0, 0)) {
        page.drawText(String(text || "-"), { x, y, size, font: f, color });
    }

    function ensureSpace(needed) {
        if (curY - needed < MB) {
            page = pdfDoc.addPage([W, H]);
            curY = H - MT;
        }
    }

    function drawCentered(text, y, size, f = fontBold) {
        const width = f.widthOfTextAtSize(text, size);
        drawText(text, (W - width) / 2, y, size, f);
    }

    function drawInfoRow(label, value) {
        drawText(label, ML, curY, 10, fontBold);
        drawText(":", ML + 125, curY, 10);
        const lines = wrapText(font, value || "-", 10, contentW - 140);
        lines.forEach((line, index) => {
            drawText(line, ML + 138, curY - (index * 13), 10);
        });
        curY -= Math.max(16, lines.length * 13);
    }

    function drawCell(x, y, w, h, text, isHeader = false, align = "left") {
        const f = isHeader ? fontBold : font;
        const size = 9;
        const lines = wrapText(f, text, size, w - 10);
        const cellH = Math.max(h, lines.length * 12 + 10);

        page.drawRectangle({
            x,
            y: y - cellH,
            width: w,
            height: cellH,
            borderColor: rgb(0, 0, 0),
            borderWidth: 0.5,
            color: isHeader ? rgb(0.94, 0.94, 0.94) : rgb(1, 1, 1),
        });

        let textY = isHeader ? y - (cellH / 2) - 3 : y - 14;
        for (const line of lines) {
            const textW = f.widthOfTextAtSize(line, size);
            const tx = align === "center" ? x + (w - textW) / 2 : x + 5;
            drawText(line, tx, textY, size, f);
            textY -= 12;
        }

        return cellH;
    }

    drawCentered("BERITA ACARA SEMINAR KERJA PRAKTIK", curY, 12);
    curY -= 16;

    drawInfoRow("Nama Mahasiswa", studentName);
    drawInfoRow("NIM", studentNim);
    drawInfoRow("Instansi KP", companyName);
    drawInfoRow("Dosen Pembimbing", supervisorName);
    drawInfoRow("Tanggal Seminar", formatDate(seminarDate));
    drawInfoRow("Waktu", `${formatTime(startTime)} - ${formatTime(endTime)}`);
    drawInfoRow("Ruangan", roomName);
    drawInfoRow("Moderator", moderatorName);

    curY -= 10;
    drawText("Catatan / Hasil Seminar", ML, curY, 10, fontBold);
    curY -= 14;

    const noteLines = wrapText(font, notes || "Tidak ada catatan seminar.", 10, contentW - 16);
    const noteHeight = Math.max(70, noteLines.length * 13 + 18);
    page.drawRectangle({
        x: ML,
        y: curY - noteHeight,
        width: contentW,
        height: noteHeight,
        borderColor: rgb(0, 0, 0),
        borderWidth: 0.5,
        color: rgb(1, 1, 1),
    });
    noteLines.forEach((line, index) => drawText(line, ML + 8, curY - 16 - (index * 13), 10));
    curY -= noteHeight + 24;

    ensureSpace(110);
    drawText("Peserta Seminar", ML, curY, 10, fontBold);
    curY -= 14;

    const colWidths = [32, 190, 100, 90, 83];
    const headers = ["No", "Nama", "NIM", "Status", "Validasi"];
    let cx = ML;
    headers.forEach((header, index) => {
        drawCell(cx, curY, colWidths[index], 22, header, true, "center");
        cx += colWidths[index];
    });
    curY -= 22;

    const rows = audiences.length ? audiences : [{ studentName: "-", studentNim: "-", status: "-", validatedAt: null }];
    rows.forEach((audience, index) => {
        const row = [
            String(index + 1),
            audience.studentName || "-",
            audience.studentNim || "-",
            audience.status || "-",
            audience.validatedAt ? formatDate(audience.validatedAt) : "-",
        ];

        const estimatedH = Math.max(...row.map((cell, colIndex) => wrapText(font, cell, 9, colWidths[colIndex] - 10).length * 12 + 10));
        ensureSpace(estimatedH + 4);

        cx = ML;
        let actualH = estimatedH;
        row.forEach((cell, colIndex) => {
            actualH = Math.max(actualH, drawCell(cx, curY, colWidths[colIndex], estimatedH, cell, false, colIndex === 0 ? "center" : "left"));
            cx += colWidths[colIndex];
        });
        curY -= actualH;
    });

    ensureSpace(115);
    curY -= 28;
    const issueDate = formatDate(new Date());
    const rightX = W - MR - 185;
    drawText(`Padang, ${issueDate}`, rightX, curY, 10);
    curY -= 16;
    drawText("Dosen Pembimbing,", rightX, curY, 10);
    curY -= 52;
    drawText(supervisorName || "-", rightX, curY, 10, fontBold);
    page.drawLine({
        start: { x: rightX, y: curY - 2 },
        end: { x: rightX + fontBold.widthOfTextAtSize(supervisorName || "-", 10), y: curY - 2 },
        thickness: 0.5,
    });

    drawText("Dokumen ini disahkan secara digital oleh sistem NeoCentral.", ML, 54, 7, font, rgb(0.45, 0.45, 0.45));
    drawText("Pindai QR untuk verifikasi keaslian dokumen.", ML, 44, 7, font, rgb(0.45, 0.45, 0.45));

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
}
