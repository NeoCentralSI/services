import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** NeoCentral logo placed in the middle of the verification QR (error correction level H). */
let logoDataUrl = null;
export function neoCentralLogoDataUrl() {
  if (logoDataUrl === null) {
    try {
      const bytes = fs.readFileSync(path.resolve(__dirname, "../assets/neocentral-logo.png"));
      logoDataUrl = `data:image/png;base64,${bytes.toString("base64")}`;
    } catch {
      logoDataUrl = "";
    }
  }
  return logoDataUrl;
}

/** QR width in millimetres and the logo's share of it. */
export const OFFICIAL_QR_SIZE_MM = 24;
export const OFFICIAL_QR_LOGO_RATIO = 0.2;

/**
 * The verification QR at the end of an official HTML document: the QR alone, right aligned,
 * about 24 mm, no frame and no text, with the NeoCentral logo on a white patch in the middle.
 */
export function appendOfficialDocumentValidation(html, { qrDataUrl }) {
  const logo = neoCentralLogoDataUrl();
  const logoMm = (OFFICIAL_QR_SIZE_MM * OFFICIAL_QR_LOGO_RATIO).toFixed(1);
  const logoBlock = logo
    ? `<span style="position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); background: #ffffff; padding: 0.6mm; line-height: 0; border-radius: 0.6mm;"><img src="${logo}" alt="" style="display: block; width: ${logoMm}mm; height: auto;" /></span>`
    : "";
  const validationBlock = `
  <div class="official-document-qr" style="page-break-inside: avoid; break-inside: avoid; margin-top: 12px; text-align: right;">
    <span style="position: relative; display: inline-block; width: ${OFFICIAL_QR_SIZE_MM}mm; height: ${OFFICIAL_QR_SIZE_MM}mm; line-height: 0;">
      <img src="${qrDataUrl}" alt="QR verifikasi dokumen" style="display: block; width: ${OFFICIAL_QR_SIZE_MM}mm; height: ${OFFICIAL_QR_SIZE_MM}mm;" />${logoBlock}
    </span>
  </div>`;

  return html.includes("</body>")
    ? html.replace("</body>", `${validationBlock}\n</body>`)
    : `${html}${validationBlock}`;
}
