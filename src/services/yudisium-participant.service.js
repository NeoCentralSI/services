import fs from "fs";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { fileURLToPath } from "url";
import { convertHtmlToPdf } from "../utils/pdf.util.js";
import prisma from "../config/prisma.js";
import * as participantRepo from "../repositories/yudisium-participant.repository.js";
import * as requirementRepo from "../repositories/yudisium-requirement.repository.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function throwError(msg, code) {
  const e = new Error(msg);
  e.statusCode = code;
  throw e;
}

const PARTICIPANT_STATUS_PRIORITY = {
  registered: 0,
  verified: 1,
  cpl_validated: 2,
  appointed: 3,
  finalized: 4,
  rejected: 99,
};

const deriveYudisiumStatus = (item) => {
  const now = new Date();
  const openDate = item.registrationOpenDate ? new Date(item.registrationOpenDate) : null;
  const closeDate = item.registrationCloseDate ? new Date(item.registrationCloseDate) : null;
  const eventDate = item.eventDate ? new Date(item.eventDate) : null;

  if (eventDate) {
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 86400000 - 1);
    if (eventDate < todayStart) return "completed";
    if (eventDate >= todayStart && eventDate <= todayEnd) return "ongoing";
  }

  if (!openDate) return "draft";
  if (now < openDate) return "draft";
  if (closeDate && now > closeDate) return "closed";
  return "open";
};

// ============================================================
// PARTICIPANT LIST & DETAIL
// ============================================================

export const getParticipants = async (yudisiumId) => {
  const yudisium = await participantRepo.findYudisiumById(yudisiumId);
  if (!yudisium) throwError("Periode yudisium tidak ditemukan", 404);

  const totalRequirements = await prisma.yudisiumRequirementItem.count({
    where: { yudisiumId },
  });

  const participants = await participantRepo.findManyByYudisium(yudisiumId);

  const mapped = participants.map((p) => {
    const reqs = p.yudisiumParticipantRequirements;
    const approvedCount = reqs.filter((r) => r.status === "approved").length;
    const submittedCount = reqs.filter((r) => r.status === "submitted").length;
    const declinedCount = reqs.filter((r) => r.status === "declined").length;

    return {
      id: p.id,
      status: p.status,
      registeredAt: p.registeredAt,
      appointedAt: p.appointedAt,
      notes: p.notes,
      studentName: p.thesis?.student?.user?.fullName || "-",
      studentNim: p.thesis?.student?.user?.identityNumber || "-",
      thesisTitle: p.thesis?.title || "-",
      thesisId: p.thesis?.id || null,
      documentSummary: {
        total: totalRequirements,
        submitted: submittedCount,
        approved: approvedCount,
        declined: declinedCount,
      },
    };
  });

  mapped.sort((a, b) => {
    const pa = PARTICIPANT_STATUS_PRIORITY[a.status] ?? 99;
    const pb = PARTICIPANT_STATUS_PRIORITY[b.status] ?? 99;
    if (pa !== pb) return pa - pb;
    const dateA = a.registeredAt ? new Date(a.registeredAt).getTime() : 0;
    const dateB = b.registeredAt ? new Date(b.registeredAt).getTime() : 0;
    return dateA - dateB;
  });

  return {
    yudisium: { id: yudisium.id, name: yudisium.name, status: yudisium.status },
    participants: mapped,
  };
};

export const getParticipantDetail = async (participantId) => {
  const participant = await participantRepo.findDetailById(participantId);
  if (!participant) throwError("Peserta yudisium tidak ditemukan", 404);

  // Use requirements specifically assigned to this Yudisium period
  const yudisiumRequirements = await prisma.yudisiumRequirementItem.findMany({
    where: { yudisiumId: participant.yudisium.id },
    include: { yudisiumRequirement: true },
    orderBy: { order: "asc" },
  });

  const uploadedMap = new Map(
    participant.yudisiumParticipantRequirements.map((r) => [r.yudisiumRequirementItemId, r])
  );

  const documents = yudisiumRequirements.map((item) => {
    const uploaded = uploadedMap.get(item.id);
    return {
      requirementId: item.id,
      requirementName: item.yudisiumRequirement.name,
      description: item.yudisiumRequirement.description,
      order: item.order,
      status: uploaded?.status ?? null,
      submittedAt: uploaded?.submittedAt ?? null,
      verifiedAt: uploaded?.verifiedAt ?? null,
      notes: uploaded?.notes ?? null,
      verifiedBy: uploaded?.verifier?.fullName ?? null,
      document: uploaded?.document
        ? {
            id: uploaded.document.id,
            fileName: uploaded.document.fileName,
            filePath: uploaded.document.filePath,
          }
        : null,
    };
  });

  const supervisors = (participant.thesis?.thesisSupervisors || []).map((ts) => ({
    name: ts.lecturer?.user?.fullName || "-",
    role: ts.role?.name || "-",
  }));

  return {
    id: participant.id,
    status: participant.status,
    registeredAt: participant.registeredAt,
    appointedAt: participant.appointedAt,
    notes: participant.notes,
    yudisium: {
      id: participant.yudisium.id,
      name: participant.yudisium.name,
      status: deriveYudisiumStatus(participant.yudisium),
    },
    studentName: participant.thesis?.student?.user?.fullName || "-",
    studentNim: participant.thesis?.student?.user?.identityNumber || "-",
    thesisTitle: participant.thesis?.title || "-",
    supervisors,
    documents,
  };
};

// ============================================================
// DOCUMENT VALIDATION (Admin approves/declines a participant's doc)
// ============================================================

export const validateParticipantDocument = async (
  participantId,
  requirementId,
  { action, notes, userId }
) => {
  if (!["approve", "decline"].includes(action)) {
    throwError('Action harus "approve" atau "decline"', 400);
  }

  const participant = await participantRepo.findStatusById(participantId);
  if (!participant) throwError("Peserta yudisium tidak ditemukan", 404);

  if (participant.status !== "registered") {
    throwError(
      "Validasi dokumen hanya dapat dilakukan saat peserta berstatus 'registered'",
      400
    );
  }

  const docRecord = await participantRepo.findRequirementRecord(participantId, requirementId);
  if (!docRecord) {
    throwError("Dokumen persyaratan tidak ditemukan untuk divalidasi", 404);
  }

  const newStatus = action === "approve" ? "approved" : "declined";

  await participantRepo.updateRequirementRecord(participantId, requirementId, {
    status: newStatus,
    notes: notes || null,
    verifiedBy: userId,
    verifiedAt: new Date(),
  });

  // Auto-transition: when all docs approved → move participant to verified
  let participantTransitioned = false;
  if (action === "approve") {
    // Count requirements specific to this yudisium
    const expectedCount = await prisma.yudisiumRequirementItem.count({
      where: { yudisiumId: participant.yudisiumId },
    });

    const allDocs = await participantRepo.listRequirementRecords(participantId);
    const approvedCount = allDocs.filter((d) => {
      // Current doc is already approved in DB or being approved now
      if (d.yudisiumRequirementItemId === requirementId) return true;
      return d.status === "approved";
    }).length;

    if (approvedCount >= expectedCount) {
      await participantRepo.updateStatus(participantId, "verified");
      participantTransitioned = true;
    }
  }

  return {
    requirementId,
    status: newStatus,
    participantTransitioned,
    newParticipantStatus: participantTransitioned ? "verified" : participant.status,
  };
};

// ============================================================
// CPL — Scores, Verification, Recommendations
// ============================================================

export const getParticipantCplScores = async (participantId) => {
  const participant = await participantRepo.findStudentByParticipant(participantId);
  if (!participant) throwError("Peserta yudisium tidak ditemukan", 404);

  const studentId = participant.thesis?.student?.id;
  if (!studentId) throwError("Data mahasiswa tidak ditemukan", 404);

  const scores = await participantRepo.findStudentCplScores(studentId);

  const cplScores = scores.map((sc) => {
    const cpl = sc.cpl;
    return {
      cplId: sc.cplId,
      code: cpl?.code || "-",
      description: cpl?.description || "-",
      score: sc.score ?? null,
      oldScore: sc.oldCplScore ?? null,
      minimalScore: cpl?.minimalScore ?? 0,
      status: sc.status ?? "calculated",
      passed: cpl ? sc.score >= cpl.minimalScore : false,
      recommendationDocument: sc.recommendationDocument || null,
      settlementDocument: sc.settlementDocument || null,
      verifiedAt: sc.verifiedAt || null,
      verifiedBy: sc.verifier?.fullName || null,
    };
  });

  return {
    participantId,
    participantStatus: participant.status,
    cplScores,
  };
};

export const verifyCplScore = async (participantId, cplId, userId) => {
  const participant = await participantRepo.findStudentByParticipant(participantId);
  if (!participant) throwError("Peserta yudisium tidak ditemukan", 404);

  const studentId = participant.thesis?.student?.id;
  if (!studentId) throwError("Data mahasiswa tidak ditemukan", 404);

  const score = await participantRepo.findStudentCplScore(studentId, cplId);
  if (!score) throwError("Skor CPL mahasiswa tidak ditemukan", 404);
  if (score.status === "verified") throwError("CPL ini sudah tervalidasi", 400);

  await participantRepo.verifyStudentCplScore(studentId, cplId, userId);

  // If all active CPLs verified and participant is under_review → transition to approved
  const activeCpls = await participantRepo.findCplsActive();
  const allScores = await participantRepo.findStudentCplScores(studentId);
  const scoreStatusMap = new Map(allScores.map((s) => [s.cplId, s.status]));
  const allVerified = activeCpls.every((cpl) => scoreStatusMap.get(cpl.id) === "verified");

  if (allVerified && participant.status === "verified") {
    await participantRepo.updateStatus(participantId, "cpl_validated");
  }

  return { cplId, status: "verified", allCplVerified: allVerified };
};

export const saveCplRepairment = async (
  participantId,
  cplId,
  { newScore, oldScore, recommendationFile, settlementFile, userId }
) => {
  const participant = await participantRepo.findStudentByParticipant(participantId);
  if (!participant) throwError("Peserta yudisium tidak ditemukan", 404);

  const studentId = participant.thesis?.student?.id;
  if (!studentId) throwError("Data mahasiswa tidak ditemukan", 404);

  const score = await participantRepo.findStudentCplScore(studentId, cplId);
  if (!score) throwError("Skor CPL mahasiswa tidak ditemukan", 404);

  // Handle files
  const uploadsRoot = path.join(process.cwd(), "uploads", "yudisium", "cpl-repair", studentId);
  await mkdir(uploadsRoot, { recursive: true });

  let recDocId = null;
  let setDocId = null;

  if (recommendationFile) {
    const ext = path.extname(recommendationFile.originalname).toLowerCase();
    const safeName = `rec-${cplId}-${Date.now()}${ext}`;
    const absPath = path.join(uploadsRoot, safeName);
    await writeFile(absPath, recommendationFile.buffer);
    const relPath = path.relative(process.cwd(), absPath).replace(/\\/g, "/");
    const doc = await participantRepo.createDocument({
      userId,
      fileName: recommendationFile.originalname,
      filePath: relPath,
    });
    recDocId = doc.id;
  }

  if (settlementFile) {
    const ext = path.extname(settlementFile.originalname).toLowerCase();
    const safeName = `set-${cplId}-${Date.now()}${ext}`;
    const absPath = path.join(uploadsRoot, safeName);
    await writeFile(absPath, settlementFile.buffer);
    const relPath = path.relative(process.cwd(), absPath).replace(/\\/g, "/");
    const doc = await participantRepo.createDocument({
      userId,
      fileName: settlementFile.originalname,
      filePath: relPath,
    });
    setDocId = doc.id;
  }

  const result = await participantRepo.saveCplRepairment(studentId, cplId, {
    score: parseInt(newScore),
    oldCplScore: parseInt(oldScore),
    recommendationDocumentId: recDocId,
    settlementDocumentId: setDocId,
    verifiedBy: userId,
  });

  // Re-check overall transition if necessary
  const activeCpls = await participantRepo.findCplsActive();
  const allScores = await participantRepo.findStudentCplScores(studentId);
  const scoreStatusMap = new Map(allScores.map((s) => [s.cplId, s.status]));
  const allVerified = activeCpls.every((cpl) => scoreStatusMap.get(cpl.id) === "verified");

  if (allVerified && participant.status === "verified") {
    await participantRepo.updateStatus(participantId, "cpl_validated");
  }

  return { cplId, status: "verified", allCplVerified: allVerified };
};

// ============================================================
// SK (Decree) — Draft generation & official upload
// ============================================================

const STATUS_LABELS = {
  registered: "Menunggu Validasi Dokumen",
  verified: "Menunggu Validasi CPL",
  cpl_validated: "Calon Peserta Yudisium",
  appointed: "Peserta Yudisium",
  finalized: "Lulus",
  rejected: "Belum Lulus",
};

export const exportParticipants = async (yudisiumId, userId) => {
  const yudisium = await prisma.yudisium.findUnique({
    where: { id: yudisiumId },
    include: {
      room: true,
      participants: {
        where: { 
          status: { in: ["cpl_validated", "appointed", "finalized"] } 
        },
        include: {
          thesis: {
            include: {
              student: { include: { user: true } },
            },
          },
        },
      },
    },
  });

  if (!yudisium) throwError("Periode yudisium tidak ditemukan", 404);

  // Fetch Signatories
  const koordinator = await prisma.user.findUnique({ where: { id: userId } });
  const ketuaDept = await prisma.user.findFirst({
    where: {
      userHasRoles: {
        some: {
          role: { name: "Ketua Departemen" },
          status: "active",
        },
      },
    },
  });

  // Helpers
  const indonesianMonths = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];

  function formatIndoDate(dateObj) {
    if (!dateObj) return '-';
    const d = new Date(dateObj);
    return `${d.getDate()} ${indonesianMonths[d.getMonth()]} ${d.getFullYear()}`;
  }

  function getIndoDay(dateObj) {
    if (!dateObj) return '-';
    const d = new Date(dateObj);
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    return days[d.getDay()];
  }

  function formatTime(dateObj) {
    if (!dateObj) return '-';
    const d = new Date(dateObj);
    const hours = String(d.getUTCHours()).padStart(2, '0');
    const minutes = String(d.getUTCMinutes()).padStart(2, '0');
    return `${hours}.${minutes}`;
  }

  function terbilang(n) {
    const words = ["nol", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"];
    if (n < 12) return words[n];
    if (n < 20) return terbilang(n - 10) + " belas";
    if (n < 100) {
      const p = Math.floor(n / 10);
      const s = n % 10;
      return (p === 1 ? "sepuluh" : words[p] + " puluh") + (s > 0 ? " " + words[s] : "");
    }
    return String(n);
  }

  const logoPath = path.resolve(__dirname, "../assets/unand-logo.png");
  let logoBase64 = "";
  try {
    if (fs.existsSync(logoPath)) {
      const logoBuffer = fs.readFileSync(logoPath);
      logoBase64 = `data:image/png;base64,${logoBuffer.toString("base64")}`;
    }
  } catch (e) {
    console.error("Yudisium export logo load failed:", e);
  }

  const participants = yudisium.participants || [];
  const studentCount = participants.length;
  const studentCountWords = terbilang(studentCount);

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Penetapan Jadwal Pelaksanaan Yudisium</title>
  <style>
    @page {
      size: A4;
      margin: 1.5cm 2cm 1.5cm 2.5cm;
    }
    body {
      font-family: "Times New Roman", Times, serif;
      font-size: 11pt;
      line-height: 1.3;
      color: #000;
    }
    .header-table {
      width: 100%;
      border-collapse: collapse;
      border-bottom: 2px solid #000;
      padding-bottom: 6px;
      margin-bottom: 12px;
    }
    .logo-cell {
      width: 70px;
      vertical-align: middle;
      padding-right: 12px;
    }
    .logo-img {
      width: 70px;
      height: auto;
    }
    .header-text {
      text-align: center;
      vertical-align: middle;
    }
    .header-text h3 {
      margin: 0;
      font-size: 13pt;
      font-weight: bold;
      text-transform: uppercase;
    }
    .header-text h4 {
      margin: 0;
      font-size: 11pt;
      font-weight: bold;
      text-transform: uppercase;
    }
    .header-text h2 {
      margin: 0;
      font-size: 15pt;
      font-weight: bold;
      color: #0b5c9e;
      text-transform: uppercase;
    }
    .header-text p {
      margin: 1px 0;
      font-size: 9pt;
    }
    .yd-box {
      border: 1px solid #000;
      padding: 3px 8px;
      font-size: 11pt;
      font-weight: bold;
      text-align: center;
    }
    .title {
      text-align: center;
      font-weight: bold;
      font-size: 12pt;
      text-decoration: underline;
      margin: 20px 0;
      text-transform: uppercase;
    }
    .section-title {
      font-weight: bold;
      margin-top: 15px;
      margin-bottom: 5px;
    }
    .info-table {
      width: 100%;
      margin-left: 20px;
      border-collapse: collapse;
    }
    .info-table td {
      vertical-align: top;
      padding: 2px 0;
    }
    .info-label {
      width: 180px;
    }
    .info-separator {
      width: 15px;
    }
    .participants-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
    }
    .participants-table th, .participants-table td {
      border: 1px solid #000;
      padding: 5px;
      text-align: left;
    }
    .participants-table th {
      text-align: center;
      background-color: #f2f2f2;
    }
    .signature-container {
      margin-top: 30px;
      width: 100%;
    }
    .signature-row {
      display: flex;
      justify-content: space-between;
      margin-top: 20px;
    }
    .signature-block {
      width: 250px;
    }
    .signature-space {
      height: 60px;
    }
    .clear {
      clear: both;
    }
  </style>
</head>
<body>
  <table class="header-table">
    <tr>
      <td class="logo-cell">
        ${logoBase64 ? `<img src="${logoBase64}" class="logo-img" alt="Logo UNAND" />` : ''}
      </td>
      <td class="header-text">
        <h3>Kementerian Pendidikan, Kebudayaan, Riset Dan Teknologi</h3>
        <h4>Universitas Andalas</h4>
        <h4>Fakultas Teknologi Informasi</h4>
        <h2>Departemen Sistem Informasi</h2>
        <p>Kampus Universitas Andalas, Limau Manis, Padang, Kode Pos 25163</p>
        <p>Email: jurusan_si@fti.unand.ac.id dan website: http://si.fti.unand.ac.id</p>
      </td>
      <td style="width: 70px; vertical-align: top; text-align: right;">
        <div class="yd-box">YD-006</div>
      </td>
    </tr>
  </table>

  <div class="title">PENETAPAN JADWAL PELAKSANAAN YUDISIUM</div>

  <div class="section-title">A. INFORMASI UMUM</div>
  <table class="info-table">
    <tr>
      <td class="info-label">Periode Yudisium</td>
      <td class="info-separator">:</td>
      <td>${yudisium.name}</td>
    </tr>
    <tr>
      <td class="info-label">Jumlah Mahasiswa Lulus</td>
      <td class="info-separator">:</td>
      <td>${studentCount} (${studentCountWords})</td>
    </tr>
  </table>

  <div class="section-title">B. JADWAL PELAKSANAAN YUDISIUM</div>
  <table class="info-table">
    <tr>
      <td class="info-label">Hari / Tanggal</td>
      <td class="info-separator">:</td>
      <td>${getIndoDay(yudisium.eventDate)}, ${formatIndoDate(yudisium.eventDate)}</td>
    </tr>
    <tr>
      <td class="info-label">Waktu</td>
      <td class="info-separator">:</td>
      <td>${formatTime(yudisium.eventDate)} WIB</td>
    </tr>
    <tr>
      <td class="info-label">Tempat Pelaksanaan</td>
      <td class="info-separator">:</td>
      <td>${yudisium.room?.name || '-'}</td>
    </tr>
  </table>

  <div class="section-title">C. DAFTAR MAHASISWA PESERTA YUDISIUM</div>
  <table class="participants-table">
    <thead>
      <tr>
        <th style="width: 40px;">No.</th>
        <th style="width: 120px;">NIM</th>
        <th>Nama Mahasiswa</th>
      </tr>
    </thead>
    <tbody>
      ${participants.length > 0 ? participants.map((p, i) => `
        <tr>
          <td style="text-align: center;">${i + 1}</td>
          <td>${p.thesis?.student?.user?.identityNumber || '-'}</td>
          <td>${p.thesis?.student?.user?.fullName || '-'}</td>
        </tr>
      `).join('') : `
        <tr>
          <td colspan="3" style="text-align: center;">Belum ada peserta yang ditetapkan lulus</td>
        </tr>
      `}
    </tbody>
  </table>

  <div class="section-title">D. TANDA TANGAN KOORDINATOR YUDISIUM</div>
  <p>Dengan ini menetapkan jadwal pelaksanaan yudisium berdasarkan data mahasiswa yang telah memenuhi seluruh persyaratan akademik dan administratif.</p>

  <div style="margin-top: 20px;">
    <div class="signature-block">
      <p>Koordinator Yudisium</p>
      <table style="width: 100%;">
        <tr>
          <td style="width: 80px;">Nama</td>
          <td style="width: 10px;">:</td>
          <td>${koordinator?.fullName || '-'}</td>
        </tr>
        <tr>
          <td>Tanda Tangan</td>
          <td>:</td>
          <td class="signature-space">.........................................</td>
        </tr>
        <tr>
          <td>Tanggal</td>
          <td>:</td>
          <td>${formatIndoDate(new Date())}</td>
        </tr>
      </table>
    </div>
  </div>

  <div style="margin-top: 30px;">
    <p>Mengetahui,</p>
    <p>Ketua Departemen Sistem Informasi,</p>
    <div class="signature-block" style="margin-top: 5px;">
      <table style="width: 100%;">
        <tr>
          <td style="width: 80px;">Nama</td>
          <td style="width: 10px;">:</td>
          <td>${ketuaDept?.fullName || '-'}</td>
        </tr>
        <tr>
          <td>Tanda Tangan</td>
          <td>:</td>
          <td class="signature-space">.........................................</td>
        </tr>
        <tr>
          <td>Tanggal</td>
          <td>:</td>
          <td>.........................................</td>
        </tr>
      </table>
    </div>
  </div>
</body>
</html>`;

  return await convertHtmlToPdf(html);
};

export const finalizeParticipants = async (yudisiumId) => {
  const yudisium = await prisma.yudisium.findUnique({
    where: { id: yudisiumId },
    select: { registrationCloseDate: true },
  });

  if (!yudisium) throwError("Periode yudisium tidak ditemukan", 404);

  const now = new Date();
  const isClosed = yudisium.registrationCloseDate && now > new Date(yudisium.registrationCloseDate);
  if (!isClosed) {
    throwError("Finalisasi hanya dapat dilakukan setelah pendaftaran ditutup", 400);
  }

  // Finalize statuses
  // 1. cpl_validated -> appointed
  // 2. registered, verified -> rejected
  const result = await participantRepo.finalizeAllParticipants(yudisiumId);

  return result;
};
