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
    } = opts;

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const fontBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

    const W = 595.28; // A4 width in points
    const H = 841.89; // A4 height in points
    const ML = 60;
    const MR = 60;
    const MT = 60;
    const MB = 60;
    const contentW = W - ML - MR;

    let page = pdfDoc.addPage([W, H]);
    let curY = H - MT;

    // Helper: add text
    function drawText(text, x, y, size, f = font, color = rgb(0, 0, 0)) {
        page.drawText(text, { x, y, size, font: f, color });
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

    curY -= 10;

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
        const rowH = 18;
        let x = ML;

        for (let i = 0; i < cells.length; i++) {
            // Draw cell border
            page.drawRectangle({
                x,
                y: y - rowH,
                width: colWidths[i],
                height: rowH,
                borderColor: rgb(0, 0, 0),
                borderWidth: 0.5,
                color: isHeader ? rgb(0.93, 0.93, 0.93) : rgb(1, 1, 1),
            });

            // Draw text (centered for header, left-aligned for body)
            const text = String(cells[i] || "");
            const tw = f.widthOfTextAtSize(text, sz);
            const tx = i === 1 ? x + 4 : x + (colWidths[i] - tw) / 2;
            page.drawText(text, { x: tx, y: y - 13, size: sz, font: f, color: rgb(0, 0, 0) });

            x += colWidths[i];
        }
        return rowH;
    }

    ensureSpace(30);
    drawTableRow(headers, curY, true);
    curY -= 18;

    let totalWeightedScore = 0;

    for (let idx = 0; idx < cpmks.length; idx++) {
        const cpmk = cpmks[idx];

        // Find which rubric was chosen for this CPMK
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

        ensureSpace(22);
        drawTableRow(
            [
                String(idx + 1),
                `${cpmk.code} - ${cpmk.name.length > 30 ? cpmk.name.substring(0, 30) + "..." : cpmk.name}`,
                levelName,
                scoreDisplay,
                weight,
            ],
            curY
        );
        curY -= 18;

        if (chosenScore && cpmk.weight) {
            totalWeightedScore += (chosenScore * cpmk.weight) / 100;
        }
    }

    // Total row
    ensureSpace(22);
    curY -= 10;
    drawText(`Total Nilai Tertimbang: ${totalWeightedScore.toFixed(2)}`, ML, curY, 11, fontBold);
    curY -= 30;

    // ===== SIGNATURE SECTION =====
    ensureSpace(160);

    const sigDate = submittedAt
        ? submittedAt.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })
        : new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });

    // Right-aligned date
    const dateText = `Padang, ${sigDate}`;
    const dateTw = font.widthOfTextAtSize(dateText, 10);
    drawText(dateText, W - MR - dateTw, curY, 10);
    curY -= 18;

    const sigLabel = "Pembimbing Lapangan,";
    const sigLTw = font.widthOfTextAtSize(sigLabel, 10);
    drawText(sigLabel, W - MR - sigLTw, curY, 10);
    curY -= 6;

    // Embed signature image
    if (signatureBase64) {
        try {
            // Remove data URL prefix if present
            const base64Data = signatureBase64.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");
            const sigBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));

            let sigImage;
            if (signatureBase64.includes("image/png")) {
                sigImage = await pdfDoc.embedPng(sigBytes);
            } else {
                sigImage = await pdfDoc.embedJpg(sigBytes);
            }

            const sigW = 150;
            const sigH = (sigImage.height / sigImage.width) * sigW;
            const sigX = W - MR - sigW;

            page.drawImage(sigImage, {
                x: sigX,
                y: curY - sigH,
                width: sigW,
                height: sigH,
            });
            curY -= sigH + 4;
        } catch (imgErr) {
            console.error("Gagal embed tanda tangan ke PDF:", imgErr);
            curY -= 50; // leave space for missing signature
        }
    } else {
        curY -= 50;
    }

    // Supervisor name with underline
    const nameText = fieldSupervisorName;
    const nameTw = fontBold.widthOfTextAtSize(nameText, 10);
    const nameX = W - MR - nameTw;
    drawText(nameText, nameX, curY, 10, fontBold);
    curY -= 2;
    page.drawLine({
        start: { x: nameX, y: curY },
        end: { x: nameX + nameTw, y: curY },
        thickness: 0.5,
        color: rgb(0, 0, 0),
    });

    // ===== VERIFICATION FOOTER =====
    curY -= 30;
    ensureSpace(30);
    drawText("Kode Verifikasi:", ML, curY, 7, font, rgb(0.5, 0.5, 0.5));
    curY -= 10;
    drawText(signatureHash, ML, curY, 6, font, rgb(0.5, 0.5, 0.5));

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
}
