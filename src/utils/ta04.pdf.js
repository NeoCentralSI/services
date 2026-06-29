import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = join(
  __dirname,
  "..",
  "..",
  "..",
  "guide",
  "TA-04_PENUGASAN DOSEN PEMBIMBING TUGAS AKHIR.pdf",
);

const ROWS_PER_FIRST_PAGE = 7;
const ROWS_PER_CONTINUATION_PAGE = 10;
const COLOR_WHITE = rgb(1, 1, 1);
const COLOR_BLACK = rgb(0, 0, 0);
const LINE_THIN = 0.75;

// Coordinates measured from the official TA-04 PDF using PyMuPDF.
// They use the template's native top-left coordinate system and are converted
// to pdf-lib's bottom-left coordinates at draw time.
const TA04_COORDS = {
  page1: {
    semesterTailBox: { x0: 321.8, y0: 214.8, x1: 542.6, y1: 231.2 },
    columns: {
      no: { x0: 72.5, y0: 358.8, x1: 103.2, y1: 590.6, align: "center" },
      name: { x0: 103.7, y0: 358.8, x1: 215.7, y1: 590.6, align: "left" },
      nim: { x0: 216.2, y0: 358.8, x1: 292.2, y1: 590.6, align: "center" },
      title: { x0: 292.8, y0: 358.8, x1: 446.1, y1: 590.6, align: "left" },
      supervisor: { x0: 446.6, y0: 358.8, x1: 539.6, y1: 590.6, align: "left" },
    },
    rows: [
      { y0: 358.8, y1: 391.5 },
      { y0: 391.9, y1: 424.6 },
      { y0: 425.1, y1: 457.9 },
      { y0: 458.4, y1: 491.1 },
      { y0: 491.6, y1: 524.3 },
      { y0: 524.8, y1: 557.5 },
      { y0: 558.0, y1: 590.6 },
    ],
  },
};

const CONTINUATION_PAGE = {
  titleBox: { x0: 72.5, y0: 72.0, x1: 540.0, y1: 96.0 },
  tableTop: 118.0,
  headerHeight: 38.0,
  rowHeight: 54.0,
  columns: {
    no: { x0: 72.5, x1: 103.2, align: "center" },
    name: { x0: 103.7, x1: 215.7, align: "left" },
    nim: { x0: 216.2, x1: 292.2, align: "center" },
    title: { x0: 292.8, x1: 446.1, align: "left" },
    supervisor: { x0: 446.6, x1: 539.6, align: "left" },
  },
};

const SIGNATURE_PAGE = {
  ketentuanBulletBox: { x0: 108.0, y0: 72.0, x1: 540.0, y1: 130.0 },
  pengesahanTitleBox: { x0: 72.5, y0: 160.0, x1: 540.0, y1: 184.0 },
  dateBox: { x0: 310.0, y0: 222.0, x1: 540.0, y1: 240.0 },
  roleBox: { x0: 310.0, y0: 254.0, x1: 540.0, y1: 274.0 },
  nameBox: { x0: 310.0, y0: 364.0, x1: 540.0, y1: 396.0 },
  nipBox: { x0: 310.0, y0: 406.0, x1: 540.0, y1: 424.0 },
};

let templateBytesCache = null;

async function loadTemplateBytes() {
  if (!templateBytesCache) {
    templateBytesCache = await readFile(TEMPLATE_PATH);
  }
  return templateBytesCache;
}

function topToBottomY(pageHeight, topY, fontSize) {
  return pageHeight - topY - fontSize;
}

function topToPdfY(page, topY) {
  return page.getHeight() - topY;
}

function drawLineTop(page, x1, y1, x2, y2, thickness = LINE_THIN) {
  page.drawLine({
    start: { x: x1, y: topToPdfY(page, y1) },
    end: { x: x2, y: topToPdfY(page, y2) },
    thickness,
    color: COLOR_BLACK,
  });
}

function drawTextAtTop(page, text, x, topY, font, size, options = {}) {
  page.drawText(String(text ?? ""), {
    x,
    y: topToBottomY(page.getHeight(), topY, size),
    size,
    font,
    color: options.color ?? COLOR_BLACK,
  });
}

function drawWhiteMask(page, box, padding = {}) {
  const {
    left = 0,
    right = 0,
    top = 0,
    bottom = 0,
  } = padding;
  const pageHeight = page.getHeight();
  const x = box.x0 - left;
  const yTop = box.y0 - top;
  const width = (box.x1 - box.x0) + left + right;
  const height = (box.y1 - box.y0) + top + bottom;
  page.drawRectangle({
    x,
    y: pageHeight - yTop - height,
    width,
    height,
    color: COLOR_WHITE,
    borderColor: COLOR_WHITE,
    borderWidth: 0,
  });
}

function wrapText(text, font, fontSize, maxWidth) {
  const words = String(text ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];

  const lines = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(test, fontSize) <= maxWidth) {
      current = test;
      continue;
    }

    if (current) {
      lines.push(current);
      current = word;
      continue;
    }

    // Force-break a single long token.
    let token = word;
    while (token.length > 0) {
      let slice = token;
      while (slice.length > 1 && font.widthOfTextAtSize(slice, fontSize) > maxWidth) {
        slice = slice.slice(0, -1);
      }
      lines.push(slice);
      token = token.slice(slice.length);
    }
    current = "";
  }

  if (current) lines.push(current);
  return lines;
}

function truncateLines(lines, font, fontSize, maxWidth, maxLines) {
  if (lines.length <= maxLines) return lines;

  const next = lines.slice(0, maxLines);
  let last = next[maxLines - 1];
  const ellipsis = "...";
  while (last.length > 1 && font.widthOfTextAtSize(`${last}${ellipsis}`, fontSize) > maxWidth) {
    last = last.slice(0, -1);
  }
  next[maxLines - 1] = `${last}${ellipsis}`;
  return next;
}

function fitTextToBox(text, font, boxWidth, boxHeight, options = {}) {
  const {
    maxSize = 11,
    minSize = 8,
    lineHeightMultiplier = 1.05,
    maxLines = null,
  } = options;

  let size = maxSize;
  while (size >= minSize) {
    const lineHeight = size * lineHeightMultiplier;
    const lines = wrapText(text, font, size, boxWidth);
    const fitsLineCount = maxLines == null || lines.length <= maxLines;
    if (fitsLineCount && (lines.length * lineHeight) <= boxHeight) {
      return { lines, fontSize: size, lineHeight };
    }
    size -= 0.5;
  }

  const fontSize = minSize;
  const lineHeight = fontSize * lineHeightMultiplier;
  const allowedLines = Math.max(1, Math.floor(boxHeight / lineHeight));
  const wrapped = wrapText(text, font, fontSize, boxWidth);
  return {
    lines: truncateLines(wrapped, font, fontSize, boxWidth, allowedLines),
    fontSize,
    lineHeight,
  };
}

function drawTextInBox(page, text, box, font, options = {}) {
  const {
    align = "left",
    mask = true,
    maskPadding = { left: 1, right: 1, top: 1, bottom: 1 },
    textPaddingX = 4,
    textPaddingY = 4,
    maxSize = 11,
    minSize = 8,
    maxLines = null,
    lineHeightMultiplier = 1.05,
    verticalAlign = "top",
  } = options;

  if (mask) {
    drawWhiteMask(page, box, maskPadding);
  }

  const innerWidth = Math.max(1, (box.x1 - box.x0) - (textPaddingX * 2));
  const innerHeight = Math.max(1, (box.y1 - box.y0) - (textPaddingY * 2));
  const pageHeight = page.getHeight();

  const { lines, fontSize, lineHeight } = fitTextToBox(text, font, innerWidth, innerHeight, {
    maxSize,
    minSize,
    lineHeightMultiplier,
    maxLines,
  });

  const totalTextHeight = lines.length * lineHeight;
  let cursorTop = box.y0 + textPaddingY;
  if (verticalAlign === "middle") {
    cursorTop = box.y0 + textPaddingY + Math.max(0, (innerHeight - totalTextHeight) / 2);
  }
  for (const line of lines) {
    const lineWidth = font.widthOfTextAtSize(line, fontSize);
    let x = box.x0 + textPaddingX;
    if (align === "center") {
      x = box.x0 + ((box.x1 - box.x0 - lineWidth) / 2);
    } else if (align === "right") {
      x = box.x1 - textPaddingX - lineWidth;
    }

    page.drawText(line, {
      x,
      y: topToBottomY(pageHeight, cursorTop, fontSize),
      size: fontSize,
      font,
      color: COLOR_BLACK,
    });
    cursorTop += lineHeight;
  }
}

function getRowCellBox(column, row, innerPadding = 2) {
  return {
    x0: column.x0 + innerPadding,
    y0: row.y0 + innerPadding,
    x1: column.x1 - innerPadding,
    y1: row.y1 - innerPadding,
  };
}

function getContinuationCellBox(column, row, innerPadding = 2) {
  return {
    x0: column.x0 + innerPadding,
    y0: row.y0 + innerPadding,
    x1: column.x1 - innerPadding,
    y1: row.y1 - innerPadding,
  };
}

async function copyTemplatePage(outputDoc, templateDoc, pageIndex) {
  const [page] = await outputDoc.copyPages(templateDoc, [pageIndex]);
  outputDoc.addPage(page);
  return page;
}

function drawRowNumber(page, rowIndex, globalRowNumber, font) {
  const row = TA04_COORDS.page1.rows[rowIndex];
  const noColumn = TA04_COORDS.page1.columns.no;
  const box = getRowCellBox(noColumn, row, 4);

  // The official template already contains static 1..7 row numbers, so mask
  // and redraw them to keep generated text aligned with row content.
  drawTextInBox(page, String(globalRowNumber), box, font, {
    align: "center",
    mask: true,
    maskPadding: { left: 4, right: 4, top: 2, bottom: 2 },
    textPaddingX: 2,
    textPaddingY: 5,
    maxSize: 11,
    minSize: 10,
    maxLines: 1,
    lineHeightMultiplier: 1.0,
    verticalAlign: "middle",
  });
}

function drawEntryCells(page, rowIndex, entry, font) {
  const row = TA04_COORDS.page1.rows[rowIndex];
  const { name, nim, title, supervisor } = TA04_COORDS.page1.columns;

  drawTextInBox(page, entry.studentName, getRowCellBox(name, row), font, {
    align: "left",
    textPaddingX: 5,
    textPaddingY: 4,
    maxSize: 10,
    minSize: 8,
    maxLines: 3,
    lineHeightMultiplier: 1.0,
    verticalAlign: "middle",
  });

  drawTextInBox(page, entry.nim, getRowCellBox(nim, row), font, {
    align: "center",
    textPaddingX: 2,
    textPaddingY: 5,
    maxSize: 10,
    minSize: 9,
    maxLines: 1,
    lineHeightMultiplier: 1.0,
    verticalAlign: "middle",
  });

  drawTextInBox(page, entry.title, getRowCellBox(title, row), font, {
    align: "left",
    textPaddingX: 4,
    textPaddingY: 3,
    maxSize: 8.8,
    minSize: 6.8,
    maxLines: 4,
    lineHeightMultiplier: 1.0,
    verticalAlign: "middle",
  });

  drawTextInBox(page, entry.supervisorName, getRowCellBox(supervisor, row), font, {
    align: "left",
    textPaddingX: 4,
    textPaddingY: 3,
    maxSize: 8.8,
    minSize: 6.8,
    maxLines: 4,
    lineHeightMultiplier: 1.0,
    verticalAlign: "middle",
  });
}

function overlayPageOne(page, entries, startIndex, semester, font) {
  drawTextInBox(page, `semester ${semester}, maka melalui formulir`, TA04_COORDS.page1.semesterTailBox, font, {
    align: "left",
    textPaddingX: 0,
    textPaddingY: 2,
    maxSize: 10.75,
    minSize: 10.75,
    maxLines: 1,
    lineHeightMultiplier: 1.0,
    maskPadding: { left: 1, right: 2, top: 1, bottom: 1 },
  });

  for (let rowIndex = 0; rowIndex < ROWS_PER_FIRST_PAGE; rowIndex += 1) {
    const globalRowNumber = startIndex + rowIndex + 1;
    const entry = entries[rowIndex];
    drawRowNumber(page, rowIndex, entry ? globalRowNumber : "", font);
    if (!entry) continue;
    drawEntryCells(page, rowIndex, entry, font);
  }
}

function buildContinuationRows(rowCount) {
  return Array.from({ length: rowCount }, (_, index) => {
    const y0 = CONTINUATION_PAGE.tableTop + CONTINUATION_PAGE.headerHeight + (index * CONTINUATION_PAGE.rowHeight);
    return { y0, y1: y0 + CONTINUATION_PAGE.rowHeight };
  });
}

function drawTableGrid(page, rows) {
  const { columns, tableTop, headerHeight } = CONTINUATION_PAGE;
  const x0 = columns.no.x0;
  const x1 = columns.supervisor.x1;
  const tableBottom = rows.length > 0 ? rows[rows.length - 1].y1 : tableTop + headerHeight;
  const columnEdges = [
    columns.no.x0,
    columns.no.x1,
    columns.name.x1,
    columns.nim.x1,
    columns.title.x1,
    columns.supervisor.x1,
  ];

  drawLineTop(page, x0, tableTop, x1, tableTop);
  drawLineTop(page, x0, tableTop + headerHeight, x1, tableTop + headerHeight);
  for (const row of rows) {
    drawLineTop(page, x0, row.y1, x1, row.y1);
  }
  for (const edge of columnEdges) {
    drawLineTop(page, edge, tableTop, edge, tableBottom);
  }
}

function drawContinuationHeader(page, boldFont) {
  const { columns, tableTop, headerHeight } = CONTINUATION_PAGE;
  const headerRow = { y0: tableTop, y1: tableTop + headerHeight };
  const cells = [
    [columns.no, "No."],
    [columns.name, "Nama Mahasiswa"],
    [columns.nim, "NIM"],
    [columns.title, "Judul Tugas Akhir"],
    [columns.supervisor, "Nama Dosen Pembimbing"],
  ];

  for (const [column, label] of cells) {
    drawTextInBox(page, label, getContinuationCellBox(column, headerRow, 3), boldFont, {
      align: "center",
      mask: false,
      textPaddingX: 2,
      textPaddingY: 2,
      maxSize: 12,
      minSize: 9,
      lineHeightMultiplier: 1.0,
      verticalAlign: "middle",
    });
  }
}

function drawContinuationRow(page, row, entry, globalRowNumber, font) {
  const { columns } = CONTINUATION_PAGE;
  drawTextInBox(page, String(globalRowNumber), getContinuationCellBox(columns.no, row, 4), font, {
    align: "center",
    mask: false,
    textPaddingX: 2,
    textPaddingY: 4,
    maxSize: 11,
    minSize: 10,
    maxLines: 1,
    lineHeightMultiplier: 1.0,
    verticalAlign: "middle",
  });

  drawTextInBox(page, entry.studentName, getContinuationCellBox(columns.name, row), font, {
    align: "left",
    mask: false,
    textPaddingX: 5,
    textPaddingY: 4,
    maxSize: 10,
    minSize: 8,
    maxLines: 4,
    lineHeightMultiplier: 1.0,
    verticalAlign: "middle",
  });

  drawTextInBox(page, entry.nim, getContinuationCellBox(columns.nim, row), font, {
    align: "center",
    mask: false,
    textPaddingX: 2,
    textPaddingY: 4,
    maxSize: 10,
    minSize: 9,
    maxLines: 1,
    lineHeightMultiplier: 1.0,
    verticalAlign: "middle",
  });

  drawTextInBox(page, entry.title, getContinuationCellBox(columns.title, row), font, {
    align: "left",
    mask: false,
    textPaddingX: 4,
    textPaddingY: 4,
    maxSize: 9,
    minSize: 7,
    maxLines: 5,
    lineHeightMultiplier: 1.0,
    verticalAlign: "middle",
  });

  drawTextInBox(page, entry.supervisorName, getContinuationCellBox(columns.supervisor, row), font, {
    align: "left",
    mask: false,
    textPaddingX: 4,
    textPaddingY: 4,
    maxSize: 9,
    minSize: 7,
    maxLines: 5,
    lineHeightMultiplier: 1.0,
    verticalAlign: "middle",
  });
}

function addBlankPageLike(outputDoc, templateDoc) {
  const templatePage = templateDoc.getPage(0);
  return outputDoc.addPage([templatePage.getWidth(), templatePage.getHeight()]);
}

function drawContinuationPage(page, entries, startIndex, regularFont, boldFont) {
  drawTextInBox(
    page,
    "A. Data Penugasan Dosen Pembimbing Tugas Akhir (lanjutan)",
    CONTINUATION_PAGE.titleBox,
    boldFont,
    {
      align: "left",
      mask: false,
      textPaddingX: 0,
      textPaddingY: 0,
      maxSize: 14,
      minSize: 12,
      maxLines: 1,
      lineHeightMultiplier: 1.0,
    },
  );

  const rows = buildContinuationRows(Math.max(1, entries.length));
  drawTableGrid(page, rows);
  drawContinuationHeader(page, boldFont);

  entries.forEach((entry, index) => {
    drawContinuationRow(page, rows[index], entry, startIndex + index + 1, regularFont);
  });
}

function drawSignaturePage(page, dateGenerated, kadepName, kadepNip, regularFont, boldFont) {
  drawTextAtTop(page, "\u2022", 90.0, 76.0, regularFont, 13);
  drawTextInBox(
    page,
    "Perubahan dosen pembimbing hanya dapat dilakukan melalui prosedur resmi dan disetujui oleh Ketua Departemen.",
    SIGNATURE_PAGE.ketentuanBulletBox,
    regularFont,
    {
      align: "left",
      mask: false,
      textPaddingX: 0,
      textPaddingY: 0,
      maxSize: 13,
      minSize: 11,
      lineHeightMultiplier: 1.25,
    },
  );

  drawTextInBox(page, "C. Pengesahan", SIGNATURE_PAGE.pengesahanTitleBox, boldFont, {
    align: "left",
    mask: false,
    textPaddingX: 0,
    textPaddingY: 0,
    maxSize: 14,
    minSize: 12,
    maxLines: 1,
    lineHeightMultiplier: 1.0,
  });

  drawTextInBox(page, `Padang, ${dateGenerated}`, SIGNATURE_PAGE.dateBox, regularFont, {
    align: "center",
    mask: false,
    textPaddingX: 0,
    textPaddingY: 0,
    maxSize: 12,
    minSize: 10,
    maxLines: 1,
    lineHeightMultiplier: 1.0,
  });

  drawTextInBox(page, "Ketua Departemen Sistem Informasi,", SIGNATURE_PAGE.roleBox, regularFont, {
    align: "center",
    mask: false,
    textPaddingX: 0,
    textPaddingY: 0,
    maxSize: 12,
    minSize: 10,
    maxLines: 1,
    lineHeightMultiplier: 1.0,
  });

  drawTextInBox(page, kadepName, SIGNATURE_PAGE.nameBox, boldFont, {
    align: "center",
    mask: false,
    textPaddingX: 0,
    textPaddingY: 0,
    maxSize: 11,
    minSize: 8,
    maxLines: 2,
    lineHeightMultiplier: 1.0,
    verticalAlign: "middle",
  });

  drawTextInBox(page, `NIP: ${kadepNip}`, SIGNATURE_PAGE.nipBox, regularFont, {
    align: "center",
    mask: false,
    textPaddingX: 0,
    textPaddingY: 0,
    maxSize: 12,
    minSize: 10,
    maxLines: 1,
    lineHeightMultiplier: 1.0,
  });
}

/**
 * Generate TA-04 by overlaying dynamic text on top of the official PDF.
 *
 * For <= 7 rows:
 * - page 1 = official TA-04 page 1 with row data
 * - page 2 = content-only ketentuan/pengesahan page
 *
 * For > 7 rows:
 * - page 1 = official TA-04 page 1 with rows 1..7
 * - page 2..n = content-only continuation table pages for rows 8+
 * - last page = content-only ketentuan/pengesahan page
 *
 * @param {Object} opts
 * @param {string} opts.semester
 * @param {Array<{studentName:string, nim:string, title:string, supervisorName:string}>} opts.entries
 * @param {string} opts.dateGenerated
 * @param {string} opts.kadepName
 * @param {string} opts.kadepNip
 * @returns {Promise<Buffer>}
 */
export async function generateTA04Pdf(opts) {
  const {
    semester,
    entries = [],
    dateGenerated,
    kadepName,
    kadepNip,
  } = opts;

  const templateBytes = await loadTemplateBytes();
  const templateDoc = await PDFDocument.load(templateBytes);
  const outputDoc = await PDFDocument.create();

  const regularFont = await outputDoc.embedFont(StandardFonts.TimesRoman);
  const boldFont = await outputDoc.embedFont(StandardFonts.TimesRomanBold);

  const pageOneEntries = entries.slice(0, ROWS_PER_FIRST_PAGE);
  const continuationChunks = [];
  for (let i = ROWS_PER_FIRST_PAGE; i < entries.length; i += ROWS_PER_CONTINUATION_PAGE) {
    continuationChunks.push(entries.slice(i, i + ROWS_PER_CONTINUATION_PAGE));
  }

  const officialPage1 = await copyTemplatePage(outputDoc, templateDoc, 0);
  overlayPageOne(officialPage1, pageOneEntries, 0, semester, regularFont);

  let continuationStart = ROWS_PER_FIRST_PAGE;
  for (const chunk of continuationChunks) {
    const continuationPage = addBlankPageLike(outputDoc, templateDoc);
    drawContinuationPage(continuationPage, chunk, continuationStart, regularFont, boldFont);
    continuationStart += ROWS_PER_CONTINUATION_PAGE;
  }

  const signaturePage = addBlankPageLike(outputDoc, templateDoc);
  drawSignaturePage(signaturePage, dateGenerated, kadepName, kadepNip, regularFont, boldFont);

  const pdfBytes = await outputDoc.save();
  return Buffer.from(pdfBytes);
}
