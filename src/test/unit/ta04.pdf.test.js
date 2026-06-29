import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { generateTA04Pdf } from "../../utils/ta04.pdf.js";

function buildEntries(count) {
  return Array.from({ length: count }, (_, index) => {
    const number = index + 1;
    return {
      studentName: `Mahasiswa Uji ${number}`,
      nim: `221152${String(number).padStart(4, "0")}`,
      title: `Rancang Bangun Sistem Informasi Tugas Akhir Nomor ${number}`,
      supervisorName: number % 2 === 0
        ? "Dr. Pembimbing Satu, M.Kom., Dr. Pembimbing Dua, M.T."
        : "Dr. Pembimbing Satu, M.Kom.",
    };
  });
}

async function getGeneratedPageCount(entryCount) {
  const pdfBuffer = await generateTA04Pdf({
    semester: "Genap 2025/2026",
    entries: buildEntries(entryCount),
    dateGenerated: "27 Juni 2026",
    kadepName: "Dr. Ketua Departemen, M.Kom.",
    kadepNip: "198000000000000001",
  });
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  return pdfDoc.getPageCount();
}

describe("generateTA04Pdf", () => {
  it("uses only the first official template page plus a content-only signature page for up to 7 entries", async () => {
    await expect(getGeneratedPageCount(7)).resolves.toBe(2);
  });

  it("groups overflow rows into content-only continuation pages instead of cloning the letterhead template repeatedly", async () => {
    await expect(getGeneratedPageCount(15)).resolves.toBe(3);
    await expect(getGeneratedPageCount(18)).resolves.toBe(4);
  });
});
