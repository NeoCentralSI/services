import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockFs, mockQRCode, mockPdf } = vi.hoisted(() => {
  const officialGeneratedDocument = {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
  };

  return {
    mockPrisma: {
      officialGeneratedDocument,
      $transaction: vi.fn(async (callback) => callback({ officialGeneratedDocument })),
    },
    mockFs: {
      readFile: vi.fn(),
      mkdir: vi.fn(),
      writeFile: vi.fn(),
      unlink: vi.fn(),
    },
    mockQRCode: { toDataURL: vi.fn() },
    mockPdf: { convertHtmlToPdf: vi.fn() },
  };
});

vi.mock("../../../config/prisma.js", () => ({ default: mockPrisma }));
vi.mock("fs/promises", () => ({ default: mockFs }));
vi.mock("qrcode", () => ({ default: mockQRCode }));
vi.mock("../../../utils/pdf.util.js", () => mockPdf);
vi.mock("../../../config/env.js", () => ({
  ENV: { FRONTEND_URL: "https://neocentral.dev" },
}));

import {
  checkOfficialDocumentHash,
  getOfficialDocumentVerification,
  renderAndIssueOfficialHtmlDocument,
} from "../../../services/official-document.service.js";

describe("Official Document Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.unlink.mockResolvedValue(undefined);
    mockQRCode.toDataURL.mockResolvedValue("data:image/png;base64,qr");
    mockPdf.convertHtmlToPdf.mockResolvedValue(Buffer.from("official-pdf"));
    mockPrisma.officialGeneratedDocument.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    mockPrisma.officialGeneratedDocument.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.officialGeneratedDocument.create.mockResolvedValue({ id: "doc-1" });
  });

  it("issues a PDF with a QR validation block and persists its hash", async () => {
    const result = await renderAndIssueOfficialHtmlDocument({
      documentKind: "seminar_invitation",
      sourceId: "seminar-1",
      title: "Surat Undangan Seminar Hasil",
      subjectName: "Mahasiswa",
      subjectIdentifier: "221000001",
      html: "<html><body><p>Isi dokumen</p></body></html>",
    });

    expect(result).toEqual(Buffer.from("official-pdf"));
    expect(mockPdf.convertHtmlToPdf).toHaveBeenCalledWith(
      expect.stringContaining("Validasi Dokumen NeoCentral"),
    );
    expect(mockQRCode.toDataURL).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/neocentral\.dev\/verify\/document\/[a-f0-9]{64}$/),
      expect.any(Object),
    );
    expect(mockPrisma.officialGeneratedDocument.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        documentKind: "seminar_invitation",
        sourceId: "seminar-1",
        version: 1,
        status: "current",
        fileHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    });
  });

  it("returns public metadata without exposing storage paths or hashes", async () => {
    mockPrisma.officialGeneratedDocument.findUnique.mockResolvedValue({
      verificationToken: "token",
      documentKind: "yudisium_cpl_report",
      title: "Formulir CPL",
      documentNumber: null,
      subjectName: "Mahasiswa",
      subjectIdentifier: "221000001",
      issuerName: "NeoCentral",
      issuerRole: "Sistem",
      issuedAt: new Date("2026-09-20T00:00:00.000Z"),
      version: 2,
      status: "current",
      fileHash: "secret-hash",
      filePath: "/private/path",
    });

    const result = await getOfficialDocumentVerification("token");

    expect(result.isCurrent).toBe(true);
    expect(result.integrityCheckAvailable).toBe(true);
    expect(result).not.toHaveProperty("fileHash");
    expect(result).not.toHaveProperty("filePath");
  });

  it("detects matching and modified PDF bytes", async () => {
    const buffer = Buffer.from("official-pdf");
    const crypto = await import("crypto");
    const fileHash = crypto.createHash("sha256").update(buffer).digest("hex");
    mockPrisma.officialGeneratedDocument.findUnique
      .mockResolvedValueOnce({ fileHash, status: "current" })
      .mockResolvedValueOnce({ fileHash, status: "current" });

    await expect(checkOfficialDocumentHash("token", buffer)).resolves.toMatchObject({
      isValid: true,
      status: "current",
    });
    await expect(checkOfficialDocumentHash("token", Buffer.from("modified"))).resolves.toMatchObject({
      isValid: false,
      status: "current",
    });
  });
});
