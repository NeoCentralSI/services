/**
 * Test and demo data for Seminar Hasil, Sidang TA and Yudisium: one `ta_demo_…` account per
 * stage, plus what those stages need (requirement documents of the running semester, CPLs,
 * yudisium requirements, an exit survey form, and a yudisium period whose registration is open).
 *
 * Every account is supervised by the Ketua Departemen (kadep_si) as Pembimbing 1 and examined
 * by penguji_si and gkm_si, so each step of a demo can be done by an account that logs in.
 *
 * Run it last, after the eight standard seeders (from app/backend):
 *   node scripts/seed-thesis-final-stages.js
 *
 * "Now" is the moment the seeder runs: the seminar and defence that are "Sedang Berlangsung"
 * start five minutes before it. Later, DevTools → Seminar & Sidang → "Mulai sekarang" moves them
 * to the current time again. Data is written directly: no notification, no email.
 * Idempotent: an account that already has a thesis is left as it is.
 * Password of every account: password123.
 */
import bcrypt from "bcrypt";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { PrismaClient } from "../src/generated/prisma/index.js";
import { ROLES } from "../src/constants/roles.js";
import { THESIS_STATUS, THESIS_PHASE } from "../src/constants/thesisStatus.js";
import { mapScoreToGrade } from "../src/utils/score.util.js";
import { buildSamplePdf } from "../src/services/devtools/devtools-support.js";
import { generateScores } from "../src/services/devtools/devtools-final-stages.service.js";
import { seedReadinessApprovals } from "./lib/readiness-audit.js";

const prisma = new PrismaClient();

const DEFAULT_PASSWORD = "password123";
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WIB_OFFSET = 7 * HOUR;
const NOW = new Date();

const TOPIC_NAME = "Pengembangan Sistem (Enterprise Application)";
const LECTURER = Object.freeze({
  supervisor: "kadep_si@fti.unand.ac.id",
  examiner1: "penguji_si@fti.unand.ac.id",
  examiner2: "gkm_si@fti.unand.ac.id",
  admin: "admin_si@fti.unand.ac.id",
});
const ROOM = Object.freeze({ seminar: "Ruang Seminar SI", defence: "Ruang Sidang SI" });

const SEMINAR_REQUIREMENTS = ["Draf Laporan Tugas Akhir", "Lembar Persetujuan Seminar Hasil", "Kartu Kendali Bimbingan"];
const DEFENCE_REQUIREMENTS = ["Laporan Tugas Akhir Lengkap", "Lembar Pengesahan Revisi Seminar Hasil", "Transkrip Nilai Sementara"];
const YUDISIUM_REQUIREMENTS = ["Surat Keterangan Bebas Pustaka", "Bukti Penyerahan Laporan Tugas Akhir", "Pas Foto Berwarna", "Transkrip Nilai Akhir"];

const CPLS = [
  ["CPL-01", "Mengidentifikasi, memformulasikan, dan memecahkan permasalahan kebutuhan informasi organisasi"],
  ["CPL-02", "Mengintegrasikan solusi berbasis teknologi informasi secara efektif pada organisasi"],
  ["CPL-03", "Merencanakan, merancang, membangun, mengoperasikan, dan mengevaluasi sistem informasi"],
  ["CPL-04", "Berkarya dengan perilaku etika sesuai bidang keprofesian teknologi informasi"],
  ["CPL-05", "Berkomunikasi secara efektif pada berbagai kalangan"],
  ["CPL-06", "Melibatkan diri dalam proses belajar terus-menerus sepanjang hidup"],
  ["CPL-07", "Bekerja sama secara efektif sebagai anggota maupun pimpinan tim"],
  ["CPL-08", "Mengidentifikasi kebutuhan untuk menjadi wirausaha di bidang teknologi informasi"],
];
const CPL_MINIMUM = 55;

const REVISION_NOTES = [
  "Perjelas rumusan masalah dan batasan penelitian pada BAB I.",
  "Lengkapi hasil pengujian dan pembahasannya pada BAB IV.",
];

/**
 * `seminar` / `defence`: the attempt of the account, `held` = days ago it took place (0 = now).
 * `yudisium`: "ready" (TA Selesai, not registered) or "registered" (in the open period).
 */
const ACCOUNTS = [
  { key: "siap_seminar", fullName: "Uji Demo Siap Daftar Seminar", nim: "2211529201", title: "Sistem Informasi Pemantauan Kegiatan Laboratorium", ready: "seminar" },
  { key: "seminar_berlangsung", fullName: "Uji Demo Seminar Berlangsung", nim: "2211529202", title: "Aplikasi Penjadwalan Ruang Kuliah Berbasis Web",
    seminar: { status: "scheduled", held: 0 } },
  { key: "seminar_revisi", fullName: "Uji Demo Seminar Lulus Revisi", nim: "2211529203", title: "Sistem Informasi Pengelolaan Beasiswa Mahasiswa",
    seminar: { status: "passed_with_revision", held: 3, revisions: "open" } },
  { key: "siap_sidang", fullName: "Uji Demo Siap Daftar Sidang", nim: "2211529204", title: "Aplikasi Pengelolaan Arsip Surat Departemen",
    seminar: { status: "passed_with_revision", held: 30, revisions: "final" }, ready: "defence" },
  { key: "sidang_berlangsung", fullName: "Uji Demo Sidang Berlangsung", nim: "2211529205", title: "Sistem Informasi Penilaian Kinerja Dosen",
    seminar: { status: "passed", held: 40 }, defence: { status: "scheduled", held: 0 } },
  { key: "sidang_revisi", fullName: "Uji Demo Sidang Lulus Revisi", nim: "2211529206", title: "Aplikasi Pendaftaran Kerja Praktik Terpadu",
    seminar: { status: "passed", held: 45 }, defence: { status: "passed_with_revision", held: 4, revisions: "open" } },
  { key: "siap_yudisium", fullName: "Uji Demo Siap Yudisium", nim: "2211529207", title: "Sistem Informasi Pelacakan Alumni Departemen",
    seminar: { status: "passed", held: 60 }, defence: { status: "passed", held: 14 }, yudisium: "ready" },
  { key: "yudisium_cpl_kurang", fullName: "Uji Demo Yudisium CPL Kurang", nim: "2211529208", title: "Aplikasi Pengelolaan Kegiatan Himpunan Mahasiswa",
    seminar: { status: "passed", held: 70 }, defence: { status: "passed", held: 21 }, yudisium: "registered", failingCpl: true },
  { key: "metopen_ta", fullName: "Uji Demo Metopen dan TA Semester Ini", nim: "2211529209", flagsOnly: true },
];

const email = (key) => `ta_demo_${key}@fti.unand.ac.id`;

// ─── Time ──────────────────────────────────────────────────────────────────────────────────

const pad = (n) => String(n).padStart(2, "0");
/** Calendar date (WIB) and clock of a moment, as the seminar and defence modules store them. */
function wibSlot(moment) {
  const wib = new Date(moment.getTime() + WIB_OFFSET);
  return {
    date: new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate())),
    clock: `${pad(wib.getUTCHours())}:${pad(wib.getUTCMinutes())}`,
  };
}
const clock = (hhmm) => new Date(`1970-01-01T${hhmm}:00.000Z`);
/** An event held `daysAgo` days ago from 09:00 to 11:00 WIB; `0` = starting five minutes ago. */
function eventWindow(daysAgo) {
  if (daysAgo === 0) {
    const start = wibSlot(new Date(NOW.getTime() - 5 * MINUTE));
    const end = wibSlot(new Date(NOW.getTime() + 2 * HOUR));
    const endClock = end.date.getTime() === start.date.getTime() ? end.clock : "23:59";
    return { date: start.date, startTime: clock(start.clock), endTime: clock(endClock), startedAt: new Date(NOW.getTime() - 5 * MINUTE) };
  }
  const day = wibSlot(new Date(NOW.getTime() - daysAgo * DAY)).date;
  return { date: day, startTime: clock("09:00"), endTime: clock("11:00"), startedAt: new Date(day.getTime() + 2 * HOUR) };
}

// ─── Lookups ───────────────────────────────────────────────────────────────────────────────

async function requireRole(name) {
  const role = await prisma.userRole.findFirst({ where: { name } });
  if (!role) throw new Error(`Role "${name}" tidak ditemukan. Jalankan scripts/seed-master.js lebih dulu.`);
  return role;
}

async function requireUser(address) {
  const user = await prisma.user.findFirst({ where: { email: address } });
  if (!user) throw new Error(`Akun ${address} tidak ditemukan. Jalankan scripts/seed-master.js lebih dulu.`);
  return user;
}

async function ensureRoom(name) {
  return (await prisma.room.findFirst({ where: { name } })) ?? prisma.room.create({ data: { name, location: "Gedung Departemen Sistem Informasi", capacity: 30 } });
}

async function resolveSemesters() {
  const current =
    (await prisma.academicYear.findFirst({ where: { isActive: true } })) ??
    (await prisma.academicYear.findFirst({ where: { startDate: { lte: NOW }, endDate: { gte: NOW } } }));
  if (!current) throw new Error("Tidak ada tahun ajaran aktif. Jalankan scripts/seed-master.js lebih dulu.");
  const previous = await prisma.academicYear.findFirst({ where: { startDate: { lt: current.startDate } }, orderBy: { startDate: "desc" } });
  return { current, previous: previous ?? current };
}

async function samplePdf(relativeDir, fileName, title, lines) {
  const buffer = await buildSamplePdf(title, lines);
  const relativePath = path.posix.join(relativeDir, fileName);
  await fs.mkdir(path.resolve(process.cwd(), relativeDir), { recursive: true });
  await fs.writeFile(path.resolve(process.cwd(), relativePath), buffer);
  return {
    filePath: relativePath,
    fileName,
    mimeType: "application/pdf",
    fileSize: buffer.length,
    fileHash: crypto.createHash("sha256").update(buffer).digest("hex"),
  };
}

// ─── Master data the stages need ───────────────────────────────────────────────────────────

async function ensureEventRequirements(model, academicYearId, names) {
  const existing = await prisma[model].findMany({ where: { academicYearId } });
  if (existing.length > 0) return existing;
  for (const [index, name] of names.entries()) {
    await prisma[model].create({ data: { academicYearId, name, displayOrder: index + 1 } });
  }
  console.log(`  ✅ Syarat dokumen ${model === "thesisSeminarRequirement" ? "seminar" : "sidang"} semester berjalan ditambahkan.`);
  return prisma[model].findMany({ where: { academicYearId }, orderBy: { displayOrder: "asc" } });
}

async function ensureCpls() {
  const active = await prisma.cpl.findMany({ where: { isActive: true }, orderBy: [{ displayOrder: "asc" }, { code: "asc" }] });
  if (active.length > 0) return active;
  const curriculum = (await prisma.curriculum.findFirst({ where: { name: "Kurikulum OBE" } })) ??
    (await prisma.curriculum.create({ data: { name: "Kurikulum OBE", startYear: 2021, endYear: 2026 } }));
  for (const [index, [code, description]] of CPLS.entries()) {
    await prisma.cpl.create({ data: { curriculumId: curriculum.id, code, description, minimalScore: CPL_MINIMUM, displayOrder: index + 1, isActive: true } });
  }
  console.log("  ✅ Kurikulum dan delapan CPL ditambahkan.");
  return prisma.cpl.findMany({ where: { isActive: true }, orderBy: [{ displayOrder: "asc" }, { code: "asc" }] });
}

async function ensureExitSurveyForm() {
  const title = "Exit Survey Lulusan Sistem Informasi";
  const existing = await prisma.exitSurveyForm.findFirst({ where: { title } });
  if (existing) return existing;
  const form = await prisma.exitSurveyForm.create({ data: { title, description: "Kuesioner lulusan sebelum yudisium", isActive: true } });
  const sessions = [
    { name: "Rencana Setelah Lulus", questions: [
      { question: "Apa rencana utama Anda setelah lulus?", type: "single_choice", required: true, options: ["Bekerja", "Melanjutkan studi", "Berwirausaha", "Belum menentukan"] },
      { question: "Perkiraan tanggal mulai bekerja atau studi lanjut", type: "date", required: false },
      { question: "Nama instansi atau perusahaan tujuan", type: "short_answer", required: false },
    ] },
    { name: "Penilaian Program Studi", questions: [
      { question: "Kompetensi yang paling bermanfaat selama kuliah", type: "multiple_choice", required: true, options: ["Analisis kebutuhan sistem", "Pemrograman", "Manajemen proyek", "Komunikasi"] },
      { question: "Nilai kepuasan terhadap layanan akademik (1–5)", type: "number", required: true },
      { question: "Saran untuk Departemen Sistem Informasi", type: "paragraph", required: false },
    ] },
  ];
  let order = 0;
  for (const [sessionIndex, session] of sessions.entries()) {
    const row = await prisma.exitSurveySession.create({ data: { exitSurveyFormId: form.id, name: session.name, order: sessionIndex + 1 } });
    for (const question of session.questions) {
      order += 1;
      const created = await prisma.exitSurveyQuestion.create({
        data: { exitSurveySessionId: row.id, exitSurveyFormId: form.id, question: question.question, questionType: question.type, isRequired: question.required, orderNumber: order },
      });
      for (const [optionIndex, optionText] of (question.options ?? []).entries()) {
        await prisma.exitSurveyOption.create({ data: { exitSurveyQuestionId: created.id, optionText, orderNumber: optionIndex + 1 } });
      }
    }
  }
  console.log("  ✅ Formulir exit survey ditambahkan.");
  return form;
}

async function ensureOpenYudisium(ctx) {
  const name = `Yudisium ${ctx.semesters.current.semester === "genap" ? "Genap" : "Ganjil"} ${ctx.semesters.current.year}`;
  const existing = await prisma.yudisium.findFirst({ where: { name } });
  if (existing) return existing;
  const requirements = [];
  for (const [index, requirementName] of YUDISIUM_REQUIREMENTS.entries()) {
    requirements.push((await prisma.yudisiumRequirement.findFirst({ where: { name: requirementName } })) ??
      (await prisma.yudisiumRequirement.create({ data: { name: requirementName, isActive: true, isPublic: true, order: index + 1 } })));
  }
  const close = new Date(NOW.getTime() + 14 * DAY);
  const today = wibSlot(NOW).date;
  const yudisium = await prisma.yudisium.create({
    data: {
      name,
      academicYearId: ctx.semesters.current.id,
      exitSurveyFormId: ctx.exitSurveyForm.id,
      roomId: ctx.rooms.defence.id,
      registrationOpenDate: new Date(NOW.getTime() - DAY),
      registrationCloseDate: close,
      eventDate: new Date(close.getTime() + 7 * DAY),
      exitSurveyOpenDate: new Date(today.getTime() - DAY),
      exitSurveyCloseDate: wibSlot(close).date,
      status: "open",
      notes: "Periode uji: pendaftaran dibuka saat seed dijalankan.",
      requirementItems: { create: requirements.map((requirement, index) => ({ yudisiumRequirementId: requirement.id, order: index })) },
    },
  });
  console.log(`  ✅ Periode ${name} (pendaftaran dibuka) ditambahkan.`);
  return yudisium;
}

// ─── Accounts ──────────────────────────────────────────────────────────────────────────────

async function ensureStudent(account, ctx) {
  let user = await prisma.user.findFirst({ where: { OR: [{ email: email(account.key) }, { identityNumber: account.nim }] } });
  if (!user) {
    user = await prisma.user.create({
      data: { email: email(account.key), fullName: account.fullName, identityType: "NIM", identityNumber: account.nim, password: ctx.passwordHash, isVerified: true },
    });
  }
  await prisma.userHasRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: ctx.roles.student.id } },
    update: {},
    create: { userId: user.id, roleId: ctx.roles.student.id, status: "active" },
  });
  const graduating = !!account.yudisium;
  await prisma.student.upsert({
    where: { id: user.id },
    update: {},
    create: {
      id: user.id,
      status: "active",
      enrollmentYear: 2022,
      currentSemester: 9,
      sksCompleted: graduating ? 146 : 142,
      researchMethodCompleted: !account.flagsOnly,
      mandatoryCoursesCompleted: graduating,
      mkwuCompleted: graduating,
      internshipCompleted: graduating,
      kknCompleted: graduating,
    },
  });
  return user;
}

async function createResearchHistory(thesisId, supervisorId, lastActivityAt) {
  for (let i = 0; i < 8; i += 1) {
    const approvedDate = new Date(lastActivityAt.getTime() - (7 - i) * 7 * DAY);
    await prisma.thesisGuidance.create({
      data: {
        thesisId,
        supervisorId,
        requestedDate: new Date(approvedDate.getTime() - 2 * DAY),
        approvedDate,
        duration: 60,
        studentNotes: `Bimbingan ke-${i + 1}: pembahasan kemajuan penelitian.`,
        sessionSummary: `Ringkasan bimbingan ke-${i + 1}.`,
        summarySubmittedAt: approvedDate,
        completedAt: approvedDate,
        status: "completed",
        phase: THESIS_PHASE.RESEARCH,
      },
    });
  }
  const titles = ["BAB I - Pendahuluan", "BAB II - Tinjauan Pustaka", "BAB III - Metodologi", "BAB IV - Hasil dan Pembahasan", "BAB V - Penutup"];
  for (const [index, title] of titles.entries()) {
    const doneAt = new Date(lastActivityAt.getTime() - (titles.length - 1 - index) * 5 * DAY);
    await prisma.thesisMilestone.create({
      data: { thesisId, title, orderIndex: index + 1, phase: THESIS_PHASE.RESEARCH, status: "completed", progressPercentage: 100, completedAt: doneAt, validatedAt: doneAt, updatedAt: doneAt },
    });
  }
}

async function requirementDocuments(kind, event, thesis, account, requirements, verifiedAt, ctx) {
  const model = kind === "seminar" ? "thesisSeminarRequirementDocument" : "thesisDefenceRequirementDocument";
  const eventKey = kind === "seminar" ? "thesisSeminarId" : "thesisDefenceId";
  const requirementKey = kind === "seminar" ? "thesisSeminarRequirementId" : "thesisDefenceRequirementId";
  for (const requirement of requirements) {
    const file = await samplePdf(`uploads/thesis/${thesis.id}/${kind === "seminar" ? "seminar" : "defence"}/${event.id}`, `requirement-${requirement.id}-seed.pdf`, requirement.name, [account.fullName, account.nim]);
    await prisma[model].create({
      data: { [eventKey]: event.id, [requirementKey]: requirement.id, ...file, submittedAt: new Date(verifiedAt.getTime() - 2 * DAY), status: "approved", verifiedBy: ctx.admin.id, verifiedAt },
    });
  }
}

/** A seminar or defence at its status, with the rows the modules write up to there. */
async function createEvent(kind, thesis, account, config, ctx) {
  const window = eventWindow(config.held);
  const held = config.status !== "scheduled";
  const registeredAt = new Date(window.startedAt.getTime() - 21 * DAY);
  const verifiedAt = new Date(window.startedAt.getTime() - 17 * DAY);
  const scheduledAt = new Date(window.startedAt.getTime() - 10 * DAY);
  const resultAt = held ? new Date(window.startedAt.getTime() + 2 * HOUR) : null;
  const model = kind === "seminar" ? "thesisSeminar" : "thesisDefence";
  const event = await prisma[model].create({
    data: {
      thesisId: thesis.id,
      status: config.status,
      registeredAt,
      verifiedAt,
      scheduledAt,
      date: window.date,
      startTime: window.startTime,
      endTime: window.endTime,
      roomId: ctx.rooms[kind].id,
      createdAt: registeredAt,
    },
  });
  await requirementDocuments(kind, event, thesis, account, ctx.requirements[kind], verifiedAt, ctx);

  const examinerModel = kind === "seminar" ? "thesisSeminarExaminer" : "thesisDefenceExaminer";
  const examinerKey = kind === "seminar" ? "thesisSeminarId" : "thesisDefenceId";
  const scores = held ? generateScores(kind, ctx.assessment[kind], 2, config.status) : null;
  const examiners = [];
  for (const [index, lecturer] of [ctx.lecturers.examiner1, ctx.lecturers.examiner2].entries()) {
    const assignedAt = new Date(verifiedAt.getTime() + DAY);
    const sheet = scores?.examiners[index];
    const row = await prisma[examinerModel].create({
      data: {
        [examinerKey]: event.id,
        lecturerId: lecturer.id,
        assignedBy: ctx.lecturers.supervisor.id,
        order: index + 1,
        assignedAt,
        availabilityStatus: "available",
        respondedAt: new Date(assignedAt.getTime() + HOUR),
        assessmentScore: sheet?.total ?? null,
        assessmentSubmittedAt: sheet ? resultAt : null,
        revisionNotes: config.status === "passed_with_revision" ? REVISION_NOTES[index] : null,
      },
    });
    if (sheet) {
      const detailModel = kind === "seminar" ? "thesisSeminarExaminerAssessmentDetail" : "thesisDefenceExaminerAssessmentDetail";
      const detailKey = kind === "seminar" ? "thesisSeminarExaminerId" : "thesisDefenceExaminerId";
      await prisma[detailModel].createMany({ data: sheet.scores.map((s) => ({ [detailKey]: row.id, ...s })) });
    }
    examiners.push(row);
  }

  if (held) {
    const average = scores.examiners.reduce((s, e) => s + e.total, 0) / scores.examiners.length;
    const result = { resultFinalizedAt: resultAt, resultFinalizedBy: ctx.p1Relation.id, updatedAt: resultAt };
    if (kind === "seminar") {
      await prisma.thesisSeminar.update({ where: { id: event.id }, data: { ...result, finalScore: average } });
    } else {
      await prisma.thesisDefenceSupervisorAssessmentDetail.createMany({ data: scores.supervisor.scores.map((s) => ({ thesisDefenceId: event.id, ...s })) });
      const finalScore = average + scores.supervisor.total;
      await prisma.thesisDefence.update({
        where: { id: event.id },
        data: { ...result, examinerAverageScore: average, supervisorScore: scores.supervisor.total, supervisorAssessmentSubmittedAt: resultAt, finalScore, grade: mapScoreToGrade(finalScore) },
      });
    }
  }

  if (config.revisions) {
    const revisionModel = kind === "seminar" ? "thesisSeminarRevision" : "thesisDefenceRevision";
    const revisionKey = kind === "seminar" ? "seminarExaminerId" : "defenceExaminerId";
    const final = config.revisions === "final";
    const finalAt = final ? new Date(resultAt.getTime() + 10 * DAY) : null;
    for (const [index, examiner] of examiners.entries()) {
      // Open revision: the first item is submitted by the student and waits for the supervisor.
      const submitted = final || index === 0;
      await prisma[revisionModel].create({
        data: {
          [revisionKey]: examiner.id,
          description: REVISION_NOTES[index],
          revisionAction: submitted ? "Sudah diperbaiki sesuai catatan penguji." : "",
          studentSubmittedAt: submitted ? new Date((finalAt ?? NOW).getTime() - DAY) : null,
          supervisorApprovedAt: final ? finalAt : null,
          approvedBy: final ? ctx.p1Relation.id : null,
        },
      });
    }
    if (final) await prisma[model].update({ where: { id: event.id }, data: { revisionFinalizedAt: finalAt, revisionFinalizedBy: ctx.p1Relation.id } });
  }
  return { event, resultAt };
}

async function setPeriodFlags(studentId, academicYearId) {
  await prisma.studentAcademicYearSnapshot.upsert({
    where: { studentId_academicYearId: { studentId, academicYearId } },
    update: {},
    create: {
      studentId,
      academicYearId,
      eligibleResearchMethod: true,
      eligibilitySource: "admin",
      eligibilityCapturedAt: NOW,
      takingThesisCourse: true,
      thesisCourseSource: "admin",
      thesisCourseCapturedAt: NOW,
      capturedAt: NOW,
    },
  });
}

/** Eight approved attendances at seminars that took place, those of the demo accounts first. */
async function addAttendance(student, thesisIds) {
  const seminars = await prisma.thesisSeminar.findMany({
    where: { status: { in: ["passed", "passed_with_revision", "failed"] }, thesis: { studentId: { not: student.id } } },
    select: { id: true, thesisId: true, date: true, resultFinalizer: { select: { id: true } } },
    orderBy: [{ date: "desc" }],
  });
  const ordered = [...seminars.filter((s) => thesisIds.includes(s.thesisId)), ...seminars.filter((s) => !thesisIds.includes(s.thesisId))].slice(0, 8);
  for (const seminar of ordered) {
    const at = new Date((seminar.date ?? NOW).getTime() + 3 * HOUR);
    await prisma.thesisSeminarAudience.create({
      data: { thesisSeminarId: seminar.id, thesisId: seminar.thesisId, studentId: student.id, registeredAt: new Date(at.getTime() - DAY), approvedAt: at, approvedBy: seminar.resultFinalizer?.id ?? null },
    });
  }
  return ordered.length;
}

async function seedCplScores(studentId, cpls, failing) {
  for (const [index, cpl] of cpls.entries()) {
    const score = failing && index === 0 ? cpl.minimalScore - 10 : Math.min(100, cpl.minimalScore + 18 + (index % 4) * 3);
    await prisma.studentCplScore.upsert({
      where: { studentId_cplId: { studentId, cplId: cpl.id } },
      update: {},
      create: { studentId, cplId: cpl.id, score, source: "SIA", status: "calculated", inputAt: NOW },
    });
  }
}

/** Registered in the open period: exit survey answered, every document uploaded (not verified yet). */
async function registerForYudisium(thesis, account, ctx) {
  const yudisium = ctx.yudisium;
  const registeredAt = new Date(NOW.getTime() - 2 * HOUR);
  const participant = await prisma.yudisiumParticipant.create({
    data: { yudisiumId: yudisium.id, thesisId: thesis.id, exitSurveyFormId: yudisium.exitSurveyFormId, exitSurveySubmittedAt: registeredAt, registeredAt, status: "registered" },
  });
  const questions = await prisma.exitSurveyQuestion.findMany({ where: { exitSurveyFormId: yudisium.exitSurveyFormId }, include: { options: { orderBy: { orderNumber: "asc" } } } });
  for (const question of questions) {
    const base = { yudisiumParticipantId: participant.id, exitSurveyFormId: yudisium.exitSurveyFormId, exitSurveyQuestionId: question.id };
    await prisma.yudisiumParticipantExitSurveyAnswer.create({
      data: {
        ...base,
        exitSurveyOptionId: question.questionType === "single_choice" ? question.options[0]?.id ?? null : null,
        answerText: question.questionType === "short_answer" ? "PT Teknologi Andalas" : question.questionType === "paragraph" ? "Perbanyak praktik proyek bersama industri." : null,
        answerNumber: question.questionType === "number" ? 4 : null,
        answerDate: question.questionType === "date" ? new Date(wibSlot(NOW).date.getTime() + 30 * DAY) : null,
      },
    });
    if (question.questionType === "multiple_choice") {
      for (const option of question.options.slice(0, 2)) {
        await prisma.yudisiumParticipantExitSurveySelectedOption.create({ data: { ...base, exitSurveyOptionId: option.id } });
      }
    }
  }
  const items = await prisma.yudisiumRequirementItem.findMany({ where: { yudisiumId: yudisium.id }, include: { yudisiumRequirement: true } });
  for (const item of items) {
    const file = await samplePdf(`uploads/yudisium/${yudisium.id}/${participant.id}`, `req-${item.id}-seed.pdf`, item.yudisiumRequirement.name, [account.fullName, account.nim]);
    await prisma.yudisiumParticipantRequirement.create({
      data: { yudisiumParticipantId: participant.id, yudisiumRequirementItemId: item.id, yudisiumId: yudisium.id, ...file, submittedAt: registeredAt, status: "submitted" },
    });
  }
}

async function seedAccount(account, ctx) {
  const student = await ensureStudent(account, ctx);
  if (account.flagsOnly) {
    await setPeriodFlags(student.id, ctx.semesters.current.id);
    console.log(`  ✅ ${email(account.key)}: ${account.fullName}`);
    return null;
  }
  if (await prisma.thesis.findFirst({ where: { studentId: student.id } })) {
    console.log(`  ⏭️  ${email(account.key)}: sudah punya tugas akhir, dilewati.`);
    return null;
  }
  const { previous } = ctx.semesters;
  const startDate = new Date(Math.min(previous.endDate.getTime() - 90 * DAY, NOW.getTime() - 150 * DAY));
  const finished = account.defence?.status === "passed";
  const thesis = await prisma.thesis.create({
    data: {
      studentId: student.id,
      title: account.title,
      thesisTopicId: ctx.topic.id,
      academicYearId: previous.id,
      startDate,
      createdAt: startDate,
      status: THESIS_STATUS.RESEARCH,
      statusChangedAt: startDate,
    },
  });
  const p1Relation = await prisma.thesisSupervisors.create({
    data: {
      thesisId: thesis.id,
      lecturerId: ctx.lecturers.supervisor.id,
      roleId: ctx.roles.p1.id,
      activeRoleKey: `${thesis.id}:${ctx.roles.p1.id}`,
      seminarReady: true,
      defenceReady: !!account.defence || account.ready === "defence",
    },
  });
  const accountCtx = { ...ctx, p1Relation };
  const firstEventAt = account.seminar ? eventWindow(account.seminar.held).startedAt : NOW;
  await createResearchHistory(thesis.id, ctx.lecturers.supervisor.id, new Date(Math.min(firstEventAt.getTime(), NOW.getTime()) - 25 * DAY));
  const approvers = [{ lecturerId: ctx.lecturers.supervisor.id, position: "pembimbing_1" }];
  await seedReadinessApprovals(prisma, { thesisId: thesis.id, kind: "seminar", approvedAt: new Date(firstEventAt.getTime() - 23 * DAY), supervisors: approvers });

  if (account.seminar) await createEvent("seminar", thesis, account, account.seminar, accountCtx);
  if (account.defence || account.ready === "defence") {
    const defenceAt = account.defence ? eventWindow(account.defence.held).startedAt : NOW;
    await seedReadinessApprovals(prisma, { thesisId: thesis.id, kind: "defence", approvedAt: new Date(defenceAt.getTime() - 23 * DAY), supervisors: approvers });
  }
  if (account.defence) {
    const { resultAt } = await createEvent("defence", thesis, account, account.defence, accountCtx);
    if (finished) {
      // A pass without revision finished the thesis when the result was set (K28).
      await prisma.thesis.update({ where: { id: thesis.id }, data: { status: THESIS_STATUS.COMPLETED, statusChangedAt: resultAt } });
    }
  }
  if (account.yudisium) {
    await seedCplScores(student.id, ctx.cpls, !!account.failingCpl);
    if (account.yudisium === "registered") await registerForYudisium(thesis, account, ctx);
  }
  console.log(`  ✅ ${email(account.key)}: ${account.fullName}`);
  return { student, thesis, account };
}

async function main() {
  console.log("🚀 Seeding data uji Seminar Hasil, Sidang TA, dan Yudisium...");
  const topic = await prisma.thesisTopic.findFirst({ where: { name: TOPIC_NAME } });
  if (!topic) throw new Error(`Topik "${TOPIC_NAME}" tidak ditemukan. Jalankan scripts/seed-master.js lebih dulu.`);
  const semesters = await resolveSemesters();
  const current = semesters.current;
  if (current.thesisSeminarMinimumScore === null || current.thesisDefenceMinimumScore === null) {
    throw new Error("Nilai minimum seminar/sidang semester berjalan kosong. Jalankan scripts/seed-thesis-rubrics.js lebih dulu.");
  }
  const [seminarCpmks, defenceExaminerCpmks, defenceSupervisorCpmks] = await Promise.all([
    prisma.thesisCpmk.findMany({ where: { academicYearId: current.id }, include: { thesisSeminarAssessmentCriterias: true } }),
    prisma.thesisCpmk.findMany({ where: { academicYearId: current.id }, include: { thesisDefenceExaminerAssessmentCriterias: true } }),
    prisma.thesisCpmk.findMany({ where: { academicYearId: current.id }, include: { thesisDefenceSupervisorAssessmentCriterias: true } }),
  ]);
  const assessment = {
    seminar: { minimum: current.thesisSeminarMinimumScore, examinerCriteria: seminarCpmks.flatMap((c) => c.thesisSeminarAssessmentCriterias), supervisorCriteria: [] },
    defence: {
      minimum: current.thesisDefenceMinimumScore,
      examinerCriteria: defenceExaminerCpmks.flatMap((c) => c.thesisDefenceExaminerAssessmentCriterias),
      supervisorCriteria: defenceSupervisorCpmks.flatMap((c) => c.thesisDefenceSupervisorAssessmentCriterias),
    },
  };
  if (assessment.seminar.examinerCriteria.length === 0 || assessment.defence.supervisorCriteria.length === 0) {
    throw new Error("Rubrik seminar/sidang semester berjalan kosong. Jalankan scripts/seed-thesis-rubrics.js lebih dulu.");
  }

  const ctx = {
    topic,
    semesters,
    assessment,
    passwordHash: await bcrypt.hash(DEFAULT_PASSWORD, 10),
    roles: { student: await requireRole(ROLES.MAHASISWA), p1: await requireRole(ROLES.PEMBIMBING_1) },
    lecturers: {
      supervisor: await requireUser(LECTURER.supervisor),
      examiner1: await requireUser(LECTURER.examiner1),
      examiner2: await requireUser(LECTURER.examiner2),
    },
    admin: await requireUser(LECTURER.admin),
    rooms: { seminar: await ensureRoom(ROOM.seminar), defence: await ensureRoom(ROOM.defence) },
    requirements: {
      seminar: await ensureEventRequirements("thesisSeminarRequirement", current.id, SEMINAR_REQUIREMENTS),
      defence: await ensureEventRequirements("thesisDefenceRequirement", current.id, DEFENCE_REQUIREMENTS),
    },
    cpls: await ensureCpls(),
    exitSurveyForm: await ensureExitSurveyForm(),
  };
  ctx.yudisium = await ensureOpenYudisium(ctx);

  const seeded = [];
  for (const account of ACCOUNTS) {
    const result = await seedAccount(account, ctx);
    if (result) seeded.push(result);
  }
  // Attendance of the account ready to register for its seminar, at seminars that took place.
  const ready = seeded.find((s) => s.account.ready === "seminar");
  if (ready) {
    const count = await addAttendance(ready.student, seeded.map((s) => s.thesis.id));
    console.log(`  ✅ ${count} kehadiran seminar untuk ${ready.account.fullName}.`);
  }
  console.log(`\n✨ Selesai. ${ACCOUNTS.length} akun uji diproses.`);
}

main()
  .catch((error) => {
    console.error("❌ Seeder gagal:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
