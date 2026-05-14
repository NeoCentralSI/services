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

const ROWS_PER_TABLE_PAGE = 7;
const COLOR_WHITE = rgb(1, 1, 1);
const COLOR_BLACK = rgb(0, 0, 0);

// Coordinates measured from the official TA-04 PDF using PyMuPDF.
// They use the template's native top-left coordinate system and are converted
// to pdf-lib's bottom-left coordinates at draw time.
const TA04_COORDS = {
  page1: {
    semesterTailBox: { x0: 321.8, y0: 214.8, x1: 542.6, y1: 231.2 },
    continuationMasks: [
      { x0: 72.0, y0: 157.0, x1: 541.0, y1: 286.5 }, // title + intro
      { x0: 72.0, y0: 620.0, x1: 543.0, y1: 680.0 }, // B. Ketentuan + bullets 1-2
    ],
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
  page2: {
    dateBox: { x0: 432.0, y0: 248.5, x1: 543.2, y1: 264.8 },
    nameBox: { x0: 399.5, y0: 344.8, x1: 541.0, y1: 361.5 },
    nipBox: { x0: 393.0, y0: 366.0, x1: 541.0, y1: 382.5 },
  },
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

  let cursorTop = box.y0 + textPaddingY;
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

async function copyTemplatePage(outputDoc, templateDoc, pageIndex) {
  const [page] = await outputDoc.copyPages(templateDoc, [pageIndex]);
  outputDoc.addPage(page);
  return page;
}

function applyContinuationMasks(page) {
  for (const mask of TA04_COORDS.page1.continuationMasks) {
    drawWhiteMask(page, mask);
  }
}

function drawRowNumber(page, rowIndex, globalRowNumber, font, isContinuation) {
  const row = TA04_COORDS.page1.rows[rowIndex];
  const noColumn = TA04_COORDS.page1.columns.no;
  const box = getRowCellBox(noColumn, row, 4);

  // On continuation pages the base template still contains 1..7,
  // so we must always mask and redraw them. On page 1 this redraws the same
  // numbers for consistency and alignment.
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
  });
}

function drawEntryCells(page, rowIndex, entry, font) {
  const row = TA04_COORDS.page1.rows[rowIndex];
  const { name, nim, title, supervisor } = TA04_COORDS.page1.columns;

  drawTextInBox(page, entry.studentName, getRowCellBox(name, row), font, {
    align: "left",
    textPaddingX: 5,
    textPaddingY: 4,
    maxSize: 11,
    minSize: 8,
    maxLines: 3,
  });

  drawTextInBox(page, entry.nim, getRowCellBox(nim, row), font, {
    align: "center",
    textPaddingX: 2,
    textPaddingY: 5,
    maxSize: 11,
    minSize: 9,
    maxLines: 1,
    lineHeightMultiplier: 1.0,
  });

  drawTextInBox(page, entry.title, getRowCellBox(title, row), font, {
    align: "left",
    textPaddingX: 5,
    textPaddingY: 4,
    maxSize: 11,
    minSize: 6.5,
    maxLines: 4,
  });

  drawTextInBox(page, entry.supervisorName, getRowCellBox(supervisor, row), font, {
    align: "left",
    textPaddingX: 4,
    textPaddingY: 4,
    maxSize: 10.5,
    minSize: 6,
    maxLines: 4,
  });
}

function overlayPageOne(page, entries, startIndex, semester, font, isContinuation = false) {
  if (!isContinuation) {
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
  } else {
    applyContinuationMasks(page);
  }

  for (let rowIndex = 0; rowIndex < ROWS_PER_TABLE_PAGE; rowIndex += 1) {
    const globalRowNumber = startIndex + rowIndex + 1;
    drawRowNumber(page, rowIndex, globalRowNumber, font, isContinuation);

    const entry = entries[rowIndex];
    if (!entry) continue;
    drawEntryCells(page, rowIndex, entry, font);
  }
}

function overlayPageTwo(page, dateGenerated, kadepName, kadepNip, regularFont, boldFont) {
  drawTextInBox(page, dateGenerated, TA04_COORDS.page2.dateBox, regularFont, {
    align: "left",
    textPaddingX: 2,
    textPaddingY: 2,
    maxSize: 12,
    minSize: 10,
    maxLines: 1,
    lineHeightMultiplier: 1.0,
    maskPadding: { left: 1, right: 2, top: 1, bottom: 1 },
  });

  drawTextInBox(page, kadepName, TA04_COORDS.page2.nameBox, boldFont, {
    align: "left",
    textPaddingX: 2,
    textPaddingY: 2,
    maxSize: 12,
    minSize: 9,
    maxLines: 1,
    lineHeightMultiplier: 1.0,
    maskPadding: { left: 1, right: 2, top: 1, bottom: 1 },
  });

  drawTextInBox(page, kadepNip, TA04_COORDS.page2.nipBox, regularFont, {
    align: "left",
    textPaddingX: 2,
    textPaddingY: 2,
    maxSize: 12,
    minSize: 10,
    maxLines: 1,
    lineHeightMultiplier: 1.0,
    maskPadding: { left: 1, right: 2, top: 1, bottom: 1 },
  });
}

/**
 * Generate TA-04 by overlaying dynamic text on top of the official PDF.
 *
 * For <= 7 rows:
 * - page 1 = official TA-04 page 1 with row data
 * - page 2 = official TA-04 page 2 with signature data
 *
 * For > 7 rows:
 * - page 1 = official TA-04 page 1 with rows 1..7
 * - page 2..n = cloned page 1 with title/intro/ketentuan masked, used as
 *   continuation table pages for rows 8+
 * - last page = official TA-04 page 2
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

  const pageOneEntries = entries.slice(0, ROWS_PER_TABLE_PAGE);
  const continuationChunks = [];
  for (let i = ROWS_PER_TABLE_PAGE; i < entries.length; i += ROWS_PER_TABLE_PAGE) {
    continuationChunks.push(entries.slice(i, i + ROWS_PER_TABLE_PAGE));
  }

  const officialPage1 = await copyTemplatePage(outputDoc, templateDoc, 0);
  overlayPageOne(officialPage1, pageOneEntries, 0, semester, regularFont, false);

  let continuationStart = ROWS_PER_TABLE_PAGE;
  for (const chunk of continuationChunks) {
    const continuationPage = await copyTemplatePage(outputDoc, templateDoc, 0);
    overlayPageOne(continuationPage, chunk, continuationStart, semester, regularFont, true);
    continuationStart += ROWS_PER_TABLE_PAGE;
  }

  const officialPage2 = await copyTemplatePage(outputDoc, templateDoc, 1);
  overlayPageTwo(officialPage2, dateGenerated, kadepName, kadepNip, regularFont, boldFont);

  const pdfBytes = await outputDoc.save();
  return Buffer.from(pdfBytes);
}
