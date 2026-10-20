import * as XLSX from "xlsx";

import { BadRequestError } from "../utils/errors.js";

/**
 * Reading a spreadsheet upload (.xlsx, .xls or .csv): the first sheet as rows of cells. Used by
 * the import of semester flags (Impor Keikutsertaan).
 */
export function readSheetRows(buffer, { unreadableMessage, emptyMessage }) {
  let workbook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  } catch {
    throw new BadRequestError(unreadableMessage);
  }
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new BadRequestError(emptyMessage);
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "", blankrows: false });
}

/** A header or cell for matching: no accents, lower case, words separated by single spaces. */
/** A NIM or NIP as written in a cell: spaces removed. */
export function normalizeIdentity(value) {
  return String(value ?? "").replace(/\s+/g, "").trim();
}

export function normalizeHeader(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** An .xlsx workbook with one sheet per entry, `[name, rows]`. */
export function buildWorkbookBuffer(sheets) {
  const book = XLSX.utils.book_new();
  for (const [name, rows] of sheets) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), name);
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" });
}
