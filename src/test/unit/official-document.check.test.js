/**
 * Cek Dokumen: the QR at the end of an official HTML document carries no text, its link opens
 * /cek-dokumen/<token>, and an uploaded PDF is matched by its SHA-256 only (never stored).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import express from "express";
import request from "supertest";

vi.mock("../../config/prisma.js", async () => ({
  default: (await import("./nabil/helpers/fakePrisma.js")).prismaFake,
}));

const { resetDb, store } = await import("./nabil/helpers/fakePrisma.js");
const { appendOfficialDocumentValidation } = await import("../../utils/official-document-html.util.js");
const service = await import("../../services/official-document.service.js");
const { default: router } = await import("../../routes/official-documents.route.js");
const { default: errorHandler } = await import("../../middlewares/error.middleware.js");

const app = express();
app.use(express.json());
app.use("/official-documents", router);
app.use(errorHandler);

const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const PDF_V1 = Buffer.from("%PDF-1.7 penetapan v1");
const PDF_V2 = Buffer.from("%PDF-1.7 penetapan v2");
const record = (overrides) => ({
  id: overrides.verificationToken, documentKind: "supervisor_assignment", sourceId: "ay-1", title: "Penetapan Pembimbing Tugas Akhir",
  documentNumber: null, subjectName: "Semester Ganjil 2026/2027", subjectIdentifier: "3 mahasiswa", issuerName: "Kadep",
  issuerRole: "Ketua Departemen Sistem Informasi", fileHash: sha(PDF_V1), version: 1, status: "current", issuedAt: new Date("2026-08-01"),
  supersededAt: null, ...overrides,
});

beforeEach(() => resetDb({
  officialGeneratedDocument: [
    record({ verificationToken: "t1", status: "superseded", supersededAt: new Date("2026-10-01"), fileHash: sha(PDF_V1) }),
    record({ verificationToken: "t2", version: 2, fileHash: sha(PDF_V2), issuedAt: new Date("2026-10-01") }),
  ],
}));

describe("QR block of official HTML documents", () => {
  it("is only the QR (with the logo in its middle), right aligned, kept on one page, without frame or text", () => {
    const html = appendOfficialDocumentValidation("<html><body><p>Isi</p></body></html>", { qrDataUrl: "data:image/png;base64,QR" });
    const block = html.slice(html.lastIndexOf("<div", html.indexOf('class="official-document-qr"')));
    expect(block).toContain("text-align: right");
    expect(block).toContain("page-break-inside: avoid");
    expect(block).toContain('src="data:image/png;base64,QR"');
    expect(block).toMatch(/width: 24mm/);
    expect(block).not.toMatch(/border: 1px|Validasi Dokumen|Pindai QR|verify|cek-dokumen/);
    expect(block.replace(/<[^>]+>/g, "").trim()).toBe("");
    expect(html.indexOf("official-document-qr")).toBeLessThan(html.indexOf("</body>"));
  });

  it("the QR link opens /cek-dokumen/<token>", () => {
    expect(service.officialDocumentVerificationUrl("abc")).toMatch(/\/cek-dokumen\/abc$/);
    expect(service.officialDocumentVerificationUrl("abc")).not.toContain("/verify/");
  });
});

describe("lookup by file hash", () => {
  it("finds the current version", async () => {
    const res = await request(app).post("/official-documents/find-by-file").attach("file", PDF_V2, { filename: "penetapan.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ token: "t2", documentKind: "supervisor_assignment", isCurrent: true, version: 2 });
  });

  it("finds a superseded version and the date of the version that replaced it", async () => {
    const res = await request(app).post("/official-documents/find-by-file").attach("file", PDF_V1, { filename: "lama.pdf", contentType: "application/pdf" });
    expect(res.body.data).toMatchObject({ token: "t1", status: "superseded", isCurrent: false });
    expect(new Date(res.body.data.replacedByIssuedAt).toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("says so when the file matches no official document", async () => {
    const res = await request(app).post("/official-documents/find-by-file").attach("file", Buffer.from("%PDF-1.7 diubah"), { filename: "x.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Berkas tidak cocok dengan dokumen resmi mana pun. Dokumen mungkin telah diubah atau bukan terbitan NeoCentral.");
  });

  it("refuses a file that is not a PDF, and a request without a file", async () => {
    const notPdf = await request(app).post("/official-documents/find-by-file").attach("file", Buffer.from("hello"), { filename: "x.txt", contentType: "text/plain" });
    expect(notPdf.status).toBe(400);
    expect(notPdf.body.message).toBe("Hanya berkas PDF yang dapat diperiksa.");
    const none = await request(app).post("/official-documents/find-by-file");
    expect(none.status).toBe(400);
  });

  it("does not store the upload", async () => {
    const before = JSON.stringify(store.state);
    await request(app).post("/official-documents/find-by-file").attach("file", PDF_V2, { filename: "p.pdf", contentType: "application/pdf" });
    expect(JSON.stringify(store.state)).toBe(before);
  });

  it("the token page tells the replacement date of a superseded version", async () => {
    const res = await request(app).get("/official-documents/t1");
    expect(res.body.data).toMatchObject({ status: "superseded", supersededAt: expect.any(String) });
    expect(new Date(res.body.data.replacedByIssuedAt).toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });
});
