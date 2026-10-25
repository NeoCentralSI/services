import fs from "fs";
import path from "path";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../config/prisma.js", () => ({ default: {} }));
const util = await import("../../utils/document-template.util.js");
const { appendOfficialDocumentValidation } = await import("../../utils/official-document-html.util.js");

describe("signature block", () => {
  it("with a QR: place, date, title, the QR slot, name and NIP", () => {
    const html = util.signatureBlockHtml({ date: new Date("2026-10-25T03:00:00Z"), title: "Ketua Departemen Sistem Informasi", name: "Ricky Akbar, M.Kom", nip: "198410062012121001", withQr: true });
    expect(html).toContain("Padang, 25 Oktober 2026");
    expect(html).toContain("Ketua Departemen Sistem Informasi,");
    expect(html).toContain(util.DOCUMENT_QR_PLACEHOLDER);
    expect(html).toContain("Ricky Akbar, M.Kom");
    expect(html).toContain("NIP. 198410062012121001");
  });

  it("without a QR keeps an empty space to sign; a missing holder is a blank line", () => {
    const html = util.signatureBlockHtml({ title: "Koordinator Yudisium", acknowledged: true });
    expect(html).not.toContain(util.DOCUMENT_QR_PLACEHOLDER);
    expect(html).toContain("Mengetahui,");
    expect(html).toContain("signature-space");
    expect(html).toContain("______");
  });

  it("a letter (date in its header) leaves the place and date out of the block", () => {
    const html = util.signatureBlockHtml({ date: null, title: "Ketua Departemen Sistem Informasi", withQr: true });
    expect(html).not.toContain("Padang,");
    expect(html).toContain(util.DOCUMENT_QR_PLACEHOLDER);
  });

  it("a template without the slot still gets the QR, at the end", () => {
    const out = appendOfficialDocumentValidation("<html><body><p>Isi</p></body></html>", { qrDataUrl: "data:image/png;base64,QR" });
    expect(out.indexOf("data:image/png;base64,QR")).toBeGreaterThan(out.indexOf("Isi"));
  });

  it("the QR goes into the signature block, not at the end of the document", () => {
    const body = `<html><body><p>Isi</p>${util.signatureBlockHtml({ title: "Dosen Pembimbing I", name: "A", nip: "1", withQr: true })}<p>Tembusan</p></body></html>`;
    const out = appendOfficialDocumentValidation(body, { qrDataUrl: "data:image/png;base64,QR" });
    expect(out).not.toContain(util.DOCUMENT_QR_PLACEHOLDER);
    const qrAt = out.indexOf("data:image/png;base64,QR");
    expect(qrAt).toBeGreaterThan(out.indexOf("Dosen Pembimbing I"));
    expect(qrAt).toBeLessThan(out.indexOf("Tembusan"));
  });
});

describe("monochrome base style", () => {
  it("uses only black, white and greys", () => {
    const css = util.documentBaseStyles() + util.letterheadHtml().replace(/src="data:[^"]+"/g, "");
    for (const hex of css.match(/#[0-9a-fA-F]{3,6}\b/g) ?? []) {
      const full = hex.length === 4 ? hex.slice(1).split("").map((c) => c + c).join("") : hex.slice(1);
      expect(full.slice(0, 2) === full.slice(2, 4) && full.slice(2, 4) === full.slice(4, 6), hex).toBe(true);
    }
  });
});

// Every template of Seminar Hasil, Sidang and Yudisium (and its helpers) is checked; the CPL
// certificate (buildLearningCertificatePdf) is the only coloured document and is left out.
const TEMPLATES = {
  "services/thesis-seminar/core.service.js": ["export async function generateInvitationLetter", "export async function generateAssessmentResultPdf"],
  "services/thesis-defence/core.service.js": ["export async function generateInvitationLetter", "export async function generateAssessmentResultPdf"],
  "services/thesis-seminar/audience.service.js": ["export async function exportAudiencesPdf"],
  "services/thesis-seminar/attendance-log.service.js": ["export function buildAttendanceFormHtml"],
  "services/yudisium/participant.service.js": ["const buildRadarSvg", "const buildCplReportPdf", "export const exportParticipants = async"],
  "services/yudisium/exit-survey.service.js": ["const buildExitSurveyReportHtml"],
};

function templateSource(file, marker) {
  const source = fs.readFileSync(path.resolve(import.meta.dirname, "../..", file), "utf8");
  const start = source.indexOf(marker);
  expect(start, `${file}: ${marker}`).toBeGreaterThanOrEqual(0);
  const ends = ["\nexport ", "\nconst "].map((next) => source.indexOf(next, start + marker.length)).filter((at) => at > 0);
  return source.slice(start, ends.length ? Math.min(...ends) : source.length);
}

const isGrey = (hex) => {
  const full = hex.length === 4 ? hex.slice(1).split("").map((c) => c + c).join("") : hex.slice(1);
  return full.slice(0, 2) === full.slice(2, 4) && full.slice(2, 4) === full.slice(4, 6);
};

describe("monochrome templates", () => {
  for (const [file, markers] of Object.entries(TEMPLATES)) {
    for (const marker of markers) {
      it(`${file} ${marker.split(" ").at(-1)}: no colour besides black and grey`, () => {
        const source = templateSource(file, marker);
        const colours = (source.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g) ?? []).filter((hex) => !isGrey(hex));
        expect(colours).toEqual([]);
        expect(source).not.toMatch(/rgba?\(|hsl\(|color:\s*(blue|red|navy|orange|green)/);
      });
    }
  }

  it("every official HTML template puts the QR in a signature block", () => {
    for (const [file, markers] of Object.entries(TEMPLATES)) {
      for (const marker of markers) {
        if (marker.includes("buildRadarSvg") || marker.includes("buildExitSurveyReportHtml")) continue;
        expect(templateSource(file, marker), `${file}: ${marker}`).toMatch(/signatureBlockHtml\(\{[^}]*withQr: true/);
      }
    }
  });

  it("the exit survey report has an unsigned \"Mengetahui,\" block of the Koordinator Yudisium", () => {
    const source = templateSource("services/yudisium/exit-survey.service.js", "const buildExitSurveyReportHtml");
    expect(source).toMatch(/signatureBlockHtml\(\{[^}]*acknowledged: true, title: "Koordinator Yudisium"/);
    expect(source).not.toContain("withQr");
  });
});
