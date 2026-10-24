import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Official "Formulir TA-04" template (Penugasan Dosen Pembimbing Tugas Akhir), shipped with src.
const TEMPLATE_PATH = join(__dirname, "..", "assets", "supervisor-assignment-template.pdf");

const ROWS_PER_FIRST_PAGE = 7;
const ROWS_PER_CONTINUATION_PAGE = 10;
const COLOR_WHITE = rgb(1, 1, 1);
const COLOR_BLACK = rgb(0, 0, 0);
const LINE_THIN = 0.75;

// The official page 1 has a 7-row table with "B. Ketentuan" below it. The page is cut right
// under the last student's row, so the table has exactly one row per student (no empty rows)
// and the template's own B never interrupts section A; B and C are drawn after the last table.
// The row's bottom line is 0.75 pt thick around `y1`; the cut keeps all of it.
const PAGE1_ROW_CUT_BELOW = 0.8;
// Space between the end of the last table and "B. Ketentuan" on the same page.
const GAP_AFTER_TABLE = 28.0;

const KETENTUAN_BULLETS = [
  "Dosen pembimbing bertanggung jawab membimbing mahasiswa dalam proses penyusunan proposal, pengembangan sistem, seminar hasil, hingga pelaksanaan sidang Tugas Akhir.",
  "Mahasiswa wajib aktif melakukan bimbingan dan mencatat prosesnya secara administratif.",
  "Perubahan dosen pembimbing hanya dapat dilakukan melalui prosedur resmi dan disetujui oleh Ketua Departemen.",
];

// Coordinates measured from the official TA-04 PDF using PyMuPDF.
// They use the template's native top-left coordinate system and are converted
// to pdf-lib's bottom-left coordinates at draw time.
const TEMPLATE_COORDS = {
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

// Flow layout for sections B and C on content-only pages (supports multi-page each).
const FLOW_PAGE = {
  top: 72.0,
  bottomMargin: 72.0,
  left: 72.5,
  right: 540.0,
  bulletIndent: 108.0,
  bulletGlyphX: 90.0,
  sectionTitleHeight: 28.0,
  bulletGap: 14.0,
  signatureHeight: 280.0,
  afterBGap: 28.0,
};

const SECTION = Object.freeze({
  A: "A",
  B: "B",
  C: "C",
});

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

/**
 * Copy official page 1 but drop everything below `keepUntilTopY` (top-left coords): the empty
 * rows of the table and the template's own "B. Ketentuan".
 */
async function copyTemplatePage1Until(outputDoc, templateDoc, keepUntilTopY) {
  const templatePage = templateDoc.getPage(0);
  const { width, height } = templatePage.getSize();
  const cropBottom = Math.max(0, height - keepUntilTopY);
  const embedded = await outputDoc.embedPage(templatePage, {
    left: 0,
    bottom: cropBottom,
    right: width,
    top: height,
  });

  const page = outputDoc.addPage([width, height]);
  page.drawPage(embedded, {
    x: 0,
    y: cropBottom,
    width,
    height: height - cropBottom,
  });
  return page;
}

function drawRowNumber(page, rowIndex, globalRowNumber, font) {
  const row = TEMPLATE_COORDS.page1.rows[rowIndex];
  const noColumn = TEMPLATE_COORDS.page1.columns.no;
  const box = getRowCellBox(noColumn, row, 4);

  // The official template already contains static 1..7 row numbers, so mask
  // and redraw them to keep generated text aligned with row content. The mask stays
  // 1 pt inside the cell edges (as in the other columns); flush with the edges it covered half
  // of the column lines, which viewers showed as broken lines in the No column.
  drawTextInBox(page, String(globalRowNumber), box, font, {
    align: "center",
    mask: true,
    maskPadding: { left: 3, right: 3, top: 2, bottom: 2 },
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
  const row = TEMPLATE_COORDS.page1.rows[rowIndex];
  const { name, nim, title, supervisor } = TEMPLATE_COORDS.page1.columns;

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
  drawTextInBox(page, `semester ${semester}, maka melalui formulir`, TEMPLATE_COORDS.page1.semesterTailBox, font, {
    align: "left",
    textPaddingX: 0,
    textPaddingY: 2,
    maxSize: 10.75,
    minSize: 10.75,
    maxLines: 1,
    lineHeightMultiplier: 1.0,
    maskPadding: { left: 1, right: 2, top: 1, bottom: 1 },
  });

  // Only the students' rows remain on the cut page; each gets its number and cells.
  entries.slice(0, ROWS_PER_FIRST_PAGE).forEach((entry, rowIndex) => {
    drawRowNumber(page, rowIndex, startIndex + rowIndex + 1, font);
    drawEntryCells(page, rowIndex, entry, font);
  });
}

/** Rows on page 1 (at least one, so an empty cohort still shows the table head). */
function firstPageRowCount(entryCount) {
  return Math.min(Math.max(1, entryCount), ROWS_PER_FIRST_PAGE);
}

/** Where page 1 is cut: right under its last student's row. */
function firstPageCutTop(entryCount) {
  return TEMPLATE_COORDS.page1.rows[firstPageRowCount(entryCount) - 1].y1 + PAGE1_ROW_CUT_BELOW;
}

/** The bottom of the last table of section A (page 1 or the last continuation page). */
function lastTableBottom(entryCount) {
  const count = Math.max(1, entryCount);
  if (count <= ROWS_PER_FIRST_PAGE) return firstPageCutTop(count);
  const lastRows = (count - ROWS_PER_FIRST_PAGE) % ROWS_PER_CONTINUATION_PAGE || ROWS_PER_CONTINUATION_PAGE;
  return CONTINUATION_PAGE.tableTop + CONTINUATION_PAGE.headerHeight + lastRows * CONTINUATION_PAGE.rowHeight;
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

function drawContinuationPage(page, entries, startIndex, regularFont, boldFont, { isContinuation = true } = {}) {
  const title = isContinuation
    ? "A. Data Penugasan Dosen Pembimbing Tugas Akhir (lanjutan)"
    : "A. Data Penugasan Dosen Pembimbing Tugas Akhir";

  drawTextInBox(
    page,
    title,
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

function flowPageBottom(pageHeight) {
  return pageHeight - FLOW_PAGE.bottomMargin;
}

function measureBulletBlockHeight(text, font, fontSize = 13, lineHeightMultiplier = 1.25) {
  const maxWidth = FLOW_PAGE.right - FLOW_PAGE.bulletIndent;
  const lines = wrapText(text, font, fontSize, maxWidth);
  return Math.max(32, (lines.length * fontSize * lineHeightMultiplier) + 6);
}

function drawSectionTitle(page, title, topY, boldFont) {
  const box = {
    x0: FLOW_PAGE.left,
    y0: topY,
    x1: FLOW_PAGE.right,
    y1: topY + FLOW_PAGE.sectionTitleHeight,
  };
  drawTextInBox(page, title, box, boldFont, {
    align: "left",
    mask: false,
    textPaddingX: 0,
    textPaddingY: 0,
    maxSize: 14,
    minSize: 12,
    maxLines: 1,
    lineHeightMultiplier: 1.0,
  });
  return topY + FLOW_PAGE.sectionTitleHeight;
}

function drawBulletBlock(page, text, topY, regularFont) {
  const height = measureBulletBlockHeight(text, regularFont);
  const box = {
    x0: FLOW_PAGE.bulletIndent,
    y0: topY,
    x1: FLOW_PAGE.right,
    y1: topY + height,
  };
  drawTextAtTop(page, "\u2022", FLOW_PAGE.bulletGlyphX, topY + 2, regularFont, 13);
  drawTextInBox(page, text, box, regularFont, {
    align: "left",
    mask: false,
    textPaddingX: 0,
    textPaddingY: 0,
    maxSize: 13,
    minSize: 11,
    lineHeightMultiplier: 1.25,
  });
  return topY + height + FLOW_PAGE.bulletGap;
}

function drawSignatureBlockAt(page, startTopY, dateGenerated, kadepName, kadepNip, regularFont, boldFont, preview, logo) {
  const layout = {
    pengesahanTitleBox: {
      x0: FLOW_PAGE.left,
      y0: startTopY,
      x1: FLOW_PAGE.right,
      y1: startTopY + 24,
    },
    dateBox: {
      x0: 310.0,
      y0: startTopY + 60,
      x1: FLOW_PAGE.right,
      y1: startTopY + 78,
    },
    roleBox: {
      x0: 310.0,
      y0: startTopY + 92,
      x1: FLOW_PAGE.right,
      y1: startTopY + 112,
    },
    nameBox: {
      x0: 310.0,
      y0: startTopY + 202,
      x1: FLOW_PAGE.right,
      y1: startTopY + 234,
    },
    nipBox: {
      x0: 310.0,
      y0: startTopY + 244,
      x1: FLOW_PAGE.right,
      y1: startTopY + 262,
    },
  };

  drawTextInBox(page, "C. Pengesahan", layout.pengesahanTitleBox, boldFont, {
    align: "left",
    mask: false,
    textPaddingX: 0,
    textPaddingY: 0,
    maxSize: 14,
    minSize: 12,
    maxLines: 1,
    lineHeightMultiplier: 1.0,
  });

  drawTextInBox(page, `Padang, ${dateGenerated}`, layout.dateBox, regularFont, {
    align: "center",
    mask: false,
    textPaddingX: 0,
    textPaddingY: 0,
    maxSize: 12,
    minSize: 10,
    maxLines: 1,
    lineHeightMultiplier: 1.0,
  });

  drawTextInBox(page, "Ketua Departemen Sistem Informasi,", layout.roleBox, regularFont, {
    align: "center",
    mask: false,
    textPaddingX: 0,
    textPaddingY: 0,
    maxSize: 12,
    minSize: 10,
    maxLines: 1,
    lineHeightMultiplier: 1.0,
  });

  drawTextInBox(page, kadepName, layout.nameBox, boldFont, {
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

  drawTextInBox(page, `NIP: ${kadepNip}`, layout.nipBox, regularFont, {
    align: "center",
    mask: false,
    textPaddingX: 0,
    textPaddingY: 0,
    maxSize: 12,
    minSize: 10,
    maxLines: 1,
    lineHeightMultiplier: 1.0,
  });

  if (preview) {
    drawTextAtTop(page, "(belum diterbitkan)", 365, startTopY + 150, regularFont, 11);
  } else if (logo) {
    const dimensions = logo.scaleToFit(65, 65);
    page.drawImage(logo, { x: 425 - dimensions.width / 2, y: page.getHeight() - startTopY - 190, ...dimensions });
  }
  return startTopY + FLOW_PAGE.signatureHeight;
}

/**
 * Enforce canonical reading order: A* then B* then C* (no interleaving).
 * @param {Array<{section:string}>} pagePlan
 */
export function assertStrictSectionOrder(pagePlan) {
  const rank = { [SECTION.A]: 0, [SECTION.B]: 1, [SECTION.C]: 2 };
  let previous = -1;
  for (const page of pagePlan) {
    const current = rank[page.section];
    if (current == null) {
      throw new Error(`Unknown TA-04 section: ${page.section}`);
    }
    if (current < previous) {
      throw new Error(
        `Invalid TA-04 section order: ${pagePlan.map((p) => p.section).join(" → ")}`,
      );
    }
    previous = current;
  }
  return true;
}

function chunkEntriesForSectionA(entries) {
  const chunks = [];
  chunks.push({
    section: SECTION.A,
    kind: "primary",
    startIndex: 0,
    entries: entries.slice(0, ROWS_PER_FIRST_PAGE),
  });

  for (let i = ROWS_PER_FIRST_PAGE; i < entries.length; i += ROWS_PER_CONTINUATION_PAGE) {
    chunks.push({
      section: SECTION.A,
      kind: "continuation",
      startIndex: i,
      entries: entries.slice(i, i + ROWS_PER_CONTINUATION_PAGE),
    });
  }

  return chunks;
}

/**
 * Plan of sections B and C. B starts under the last table of section A when its title and
 * first bullet fit there (`startTop`), otherwise on a new page; it continues on as many pages
 * as needed, and C follows on the last B page when it fits, else on its own page. A page that
 * shares the last A page is marked `onAPage`.
 * @param {string[]} bullets
 * @param {number} pageHeight
 * @param {import('pdf-lib').PDFFont} regularFont
 * @param {number|null} [startTop]
 */
function planKetentuanAndPengesahanPages(bullets, pageHeight, regularFont, startTop = null) {
  const bottom = flowPageBottom(pageHeight);
  const pages = [];
  let current = null;
  let cursor = 0;
  const openPage = (kind, top, onAPage = false) => {
    current = { section: SECTION.B, kind, bullets: [], drawC: false, startTop: top, onAPage };
    pages.push(current);
    cursor = top + FLOW_PAGE.sectionTitleHeight;
  };

  const firstHeight = bullets.length > 0 ? measureBulletBlockHeight(bullets[0], regularFont) + FLOW_PAGE.bulletGap : 0;
  if (startTop != null && startTop + FLOW_PAGE.sectionTitleHeight + firstHeight <= bottom) openPage("primary", startTop, true);
  else openPage("primary", FLOW_PAGE.top);

  for (const text of bullets) {
    const height = measureBulletBlockHeight(text, regularFont) + FLOW_PAGE.bulletGap;
    if (current.bullets.length > 0 && cursor + height > bottom) openPage("continuation", FLOW_PAGE.top);
    current.bullets.push(text);
    cursor += height;
  }

  // Section C only after all B content is placed.
  if (cursor + FLOW_PAGE.afterBGap + FLOW_PAGE.signatureHeight <= bottom) {
    current.drawC = true;
  } else {
    pages.push({ section: SECTION.C, kind: "primary", bullets: [], drawC: true, startTop: FLOW_PAGE.top, onAPage: false });
  }
  return pages;
}

/**
 * Pure planner for TA-04 page structure. Exported for unit tests.
 * Always emits pages in section order A* → B* → C*. The tables of section A have exactly one
 * row per student: page 1 holds up to 7, each continuation page up to 10 under a repeated head.
 *
 * @param {number} entryCount
 * @param {object} [options]
 * @param {string[]} [options.ketentuanBullets]
 * @param {number} [options.pageHeight]
 * @param {{widthOfTextAtSize: Function}} [options.regularFont]
 */
export function planAssignmentDocumentStructure(entryCount, options = {}) {
  const safeCount = Math.max(0, Number(entryCount) || 0);
  const overflowCount = Math.max(0, safeCount - ROWS_PER_FIRST_PAGE);
  const hasOverflow = overflowCount > 0;
  const aContinuationCount = overflowCount === 0 ? 0 : Math.ceil(overflowCount / ROWS_PER_CONTINUATION_PAGE);

  const bullets = options.ketentuanBullets ?? [...KETENTUAN_BULLETS];
  const pageHeight = options.pageHeight ?? 792;
  const regularFont = options.regularFont ?? {
    // Conservative estimator used when font is unavailable (unit tests for counts).
    widthOfTextAtSize: (text, size) => String(text).length * size * 0.5,
  };

  const tableRows = [
    firstPageRowCount(safeCount),
    ...Array.from({ length: aContinuationCount }, (_, index) =>
      Math.min(ROWS_PER_CONTINUATION_PAGE, overflowCount - index * ROWS_PER_CONTINUATION_PAGE)),
  ];
  const aPages = tableRows.map((rows, index) => ({ section: SECTION.A, kind: index === 0 ? "primary" : "continuation", rows, flow: null }));

  const bcPages = planKetentuanAndPengesahanPages(bullets, pageHeight, regularFont, lastTableBottom(safeCount) + GAP_AFTER_TABLE);
  if (bcPages[0]?.onAPage) aPages[aPages.length - 1].flow = bcPages.shift();
  const pages = [...aPages, ...bcPages];
  assertStrictSectionOrder(pages);

  const sectionsOf = (page) => {
    if (page.section === SECTION.A) {
      return page.flow ? [SECTION.A, SECTION.B, ...(page.flow.drawC ? [SECTION.C] : [])] : [SECTION.A];
    }
    if (page.section === SECTION.B && page.drawC) return [SECTION.B, SECTION.C];
    return [page.section];
  };

  return {
    hasOverflow,
    continuationPageCount: aContinuationCount,
    tableRows,
    totalPages: pages.length,
    pages,
    sectionSequence: pages.flatMap(sectionsOf),
  };
}

function drawKetentuanPage(page, planPage, {
  dateGenerated,
  kadepName,
  kadepNip,
  regularFont,
  boldFont,
  preview,
  logo,
}) {
  let cursor = planPage.startTop ?? FLOW_PAGE.top;
  if (planPage.section === SECTION.B) {
    const title = planPage.kind === "continuation"
      ? "B. Ketentuan (lanjutan)"
      : "B. Ketentuan";
    cursor = drawSectionTitle(page, title, cursor, boldFont);
    for (const text of planPage.bullets) {
      cursor = drawBulletBlock(page, text, cursor, regularFont);
    }
  }

  if (planPage.drawC) {
    if (planPage.section === SECTION.B) {
      cursor += FLOW_PAGE.afterBGap;
    } else {
      cursor = planPage.startTop ?? FLOW_PAGE.top;
    }
    drawSignatureBlockAt(page, cursor, dateGenerated, kadepName, kadepNip, regularFont, boldFont, preview, logo);
  }
}

/**
 * Generate TA-04 by overlaying dynamic text on top of the official PDF.
 *
 * Strict structural invariant (always):
 *   A (primary + semua lanjutan) → B (primary + semua lanjutan) → C
 *
 * - page 1 = official TA-04 page 1 cut under the last student's row (up to 7 rows, no empty
 *   row, without the template's own B)
 * - more than 7 students: continuation tables of up to 10 rows, the table head repeated
 * - then B, under the last table when it fits, then C (each paginated if needed)
 *
 * @param {Object} opts
 * @param {string} opts.semester
 * @param {Array<{studentName:string, nim:string, title:string, supervisorName:string}>} opts.entries
 * @param {string} opts.dateGenerated
 * @param {string} opts.kadepName
 * @param {string} opts.kadepNip
 * @returns {Promise<Buffer>}
 */
export async function generateSupervisorAssignmentPdf(opts) {
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

  const pageHeight = templateDoc.getPage(0).getHeight();
  const plan = planAssignmentDocumentStructure(entries.length, {
    ketentuanBullets: [...KETENTUAN_BULLETS],
    pageHeight,
    regularFont,
  });
  assertStrictSectionOrder(plan.pages);

  const aChunks = chunkEntriesForSectionA(entries);
  let aChunkIndex = 0;
  const logo = opts.preview ? null : await outputDoc.embedPng(await readFile(join(__dirname, "..", "assets", "unand-logo.png")));
  const flowOptions = { dateGenerated, kadepName, kadepNip, regularFont, boldFont, preview: opts.preview, logo };

  for (const planPage of plan.pages) {
    if (planPage.section === SECTION.A) {
      const chunk = aChunks[aChunkIndex];
      aChunkIndex += 1;

      let page;
      if (planPage.kind === "primary") {
        page = await copyTemplatePage1Until(outputDoc, templateDoc, firstPageCutTop(entries.length));
        overlayPageOne(page, chunk.entries, chunk.startIndex, semester, regularFont);
      } else {
        page = addBlankPageLike(outputDoc, templateDoc);
        drawContinuationPage(page, chunk.entries, chunk.startIndex, regularFont, boldFont, { isContinuation: true });
      }
      // Section B (and C when it fits) starts under the last table.
      if (planPage.flow) drawKetentuanPage(page, planPage.flow, flowOptions);
      continue;
    }

    const contentPage = addBlankPageLike(outputDoc, templateDoc);
    drawKetentuanPage(contentPage, planPage, flowOptions);
  }

  if (opts.preview) {
    for (const page of outputDoc.getPages()) {
      page.drawText("PRATINJAU — BUKAN DOKUMEN RESMI", {
        x: 70, y: page.getHeight() * 0.42, size: 23, font: boldFont,
        color: rgb(0.6, 0.6, 0.6), opacity: 0.3, rotate: degrees(30),
      });
    }
  }
  const pdfBytes = await outputDoc.save();
  return Buffer.from(pdfBytes);
}
