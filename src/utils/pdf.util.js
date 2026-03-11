import axios from 'axios';
import FormData from 'form-data';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { ENV } from '../config/env.js';

/**
 * Converts a DOCX buffer to PDF using Gotenberg (LibreOffice module)
 * @param {Buffer} docxBuffer - The content of the DOCX file
 * @param {string} fileName - Original filename (optional)
 * @returns {Promise<Buffer>} - The converted PDF as a buffer
 */
export async function convertDocxToPdf(docxBuffer, fileName = 'document.docx') {
    try {
        const url = `${ENV.GOTENBERG_URL || 'http://localhost:3001'}/forms/libreoffice/convert`;

        const form = new FormData();
        form.append('files', docxBuffer, {
            filename: fileName,
            contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        });

        const response = await axios.post(url, form, {
            headers: {
                ...form.getHeaders()
            },
            responseType: 'arraybuffer'
        });

        return Buffer.from(response.data);
    } catch (error) {
        const respBody = error.response?.data ? Buffer.from(error.response.data).toString('utf8').substring(0, 2000) : null;
        console.error('Gotenberg PDF conversion failed:', {
            status: error.response?.status,
            statusText: error.response?.statusText,
            body: respBody,
            message: error.message,
            code: error.code,
        });
        throw new Error('Gagal mengonversi dokumen ke PDF melalui Gotenberg');
    }
}

/**
 * Converts HTML content to PDF using Gotenberg (Chromium module)
 * @param {string} html - The HTML content to convert
 * @returns {Promise<Buffer>} - The converted PDF as a buffer
 */
export async function convertHtmlToPdf(html) {
    try {
        const url = `${ENV.GOTENBERG_URL || 'http://localhost:3001'}/forms/chromium/convert/html`;

        const form = new FormData();
        form.append('files', Buffer.from(html), {
            filename: 'index.html',
            contentType: 'text/html'
        });

        const response = await axios.post(url, form, {
            headers: {
                ...form.getHeaders()
            },
            responseType: 'arraybuffer'
        });

        return Buffer.from(response.data);
    } catch (error) {
        console.error('Gotenberg HTML to PDF conversion failed:', error.response?.data?.toString() || error.message);
        throw new Error('Gagal mengonversi HTML ke PDF melalui Gotenberg');
    }
 * Adds guidance table pages + signature to a base PDF using pdf-lib.
 *
 * @param {Buffer} basePdfBytes  – PDF from Gotenberg (identity/header page)
 * @param {Object} opts
 * @param {Array}  opts.rows     – [{ no, tanggal, notes }]
 * @param {string} opts.dateGenerated
 * @param {string} opts.dospem1Name
 * @param {string} opts.nip1
 * @param {boolean} opts.hasDospem2
 * @param {string} opts.dospem2Name
 * @param {string} opts.nip2
 * @returns {Promise<Buffer>}
 */
export async function addGuidanceTablePages(basePdfBytes, opts) {
    const {
        rows, dateGenerated,
        dospem1Name, nip1,
        hasDospem2, dospem2Name, nip2,
    } = opts;

    const pdfDoc = await PDFDocument.load(basePdfBytes);
    const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const fontBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

    // ----- Page / layout constants (Letter size, matching template) -----
    const W = 612, H = 792;           // pts  (8.5 × 11 in)
    const ML = 72, MR = 72, MT = 72, MB = 90; // margins
    const tableW = W - ML - MR;       // usable width

    // Column definitions: No | Tanggal | Pokok Bahasan | Paraf
    const cols = [
        { w: 30,  hdr: 'No',                align: 'center' },
        { w: 100, hdr: 'Tanggal Bimbingan', align: 'center' },
        { w: 305, hdr: 'Pokok bahasan / Kemajuan / Tugas yang Didiskusikan', align: 'left' },
        { w: 33,  hdr: 'Paraf\nDosen',      align: 'center' },
    ];
    const totalColW = cols.reduce((s, c) => s + c.w, 0);
    const scale = tableW / totalColW;
    cols.forEach(c => { c.w = Math.round(c.w * scale); });

    const FS = 10, FS_HDR = 10;
    const LH = FS * 1.3;              // line-height for body
    const cellPad = 4;
    const borderColor = rgb(0, 0, 0);

    // ----- Helper: wrap text into lines -----
    function wrapText(text, maxWidth, f, size) {
        const words = text.split(/\s+/);
        const lines = [];
        let line = '';
        for (const word of words) {
            const test = line ? line + ' ' + word : word;
            if (f.widthOfTextAtSize(test, size) > maxWidth) {
                if (line) lines.push(line);
                line = word;
            } else {
                line = test;
            }
        }
        if (line) lines.push(line);
        return lines.length ? lines : [''];
    }

    // ----- Helper: measure row height -----
    function measureRow(row) {
        let maxH = LH + cellPad * 2; // minimum 1-line height
        const cellTexts = [row.no, row.tanggal, row.notes, ''];
        cellTexts.forEach((txt, ci) => {
            const innerW = cols[ci].w - cellPad * 2;
            // Split on explicit newlines first, then wrap each
            const paragraphs = String(txt || '').split('\n');
            let totalLines = 0;
            for (const p of paragraphs) {
                totalLines += wrapText(p, innerW, font, FS).length;
            }
            const h = totalLines * LH + cellPad * 2;
            if (h > maxH) maxH = h;
        });
        return maxH;
    }

    // ----- Helper: draw a single cell -----
    function drawCell(page, x, y, w, h, text, align, isHeader) {
        const f = isHeader ? fontBold : font;
        const sz = isHeader ? FS_HDR : FS;
        // Border
        page.drawRectangle({ x, y: y - h, width: w, height: h,
            borderColor, borderWidth: 0.5, color: rgb(1, 1, 1) });
        // Text
        const innerW = w - cellPad * 2;
        const paragraphs = String(text || '').split('\n');
        let allLines = [];
        for (const p of paragraphs) {
            allLines.push(...wrapText(p, innerW, f, sz));
        }
        let ty = y - cellPad - sz;
        for (const line of allLines) {
            let tx = x + cellPad;
            if (align === 'center') {
                const tw = f.widthOfTextAtSize(line, sz);
                tx = x + (w - tw) / 2;
            }
            page.drawText(line, { x: tx, y: ty, size: sz, font: f, color: rgb(0, 0, 0) });
            ty -= LH;
        }
    }

    // ----- Helper: draw header row & return its height -----
    function drawHeaderRow(page, startY) {
        // Measure header height
        let hdrH = LH + cellPad * 2;
        cols.forEach(c => {
            const paragraphs = c.hdr.split('\n');
            let lines = 0;
            for (const p of paragraphs) lines += wrapText(p, c.w - cellPad * 2, fontBold, FS_HDR).length;
            const h = lines * LH + cellPad * 2;
            if (h > hdrH) hdrH = h;
        });

        let cx = ML;
        for (const c of cols) {
            drawCell(page, cx, startY, c.w, hdrH, c.hdr, 'center', true);
            cx += c.w;
        }
        return hdrH;
    }

    // ----- Find where content ends on the last Gotenberg page -----
    const pages = pdfDoc.getPages();
    let page = pages[pages.length - 1];
    const { width: pageW, height: pageH } = page.getSize();

    // Parse content stream to find the lowest text Y coordinate
    let lowestY = pageH - 300; // fallback
    try {
        const { inflateSync } = await import('zlib');
        const pdfRaw = Buffer.from(basePdfBytes);
        let pos = 0;
        const yVals = [];
        while (true) {
            const sIdx = pdfRaw.indexOf(Buffer.from('stream\r\n'), pos);
            const sIdx2 = pdfRaw.indexOf(Buffer.from('stream\n'), pos);
            let sm = -1;
            if (sIdx !== -1 && sIdx2 !== -1) sm = Math.min(sIdx, sIdx2);
            else if (sIdx !== -1) sm = sIdx;
            else if (sIdx2 !== -1) sm = sIdx2;
            if (sm === -1) break;
            const off = pdfRaw[sm + 6] === 0x0d ? 8 : 7;
            const ds = sm + off;
            const eIdx = pdfRaw.indexOf(Buffer.from('endstream'), ds);
            if (eIdx === -1) break;
            try {
                const dec = inflateSync(pdfRaw.slice(ds, eIdx));
                const txt = dec.toString('latin1');
                const re = /([\d.]+)\s+([\d.]+)\s+Td/g;
                let m;
                while ((m = re.exec(txt)) !== null) yVals.push(parseFloat(m[2]));
            } catch (_) { /* skip non-zlib */ }
            pos = eIdx + 9;
        }
        if (yVals.length > 0) {
            lowestY = Math.min(...yVals);
        }
    } catch (_) { /* fallback to estimate */ }

    // Start 30pt below the lowest text
    let curY = lowestY - 30;

    // Draw "B. Catatan Asistensi" heading then table immediately
    page.drawText('B.  Catatan Asistensi', {
        x: ML, y: curY, size: 12, font: fontBold, color: rgb(0, 0, 0),
    });
    curY -= 20;

    let hdrH = drawHeaderRow(page, curY);
    curY -= hdrH;

    for (const row of rows) {
        const rh = measureRow(row);
        if (curY - rh < MB) {
            // New page
            page = pdfDoc.addPage([W, H]);
            curY = H - MT;
            hdrH = drawHeaderRow(page, curY);
            curY -= hdrH;
        }
        // Draw data row
        let cx = ML;
        const cellTexts = [row.no, row.tanggal, row.notes, ''];
        const aligns = ['center', 'center', 'left', 'center'];
        for (let ci = 0; ci < cols.length; ci++) {
            drawCell(page, cx, curY, cols[ci].w, rh, cellTexts[ci], aligns[ci], false);
            cx += cols[ci].w;
        }
        curY -= rh;
    }

    // ----- Signature block on the last table page -----
    const sigNeed = 160;
    if (curY - sigNeed < MB) {
        page = pdfDoc.addPage([W, H]);
        curY = H - MT;
    }

    curY -= 20;
    // "Padang, <date>" — right-aligned (matching template indentation)
    const sigX = W - MR - 180;
    page.drawText(`Padang, ${dateGenerated}`, {
        x: sigX, y: curY, size: FS, font, color: rgb(0, 0, 0),
    });
    curY -= 18;

    if (hasDospem2) {
        // Two-column signature
        const leftX = ML + 60;
        const rightX = sigX;

        page.drawText('Pembimbing I', { x: leftX, y: curY, size: FS, font, color: rgb(0, 0, 0) });
        page.drawText('Pembimbing II', { x: rightX, y: curY, size: FS, font, color: rgb(0, 0, 0) });
        curY -= 50; // space for signature

        page.drawText(dospem1Name, { x: leftX, y: curY, size: FS, font: fontBold, color: rgb(0, 0, 0) });
        page.drawText(dospem2Name, { x: rightX, y: curY, size: FS, font: fontBold, color: rgb(0, 0, 0) });
        curY -= 14;

        page.drawText(`NIP. ${nip1}`, { x: leftX, y: curY, size: FS, font, color: rgb(0, 0, 0) });
        page.drawText(`NIP. ${nip2}`, { x: rightX, y: curY, size: FS, font, color: rgb(0, 0, 0) });
    } else {
        // Single supervisor – right-aligned
        page.drawText('Pembimbing I', { x: sigX, y: curY, size: FS, font, color: rgb(0, 0, 0) });
        curY -= 50;
        page.drawText(dospem1Name, { x: sigX, y: curY, size: FS, font: fontBold, color: rgb(0, 0, 0) });
        curY -= 14;
        page.drawText(`NIP. ${nip1}`, { x: sigX, y: curY, size: FS, font, color: rgb(0, 0, 0) });
    }

    const finalBytes = await pdfDoc.save();
    return Buffer.from(finalBytes);
}
