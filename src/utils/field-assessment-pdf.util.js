import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/**
 * Generate a PDF document for field supervisor assessment.
 * Embeds the signature image and assessment scores.
 */
export async function generateFieldAssessmentPdf(opts) {
    const {
        studentName,
        studentNim,
        companyName,
        fieldSupervisorName,
        unitSection,
        period,
        academicYear,
        cpmks,
        scores,
        signatureBase64,
        signatureHash,
        submittedAt,
        headerPdfBuffer, // Added support for KOP
    } = opts;

    let pdfDoc;
    if (headerPdfBuffer) {
        pdfDoc = await PDFDocument.load(headerPdfBuffer);
    } else {
        pdfDoc = await PDFDocument.create();
    }

    const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const fontBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

    const W = 595.28; // A4 width in points
    const H = 841.89; // A4 height in points
    const ML = 60;
    const MR = 60;
    const MT = 60;
    const MB = 60;
    const contentW = W - ML - MR;

    let pages = pdfDoc.getPages();
    let page = pages[pages.length - 1];
    let curY = H - MT;

    if (headerPdfBuffer) {
        curY = H - 155; // Further reduced from 180 to 155
    }

    // Helper: add text
    function drawText(text, x, y, size, f = font, color = rgb(0, 0, 0)) {
        page.drawText(String(text || ""), { x, y, size, font: f, color });
    }

    // Helper: centered text
    function drawCentered(text, y, size, f = font) {
        const tw = f.widthOfTextAtSize(text, size);
        drawText(text, (W - tw) / 2, y, size, f);
    }

    // Helper: new page if needed
    function ensureSpace(needed) {
        if (curY - needed < MB) {
            page = pdfDoc.addPage([W, H]);
            curY = H - MT;
        }
    }

    // ===== HEADER =====
    drawCentered("FORMULIR PENILAIAN PEMBIMBING LAPANGAN", curY, 14, fontBold);
    curY -= 18;
    drawCentered("KERJA PRAKTIK", curY, 14, fontBold);
    curY -= 14;
    drawCentered(`Tahun Akademik ${academicYear}`, curY, 10);
    curY -= 30;

    // ===== STUDENT INFO TABLE =====
    const infoRows = [
        ["Nama Mahasiswa", studentName],
        ["NIM", studentNim],
        ["Perusahaan / Instansi", companyName],
        ["Bagian / Unit", unitSection],
        ["Periode KP", period],
        ["Pembimbing Lapangan", fieldSupervisorName],
    ];

    for (const [label, value] of infoRows) {
        drawText(label, ML, curY, 10, fontBold);
        drawText(":", ML + 160, curY, 10);
        drawText(value || "-", ML + 170, curY, 10);
        curY -= 16;
    }

    curY -= 15;

    // ===== ASSESSMENT TABLE =====
    drawText("A. Penilaian Kompetensi", ML, curY, 12, fontBold);
    curY -= 20;

    // Create a score lookup map: chosenRubricId -> score
    const scoreMap = new Map();
    for (const s of scores) {
        scoreMap.set(s.chosenRubricId, s.score);
    }

    // Table header
    const colWidths = [30, 200, 160, 50, 35];
    const headers = ["No", "Komponen (CPMK)", "Level Rubrik", "Skor", "Bobot"];

    function drawTableRow(cells, y, isHeader = false) {
        const f = isHeader ? fontBold : font;
        const sz = 9;
        
        // Multi-line support for CPMK Name
        const maxW_CPMK = colWidths[1] - 8;
        const cpmkWords = String(cells[1]).split(" ");
        const cpmkLines = [];
        let currentLine = "";
        for (const word of cpmkWords) {
            const testLine = currentLine ? currentLine + " " + word : word;
            if (f.widthOfTextAtSize(testLine, sz) > maxW_CPMK) {
                cpmkLines.push(currentLine);
                currentLine = word;
            } else {
                currentLine = testLine;
            }
        }
        cpmkLines.push(currentLine);

        const rowH = Math.max(20, (cpmkLines.length * 12) + 8);
        let x = ML;

        for (let i = 0; i < cells.length; i++) {
            page.drawRectangle({
                x, y: y - rowH, width: colWidths[i], height: rowH,
                borderColor: rgb(0, 0, 0), borderWidth: 0.5,
                color: isHeader ? rgb(0.93, 0.93, 0.93) : rgb(1, 1, 1),
            });

            const text = String(cells[i] || "");
            if (i === 1) { // CPMK column
                let ly = y - 13;
                for (const line of cpmkLines) {
                    page.drawText(line, { x: x + 4, y: ly, size: sz, font: f });
                    ly -= 12;
                }
            } else {
                const tw = f.widthOfTextAtSize(text, sz);
                const tx = x + (colWidths[i] - tw) / 2;
                page.drawText(text, { x: tx, y: y - (rowH + sz) / 2, size: sz, font: f });
            }
            x += colWidths[i];
        }
        return rowH;
    }

    ensureSpace(30);
    let rh = drawTableRow(headers, curY, true);
    curY -= rh;

    let totalWeightedScore = 0;

    for (let idx = 0; idx < cpmks.length; idx++) {
        const cpmk = cpmks[idx];
        let chosenRubric = null;
        let chosenScore = 0;

        for (const rubric of cpmk.rubrics) {
            if (scoreMap.has(rubric.id)) {
                chosenRubric = rubric;
                chosenScore = scoreMap.get(rubric.id);
                break;
            }
        }

        const levelName = chosenRubric ? chosenRubric.levelName : "-";
        const scoreDisplay = chosenScore ? chosenScore.toFixed(0) : "-";
        const weight = (cpmk.weight || 0).toFixed(0) + "%";

        ensureSpace(30);
        rh = drawTableRow(
            [
                String(idx + 1),
                `${cpmk.code} - ${cpmk.name}`,
                levelName,
                scoreDisplay,
                weight,
            ],
            curY
        );
        curY -= rh;

        if (chosenScore && cpmk.weight) {
            totalWeightedScore += (chosenScore * cpmk.weight) / 100;
        }
    }

    // Total row
    ensureSpace(40);
    curY -= 15;
    drawText(`Total Nilai Tertimbang: ${totalWeightedScore.toFixed(2)}`, ML, curY, 11, fontBold);
    curY -= 30;

    // ===== SIGNATURE SECTION =====
    ensureSpace(160);

    const sigDate = submittedAt
        ? submittedAt.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })
        : new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });

    const rightX = W - MR - 150;
    drawText(`Padang, ${sigDate}`, rightX, curY, 10);
    curY -= 16;
    drawText("Pembimbing Lapangan,", rightX, curY, 10);
    curY -= 5;

    if (signatureBase64) {
        try {
            const base64Data = signatureBase64.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");
            const sigBytes = Buffer.from(base64Data, "base64");

            let sigImage = signatureBase64.includes("image/png") ? await pdfDoc.embedPng(sigBytes) : await pdfDoc.embedJpg(sigBytes);

            const sigW = 100;
            const sigH = (sigImage.height / sigImage.width) * sigW;

            page.drawImage(sigImage, {
                x: rightX,
                y: curY - sigH,
                width: sigW,
                height: sigH,
            });
            curY -= sigH + 5;
        } catch (imgErr) {
            console.error("Gagal embed tanda tangan ke PDF:", imgErr);
            curY -= 50;
        }
    } else {
        curY -= 50;
    }

    const nameText = fieldSupervisorName;
    const nameTw = fontBold.widthOfTextAtSize(nameText, 10);
    drawText(nameText, rightX, curY, 10, fontBold);
    curY -= 2;
    page.drawLine({
        start: { x: rightX, y: curY },
        end: { x: rightX + nameTw, y: curY },
        thickness: 0.5,
    });

    // ===== VERIFICATION FOOTER =====
    curY = MB - 20;
    drawText("Dokumen ini disahkan secara digital. Kode Verifikasi:", ML, curY, 7, font, rgb(0.5, 0.5, 0.5));
    drawText(signatureHash || "-", ML, curY - 10, 6, font, rgb(0.5, 0.5, 0.5));

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
}
