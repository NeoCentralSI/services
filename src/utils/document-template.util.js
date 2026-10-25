/**
 * Shared pieces of the HTML documents of Seminar Hasil, Sidang, and Yudisium, after the style of
 * the Surat Undangan Seminar and the Daftar Hadir Seminar Hasil: the department letterhead, the
 * base style (Times New Roman 11 pt, A4 margins, thin black table lines, bold headers without a
 * coloured background), and the signature block of the official in charge.
 *
 * Monochrome: only black, white and greys. The Universitas Andalas logo keeps its colours.
 *
 * QR: a document with a verification QR puts `DOCUMENT_QR_PLACEHOLDER` in its signature block;
 * `appendOfficialDocumentValidation` (official-document-html.util.js) puts the QR there.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import prisma from "../config/prisma.js";
import { DOCUMENT_QR_PLACEHOLDER } from "./official-document-html.util.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Where the verification QR goes, inside the signature block. */
export { DOCUMENT_QR_PLACEHOLDER };

let unandLogo = null;
export function unandLogoDataUrl() {
  if (unandLogo === null) {
    try {
      unandLogo = `data:image/png;base64,${fs.readFileSync(path.resolve(__dirname, "../assets/unand-logo.png")).toString("base64")}`;
    } catch {
      unandLogo = "";
    }
  }
  return unandLogo;
}

export const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

/** "25 Oktober 2026" in WIB. */
export function formatDocumentDate(value = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const wib = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  return `${wib.getUTCDate()} ${MONTHS[wib.getUTCMonth()]} ${wib.getUTCFullYear()}`;
}

/** The base style of every document. `extra` is appended (document-specific rules). */
export function documentBaseStyles(extra = "") {
  return `
    @page { size: A4; margin: 1.2cm 2cm 1.2cm 2.5cm; }
    * { box-sizing: border-box; }
    body { font-family: "Times New Roman", Times, serif; font-size: 11pt; line-height: 1.3; color: #000; margin: 0; }
    .letterhead { width: 100%; border-collapse: collapse; border-bottom: 2.5px solid #000; margin-bottom: 15px; }
    .letterhead td { padding: 0 0 8px 0; vertical-align: middle; }
    .letterhead .logo-cell { width: 85px; padding-right: 15px; }
    .letterhead .logo-cell img { width: 80px; height: auto; }
    .letterhead .text-cell { text-align: center; padding-right: 20px; }
    .letterhead h3, .letterhead h4 { margin: 0; font-size: 11pt; font-weight: normal; text-transform: uppercase; white-space: nowrap; }
    .letterhead h2 { margin: 2px 0; font-size: 16pt; font-weight: bold; text-transform: uppercase; }
    .letterhead p { margin: 2px 0; font-size: 10pt; }
    .document-title { text-align: center; font-size: 12pt; font-weight: bold; text-transform: uppercase; margin: 14px 0 4px; }
    .document-number { text-align: center; margin: 0 0 14px; }
    .form-code { width: 100%; border-collapse: collapse; margin: 6px 0 16px; }
    .form-code td { border: 1px solid #000; padding: 4px 8px; font-weight: bold; background: #e6e6e6; }
    .form-code .code { width: 110px; text-align: center; font-size: 16pt; }
    .info-table { border-collapse: collapse; margin: 4px 0 12px; }
    .info-table td { padding: 2px 6px 2px 0; vertical-align: top; }
    table.grid { width: 100%; border-collapse: collapse; margin: 8px 0; }
    table.grid th, table.grid td { border: 1px solid #000; padding: 5px 6px; vertical-align: top; overflow-wrap: anywhere; }
    table.grid th { font-weight: bold; text-align: center; background: #f2f2f2; }
    table.grid thead { display: table-header-group; }
    table.grid tr { break-inside: avoid; }
    .nowrap { white-space: nowrap; }
    .signature-row { width: 100%; margin-top: 12px; page-break-inside: avoid; break-inside: avoid; }
    .signature-block { width: 260px; margin-left: auto; text-align: left; page-break-inside: avoid; break-inside: avoid; }
    .signature-block p { margin: 0; }
    .signature-block .signature-space { height: 26mm; margin: 4px 0; line-height: 0; }
    .signature-block .signer-name { font-weight: bold; text-decoration: underline; }
    ${extra}
  `;
}

/** The department letterhead (Universitas Andalas logo in colour, text in black). */
export function letterheadHtml() {
  const logo = unandLogoDataUrl();
  return `
  <table class="letterhead">
    <tr>
      <td class="logo-cell">${logo ? `<img src="${logo}" alt="Logo Universitas Andalas" />` : ""}</td>
      <td class="text-cell">
        <h3>Kementerian Pendidikan Tinggi, Sains, dan Teknologi</h3>
        <h4>Universitas Andalas</h4>
        <h4>Fakultas Teknologi Informasi</h4>
        <h2>Departemen Sistem Informasi</h2>
        <p>Kampus Universitas Andalas, Limau Manis 25163</p>
        <p>Website: http://si.fti.unand.ac.id dan email: jurusan_si@fti.unand.ac.id</p>
      </td>
    </tr>
  </table>`;
}

/**
 * The signature block of the official in charge:
 *   Padang, <date>
 *   [Mengetahui,]
 *   <Title>,
 *   [QR ±24 mm, or an empty space to sign]
 *   <Full name with degrees>
 *   NIP. <nip>
 * A missing name or NIP is a blank line to fill in by hand. `date: null` leaves out the place and
 * date line (a letter already carries them next to its number).
 */
export function signatureBlockHtml({ date = new Date(), place = "Padang", title, titleLines = [], acknowledged = false, name = null, nip = null, withQr = false }) {
  const blank = "______________________________";
  return `
  <div class="signature-row">
    <div class="signature-block">
      ${date === null ? "" : `<p>${escapeHtml(place)}, ${escapeHtml(formatDocumentDate(date))}</p>`}
      ${acknowledged ? "<p>Mengetahui,</p>" : ""}
      <p>${escapeHtml(title)},</p>
      ${titleLines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}
      <div class="signature-space">${withQr ? DOCUMENT_QR_PLACEHOLDER : ""}</div>
      <p class="signer-name">${name ? escapeHtml(name) : blank}</p>
      <p>NIP. ${nip ? escapeHtml(nip) : "____________________"}</p>
    </div>
  </div>`;
}

/** The holder of a department position (an active user with that role), or null. */
export async function findPositionHolder(roleName, client = prisma) {
  const row = await client.userHasRole.findFirst({
    where: { status: "active", role: { name: roleName } },
    orderBy: { userId: "asc" },
    select: { user: { select: { fullName: true, identityNumber: true } } },
  });
  return row?.user ? { name: row.user.fullName, nip: row.user.identityNumber } : null;
}

/** Name and NIP of a lecturer relation (`{ lecturer: { user } }`), or null. */
export function lecturerSigner(relation) {
  const user = relation?.lecturer?.user ?? relation?.user ?? null;
  return user ? { name: user.fullName ?? null, nip: user.identityNumber ?? null } : null;
}

const SUPERVISOR_TITLES = { "Pembimbing 1": "Dosen Pembimbing I", "Pembimbing 2": "Dosen Pembimbing II" };

/**
 * The supervisor who signs a seminar or defence document: the given relation (e.g. the one who
 * finalized the result), else Pembimbing 1 of the thesis. { title, name, nip }.
 */
export async function supervisorSigner(thesisId, relationId = null, client = prisma) {
  const select = { role: { select: { name: true } }, lecturer: { select: { user: { select: { fullName: true, identityNumber: true } } } } };
  const relation =
    (relationId ? await client.thesisSupervisors.findUnique({ where: { id: relationId }, select }) : null) ??
    (thesisId ? await client.thesisSupervisors.findFirst({ where: { thesisId, role: { name: "Pembimbing 1" } }, orderBy: { createdAt: "asc" }, select }) : null);
  return {
    title: SUPERVISOR_TITLES[relation?.role?.name] ?? "Dosen Pembimbing I",
    name: relation?.lecturer?.user?.fullName ?? null,
    nip: relation?.lecturer?.user?.identityNumber ?? null,
  };
}
