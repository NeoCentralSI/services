/**
 * TA-07 Formulir Bukti Kehadiran di Seminar Tugas Akhir Mahasiswa Lain: the student's verified
 * attendances at other students' Seminar Hasil, as an official document signed (QR) by the
 * student's Dosen Pembimbing I. Moderator signatures become "Diverifikasi oleh": the lecturer who
 * verified the attendance in NeoCentral and when.
 */
import prisma from "../../config/prisma.js";
import { renderAndIssueOfficialHtmlDocument } from "../official-document.service.js";
import { documentBaseStyles, escapeHtml, formatDocumentDate, letterheadHtml, signatureBlockHtml, supervisorSigner } from "../../utils/document-template.util.js";

export const SEMINAR_ATTENDANCE_DOCUMENT_KIND = "seminar_attendance_certificate";
const text = (value) => escapeHtml(value || "-");

function fail(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
}

/** The HTML of the form. Exported for tests. */
export function buildAttendanceFormHtml({ student, thesis, supervisors, records, signer, issuedOn }) {
  const supervisorOf = (roleName) => supervisors.find((row) => row.role?.name === roleName)?.lecturer?.user?.fullName;
  const rows = records
    .map((row, index) => {
      const presenter = row.seminar.thesis.student.user;
      return `
      <tr>
        <td class="center">${index + 1}</td>
        <td class="nowrap">${text(formatDocumentDate(row.seminar.date))}</td>
        <td>${text(presenter.fullName)} / ${text(presenter.identityNumber)} / ${text(row.seminar.thesis.title)}</td>
        <td>${text(row.supervisor?.lecturer?.user?.fullName)}<br /><span class="nowrap">${text(formatDocumentDate(row.approvedAt))}</span></td>
      </tr>`;
    })
    .join("");
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>TA-07 Bukti Kehadiran Seminar</title>
  <style>${documentBaseStyles(`
    .section-title { font-weight: bold; margin: 14px 0 6px; }
    .identity td:first-child { width: 170px; }
    .center { text-align: center; }
  `)}</style>
</head>
<body>
  ${letterheadHtml()}
  <table class="form-code">
    <tr>
      <td class="code">TA – 07</td>
      <td>FORMULIR BUKTI KEHADIRAN DI SEMINAR TUGAS AKHIR MAHASISWA LAIN</td>
    </tr>
  </table>

  <div class="section-title">A. Identitas Mahasiswa</div>
  <table class="info-table identity">
    <tr><td>Nama mahasiswa</td><td>:</td><td>${text(student.user.fullName)}</td></tr>
    <tr><td>NIM</td><td>:</td><td>${text(student.user.identityNumber)}</td></tr>
    <tr><td>Judul Tugas Akhir</td><td>:</td><td>${text(thesis?.title)}</td></tr>
    <tr><td>Dosen Pembimbing 1</td><td>:</td><td>${text(supervisorOf("Pembimbing 1"))}</td></tr>
    ${supervisorOf("Pembimbing 2") ? `<tr><td>Dosen Pembimbing 2</td><td>:</td><td>${text(supervisorOf("Pembimbing 2"))}</td></tr>` : ""}
  </table>

  <div class="section-title">B. Bukti Kehadiran di Seminar Tugas Akhir Mahasiswa Lain</div>
  <table class="grid">
    <thead>
      <tr>
        <th style="width: 7%;">No</th>
        <th style="width: 17%;">Tanggal Seminar</th>
        <th>Nama Mahasiswa / NIM Mahasiswa / Judul Tugas Akhir</th>
        <th style="width: 24%;">Diverifikasi oleh</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  ${signatureBlockHtml({ date: issuedOn, title: signer.title, name: signer.name, nip: signer.nip, withQr: true })}
</body>
</html>`;
}

export async function generateAttendanceLog(userId, seminarIds) {
  const ids = [...new Set(seminarIds)];
  const student = await prisma.student.findUnique({
    where: { id: userId },
    select: { id: true, user: { select: { fullName: true, identityNumber: true } } },
  });
  if (!student) fail("Data mahasiswa tidak ditemukan.", 404);
  // Only verified attendances (approvedAt) count.
  const records = await prisma.thesisSeminarAudience.findMany({
    where: { studentId: student.id, thesisSeminarId: { in: ids }, approvedAt: { not: null } },
    include: {
      seminar: { include: { thesis: { include: { student: { include: { user: true } } } } } },
      supervisor: { include: { lecturer: { include: { user: true } } } },
    },
    orderBy: [{ seminar: { date: "asc" } }, { thesisSeminarId: "asc" }],
  });
  if (!ids.length || records.length !== ids.length) fail("Pilih hanya kehadiran seminar Anda yang sudah diverifikasi hadir.", 400);

  const thesis = await prisma.thesis.findFirst({
    where: { studentId: student.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      thesisSupervisors: {
        orderBy: { role: { name: "asc" } },
        select: { role: { select: { name: true } }, lecturer: { select: { user: { select: { fullName: true } } } } },
      },
    },
  });
  const signer = await supervisorSigner(thesis?.id ?? null);
  // Dated by the last verification, so the same selection gives the same document.
  const issuedOn = new Date(Math.max(...records.map((row) => new Date(row.approvedAt).getTime())));
  const html = buildAttendanceFormHtml({ student, thesis, supervisors: thesis?.thesisSupervisors ?? [], records, signer, issuedOn });

  const buffer = await renderAndIssueOfficialHtmlDocument({
    documentKind: SEMINAR_ATTENDANCE_DOCUMENT_KIND,
    sourceId: student.id,
    title: "Bukti Kehadiran Seminar (TA-07)",
    subjectName: student.user.fullName,
    subjectIdentifier: student.user.identityNumber,
    issuerName: signer.name ?? "Departemen Sistem Informasi Universitas Andalas",
    issuerRole: signer.title,
    html,
  });
  return { buffer, filename: `TA-07_Bukti_Kehadiran_Seminar_${student.user.identityNumber}.pdf` };
}
