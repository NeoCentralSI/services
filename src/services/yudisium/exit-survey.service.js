/**
 * Exit Survey Service.
 * 
 * Manages the data master for exit survey forms, including sessions, questions,
 * and processing student responses during the yudisium process.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as xlsx from "xlsx";
import * as repo from "../../repositories/yudisium/exit-survey.repository.js";
import { findStudentContext } from "./student.service.js";
import prisma from "../../config/prisma.js";
import { convertHtmlToPdf } from "../../utils/pdf.util.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function throwError(msg, code) {
  const e = new Error(msg);
  e.statusCode = code;
  throw e;
}

const QUESTION_TYPES = ["short_answer", "paragraph", "single_choice", "multiple_choice", "date"];
const REQUIRED_SKS = 146;
const CHOICE_QUESTION_TYPES = ["single_choice", "multiple_choice"];

const QUESTION_TYPE_LABELS = {
  short_answer: "Jawaban Singkat",
  paragraph: "Paragraf",
  single_choice: "Pilihan Ganda",
  multiple_choice: "Kotak Centang",
  date: "Tanggal",
};

const validateQuestionType = (value) => {
  if (!QUESTION_TYPES.includes(value)) throwError("Jenis pertanyaan tidak valid", 400);
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

const isYudisiumRegistrationOpen = (item) => deriveYudisiumStatus(item) === "open";

const hasMetAcademicRequirements = (student, thesis) => {
  const latestDefence = thesis?.thesisDefences?.[0] ?? null;
  const needsRevision = latestDefence?.status === "passed_with_revision";
  const revisionFinalized =
    !!latestDefence?.revisionFinalizedAt && !!latestDefence?.revisionFinalizedBy;

  return (
    (student?.skscompleted ?? 0) >= REQUIRED_SKS &&
    (!needsRevision || revisionFinalized) &&
    !!student?.mandatoryCoursesCompleted &&
    !!student?.mkwuCompleted &&
    !!student?.internshipCompleted &&
    !!student?.kknCompleted
  );
};

const formatFormSummary = (item) => {
  const totalQuestions = (item.sessions ?? []).reduce(
    (acc, session) => acc + (session._count?.questions ?? 0),
    0
  );

  return {
    id: item.id,
    name: item.name,
    description: item.description ?? null,
    isActive: item.isActive,
    totalSessions: item.sessions?.length ?? 0,
    totalQuestions,
    usedCount: item._count?.yudisiums ?? 0,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
};

const formatQuestion = (q, sessionName = q.session?.name) => ({
  id: q.id,
  exitSurveySessionId: q.exitSurveySessionId,
  sessionName,
  question: q.question,
  description: q.description ?? null,
  questionType: q.questionType,
  isRequired: q.isRequired,
  orderNumber: q.orderNumber,
  options: (q.options ?? []).map((o) => ({
    id: o.id,
    optionText: o.optionText,
    orderNumber: o.orderNumber,
  })),
  createdAt: q.createdAt,
  updatedAt: q.updatedAt,
});

const escapeHtml = (value) =>
  String(value ?? "-")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const sanitizeSheetName = (value) =>
  String(value || "Data")
    .replace(/[\\/?*[\]:]/g, "")
    .slice(0, 31) || "Data";

const formatDateTimeLong = (dateObj) => {
  if (!dateObj) return "-";
  return new Date(dateObj).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
};

const formatDateLong = (dateObj) => {
  if (!dateObj) return "-";
  return new Date(dateObj).toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

const formatGpa = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "-";
  return numeric.toFixed(2);
};

const getGenderLabel = (gender) => {
  if (gender === true) return "Perempuan";
  if (gender === false) return "Laki-laki";
  return "Belum Diisi";
};

const getUnandLogoBase64 = () => {
  const possibleLogoPaths = [
    path.resolve(__dirname, "../../assets/unand-logo.png"),
    path.resolve(__dirname, "../assets/unand-logo.png"),
    path.resolve(process.cwd(), "src/assets/unand-logo.png"),
  ];

  for (const p of possibleLogoPaths) {
    try {
      if (fs.existsSync(p)) {
        return `data:image/png;base64,${fs.readFileSync(p).toString("base64")}`;
      }
    } catch {
      // Continue to the next known path.
    }
  }

  return "";
};

const percentage = (count, total) => (total > 0 ? Math.round((count / total) * 100) : 0);

const mapStudentResponse = (response) => {
  if (!response) return null;
  return {
    id: response.id,
    submittedAt: response.submittedAt,
    answers: response.answers.map((a) => ({
      id: a.id,
      questionId: a.exitSurveyQuestionId,
      optionId: a.exitSurveyOptionId,
      answerText: a.answerText,
    })),
  };
};

// ============================================================
// FORMS
// ============================================================

export const getForms = async () => {
  const items = await repo.findAllForms();
  return items.map(formatFormSummary);
};

export const getFormDetail = async (id) => {
  const data = await repo.findFormById(id);
  if (!data) throwError("Form exit survey tidak ditemukan", 404);

  return {
    id: data.id,
    name: data.name,
    description: data.description ?? null,
    isActive: data.isActive,
    sessions: data.sessions.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description ?? null,
      order: s.order,
      questions: s.questions.map((q) => formatQuestion(q, s.name)),
    })),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    usedCount: data._count?.yudisiums ?? 0,
    totalQuestions: data.sessions.reduce((acc, s) => acc + s.questions.length, 0),
    totalResponses: (await prisma.studentExitSurveyResponse.findMany({
      where: {
        yudisium: { exitSurveyFormId: id }
      },
      distinct: ["thesisId"],
      select: { thesisId: true },
    })).length,
  };
};

export const createForm = async (data) => {
  return await repo.createForm({
    name: data.name,
    description: data.description ?? null,
    isActive: data.isActive !== false,
  });
};

export const updateForm = async (id, data) => {
  const existing = await repo.findFormById(id);
  if (!existing) throwError("Form exit survey tidak ditemukan", 404);

  if (await repo.formHasLinkedResponses(id)) {
    throwError(
      "Form exit survey tidak dapat diubah karena sudah digunakan mahasiswa",
      409
    );
  }

  const updateData = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;

  return await repo.updateForm(id, updateData);
};

export const toggleForm = async (id) => {
  const existing = await repo.findFormById(id);
  if (!existing) throwError("Form exit survey tidak ditemukan", 404);

  return await repo.updateForm(id, { isActive: !existing.isActive });
};

export const deleteForm = async (id) => {
  const existing = await repo.findFormById(id);
  if (!existing) throwError("Form exit survey tidak ditemukan", 404);

  if (await repo.formHasRelatedYudisiums(id)) {
    throwError(
      "Form exit survey tidak dapat dihapus karena sudah digunakan oleh acara yudisium",
      409
    );
  }

  await repo.removeForm(id);
};

export const getFormResponses = async (formId, filters = {}) => {
  const form = await repo.findFormById(formId);
  if (!form) throwError("Form exit survey tidak ditemukan", 404);

  const responses = await prisma.studentExitSurveyResponse.findMany({
    where: {
      yudisiumId: filters.yudisiumId || undefined,
      yudisium: { exitSurveyFormId: formId },
    },
    include: {
      yudisium: true,
      answers: {
        include: {
          option: true,
          question: true,
        },
      },
      thesis: {
        include: {
          student: {
            include: {
              user: true,
            },
          },
        },
      },
    },
    orderBy: { submittedAt: "desc" },
  });

  return responses.map((r) => ({
    id: r.id,
    thesisId: r.thesisId,
    submittedAt: r.submittedAt,
    yudisiumId: r.yudisiumId,
    yudisiumName: r.yudisium?.name || "-",
    name: r.thesis?.student?.user?.fullName || "Mahasiswa",
    nim: r.thesis?.student?.user?.identityNumber || "-",
    email: r.thesis?.student?.user?.email || "-",
    phone: r.thesis?.student?.user?.phoneNumber || "-",
    gender: r.thesis?.student?.user?.gender ?? null,
    genderLabel: getGenderLabel(r.thesis?.student?.user?.gender ?? null),
    enrollmentYear: r.thesis?.student?.enrollmentYear || null,
    gpa: r.thesis?.student?.gpa ?? null,
    graduationPredicate: r.thesis?.student?.graduationPredicate ?? null,
    answers: r.answers.map((a) => ({
      questionId: a.exitSurveyQuestionId,
      questionText: a.question?.question,
      optionId: a.exitSurveyOptionId,
      optionText: a.option?.optionText,
      answerText: a.answerText,
    })),
  }));
};

const getOrderedQuestions = (form) =>
  (form.sessions ?? [])
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .flatMap((session) =>
      (session.questions ?? [])
        .slice()
        .sort((a, b) => (a.orderNumber ?? 0) - (b.orderNumber ?? 0))
        .map((question) => ({ ...question, sessionName: session.name }))
    );

const buildRespondentSummary = (responses) => {
  const uniqueByThesis = new Map();
  responses.forEach((response) => {
    if (!uniqueByThesis.has(response.thesisId || response.id)) {
      uniqueByThesis.set(response.thesisId || response.id, response);
    }
  });
  const respondents = Array.from(uniqueByThesis.values());

  const groupCount = (values) => {
    const map = new Map();
    values.forEach((value) => map.set(value || "Belum Diisi", (map.get(value || "Belum Diisi") || 0) + 1));
    return Array.from(map.entries()).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  };

  const gpaValues = respondents
    .map((response) => Number(response.gpa))
    .filter((value) => Number.isFinite(value));
  const averageGpa = gpaValues.length > 0
    ? gpaValues.reduce((acc, value) => acc + value, 0) / gpaValues.length
    : null;

  return {
    totalRespondents: respondents.length,
    gender: groupCount(respondents.map((response) => response.genderLabel)),
    enrollmentYear: groupCount(respondents.map((response) => response.enrollmentYear)),
    averageGpa,
  };
};

const buildChoiceQuestionStats = (form, responses) => {
  const questions = getOrderedQuestions(form).filter((question) =>
    CHOICE_QUESTION_TYPES.includes(question.questionType)
  );

  return questions.map((question, index) => {
    const answerMap = new Map();
    const respondentIds = new Set();

    responses.forEach((response) => {
      const answers = response.answers.filter((answer) => answer.questionId === question.id && answer.optionId);
      if (answers.length > 0) respondentIds.add(response.id);
      answers.forEach((answer) => {
        answerMap.set(answer.optionId, (answerMap.get(answer.optionId) || 0) + 1);
      });
    });

    const options = (question.options ?? []).map((option) => {
      const count = answerMap.get(option.id) || 0;
      return {
        id: option.id,
        optionText: option.optionText,
        count,
        percent: percentage(count, responses.length),
      };
    });

    return {
      index: index + 1,
      id: question.id,
      sessionName: question.sessionName,
      question: question.question,
      questionType: question.questionType,
      questionTypeLabel: QUESTION_TYPE_LABELS[question.questionType] || question.questionType,
      respondentCount: respondentIds.size,
      options,
    };
  });
};

const buildExitSurveyReportHtml = ({ form, responses, periodLabel }) => {
  const logoBase64 = getUnandLogoBase64();
  const summary = buildRespondentSummary(responses);
  const questionStats = buildChoiceQuestionStats(form, responses);
  const generatedAt = formatDateLong(new Date());

  const summaryRows = [
    ["Total Responden", `${summary.totalRespondents} mahasiswa`],
    ["Rata-rata IPK", formatGpa(summary.averageGpa)],
    ["Periode Yudisium", periodLabel],
  ].map(([label, value]) => `
    <tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>
  `).join("");

  const genderRows = summary.gender.map(([label, count]) => `
    <tr><td>${escapeHtml(label)}</td><td class="text-center">${count}</td><td class="text-center">${percentage(count, summary.totalRespondents)}%</td></tr>
  `).join("");

  const enrollmentRows = summary.enrollmentYear.map(([label, count]) => `
    <tr><td>${escapeHtml(label)}</td><td class="text-center">${count}</td><td class="text-center">${percentage(count, summary.totalRespondents)}%</td></tr>
  `).join("");

  const tocRows = questionStats.map((question) => `
    <tr><td>${question.index}</td><td>${escapeHtml(question.question)}</td><td>${escapeHtml(question.sessionName || "-")}</td></tr>
  `).join("");

  const questionSections = questionStats.map((question) => {
    const maxCount = Math.max(...question.options.map((option) => option.count), 1);
    const optionRows = question.options.map((option, idx) => `
      <tr>
        <td class="text-center">${idx + 1}</td>
        <td>${escapeHtml(option.optionText)}</td>
        <td class="text-center">${option.count}</td>
        <td>
          <div class="bar-row">
            <div class="bar" style="width: ${Math.max(4, (option.count / maxCount) * 100)}%"></div>
            <span>${option.percent}%</span>
          </div>
        </td>
      </tr>
    `).join("");

    return `
      <section class="question-section">
        <div class="question-heading">
          <div>
            <div class="question-kicker">Pertanyaan ${question.index}</div>
            <h3>${escapeHtml(question.question)}</h3>
          </div>
          <div class="question-meta">${question.respondentCount} responden</div>
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 9%;">No</th>
              <th>Pilihan Jawaban</th>
              <th style="width: 14%;">Jumlah</th>
              <th style="width: 28%;">Persentase</th>
            </tr>
          </thead>
          <tbody>${optionRows}</tbody>
        </table>
      </section>
    `;
  }).join("");

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Laporan Exit Survey</title>
  <style>
    @page { size: A4; margin: 1.35cm 1.55cm; }
    body {
      font-family: "Times New Roman", Times, serif;
      font-size: 11pt;
      line-height: 1.35;
      color: #111827;
      margin: 0;
    }
    .header-table {
      width: 100%;
      border-collapse: collapse;
      border-bottom: 2px solid #111;
      margin-bottom: 18px;
    }
    .logo-cell { width: 84px; vertical-align: middle; padding-bottom: 8px; }
    .logo-img { width: 74px; display: block; }
    .header-text { text-align: center; vertical-align: middle; padding-right: 84px; }
    .header-text h3, .header-text h4 { margin: 0; font-size: 11pt; text-transform: uppercase; }
    .header-text h2 { margin: 1px 0; font-size: 15pt; text-transform: uppercase; color: #003c73; }
    .header-text p { margin: 1px 0; font-size: 8.7pt; }
    .cover {
      min-height: 600px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      text-align: center;
      page-break-after: always;
    }
    .cover-logo {
      width: 118px;
      height: auto;
      display: block;
      margin: 46px auto 46px;
    }
    .cover h1 {
      font-size: 21pt;
      text-transform: uppercase;
      margin: 0 0 14px;
      line-height: 1.25;
      font-weight: bold;
    }
    .cover h2 {
      font-size: 16pt;
      text-transform: uppercase;
      margin: 0 0 8px;
      color: #000;
      line-height: 1.25;
      font-weight: bold;
    }
    .cover .form-title {
      font-size: 13pt;
      text-transform: uppercase;
      margin: 6px 0 0;
      font-weight: bold;
    }
    .cover-footer {
      margin-top: 150px;
      font-size: 13pt;
      text-transform: uppercase;
      font-weight: bold;
      line-height: 1.45;
    }
    .cover-year {
      margin-top: 10px;
      font-size: 13pt;
      font-weight: bold;
    }
    .page-title {
      font-size: 14pt;
      text-transform: uppercase;
      font-weight: bold;
      border-bottom: 1px solid #9ca3af;
      padding-bottom: 5px;
      margin: 0 0 10px;
    }
    .section-title {
      font-size: 12pt;
      text-transform: uppercase;
      font-weight: bold;
      margin: 18px 0 8px;
    }
    .data-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      margin-bottom: 10px;
    }
    .data-table th, .data-table td {
      border: 1px solid #1f4e79;
      padding: 5px 7px;
      vertical-align: top;
      overflow-wrap: anywhere;
    }
    .data-table th {
      background: #eef6ff;
      text-align: center;
      font-weight: bold;
    }
    .text-center { text-align: center; }
    .toc { page-break-after: always; }
    .summary-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
    }
    .question-section {
      page-break-inside: avoid;
      margin-top: 16px;
      padding-top: 6px;
    }
    .question-heading {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: flex-start;
      margin-bottom: 8px;
    }
    .question-kicker {
      font-size: 9pt;
      color: #6b7280;
      text-transform: uppercase;
      font-weight: bold;
      letter-spacing: .04em;
    }
    .question-heading h3 {
      margin: 2px 0 0;
      font-size: 11.5pt;
      line-height: 1.25;
    }
    .question-meta {
      white-space: nowrap;
      border: 1px solid #f59e0b;
      color: #b45309;
      padding: 3px 8px;
      border-radius: 999px;
      font-size: 9pt;
      font-weight: bold;
    }
    .bar-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .bar {
      height: 10px;
      background: #f7931e;
      border-radius: 999px;
      min-width: 4px;
    }
    .bar-row span {
      min-width: 34px;
      text-align: right;
      font-weight: bold;
      color: #92400e;
    }
    .footer-note {
      margin-top: 18px;
      font-size: 9pt;
      color: #6b7280;
      text-align: right;
    }
  </style>
</head>
<body>
  <section class="cover">
    <h1>Laporan Exit Survey</h1>
    <h2>${escapeHtml(periodLabel)}</h2>
    <div class="form-title">${escapeHtml(form.name)}</div>
    ${logoBase64 ? `<img src="${logoBase64}" class="cover-logo" alt="Logo UNAND" />` : ""}
    <div class="cover-footer">
      Departemen Sistem Informasi<br />
      Fakultas Teknologi Informasi<br />
      Universitas Andalas
    </div>
    <div class="cover-year">${escapeHtml(new Date().getFullYear())}</div>
  </section>

  <table class="header-table">
    <tr>
      <td class="logo-cell">
        ${logoBase64 ? `<img src="${logoBase64}" class="logo-img" alt="Logo UNAND" />` : ""}
      </td>
      <td class="header-text">
        <h3>Kementerian Pendidikan Tinggi, Sains, dan Teknologi</h3>
        <h4>Universitas Andalas</h4>
        <h4>Fakultas Teknologi Informasi</h4>
        <h2>Departemen Sistem Informasi</h2>
        <p>Kampus Universitas Andalas, Limau Manis, Padang, Kode Pos 25163</p>
        <p>Email: jurusan_si@fti.unand.ac.id dan website: http://si.fti.unand.ac.id</p>
      </td>
    </tr>
  </table>

  <section class="toc">
    <h2 class="page-title">Daftar Isi</h2>
    <table class="data-table">
      <thead><tr><th style="width: 10%;">No</th><th>Bagian</th><th style="width: 24%;">Keterangan</th></tr></thead>
      <tbody>
        <tr><td class="text-center">1</td><td>Identitas Responden</td><td>Ringkasan</td></tr>
        ${tocRows}
      </tbody>
    </table>
  </section>

  <h2 class="page-title">Identitas Responden</h2>
  <table class="data-table">
    <tbody>${summaryRows}</tbody>
  </table>
  <div class="summary-grid">
    <div>
      <div class="section-title">Jenis Kelamin</div>
      <table class="data-table">
        <thead><tr><th>Jenis Kelamin</th><th style="width: 24%;">Jumlah</th><th style="width: 24%;">%</th></tr></thead>
        <tbody>${genderRows || `<tr><td colspan="3" class="text-center">Belum ada data</td></tr>`}</tbody>
      </table>
    </div>
    <div>
      <div class="section-title">Angkatan</div>
      <table class="data-table">
        <thead><tr><th>Angkatan</th><th style="width: 24%;">Jumlah</th><th style="width: 24%;">%</th></tr></thead>
        <tbody>${enrollmentRows || `<tr><td colspan="3" class="text-center">Belum ada data</td></tr>`}</tbody>
      </table>
    </div>
  </div>

  <h2 class="page-title" style="margin-top: 20px;">Ringkasan Jawaban Pilihan</h2>
  ${questionSections || `<p>Tidak ada pertanyaan pilihan yang dapat dianalisis pada laporan ini.</p>`}
  <div class="footer-note">Dicetak melalui NeoCentral pada ${escapeHtml(formatDateTimeLong(new Date()))}</div>
</body>
</html>`;
};

export const exportFormResponsesPdf = async (formId, filters = {}) => {
  const form = await repo.findFormById(formId);
  if (!form) throwError("Form exit survey tidak ditemukan", 404);

  const responses = await getFormResponses(formId, filters);
  const periodLabel = filters.yudisiumId === "all" || !filters.yudisiumId
    ? "Semua Periode"
    : responses[0]?.yudisiumName || "Periode Terpilih";

  const html = buildExitSurveyReportHtml({ form, responses, periodLabel });
  return await convertHtmlToPdf(html);
};

export const exportFormResponsesExcel = async (formId, filters = {}) => {
  const form = await repo.findFormById(formId);
  if (!form) throwError("Form exit survey tidak ditemukan", 404);

  const responses = await getFormResponses(formId, filters);
  const questions = getOrderedQuestions(form);

  const rows = responses.map((response, index) => {
    const row = {
      No: index + 1,
      Nama: response.name,
      NIM: response.nim,
      Email: response.email,
      "No Telepon": response.phone,
      "Jenis Kelamin": response.genderLabel,
      Angkatan: response.enrollmentYear ?? "-",
      IPK: response.gpa ?? "-",
      "Periode Yudisium": response.yudisiumName,
      "Waktu Submit": formatDateTimeLong(response.submittedAt),
    };

    questions.forEach((question) => {
      const answers = response.answers.filter((answer) => answer.questionId === question.id);
      row[question.question] = answers
        .map((answer) => answer.optionText || answer.answerText)
        .filter(Boolean)
        .join(", ") || "-";
    });

    return row;
  });

  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(rows), sanitizeSheetName("Semua Respons"));
  return xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
};

export const duplicateForm = async (id) => {
  const existing = await repo.findFormById(id);
  if (!existing) throwError("Form exit survey tidak ditemukan", 404);

  const newForm = await repo.createForm({
    name: `Salinan - ${existing.name}`,
    description: existing.description,
    isActive: true,
  });

  for (const session of existing.sessions) {
    const newSession = await repo.createSession({
      exitSurveyFormId: newForm.id,
      name: session.name,
      order: session.order,
    });

    for (const q of session.questions) {
      await repo.createQuestion({
        exitSurveySessionId: newSession.id,
        question: q.question,
        questionType: q.questionType,
        isRequired: q.isRequired,
        orderNumber: q.orderNumber,
        options: q.options?.map((o) => ({
          optionText: o.optionText,
          orderNumber: o.orderNumber,
        })),
      });
    }
  }

  return await getFormDetail(newForm.id);
};

// ============================================================
// SESSIONS
// ============================================================

export const createSession = async (formId, data) => {
  const form = await repo.findFormById(formId);
  if (!form) throwError("Form exit survey tidak ditemukan", 404);
  if (await repo.formHasLinkedResponses(formId)) {
    throwError("Sesi tidak dapat ditambahkan karena form sudah digunakan mahasiswa", 409);
  }

  return await repo.createSession({
    exitSurveyFormId: formId,
    name: data.name,
    description: data.description ?? null,
    order: data.order ?? (form.sessions?.length || 0) + 1,
  });
};

export const updateSession = async (formId, sessionId, data) => {
  const session = await repo.findSessionById(sessionId);
  if (!session || session.exitSurveyFormId !== formId) {
    throwError("Sesi tidak ditemukan", 404);
  }
  if (await repo.formHasLinkedResponses(formId)) {
    throwError("Sesi tidak dapat diubah karena form sudah digunakan mahasiswa", 409);
  }

  const updateData = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.order !== undefined) updateData.order = data.order;

  return await repo.updateSession(sessionId, updateData);
};

export const deleteSession = async (formId, sessionId) => {
  const session = await repo.findSessionById(sessionId);
  if (!session || session.exitSurveyFormId !== formId) {
    throwError("Sesi tidak ditemukan", 404);
  }
  if (await repo.formHasLinkedResponses(formId)) {
    throwError("Sesi tidak dapat dihapus karena form sudah digunakan mahasiswa", 409);
  }

  return await prisma.$transaction(async (tx) => {
    // 1. Delete all answers for all questions in this session
    await tx.studentExitSurveyAnswer.deleteMany({
      where: {
        question: {
          exitSurveySessionId: sessionId
        }
      }
    });

    // 2. Delete all options for all questions in this session
    await tx.exitSurveyOption.deleteMany({
      where: {
        question: {
          exitSurveySessionId: sessionId
        }
      }
    });

    // 3. Delete all questions in this session
    await tx.exitSurveyQuestion.deleteMany({
      where: { exitSurveySessionId: sessionId }
    });
    
    const result = await tx.exitSurveySession.delete({
      where: { id: sessionId }
    });
    
    return result;
  });
};

// ============================================================
// QUESTIONS
// ============================================================

export const getQuestionsByForm = async (formId) => {
  const form = await repo.findFormById(formId);
  if (!form) throwError("Form exit survey tidak ditemukan", 404);

  const questions = await repo.findQuestionsByFormId(formId);
  return questions.map((q) => formatQuestion(q));
};

export const getQuestionDetail = async (questionId) => {
  const q = await repo.findQuestionById(questionId);
  if (!q) throwError("Pertanyaan tidak ditemukan", 404);

  return {
    ...formatQuestion(q),
    exitSurveyFormId: q.session?.exitSurveyFormId,
  };
};

export const createQuestion = async (formId, data) => {
  const form = await repo.findFormById(formId);
  if (!form) throwError("Form exit survey tidak ditemukan", 404);

  if (await repo.formHasLinkedResponses(formId)) {
    throwError(
      "Pertanyaan tidak dapat ditambahkan karena form sudah digunakan mahasiswa",
      409
    );
  }

  validateQuestionType(data.questionType);

  // Use specified session ID if provided, otherwise fallback to first session
  let sessionId = data.exitSurveySessionId;
  
  if (!sessionId) {
    let session = form.sessions?.[0];
    if (!session) {
      session = await repo.createSession({
        exitSurveyFormId: formId,
        name: "Umum",
        order: 1,
      });
    }
    sessionId = session.id;
  } else {
    // Validate that the session belongs to this form
    const session = await repo.findSessionById(sessionId);
    if (!session || session.exitSurveyFormId !== formId) {
      throwError("Sesi tidak ditemukan atau tidak valid untuk form ini", 404);
    }
  }

  const payload = {
    exitSurveySessionId: sessionId,
    question: data.question,
    description: data.description ?? null,
    questionType: data.questionType,
    isRequired: data.isRequired === true,
    orderNumber: Number(data.orderNumber) ?? 0,
  };

  const isChoiceType =
    data.questionType === "single_choice" || data.questionType === "multiple_choice";
  if (isChoiceType && Array.isArray(data.options) && data.options.length > 0) {
    payload.options = data.options.map((opt, i) => ({
      optionText: typeof opt === "string" ? opt : opt?.optionText ?? "",
      orderNumber:
        typeof opt === "object" && opt?.orderNumber != null ? opt.orderNumber : i + 1,
    }));
  }

  return await repo.createQuestion(payload);
};

export const updateQuestion = async (formId, questionId, data) => {
  const form = await repo.findFormById(formId);
  if (!form) throwError("Form exit survey tidak ditemukan", 404);

  if (await repo.formHasLinkedResponses(formId)) {
    throwError("Pertanyaan tidak dapat diubah karena form sudah digunakan mahasiswa", 409);
  }

  const existing = await repo.findQuestionById(questionId);
  if (!existing || existing.session?.exitSurveyFormId !== formId) {
    throwError("Pertanyaan tidak ditemukan", 404);
  }

  if (data.questionType !== undefined) validateQuestionType(data.questionType);

  const payload = {};
  if (data.question !== undefined) payload.question = data.question;
  if (data.description !== undefined) payload.description = data.description;
  if (data.questionType !== undefined) payload.questionType = data.questionType;
  if (data.isRequired !== undefined) payload.isRequired = data.isRequired === true;
  if (data.orderNumber !== undefined) payload.orderNumber = Number(data.orderNumber);

  const isChoice = (t) => t === "single_choice" || t === "multiple_choice";
  if (isChoice(data.questionType) || isChoice(existing.questionType)) {
    if (data.questionType !== undefined && !isChoice(data.questionType)) {
      payload.options = [];
    } else if (Array.isArray(data.options)) {
      payload.options = data.options.map((opt, i) => ({
        optionText: typeof opt === "string" ? opt : opt?.optionText ?? "",
        orderNumber:
          typeof opt === "object" && opt?.orderNumber != null ? opt.orderNumber : i + 1,
      }));
    }
  }

  return await repo.updateQuestion(questionId, payload);
};

export const deleteQuestion = async (formId, questionId) => {
  const form = await repo.findFormById(formId);
  if (!form) throwError("Form exit survey tidak ditemukan", 404);

  if (await repo.formHasLinkedResponses(formId)) {
    throwError("Pertanyaan tidak dapat dihapus karena form sudah digunakan mahasiswa", 409);
  }

  const existing = await repo.findQuestionById(questionId);
  if (!existing || existing.session?.exitSurveyFormId !== formId) {
    throwError("Pertanyaan tidak ditemukan", 404);
  }

  await repo.removeQuestion(questionId);
};

// ============================================================
// STUDENT RESPONSE — fetch questions + submit answers
// ============================================================

export const getStudentSurvey = async (userId) => {
  const { student, currentYudisium, thesis } = await findStudentContext(userId);

  if (!currentYudisium) throwError("Belum ada periode yudisium yang berlangsung", 404);
  if (!thesis?.id) throwError("Data tugas akhir mahasiswa belum tersedia", 400);
  if (!hasMetAcademicRequirements(student, thesis)) {
    throwError("Exit survey hanya dapat diakses setelah seluruh persyaratan akademik terpenuhi", 400);
  }
  if (!currentYudisium.exitSurveyForm) {
    throwError("Exit survey belum dikonfigurasi pada periode yudisium ini", 404);
  }

  const existingResponse = await repo.findResponseByYudisiumThesis(
    currentYudisium.id,
    thesis.id,
    true
  );

  if (!existingResponse && !isYudisiumRegistrationOpen(currentYudisium)) {
    throwError("Exit survey hanya dapat diisi saat pendaftaran yudisium dibuka", 400);
  }

  return {
    yudisium: {
      id: currentYudisium.id,
      name: currentYudisium.name,
    },
    form: {
      id: currentYudisium.exitSurveyForm.id,
      name: currentYudisium.exitSurveyForm.name,
      description: currentYudisium.exitSurveyForm.description,
      sessions: currentYudisium.exitSurveyForm.sessions.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description ?? null,
        order: s.order,
        questions: s.questions.map((q) => formatQuestion(q, s.name)),
      })),
    },
    response: mapStudentResponse(existingResponse),
    isSubmitted: !!existingResponse,
  };
};

export const submitStudentSurvey = async (userId, payload) => {
  const { student, currentYudisium, thesis } = await findStudentContext(userId);

  if (!currentYudisium) throwError("Belum ada periode yudisium yang berlangsung", 404);
  if (!isYudisiumRegistrationOpen(currentYudisium)) {
    throwError("Exit survey hanya dapat diisi saat pendaftaran yudisium dibuka", 400);
  }
  if (!thesis?.id) throwError("Data tugas akhir mahasiswa belum tersedia", 400);
  if (!hasMetAcademicRequirements(student, thesis)) {
    throwError("Exit survey hanya dapat diisi setelah seluruh persyaratan akademik terpenuhi", 400);
  }
  if (!currentYudisium.exitSurveyForm) {
    throwError("Exit survey belum dikonfigurasi pada periode yudisium ini", 404);
  }

  const existingResponse = await repo.findResponseByYudisiumThesis(
    currentYudisium.id,
    thesis.id
  );
  if (existingResponse) {
    throwError("Exit survey sudah pernah dikirim dan tidak dapat diubah", 409);
  }

  const allQuestions = currentYudisium.exitSurveyForm.sessions.flatMap((s) => s.questions);
  const questionMap = new Map(allQuestions.map((q) => [q.id, q]));

  const answerMap = new Map();
  for (const answer of payload.answers) {
    if (!questionMap.has(answer.questionId)) {
      throwError("Terdapat pertanyaan yang tidak valid", 400);
    }
    if (answerMap.has(answer.questionId)) {
      throwError("Jawaban duplikat untuk pertanyaan yang sama tidak diperbolehkan", 400);
    }
    answerMap.set(answer.questionId, answer);
  }

  const answerRows = [];

  for (const question of allQuestions) {
    const answer = answerMap.get(question.id);

    if (!answer) {
      if (question.isRequired) {
        throwError(`Pertanyaan wajib belum dijawab: ${question.question}`, 400);
      }
      continue;
    }

    if (question.questionType === "single_choice") {
      if (!answer.optionId) {
        throwError(`Jawaban pilihan tunggal wajib diisi: ${question.question}`, 400);
      }
      const validOption = question.options.some((o) => o.id === answer.optionId);
      if (!validOption) {
        throwError(`Opsi tidak valid untuk pertanyaan: ${question.question}`, 400);
      }
      answerRows.push({
        exitSurveyQuestionId: question.id,
        exitSurveyOptionId: answer.optionId,
        answerText: null,
      });
      continue;
    }

    if (question.questionType === "multiple_choice") {
      const optionIds = Array.isArray(answer.optionIds) ? [...new Set(answer.optionIds)] : [];
      if (question.isRequired && optionIds.length === 0) {
        throwError(`Jawaban pilihan ganda wajib diisi: ${question.question}`, 400);
      }
      for (const optionId of optionIds) {
        const validOption = question.options.some((o) => o.id === optionId);
        if (!validOption) {
          throwError(`Opsi tidak valid untuk pertanyaan: ${question.question}`, 400);
        }
        answerRows.push({
          exitSurveyQuestionId: question.id,
          exitSurveyOptionId: optionId,
          answerText: null,
        });
      }
      continue;
    }

    const answerText = typeof answer.answerText === "string" ? answer.answerText.trim() : "";
    if (question.isRequired && !answerText) {
      throwError(`Jawaban teks wajib diisi: ${question.question}`, 400);
    }
    if (answerText) {
      answerRows.push({
        exitSurveyQuestionId: question.id,
        exitSurveyOptionId: null,
        answerText,
      });
    }
  }

  if (answerRows.length === 0) {
    throwError("Jawaban exit survey tidak boleh kosong", 400);
  }

  const created = await repo.createResponseWithAnswers({
    yudisiumId: currentYudisium.id,
    thesisId: thesis.id,
    answers: answerRows,
  });

  return { response: mapStudentResponse(created) };
};
