/**
 * Penetapan Pembimbing as an official document: an issued version carries a verification QR
 * (in place of the university logo) and a record read by /verify/document/:token; issuing again
 * supersedes the previous version of the period; previews get neither.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import QRCode from "qrcode";
import { PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from "pdf-lib";

vi.mock("../../config/prisma.js", async () => ({
  default: (await import("./nabil/helpers/fakePrisma.js")).prismaFake,
}));

const { store, resetDb, prismaFake } = await import("./nabil/helpers/fakePrisma.js");
const { generateSupervisorAssignmentPdf } = await import("../../utils/supervisor-assignment.pdf.js");
const {
  renderIssuedAssignmentPdf,
  recordIssuedAssignmentDocument,
  SUPERVISOR_ASSIGNMENT_DOCUMENT_KIND,
} = await import("../../services/thesis-proposal/supervisor-assignment-document.service.js");
const { getOfficialDocumentVerification } = await import("../../services/official-document.service.js");

const YEAR = { id: "ay-1", semester: "ganjil", year: "2026/2027" };
const KADEP = { fullName: "Dr. Ketua Departemen, M.Kom.", identityNumber: "198000000000000001" };
const entries = (count) =>
  Array.from({ length: count }, (_, i) => ({
    studentName: `Mahasiswa ${i + 1}`,
    studentNim: `22115200${String(i).padStart(2, "0")}`,
    title: `Judul ${i + 1}`,
    supervisorNames: "Dr. Pembimbing Satu, M.Kom.",
  }));

function pageContent(doc, page) {
  const contents = page.node.Contents();
  if (!contents) return "";
  const streams = contents.asArray ? contents.asArray().map((ref) => doc.context.lookup(ref)) : [contents];
  return streams.filter((s) => s instanceof PDFRawStream).map((s) => Buffer.from(decodePDFRawStream(s).decode()).toString()).join("\n");
}
const hex = (text) => Buffer.from(text).toString("hex").toUpperCase();
const imagesOf = (doc, page) => {
  const objects = page.node.Resources().lookup(PDFName.of("XObject"));
  return objects ? objects.entries().filter(([, ref]) => doc.context.lookup(ref).dict.get(PDFName.of("Subtype"))?.toString() === "/Image") : [];
};

beforeEach(() => resetDb({ officialGeneratedDocument: [] }));

describe("issued version", () => {
  it("has a verification token, and the QR of its verification URL in the signature column", async () => {
    const qrSpy = vi.spyOn(QRCode, "toBuffer");
    const { buffer, document } = await renderIssuedAssignmentPdf({ academicYear: YEAR, entries: entries(3), kadep: KADEP, version: 2, cohortHash: "abc" });
    expect(document).toMatchObject({
      documentKind: SUPERVISOR_ASSIGNMENT_DOCUMENT_KIND,
      sourceId: "ay-1",
      version: 2,
      title: "Penetapan Pembimbing Tugas Akhir",
      subjectName: "Semester Ganjil 2026/2027",
      subjectIdentifier: "3 mahasiswa",
      issuerName: KADEP.fullName,
    });
    expect(document.verificationToken).toMatch(/^[0-9a-f]{64}$/);
    expect(qrSpy.mock.calls[0][0]).toMatch(new RegExp(`/verify/document/${document.verificationToken}$`));

    const doc = await PDFDocument.load(buffer);
    const signature = doc.getPages().find((page) => pageContent(doc, page).includes(hex("C. Pengesahan")));
    const content = pageContent(doc, signature);
    expect(content).toContain(hex("Validasi Dokumen NeoCentral"));
    // The URL is printed beside the QR in lines of 48 characters; every line is on the page.
    const url = qrSpy.mock.calls[0][0];
    for (let i = 0; i < url.length; i += 48) expect(content).toContain(hex(url.slice(i, i + 48)));
    expect(imagesOf(doc, signature)).toHaveLength(1);
    expect(doc.getPages().some((page) => pageContent(doc, page).includes(hex("PRATINJAU")))).toBe(false);
    qrSpy.mockRestore();
  });

  it("a preview has no QR and no verification text", async () => {
    const buffer = await generateSupervisorAssignmentPdf({
      preview: true, semester: "Ganjil 2026/2027", entries: entries(3).map((e) => ({ ...e, nim: e.studentNim, supervisorName: e.supervisorNames })),
      dateGenerated: "24 Oktober 2026", kadepName: KADEP.fullName, kadepNip: KADEP.identityNumber,
    });
    const doc = await PDFDocument.load(buffer);
    const pages = doc.getPages().map((page) => pageContent(doc, page));
    expect(pages.every((content) => content.includes(hex("PRATINJAU ")))).toBe(true);
    expect(pages.some((content) => content.includes(hex("Validasi Dokumen NeoCentral")))).toBe(false);
  });
});

describe("official record", () => {
  const stored = (n) => ({ filePath: `uploads/x-${n}.pdf`, fileName: `x-${n}.pdf`, fileSize: 10, mimeType: "application/pdf" });

  it("is read by the verification page with the Penetapan data; issuing again supersedes the previous version", async () => {
    const first = await renderIssuedAssignmentPdf({ academicYear: YEAR, entries: entries(2), kadep: KADEP, version: 1, cohortHash: "h1" });
    await recordIssuedAssignmentDocument(prismaFake, first.document, stored(1));
    const v1 = await getOfficialDocumentVerification(first.document.verificationToken);
    expect(v1).toMatchObject({
      documentKind: "supervisor_assignment",
      title: "Penetapan Pembimbing Tugas Akhir",
      documentNumber: null,
      version: 1,
      subjectName: "Semester Ganjil 2026/2027",
      issuerRole: "Ketua Departemen Sistem Informasi",
      status: "current",
      isCurrent: true,
      integrityCheckAvailable: true,
    });

    const second = await renderIssuedAssignmentPdf({ academicYear: YEAR, entries: entries(3), kadep: KADEP, version: 2, cohortHash: "h2" });
    await recordIssuedAssignmentDocument(prismaFake, second.document, stored(2));
    expect((await getOfficialDocumentVerification(first.document.verificationToken))).toMatchObject({ status: "superseded", isCurrent: false });
    expect((await getOfficialDocumentVerification(second.document.verificationToken))).toMatchObject({ status: "current", version: 2 });
    expect(store.state.officialGeneratedDocument.filter((r) => r.status === "current")).toHaveLength(1);
  });

  it("another period keeps its own current version", async () => {
    const a = await renderIssuedAssignmentPdf({ academicYear: YEAR, entries: entries(1), kadep: KADEP, version: 1, cohortHash: "a" });
    const b = await renderIssuedAssignmentPdf({ academicYear: { id: "ay-2", semester: "genap", year: "2025/2026" }, entries: entries(1), kadep: KADEP, version: 1, cohortHash: "b" });
    await recordIssuedAssignmentDocument(prismaFake, a.document, stored(1));
    await recordIssuedAssignmentDocument(prismaFake, b.document, stored(2));
    expect(store.state.officialGeneratedDocument.map((r) => r.status)).toEqual(["current", "current"]);
  });
});
