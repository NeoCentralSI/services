import prisma from "../../config/prisma.js";
import { convertHtmlToPdf } from "../../utils/pdf.util.js";

const escapeHtml = (value) => String(value ?? "-").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);

export async function generateAttendanceLog(userId, seminarIds) {
  const ids = [...new Set(seminarIds)];
  const student = await prisma.student.findUnique({
    where: { id: userId },
    select: { id: true, user: { select: { fullName: true, identityNumber: true } } },
  });
  if (!student) {
    const error = new Error("Data mahasiswa tidak ditemukan.");
    error.statusCode = 404;
    throw error;
  }
  const records = await prisma.thesisSeminarAudience.findMany({
    where: { studentId: student.id, thesisSeminarId: { in: ids }, approvedAt: { not: null } },
    include: {
      seminar: { include: { thesis: { include: { student: { include: { user: true } } } } } },
      supervisor: { include: { lecturer: { include: { user: true } } } },
    },
    orderBy: [{ seminar: { date: "asc" } }, { thesisSeminarId: "asc" }],
  });
  if (!ids.length || records.length !== ids.length) {
    const error = new Error("Pilih hanya kehadiran seminar Anda yang sudah diverifikasi hadir.");
    error.statusCode = 400;
    throw error;
  }
  const dateLabel = (date) => date ? new Date(date).toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta", day: "numeric", month: "long", year: "numeric",
  }) : "-";
  const html = `<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"><style>
    body { font-family: 'Times New Roman', serif; font-size: 11pt; color: #000; }
    header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 12px; }
    h1 { font-size: 14pt; margin: 4px 0; } h2 { text-align: center; font-size: 12pt; margin: 20px 0; }
    table { width: 100%; border-collapse: collapse; } th, td { border: 1px solid #000; padding: 7px; vertical-align: top; overflow-wrap: anywhere; }
    th { text-align: center; } thead { display: table-header-group; } tr { break-inside: avoid; }
    .identity { margin-bottom: 16px; } .identity td { border: 0; padding: 3px; }
  </style></head><body>
    <header>UNIVERSITAS ANDALAS<br>FAKULTAS TEKNOLOGI INFORMASI<h1>DEPARTEMEN SISTEM INFORMASI</h1></header>
    <h2>DAFTAR KEHADIRAN SEMINAR HASIL</h2>
    <table class="identity"><tr><td style="width: 120px">Nama Mahasiswa</td><td>: ${escapeHtml(student.user.fullName)}</td></tr>
      <tr><td>NIM</td><td>: ${escapeHtml(student.user.identityNumber)}</td></tr></table>
    <table><thead><tr><th>No</th><th>Tanggal</th><th>Presenter / NIM</th><th>Judul Tugas Akhir</th><th>Diverifikasi Oleh</th></tr></thead><tbody>
      ${records.map((row, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(dateLabel(row.seminar.date))}</td>
        <td>${escapeHtml(row.seminar.thesis.student.user.fullName)}<br>${escapeHtml(row.seminar.thesis.student.user.identityNumber)}</td>
        <td>${escapeHtml(row.seminar.thesis.title)}</td><td>${escapeHtml(row.supervisor?.lecturer?.user?.fullName)}</td></tr>`).join("")}
    </tbody></table><p>Jumlah kehadiran terverifikasi dalam daftar ini: ${records.length}</p>
  </body></html>`;
  return { buffer: await convertHtmlToPdf(html), filename: "Daftar_Kehadiran_Seminar_Hasil.pdf" };
}
