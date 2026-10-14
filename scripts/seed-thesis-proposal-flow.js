/**
 * Test data for the thesis proposal flow (Paket P): one student account per proposal state,
 * so every scenario in PANDUAN_UJI_MANUAL_ALUR_PROPOSAL.md can be run on its own.
 *
 * Run it after the other seeders (from app/backend):
 *   node scripts/seed-master.js
 *   node scripts/seed-thesis-topics.js
 *   node scripts/seed-milestone-templates.js
 *   node scripts/seed-guidance-milestone.js
 *   node scripts/seed-thesis-research-flow.js
 *   node scripts/seed-thesis-monitoring.js
 *   node scripts/seed-thesis-proposal-flow.js
 *
 * It also writes the general supervision limits (soft 8, hard 10), the Research Method master
 * data (CPMK, criteria, rubrics; supervisor 75 + coordinator 25) and the minimum passing score
 * (60) for the running and the previous semester, the general proposal milestone templates,
 * and one attendance import per semester. The sample attendance files for the import test are
 * in scripts/fixtures/.
 *
 * Dates are relative to the day the seeder runs. Idempotent: an account that already has a
 * supervisor request or a thesis is left as it is. Password of every account: password123.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import bcrypt from "bcrypt";
import { PrismaClient } from "../src/generated/prisma/index.js";
import { ROLES } from "../src/constants/roles.js";
import { THESIS_STATUS, THESIS_PHASE } from "../src/constants/thesisStatus.js";
import {
  ASSIGNMENT_BATCH_STATUS,
  SUPERVISOR_REQUEST_ROUTE as ROUTE,
  SUPERVISOR_REQUEST_STATUS as STATUS,
} from "../src/constants/thesis-proposal.js";
import { ATTENDANCE_THRESHOLD, RESEARCH_METHOD_RESULT } from "../src/constants/research-method.js";
import { storeGuidanceAttachment } from "../src/helpers/guidanceFile.helper.js";
import {
  assignmentBatchDir,
  attendanceImportDir,
  proposalFileDir,
  storeFile,
} from "../src/helpers/thesis-proposal-file.helper.js";
import {
  assignmentPdfFileName,
  buildAssignmentCohort,
  renderAssignmentPdf,
} from "../src/helpers/supervisor-assignment.helper.js";

const prisma = new PrismaClient();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_PDF = path.resolve(HERE, "..", "Sample Laporan TA.pdf");
const FIXTURES = path.resolve(HERE, "fixtures");

const DEFAULT_PASSWORD = "password123";
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date();
const daysAgo = (days) => new Date(NOW.getTime() - days * DAY);
const hoursAgo = (hours) => new Date(NOW.getTime() - hours * 60 * 60 * 1000);

const LECTURER = Object.freeze({
  kadep: "kadep_si@fti.unand.ac.id",
  husnil: "pembimbing_si@fti.unand.ac.id", // also Koordinator Metode Penelitian
  afriyanti: "sekdep_si@fti.unand.ac.id",
  aina: "penguji_si@fti.unand.ac.id",
  ullya: "gkm_si@fti.unand.ac.id",
});

const TOPIC = "Pengembangan Sistem (Enterprise Application)";
const TOPIC_RD = "Business Intelligence (BI)";

export const MINIMUM_SCORE = 60;
export const SUPERVISION_LIMITS = { softLimit: 8, hardLimit: 10 };

/** Request form content shared by every account (title differs). */
function requestFields(title) {
  return {
    proposedTitle: title,
    backgroundSummary: "Proses yang berjalan di departemen masih manual dan datanya tersebar di beberapa berkas.",
    problemStatement: "Bagaimana membangun sistem yang memusatkan data dan mempercepat proses tersebut.",
    proposedSolution: "Membangun aplikasi web dengan basis data terpusat dan notifikasi otomatis.",
    researchObject: "Departemen Sistem Informasi Universitas Andalas",
    researchPermitStatus: "in_process",
  };
}

/**
 * One entry per account. `semester`: "current" (running) or "previous" (the semester before).
 * - `flags`: SIA flags per semester ({ current: {...}, previous: {...} }).
 * - `request`: the supervisor request (status, route, lecturer, age in hours).
 * - `thesis`: created when the request was accepted ({ p1, p2, semester, assigned }).
 * - `attempt`: Research Method attempt ({ semester, proposal, attendance, scores, result }).
 * - `guidances` / `milestones`: proposal-phase activity.
 */
const ACCOUNTS = [
  // ── Kelayakan ──────────────────────────────────────────────────────────────────────
  {
    key: "layak",
    nim: "2211528001",
    fullName: "Uji Proposal Layak",
    flags: { current: { eligibleResearchMethod: true } },
  },
  {
    key: "tidak_layak",
    nim: "2211528002",
    fullName: "Uji Proposal Tidak Layak",
    flags: { current: { eligibleResearchMethod: false } },
  },

  // ── Pengajuan Pembimbing ───────────────────────────────────────────────────────────
  {
    key: "menunggu",
    nim: "2211528003",
    fullName: "Uji Proposal Menunggu Dosen",
    flags: { current: { eligibleResearchMethod: true } },
    request: { status: STATUS.PENDING, route: ROUTE.DIRECT, lecturer: LECTURER.aina, hoursAgo: 20, title: "Sistem Informasi Peminjaman Alat Laboratorium" },
  },
  {
    key: "lewat_72",
    nim: "2211528004",
    fullName: "Uji Proposal Lewat 72 Jam",
    flags: { current: { eligibleResearchMethod: true } },
    request: { status: STATUS.PENDING, route: ROUTE.DIRECT, lecturer: LECTURER.ullya, hoursAgo: 100, title: "Aplikasi Pencatatan Kegiatan Pengabdian Masyarakat" },
  },
  {
    key: "ditinjau",
    nim: "2211528005",
    fullName: "Uji Proposal Ditinjau",
    flags: { current: { eligibleResearchMethod: true } },
    request: { status: STATUS.UNDER_REVIEW, route: ROUTE.DIRECT, lecturer: LECTURER.ullya, hoursAgo: 30, title: "Sistem Informasi Penjadwalan Asisten Praktikum" },
  },
  {
    key: "atas_kuota",
    nim: "2211528006",
    fullName: "Uji Proposal Atas Kuota",
    flags: { current: { eligibleResearchMethod: true } },
    request: {
      status: STATUS.PENDING_KADEP,
      route: ROUTE.OVER_QUOTA,
      lecturer: LECTURER.husnil,
      hoursAgo: 50,
      forwarded: true,
      title: "Dashboard Analitik Kinerja Penelitian Dosen",
      topic: TOPIC,
    },
  },
  {
    key: "departemen",
    nim: "2211528007",
    fullName: "Uji Proposal Jalur Departemen",
    flags: { current: { eligibleResearchMethod: true } },
    request: { status: STATUS.PENDING_KADEP, route: ROUTE.DEPARTMENT, lecturer: null, hoursAgo: 26, title: "Sistem Rekomendasi Mata Kuliah Pilihan Mahasiswa", topic: TOPIC_RD },
  },

  // ── Diterima dan Penetapan ─────────────────────────────────────────────────────────
  {
    key: "diterima",
    nim: "2211528008",
    fullName: "Uji Proposal Diterima",
    flags: { current: { eligibleResearchMethod: true } },
    request: { status: STATUS.ACCEPTED, route: ROUTE.DIRECT, lecturer: LECTURER.aina, hoursAgo: 24 * 6, title: "Aplikasi Pengelolaan Inventaris Ruang Departemen" },
    thesis: { p1: LECTURER.aina, semester: "current", assigned: false },
  },
  {
    key: "batal",
    nim: "2211528009",
    fullName: "Uji Proposal Batal",
    flags: { current: { eligibleResearchMethod: true } },
    request: { status: STATUS.ACCEPTED, route: ROUTE.DIRECT, lecturer: LECTURER.ullya, hoursAgo: 24 * 5, title: "Sistem Informasi Layanan Surat Keterangan Mahasiswa" },
    thesis: { p1: LECTURER.ullya, semester: "current", assigned: false },
  },
  {
    key: "ditetapkan",
    nim: "2211528010",
    fullName: "Uji Proposal Ditetapkan",
    flags: { current: { eligibleResearchMethod: true } },
    request: { status: STATUS.ASSIGNED, route: ROUTE.DIRECT, lecturer: LECTURER.aina, hoursAgo: 24 * 50, title: "Sistem Informasi Pengelolaan Tugas Akhir Berbasis Web" },
    thesis: { p1: LECTURER.aina, semester: "current", assigned: true },
    guidances: [{ status: "requested", daysAhead: 3 }],
    attendance: { present: 12, total: 16 },
  },

  // ── Proposal final dan Penilaian ───────────────────────────────────────────────────
  {
    key: "proposal_final",
    nim: "2211528011",
    fullName: "Uji Proposal Final Terkirim",
    flags: { current: { eligibleResearchMethod: true } },
    request: { status: STATUS.ASSIGNED, route: ROUTE.DIRECT, lecturer: LECTURER.aina, hoursAgo: 24 * 52, title: "Aplikasi Monitoring Kehadiran Dosen Berbasis Lokasi" },
    thesis: { p1: LECTURER.aina, semester: "current", assigned: true },
    attempt: { semester: "current", proposalDaysAgo: 4 },
    attendance: { present: 14, total: 16 },
  },
  {
    key: "presensi_kurang",
    nim: "2211528012",
    fullName: "Uji Proposal Presensi Kurang",
    flags: { current: { eligibleResearchMethod: true } },
    request: { status: STATUS.ASSIGNED, route: ROUTE.DIRECT, lecturer: LECTURER.ullya, hoursAgo: 24 * 51, title: "Sistem Informasi Pengaduan Fasilitas Kampus" },
    thesis: { p1: LECTURER.ullya, semester: "current", assigned: true },
    attempt: { semester: "current", proposalDaysAgo: 6, autoZero: true },
    attendance: { present: 10, total: 16 },
  },
  {
    key: "siap_dinilai",
    nim: "2211528013",
    fullName: "Uji Proposal Siap Dinilai",
    flags: { current: { eligibleResearchMethod: true } },
    request: { status: STATUS.ASSIGNED, route: ROUTE.DIRECT, lecturer: LECTURER.aina, hoursAgo: 24 * 53, title: "Sistem Pendukung Keputusan Penerima Beasiswa Internal" },
    thesis: { p1: LECTURER.aina, p2: LECTURER.ullya, semester: "current", assigned: true, topic: TOPIC_RD },
    attempt: { semester: "current", proposalDaysAgo: 3 },
    attendance: { present: 15, total: 16 },
    guidances: [
      { status: "completed", daysAgo: 30, withDraft: true },
      { status: "completed", daysAgo: 16, withDraft: true },
    ],
    milestones: { completed: 2 },
  },
  {
    key: "dinilai_pembimbing",
    nim: "2211528014",
    fullName: "Uji Proposal Dinilai Pembimbing",
    flags: { current: { eligibleResearchMethod: true } },
    request: { status: STATUS.ASSIGNED, route: ROUTE.DIRECT, lecturer: LECTURER.ullya, hoursAgo: 24 * 54, title: "Aplikasi Pelacakan Alumni Program Studi" },
    thesis: { p1: LECTURER.ullya, semester: "current", assigned: true },
    attempt: { semester: "current", proposalDaysAgo: 5, supervisor: [20, 16, 24] },
    attendance: { present: 16, total: 16 },
  },
  {
    key: "lulus_tunggu_krs",
    nim: "2211528015",
    fullName: "Uji Proposal Lulus Tunggu KRS",
    flags: { current: { eligibleResearchMethod: true, takingThesisCourse: false } },
    request: { status: STATUS.ASSIGNED, route: ROUTE.DIRECT, lecturer: LECTURER.ullya, hoursAgo: 24 * 55, title: "Sistem Informasi Pengelolaan Magang Mahasiswa" },
    thesis: { p1: LECTURER.ullya, semester: "current", assigned: true },
    attempt: { semester: "current", proposalDaysAgo: 8, supervisor: [22, 17, 25], coordinator: [8, 12] },
    attendance: { present: 13, total: 16 },
  },

  // ── Hasil semester lalu ────────────────────────────────────────────────────────────
  {
    key: "siap_naik",
    nim: "2211528016",
    fullName: "Uji Proposal Siap Naik",
    flags: {
      previous: { eligibleResearchMethod: true, takingThesisCourse: false },
      current: { eligibleResearchMethod: false, takingThesisCourse: true },
    },
    request: { status: STATUS.ASSIGNED, route: ROUTE.DIRECT, lecturer: LECTURER.aina, semester: "previous", title: "Aplikasi Penjadwalan Ruang Seminar Departemen" },
    thesis: { p1: LECTURER.aina, semester: "previous", assigned: true },
    attempt: { semester: "previous", supervisor: [20, 15, 22], coordinator: [8, 11] },
    previousAttendance: { present: 14, total: 16 },
  },
  {
    key: "tidak_lulus",
    nim: "2211528017",
    fullName: "Uji Proposal Tidak Lulus",
    flags: {
      previous: { eligibleResearchMethod: true, takingThesisCourse: false },
      current: { eligibleResearchMethod: true, takingThesisCourse: false },
    },
    request: { status: STATUS.ASSIGNED, route: ROUTE.DIRECT, lecturer: LECTURER.ullya, semester: "previous", title: "Sistem Informasi Rekap Nilai Praktikum" },
    thesis: { p1: LECTURER.ullya, semester: "previous", assigned: true },
    attempt: { semester: "previous", supervisor: [12, 10, 15], coordinator: [4, 6] },
    previousAttendance: { present: 13, total: 16 },
    attendance: { present: 14, total: 16 },
  },
  {
    key: "naik",
    nim: "2211528018",
    fullName: "Uji Proposal Sudah Naik",
    flags: {
      previous: { eligibleResearchMethod: true, takingThesisCourse: false },
      current: { eligibleResearchMethod: false, takingThesisCourse: true },
    },
    request: { status: STATUS.ASSIGNED, route: ROUTE.DIRECT, lecturer: LECTURER.ullya, semester: "previous", title: "Aplikasi Manajemen Proyek Mahasiswa Berbasis Kanban" },
    thesis: { p1: LECTURER.ullya, semester: "previous", assigned: true, promotedDaysAgo: 60 },
    attempt: { semester: "previous", supervisor: [21, 16, 24], coordinator: [9, 12] },
    previousAttendance: { present: 16, total: 16 },
    guidances: [
      { status: "completed", daysAgo: 150, phase: THESIS_PHASE.PROPOSAL, withDraft: true },
      { status: "completed", daysAgo: 130, phase: THESIS_PHASE.PROPOSAL, withDraft: true },
      { status: "completed", daysAgo: 110, phase: THESIS_PHASE.PROPOSAL },
      { status: "completed", daysAgo: 40, phase: THESIS_PHASE.RESEARCH },
      { status: "completed", daysAgo: 20, phase: THESIS_PHASE.RESEARCH },
    ],
    milestones: { completed: 3, researchInProgress: true },
  },
];

const PROPOSAL_TEMPLATES = [
  { name: "Latar Belakang dan Rumusan Masalah", description: "Bab pendahuluan proposal: latar belakang, rumusan masalah, tujuan, dan batasan." },
  { name: "Tinjauan Pustaka", description: "Kajian teori dan penelitian terdahulu yang relevan." },
  { name: "Metodologi Penelitian", description: "Tahapan penelitian, metode pengembangan, dan rencana pengujian." },
  { name: "Proposal Lengkap", description: "Draf proposal lengkap yang siap diajukan sebagai proposal final." },
];

const CPMKS = [
  { code: "CPMK-01", description: "Mampu merumuskan masalah dan tujuan penelitian" },
  { code: "CPMK-02", description: "Mampu menyusun kajian pustaka dan metodologi penelitian" },
  { code: "CPMK-03", description: "Mampu menyajikan rencana penelitian secara tertulis dan lisan" },
];
// Supervisor 25 + 20 + 30 = 75; coordinator 10 + 15 = 25 (K31: total 100).
const SUPERVISOR_CRITERIA = [
  { cpmk: "CPMK-01", name: "Latar belakang dan rumusan masalah", maxScore: 25 },
  { cpmk: "CPMK-02", name: "Tinjauan pustaka", maxScore: 20 },
  { cpmk: "CPMK-02", name: "Metodologi penelitian", maxScore: 30 },
];
const COORDINATOR_CRITERIA = [
  { cpmk: "CPMK-03", name: "Kelengkapan dan format proposal", maxScore: 10 },
  { cpmk: "CPMK-03", name: "Presentasi rencana penelitian di kelas", maxScore: 15 },
];

/** Three rubric levels covering 0..max. */
function rubricLevels(maxScore) {
  const low = Math.floor(maxScore * 0.4);
  const mid = Math.floor(maxScore * 0.75);
  return [
    { minScore: 0, maxScore: low, description: "Kurang: belum memenuhi sebagian besar unsur yang diharapkan." },
    { minScore: low + 1, maxScore: mid, description: "Cukup: memenuhi unsur utama, masih ada bagian yang perlu diperbaiki." },
    { minScore: mid + 1, maxScore, description: "Baik: lengkap, runtut, dan didukung alasan yang kuat." },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────────────

async function requireUser(email) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`User ${email} tidak ditemukan. Jalankan scripts/seed-master.js lebih dulu.`);
  return user;
}

async function requireRole(name) {
  const role = await prisma.userRole.findFirst({ where: { name } });
  if (!role) throw new Error(`Role "${name}" tidak ditemukan. Jalankan scripts/seed-master.js lebih dulu.`);
  return role;
}

async function ensureStudent(account, passwordHash, studentRole) {
  const email = `prop_${account.key}@fti.unand.ac.id`;
  let user = await prisma.user.findFirst({ where: { OR: [{ email }, { identityNumber: account.nim }] } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        fullName: account.fullName,
        identityType: "NIM",
        identityNumber: account.nim,
        password: passwordHash,
        isVerified: true,
      },
    });
  }
  await prisma.userHasRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: studentRole.id } },
    update: {},
    create: { userId: user.id, roleId: studentRole.id, status: "active" },
  });
  await prisma.student.upsert({
    where: { id: user.id },
    update: {},
    create: { id: user.id, status: "active", enrollmentYear: 2022, sksCompleted: 110, currentSemester: 7 },
  });
  return user;
}

async function setFlags(studentId, academicYearId, flags, capturedAt) {
  const data = { capturedAt };
  if (flags.eligibleResearchMethod !== undefined) {
    Object.assign(data, { eligibleResearchMethod: flags.eligibleResearchMethod, eligibilitySource: "sia", eligibilityCapturedAt: capturedAt });
  }
  if (flags.takingThesisCourse !== undefined) {
    Object.assign(data, { takingThesisCourse: flags.takingThesisCourse, thesisCourseSource: "sia", thesisCourseCapturedAt: capturedAt });
  }
  await prisma.studentAcademicYearSnapshot.upsert({
    where: { studentId_academicYearId: { studentId, academicYearId } },
    create: { studentId, academicYearId, ...data },
    update: data,
  });
}

async function ensureSupervisionLimits() {
  const general = await prisma.supervisionQuota.findFirst({ where: { academicYearId: null } });
  if (!general) await prisma.supervisionQuota.create({ data: { academicYearId: null, ...SUPERVISION_LIMITS } });
}

async function ensureMasterData(academicYear) {
  await prisma.academicYear.update({
    where: { id: academicYear.id },
    data: { researchMethodMinimumScore: academicYear.researchMethodMinimumScore ?? MINIMUM_SCORE },
  });
  const cpmkByCode = new Map();
  for (const cpmk of CPMKS) {
    const row = await prisma.researchMethodCpmk.upsert({
      where: { academicYearId_code: { academicYearId: academicYear.id, code: cpmk.code } },
      update: {},
      create: { academicYearId: academicYear.id, ...cpmk },
    });
    cpmkByCode.set(cpmk.code, row);
  }
  async function ensureCriteria(delegate, rubricDelegate, list) {
    const result = [];
    for (const [index, item] of list.entries()) {
      const cpmk = cpmkByCode.get(item.cpmk);
      let criteria = await delegate.findFirst({ where: { researchMethodCpmkId: cpmk.id, name: item.name } });
      if (!criteria) {
        criteria = await delegate.create({
          data: { researchMethodCpmkId: cpmk.id, name: item.name, maxScore: item.maxScore, displayOrder: index },
        });
        for (const [order, level] of rubricLevels(item.maxScore).entries()) {
          await rubricDelegate.create({ data: { assessmentCriteriaId: criteria.id, ...level, displayOrder: order } });
        }
      }
      const rubrics = await rubricDelegate.findMany({ where: { assessmentCriteriaId: criteria.id }, orderBy: { displayOrder: "asc" } });
      result.push({ ...criteria, rubrics });
    }
    return result;
  }
  const supervisor = await ensureCriteria(
    prisma.researchMethodSupervisorAssessmentCriteria,
    prisma.researchMethodSupervisorAssessmentRubric,
    SUPERVISOR_CRITERIA,
  );
  const coordinator = await ensureCriteria(
    prisma.researchMethodCoordinatorAssessmentCriteria,
    prisma.researchMethodCoordinatorAssessmentRubric,
    COORDINATOR_CRITERIA,
  );
  return { supervisor, coordinator };
}

async function ensureProposalTemplates() {
  const existing = await prisma.thesisMilestoneTemplate.findMany({ where: { phase: THESIS_PHASE.PROPOSAL, topicId: null } });
  const byName = new Map(existing.map((t) => [t.name, t]));
  const templates = [];
  for (const [index, template] of PROPOSAL_TEMPLATES.entries()) {
    const row = byName.get(template.name) ?? await prisma.thesisMilestoneTemplate.create({
      data: { ...template, topicId: null, phase: THESIS_PHASE.PROPOSAL, orderIndex: index, isActive: true, defaultDueDays: 14 * (index + 1) },
    });
    templates.push(row);
  }
  return templates;
}

function details(criteria, scores) {
  return criteria.map((criterion, index) => {
    const score = scores[index];
    const rubric = criterion.rubrics.find((r) => score >= r.minScore && score <= r.maxScore);
    return { assessmentCriteriaId: criterion.id, assessmentRubricId: rubric?.id ?? null, score };
  });
}

async function createAttendanceImport(academicYear, uploader, rows, { uploadedAt, fixtureName }) {
  const importId = randomUUID();
  const sourceFiles = [];
  const fixturePath = fixtureName ? path.join(FIXTURES, fixtureName) : null;
  if (fixturePath && fs.existsSync(fixturePath)) {
    const buffer = fs.readFileSync(fixturePath);
    const stored = await storeFile({
      relDir: attendanceImportDir(importId),
      file: { buffer, originalname: fixtureName, mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      now: uploadedAt,
    });
    sourceFiles.push({ originalName: fixtureName, classCode: "A", filePath: stored.filePath, fileHash: stored.fileHash, fileSize: stored.fileSize });
  }
  const eligible = rows.filter((row) => row.present / row.total >= ATTENDANCE_THRESHOLD).length;
  const created = await prisma.researchMethodAttendanceImport.create({
    data: {
      id: importId,
      academicYearId: academicYear.id,
      uploadedByUserId: uploader.id,
      classCode: "A",
      courseName: "Metodologi Penelitian",
      semesterLabel: `${academicYear.semester === "genap" ? "Genap" : "Ganjil"} ${academicYear.year}`,
      lecturerNames: [uploader.fullName],
      sourceFiles,
      thresholdPercent: ATTENDANCE_THRESHOLD,
      totalRows: rows.length,
      matchedRows: rows.filter((row) => row.studentId).length,
      eligibleRows: eligible,
      ineligibleRows: rows.length - eligible,
      autoZeroedCount: rows.filter((row) => row.autoZero).length,
      uploadedAt,
    },
  });
  const recordByStudent = new Map();
  for (const row of rows) {
    const percentage = row.present / row.total;
    const record = await prisma.researchMethodAttendanceRecord.create({
      data: {
        importId: created.id,
        studentId: row.studentId ?? null,
        identityNumber: row.nim,
        presentCount: row.present,
        absentCount: row.total - row.present,
        totalMeetings: row.total,
        attendancePercentage: percentage,
        isEligible: percentage >= ATTENDANCE_THRESHOLD,
        rawRow: { "NIM / BP": row.nim, "Nama Mahasiswa": row.name, Hadir: row.present, Total: row.total },
      },
    });
    if (row.studentId) recordByStudent.set(row.studentId, record);
  }
  return recordByStudent;
}

async function createBatch({ academicYear, theses, kadep, generatedAt }) {
  const full = await prisma.thesis.findMany({
    where: { id: { in: theses.map((t) => t.id) } },
    include: {
      student: { include: { user: { select: { fullName: true, identityNumber: true } } } },
      thesisSupervisors: {
        where: { status: "active" },
        include: { role: { select: { name: true } }, lecturer: { include: { user: { select: { fullName: true } } } } },
      },
    },
  });
  const { entries, cohortHash } = buildAssignmentCohort(full);
  const batchId = randomUUID();
  const pdf = await renderAssignmentPdf({ academicYear, entries, kadep, now: generatedAt });
  const stored = await storeFile({
    relDir: assignmentBatchDir(batchId),
    file: { buffer: pdf, originalname: assignmentPdfFileName(academicYear, 1), mimetype: "application/pdf" },
    now: generatedAt,
  });
  await prisma.thesisSupervisorAssignmentBatch.create({
    data: {
      id: batchId,
      academicYearId: academicYear.id,
      version: 1,
      status: ASSIGNMENT_BATCH_STATUS.CURRENT,
      cohortHash,
      generatedByUserId: kadep.id,
      generatedAt,
      ...stored,
      members: { create: full.map((t) => ({ thesisId: t.id })) },
    },
  });
  return { batchId, members: full.length };
}

async function main() {
  console.log("🚀 Seeding alur proposal (Paket P)...");
  if (!fs.existsSync(SAMPLE_PDF)) throw new Error(`PDF contoh tidak ditemukan: ${SAMPLE_PDF}`);
  const samplePdf = fs.readFileSync(SAMPLE_PDF);

  const years = await prisma.academicYear.findMany({ orderBy: { startDate: "asc" } });
  const currentIndex = years.findIndex((y) => y.isActive);
  if (currentIndex < 1) throw new Error("Butuh tahun ajaran aktif dan satu semester sebelumnya. Jalankan scripts/seed-master.js lebih dulu.");
  const SEMESTER = { current: years[currentIndex], previous: years[currentIndex - 1] };
  const semesterStart = (key) => SEMESTER[key].startDate;
  console.log(`✅ Semester berjalan ${SEMESTER.current.semester} ${SEMESTER.current.year}, sebelumnya ${SEMESTER.previous.semester} ${SEMESTER.previous.year}`);

  const lecturers = {};
  for (const [key, email] of Object.entries(LECTURER)) lecturers[email] = await requireUser(email);
  const kadep = lecturers[LECTURER.kadep];
  const coordinator = lecturers[LECTURER.husnil];
  const studentRole = await requireRole(ROLES.MAHASISWA);
  const p1Role = await requireRole(ROLES.PEMBIMBING_1);
  const p2Role = await requireRole(ROLES.PEMBIMBING_2);
  const topics = new Map((await prisma.thesisTopic.findMany()).map((t) => [t.name, t]));
  if (!topics.has(TOPIC) || !topics.has(TOPIC_RD)) throw new Error("Topik belum ada. Jalankan scripts/seed-thesis-topics.js lebih dulu.");

  await ensureSupervisionLimits();
  const master = {
    current: await ensureMasterData(SEMESTER.current),
    previous: await ensureMasterData(SEMESTER.previous),
  };
  const templates = await ensureProposalTemplates();
  console.log(`✅ Batas bimbingan umum ${SUPERVISION_LIMITS.softLimit}/${SUPERVISION_LIMITS.hardLimit}, master data Metode Penelitian 2 semester, ${templates.length} template milestone proposal`);

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  const seeded = [];
  for (const account of ACCOUNTS) {
    const user = await ensureStudent(account, passwordHash, studentRole);
    const already = await prisma.thesisSupervisorRequest.count({ where: { studentId: user.id } })
      + await prisma.thesis.count({ where: { studentId: user.id } });
    if (already > 0) {
      console.log(`⏭️  ${account.fullName}: sudah punya data proposal, dilewati.`);
      continue;
    }
    for (const [semesterKey, flags] of Object.entries(account.flags ?? {})) {
      const capturedAt = semesterKey === "previous" ? new Date(semesterStart("previous").getTime() + 7 * DAY) : new Date(semesterStart("current").getTime() + 7 * DAY);
      await setFlags(user.id, SEMESTER[semesterKey].id, flags, capturedAt);
    }
    seeded.push({ account, user });
  }

  const thesisByKey = new Map();
  for (const { account, user } of seeded) {
    const req = account.request;
    if (!req) continue;
    const semester = SEMESTER[req.semester ?? "current"];
    const createdAt = req.hoursAgo != null ? hoursAgo(req.hoursAgo) : new Date(semesterStart("previous").getTime() + 14 * DAY);
    const topic = topics.get(req.topic ?? account.thesis?.topic ?? TOPIC);
    const lecturer = req.lecturer ? lecturers[req.lecturer] : null;

    let thesis = null;
    if (account.thesis) {
      const startDate = account.thesis.promotedDaysAgo ? daysAgo(account.thesis.promotedDaysAgo) : null;
      thesis = await prisma.thesis.create({
        data: {
          studentId: user.id,
          thesisTopicId: topic.id,
          title: req.title,
          academicYearId: semester.id,
          status: startDate ? THESIS_STATUS.RESEARCH : THESIS_STATUS.PROPOSAL,
          statusChangedAt: startDate ?? new Date(createdAt.getTime() + DAY),
          startDate,
          supervisorAssignedAt: account.thesis.assigned ? new Date(createdAt.getTime() + 5 * DAY) : null,
          createdAt: new Date(createdAt.getTime() + DAY),
        },
      });
      await prisma.thesisSupervisors.create({
        data: { thesisId: thesis.id, lecturerId: lecturers[account.thesis.p1].id, roleId: p1Role.id, status: "active" },
      });
      if (account.thesis.p2) {
        await prisma.thesisSupervisors.create({
          data: { thesisId: thesis.id, lecturerId: lecturers[account.thesis.p2].id, roleId: p2Role.id, status: "active" },
        });
      }
      thesisByKey.set(account.key, { thesis, account, user });
    }

    const forwarded = req.forwarded
      ? {
        forwardedToKadepAt: new Date(createdAt.getTime() + 6 * 60 * 60 * 1000),
        forwardedByLecturerId: lecturer.id,
        lecturerOverquotaReason: "Dua mahasiswa bimbingan saya dijadwalkan sidang bulan depan, sehingga beban akan turun.",
        lecturerRespondedAt: new Date(createdAt.getTime() + 6 * 60 * 60 * 1000),
      }
      : {};
    const decided = [STATUS.ACCEPTED, STATUS.ASSIGNED].includes(req.status)
      ? { lecturerRespondedAt: new Date(createdAt.getTime() + DAY), lecturerApprovalNote: "Topik sesuai dengan bidang saya." }
      : {};
    await prisma.thesisSupervisorRequest.create({
      data: {
        studentId: user.id,
        lecturerId: lecturer?.id ?? null,
        academicYearId: semester.id,
        topicId: topic.id,
        thesisId: thesis?.id ?? null,
        ...requestFields(req.title),
        studentJustification: req.route === ROUTE.OVER_QUOTA
          ? "Topik saya melanjutkan proyek riset Pak Husnil yang sudah saya ikuti sejak semester lalu."
          : null,
        status: req.status,
        route: req.route,
        reviewedAt: req.status === STATUS.UNDER_REVIEW ? hoursAgo(req.hoursAgo - 4) : null,
        createdAt,
        ...forwarded,
        ...decided,
      },
    });
    await prisma.thesisSupervisorRequestDraft.create({
      data: {
        studentId: user.id,
        lecturerId: lecturer?.id ?? null,
        topicId: topic.id,
        ...requestFields(req.title),
        lastSubmittedAt: createdAt,
      },
    });
  }

  // Penetapan Pembimbing: one batch per semester with the assigned theses.
  for (const semesterKey of ["previous", "current"]) {
    const members = [...thesisByKey.values()].filter((t) => t.account.thesis.assigned && t.account.thesis.semester === semesterKey);
    if (members.length === 0) continue;
    const generatedAt = new Date(Math.min(...members.map((m) => m.thesis.supervisorAssignedAt.getTime())));
    const batch = await createBatch({ academicYear: SEMESTER[semesterKey], theses: members.map((m) => m.thesis), kadep, generatedAt });
    console.log(`✅ Penetapan Pembimbing ${SEMESTER[semesterKey].semester} ${SEMESTER[semesterKey].year}: ${batch.members} mahasiswa`);
  }

  // Attendance imports (one per semester) for every student in the class.
  for (const semesterKey of ["previous", "current"]) {
    const field = semesterKey === "current" ? "attendance" : "previousAttendance";
    const rows = seeded
      .filter(({ account }) => account[field])
      .map(({ account, user }) => ({
        studentId: user.id,
        nim: account.nim,
        name: account.fullName,
        present: account[field].present,
        total: account[field].total,
        autoZero: semesterKey === "current" && Boolean(account.attempt?.autoZero),
      }));
    if (rows.length === 0) continue;
    if (semesterKey === "current") {
      const layak = seeded.find(({ account }) => account.key === "layak");
      if (layak) rows.push({ studentId: layak.user.id, nim: layak.account.nim, name: layak.account.fullName, present: 15, total: 16 });
      rows.push({ studentId: null, nim: "2211599999", name: "Mahasiswa Luar Daftar", present: 16, total: 16 });
    }
    const uploadedAt = semesterKey === "current" ? daysAgo(2) : new Date(SEMESTER.previous.endDate.getTime() - 20 * DAY);
    const records = await createAttendanceImport(SEMESTER[semesterKey], coordinator, rows, {
      uploadedAt,
      fixtureName: semesterKey === "current" ? "research-method-attendance-seed.xlsx" : null,
    });
    // Attempts of this semester.
    for (const { thesis, account } of thesisByKey.values()) {
      const attempt = account.attempt;
      if (!attempt || attempt.semester !== semesterKey) continue;
      const assessmentId = randomUUID();
      const submittedAt = semesterKey === "current" ? daysAgo(attempt.proposalDaysAgo) : new Date(SEMESTER.previous.endDate.getTime() - 40 * DAY);
      const proposal = await storeFile({
        relDir: proposalFileDir(thesis.id, assessmentId),
        file: { buffer: samplePdf, originalname: `Proposal ${account.fullName}.pdf`, mimetype: "application/pdf" },
        now: submittedAt,
      });
      const record = records.get(thesis.studentId) ?? null;
      const supervisorScore = attempt.supervisor ? attempt.supervisor.reduce((a, b) => a + b, 0) : null;
      const coordinatorScore = attempt.coordinator ? attempt.coordinator.reduce((a, b) => a + b, 0) : null;
      const supervisorLecturer = lecturers[account.thesis.p1];
      const minimum = SEMESTER[semesterKey].researchMethodMinimumScore ?? MINIMUM_SCORE;
      let final = {};
      if (attempt.autoZero) {
        final = {
          finalScore: 0,
          isFinalized: true,
          finalizedAt: uploadedAt,
          finalizedBy: coordinator.id,
          result: RESEARCH_METHOD_RESULT.FAILED,
          attendanceAutoZeroedAt: uploadedAt,
          attendanceAutoZeroReason: `Presensi ${Math.round((record?.attendancePercentage ?? 0) * 1000) / 10}% di bawah 75%`,
        };
      } else if (supervisorScore != null && coordinatorScore != null) {
        const finalScore = supervisorScore + coordinatorScore;
        const finalizedAt = new Date(submittedAt.getTime() + 10 * DAY);
        final = {
          finalScore,
          isFinalized: true,
          finalizedAt,
          finalizedBy: coordinator.id,
          result: finalScore >= minimum && record?.isEligible !== false ? RESEARCH_METHOD_RESULT.PASSED : RESEARCH_METHOD_RESULT.FAILED,
        };
      }
      await prisma.researchMethodAssessment.create({
        data: {
          id: assessmentId,
          thesisId: thesis.id,
          academicYearId: SEMESTER[semesterKey].id,
          proposalFilePath: proposal.filePath,
          proposalFileName: proposal.fileName,
          proposalMimeType: proposal.mimeType,
          proposalFileSize: proposal.fileSize,
          proposalFileHash: proposal.fileHash,
          proposalSubmittedAt: submittedAt,
          attendanceRecordId: record?.id ?? null,
          ...(supervisorScore != null
            ? { supervisorId: supervisorLecturer.id, supervisorScore, supervisorScoredAt: new Date(submittedAt.getTime() + 5 * DAY) }
            : {}),
          ...(coordinatorScore != null
            ? { coordinatorId: coordinator.id, coordinatorScore, coordinatorScoredAt: new Date(submittedAt.getTime() + 10 * DAY) }
            : {}),
          ...final,
          supervisorDetails: attempt.supervisor ? { create: details(master[semesterKey].supervisor, attempt.supervisor) } : undefined,
          coordinatorDetails: attempt.coordinator ? { create: details(master[semesterKey].coordinator, attempt.coordinator) } : undefined,
        },
      });
    }
  }

  // Proposal-phase guidance (drafts travel as session attachments, K32) and milestones.
  for (const { thesis, account } of thesisByKey.values()) {
    const supervisorId = lecturers[account.thesis.p1].id;
    for (const [index, plan] of (account.guidances ?? []).entries()) {
      const phase = plan.phase ?? THESIS_PHASE.PROPOSAL;
      const guidanceId = randomUUID();
      if (plan.status === "requested") {
        await prisma.thesisGuidance.create({
          data: {
            id: guidanceId,
            thesisId: thesis.id,
            supervisorId,
            requestedDate: new Date(NOW.getTime() + plan.daysAhead * DAY),
            duration: 60,
            studentNotes: "Konsultasi rumusan masalah proposal.",
            status: "requested",
            phase,
          },
        });
        continue;
      }
      const approvedDate = daysAgo(plan.daysAgo);
      const file = plan.withDraft
        ? await storeGuidanceAttachment({
          thesisId: thesis.id,
          guidanceId,
          file: { originalname: `Draf Proposal v${index + 1}.pdf`, mimetype: "application/pdf", size: samplePdf.length, buffer: samplePdf },
          now: approvedDate,
        })
        : {};
      await prisma.thesisGuidance.create({
        data: {
          id: guidanceId,
          thesisId: thesis.id,
          supervisorId,
          requestedDate: new Date(approvedDate.getTime() - 2 * DAY),
          approvedDate,
          duration: 60,
          studentNotes: phase === THESIS_PHASE.PROPOSAL ? `Bimbingan proposal ke-${index + 1}.` : `Bimbingan penelitian ke-${index + 1}.`,
          sessionSummary: phase === THESIS_PHASE.PROPOSAL ? `Pembahasan draf proposal bagian ${index + 1}.` : "Pembahasan kemajuan penelitian.",
          supervisorFeedback: "Lanjutkan sesuai catatan.",
          summarySubmittedAt: approvedDate,
          completedAt: approvedDate,
          status: "completed",
          phase,
          ...file,
        },
      });
    }

    if (account.milestones) {
      for (const [index, template] of templates.entries()) {
        const done = index < account.milestones.completed;
        const completedAt = done ? daysAgo(40 - index * 7 + (account.thesis.promotedDaysAgo ? 90 : 0)) : null;
        await prisma.thesisMilestone.create({
          data: {
            thesisId: thesis.id,
            milestoneTemplateId: template.id,
            title: template.name,
            description: template.description,
            orderIndex: index,
            phase: THESIS_PHASE.PROPOSAL,
            status: done ? "completed" : index === account.milestones.completed ? "in_progress" : "not_started",
            progressPercentage: done ? 100 : index === account.milestones.completed ? 40 : 0,
            startedAt: done || index === account.milestones.completed ? daysAgo(60) : null,
            completedAt,
            validatedAt: completedAt,
            validatedBy: done ? supervisorId : null,
          },
        });
      }
      if (account.milestones.researchInProgress) {
        await prisma.thesisMilestone.create({
          data: {
            thesisId: thesis.id,
            title: "BAB IV - Implementasi",
            description: "Implementasi sistem sesuai rancangan.",
            orderIndex: 0,
            phase: THESIS_PHASE.RESEARCH,
            status: "in_progress",
            progressPercentage: 30,
            startedAt: daysAgo(30),
          },
        });
      }
    }
  }

  console.log(`✅ ${seeded.length} akun proposal dibuat (prop_<keadaan>@fti.unand.ac.id, kata sandi ${DEFAULT_PASSWORD}).`);
  for (const { account } of seeded) console.log(`   prop_${account.key}@fti.unand.ac.id  ${account.nim}  ${account.fullName}`);
}

main()
  .catch((error) => {
    console.error("❌ Seeder alur proposal gagal:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
