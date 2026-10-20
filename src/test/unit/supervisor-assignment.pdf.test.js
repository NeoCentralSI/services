import { describe, expect, it } from "vitest";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  assertStrictSectionOrder,
  generateSupervisorAssignmentPdf,
  planAssignmentDocumentStructure,
} from "../../utils/supervisor-assignment.pdf.js";

function buildEntries(count) {
  return Array.from({ length: count }, (_, index) => {
    const number = index + 1;
    return {
      studentName: number === 8 ? "Dimas" : `Mahasiswa Uji ${number}`,
      nim: number === 8 ? "2311523026" : `221152${String(number).padStart(4, "0")}`,
      title: number === 8
        ? "Sistem Informasi Tugas akhir modul proposal"
        : `Rancang Bangun Sistem Informasi Tugas Akhir Nomor ${number}`,
      supervisorName: number === 8
        ? "Afriyanti Dwi Kartika, M.T"
        : number % 2 === 0
          ? "Dr. Pembimbing Satu, M.Kom., Dr. Pembimbing Dua, M.T."
          : "Dr. Pembimbing Satu, M.Kom.",
    };
  });
}

async function generateSample(entryCount, overrides = {}) {
  return generateSupervisorAssignmentPdf({
    semester: "Genap 2025/2026",
    entries: buildEntries(entryCount),
    dateGenerated: "20 Juli 2026",
    kadepName: "Dr. Ketua Departemen, M.Kom.",
    kadepNip: "198000000000000001",
    ...overrides,
  });
}

function isMonotonicABC(sequence) {
  const rank = { A: 0, B: 1, C: 2 };
  let previous = -1;
  for (const section of sequence) {
    const current = rank[section];
    if (current < previous) return false;
    previous = current;
  }
  return sequence.includes("A") && sequence.includes("B") && sequence.includes("C");
}

describe("assertStrictSectionOrder", () => {
  it("accepts A* → B* → C*", () => {
    expect(assertStrictSectionOrder([
      { section: "A" },
      { section: "A" },
      { section: "B" },
      { section: "B" },
      { section: "C" },
    ])).toBe(true);
  });

  it("rejects A after B", () => {
    expect(() => assertStrictSectionOrder([
      { section: "A" },
      { section: "B" },
      { section: "A" },
    ])).toThrow(/Invalid TA-04 section order/);
  });
});

describe("planAssignmentDocumentStructure", () => {
  it("one table row per student, no empty rows: 3 and 7 fit page 1, 12 continues with 5", () => {
    expect(planAssignmentDocumentStructure(3).tableRows).toEqual([3]);
    expect(planAssignmentDocumentStructure(7).tableRows).toEqual([7]);
    expect(planAssignmentDocumentStructure(12).tableRows).toEqual([7, 5]);
    expect(planAssignmentDocumentStructure(27).tableRows).toEqual([7, 10, 10]);
  });

  it("3 students: B starts under the table on page 1, C follows; A → B → C", () => {
    const plan = planAssignmentDocumentStructure(3);
    expect(plan.hasOverflow).toBe(false);
    expect(plan.continuationPageCount).toBe(0);
    expect(plan.pages[0]).toMatchObject({ section: "A", kind: "primary", rows: 3 });
    expect(plan.pages[0].flow).toMatchObject({ section: "B", onAPage: true });
    expect(plan.sectionSequence[0]).toBe("A");
    expect(plan.sectionSequence.at(-1)).toBe("C");
    expect(isMonotonicABC(plan.sectionSequence)).toBe(true);
  });

  it("schedules all A continuation pages before any B/C pages", () => {
    const plan8 = planAssignmentDocumentStructure(8);
    expect(plan8.continuationPageCount).toBe(1);
    expect(plan8.tableRows).toEqual([7, 1]);
    expect(plan8.sectionSequence[0]).toBe("A");
    expect(plan8.sectionSequence.filter((s) => s === "A")).toHaveLength(2);
    expect(plan8.sectionSequence.indexOf("B")).toBeGreaterThan(plan8.sectionSequence.lastIndexOf("A"));
    expect(plan8.sectionSequence.indexOf("C")).toBeGreaterThan(plan8.sectionSequence.lastIndexOf("B"));
    expect(isMonotonicABC(plan8.sectionSequence)).toBe(true);

    const plan27 = planAssignmentDocumentStructure(27);
    expect(plan27.continuationPageCount).toBe(2);
    expect(plan27.sectionSequence.filter((s) => s === "A")).toHaveLength(3);
    expect(plan27.sectionSequence.indexOf("B")).toBeGreaterThan(plan27.sectionSequence.lastIndexOf("A"));
    expect(isMonotonicABC(plan27.sectionSequence)).toBe(true);
  });

  it("paginates long B content across multiple pages before C", () => {
    const longBullets = Array.from({ length: 12 }, (_, i) => (
      `Ketentuan panjang nomor ${i + 1}: ${"isi detail ".repeat(20)}`
    ));
    const plan = planAssignmentDocumentStructure(8, {
      ketentuanBullets: longBullets,
      pageHeight: 792,
      regularFont: {
        widthOfTextAtSize: (text, size) => String(text).length * size * 0.45,
      },
    });

    const bCount = plan.sectionSequence.filter((s) => s === "B").length;
    expect(bCount).toBeGreaterThan(1);
    expect(plan.sectionSequence.indexOf("B")).toBeGreaterThan(
      plan.sectionSequence.lastIndexOf("A"),
    );
    expect(plan.sectionSequence.indexOf("C")).toBeGreaterThan(
      plan.sectionSequence.lastIndexOf("B"),
    );
    expect(isMonotonicABC(plan.sectionSequence)).toBe(true);
    expect(() => assertStrictSectionOrder(plan.pages)).not.toThrow();
  });
});

describe("generateSupervisorAssignmentPdf", () => {
  it("3 and 12 students: the page count follows the plan", async () => {
    for (const count of [3, 12]) {
      const plan = planAssignmentDocumentStructure(count);
      const pdfDoc = await PDFDocument.load(await generateSample(count));
      expect(pdfDoc.getPageCount()).toBe(plan.totalPages);
    }
  });

  it("keeps section order A* → B* → C* for multi-page A overflow", async () => {
    for (const count of [8, 18, 27, 37]) {
      const plan = planAssignmentDocumentStructure(count);
      expect(isMonotonicABC(plan.sectionSequence)).toBe(true);
      expect(plan.sectionSequence.indexOf("B")).toBeGreaterThan(
        plan.sectionSequence.lastIndexOf("A"),
      );
      expect(plan.sectionSequence.indexOf("C")).toBeGreaterThan(
        plan.sectionSequence.lastIndexOf("B"),
      );

      const pdfBuffer = await generateSample(count);
      const pdfDoc = await PDFDocument.load(pdfBuffer);
      expect(pdfDoc.getPageCount()).toBe(plan.totalPages);
    }
  });

  it("writes verification PDFs for visual/section-order checks", async () => {
    const outDir = join(process.cwd(), "uploads", "documents", "supervisor-assignment");
    await mkdir(outDir, { recursive: true });

    for (const count of [3, 7, 8, 12, 27]) {
      const pdfBuffer = await generateSample(count);
      await writeFile(join(outDir, `SECTION_ORDER_${count}.pdf`), pdfBuffer);
    }

    const doc = await PDFDocument.create();
    await doc.embedFont(StandardFonts.TimesRoman);
    expect(true).toBe(true);
  });
});
