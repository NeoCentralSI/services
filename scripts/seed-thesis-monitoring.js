/**
 * Test data for the per-semester monitoring page (Paket E3, part G of
 * PANDUAN_UJI_MANUAL_ALUR_TA.md): seminars and defences in every status, one for each
 * "Perlu Perhatian" reason, students ready to register, and theses that show what the
 * semester filter means. One `ta_mon_…` account per row, supervised and examined by
 * lecturers that no scenario of the guide logs in as, so the accounts and lecturer loads of
 * seed-thesis-research-flow.js stay as they are.
 *
 * Run it last (from app/backend):
 *   node scripts/seed-master.js
 *   node scripts/seed-thesis-topics.js
 *   node scripts/seed-milestone-templates.js
 *   node scripts/seed-guidance-milestone.js
 *   node scripts/seed-thesis-research-flow.js
 *   node scripts/seed-thesis-monitoring.js
 *
 * Dates of the running semester are relative to the day the seeder runs; dates of the
 * previous semester are relative to that semester. The numbers in the guide hold while the
 * relative dates stay inside the running semester (the seeder says so when they do not).
 * Idempotent: an account that already has a thesis is left as it is. Nothing is deleted.
 * Password of every account: password123.
 */
import bcrypt from "bcrypt";
import { PrismaClient } from "../src/generated/prisma/index.js";
import { ROLES } from "../src/constants/roles.js";
import { THESIS_STATUS, THESIS_PHASE } from "../src/constants/thesisStatus.js";
import { seedReadinessApprovals } from "./lib/readiness-audit.js";

const prisma = new PrismaClient();

const DEFAULT_PASSWORD = "password123";
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const WIB_OFFSET = 7 * HOUR;
const NOW = new Date();

/** Today's calendar date in WIB, stored the way the seminar and defence modules store `date`. */
const TODAY = (() => {
  const wib = new Date(NOW.getTime() + WIB_OFFSET);
  return new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate()));
})();
/** A calendar date `offset` days from today (negative = past). */
const calendarDay = (offset) => new Date(TODAY.getTime() + offset * DAY);
/** A moment a little more than `days` whole days ago, so "N hari" reads N on the seeding day. */
const ago = (days) => new Date(NOW.getTime() - days * DAY - HOUR);
/** Time of day as the modules store it: on 1970-01-01, read in UTC. */
const clock = (hhmm) => new Date(`1970-01-01T${hhmm}:00.000Z`);

const TOPIC_NAME = "Pengembangan Sistem (Enterprise Application)";

/** Lecturers of the master seed without a login in the guide. */
const LECTURER = Object.freeze({
  seminarP1: "Hafzatin Nurlatifa",
  seminarP2: "Hasdi Putra",
  defenceP1: "Dwi Welly Sukma Nirad",
  defenceP2: "Jefril Rahmadoni",
  examiner1: "Fajril Akbar",
  examiner2: "Haris Suryamen",
});

const ROOM = Object.freeze({ seminar: "Ruang Seminar SI", defence: "Ruang Sidang SI" });

/**
 * Seminars of the running semester. `heldInDays` is the day it is held, counted from today;
 * the other numbers are whole days ago.
 */
const SEMINAR_ACCOUNTS = [
  { key: "sem_daftar", fullName: "Uji Mon Seminar Baru Daftar", nim: "2211529101", title: "Sistem Informasi Peminjaman Alat Laboratorium",
    seminar: { status: "registered", registeredDaysAgo: 2 } },
  { key: "sem_verif_lama", fullName: "Uji Mon Seminar Verifikasi Lama", nim: "2211529102", title: "Aplikasi Pengelolaan Surat Tugas Dosen",
    seminar: { status: "registered", registeredDaysAgo: 10 } }, // Perlu Perhatian: menunggu verifikasi dokumen
  { key: "sem_terverifikasi", fullName: "Uji Mon Seminar Terverifikasi", nim: "2211529103", title: "Sistem Informasi Pendaftaran Asisten Praktikum",
    seminar: { status: "verified", registeredDaysAgo: 8, verifiedDaysAgo: 3 } },
  { key: "sem_belum_jadwal", fullName: "Uji Mon Seminar Belum Dijadwalkan", nim: "2211529104", title: "Aplikasi Pemantauan Kegiatan Magang",
    seminar: { status: "examiner_assigned", registeredDaysAgo: 26, verifiedDaysAgo: 20 } }, // Perlu Perhatian: belum dijadwalkan
  { key: "sem_terjadwal", fullName: "Uji Mon Seminar Terjadwal", nim: "2211529105", title: "Sistem Informasi Pengelolaan Jurnal Departemen",
    seminar: { status: "scheduled", heldInDays: 7, start: "09:00", end: "11:00" } }, // Jadwal Mendatang
  { key: "sem_hasil_tunda", fullName: "Uji Mon Seminar Hasil Tertunda", nim: "2211529106", title: "Aplikasi Rekapitulasi Kehadiran Dosen",
    seminar: { status: "scheduled", heldInDays: -5, start: "13:30", end: "15:30" } }, // Perlu Perhatian: hasil belum difinalkan
  { key: "sem_lulus", fullName: "Uji Mon Seminar Lulus", nim: "2211529107", title: "Sistem Informasi Pengelolaan Kegiatan Seminar",
    seminar: { status: "passed", heldInDays: -20, start: "09:00", end: "11:00", score: 82 } },
  { key: "sem_revisi_lama", fullName: "Uji Mon Seminar Revisi Lama", nim: "2211529108", title: "Aplikasi Penilaian Kinerja Asisten",
    seminar: { status: "passed_with_revision", heldInDays: -40, start: "09:00", end: "11:00", score: 76, revisions: { total: 2, approved: 1 } } }, // Perlu Perhatian: revisi belum selesai
  { key: "sem_revisi_final", fullName: "Uji Mon Seminar Revisi Final", nim: "2211529109", title: "Sistem Informasi Inventaris Buku Referensi",
    seminar: { status: "passed_with_revision", heldInDays: -35, start: "13:30", end: "15:30", score: 79, revisionFinalDaysAgo: 10, revisions: { total: 2, approved: 2 } } },
  { key: "sem_gagal", fullName: "Uji Mon Seminar Tidak Lulus", nim: "2211529110", title: "Aplikasi Pengaduan Layanan Akademik",
    seminar: { status: "failed", heldInDays: -25, start: "09:00", end: "11:00", score: 48 } },
  { key: "sem_batal", fullName: "Uji Mon Seminar Dibatalkan", nim: "2211529111", title: "Sistem Informasi Agenda Departemen",
    seminar: { status: "cancelled", registeredDaysAgo: 15 } },
];

/** Defences of the running semester; each thesis passed its seminar in the previous semester. */
const DEFENCE_ACCOUNTS = [
  { key: "sid_daftar", fullName: "Uji Mon Sidang Baru Daftar", nim: "2211529121", title: "Sistem Informasi Pengelolaan Proposal Penelitian",
    defence: { status: "registered", registeredDaysAgo: 3 } },
  { key: "sid_verif_lama", fullName: "Uji Mon Sidang Verifikasi Lama", nim: "2211529122", title: "Aplikasi Pencatatan Bimbingan Akademik",
    defence: { status: "registered", registeredDaysAgo: 9 } }, // Perlu Perhatian: menunggu verifikasi dokumen
  { key: "sid_terverifikasi", fullName: "Uji Mon Sidang Terverifikasi", nim: "2211529123", title: "Sistem Informasi Pengelolaan Kuesioner Alumni",
    defence: { status: "verified", registeredDaysAgo: 9, verifiedDaysAgo: 4 } },
  { key: "sid_belum_jadwal", fullName: "Uji Mon Sidang Belum Dijadwalkan", nim: "2211529124", title: "Aplikasi Pengelolaan Jadwal Laboratorium",
    defence: { status: "examiner_assigned", registeredDaysAgo: 24, verifiedDaysAgo: 18 } }, // Perlu Perhatian: belum dijadwalkan
  { key: "sid_terjadwal", fullName: "Uji Mon Sidang Terjadwal", nim: "2211529125", title: "Sistem Informasi Pengelolaan Dokumen Akreditasi",
    defence: { status: "scheduled", heldInDays: 8, start: "13:30", end: "15:30" } }, // Jadwal Mendatang
  { key: "sid_hasil_tunda", fullName: "Uji Mon Sidang Hasil Tertunda", nim: "2211529126", title: "Aplikasi Pemetaan Kompetensi Lulusan",
    defence: { status: "scheduled", heldInDays: -6, start: "09:00", end: "11:00" } }, // Perlu Perhatian: hasil belum difinalkan
  { key: "sid_lulus", fullName: "Uji Mon Sidang Lulus", nim: "2211529127", title: "Sistem Informasi Pengelolaan Tugas Akhir Terpadu",
    defence: { status: "passed", heldInDays: -15, start: "09:00", end: "11:00", score: 84, grade: "A" },
    // Lulus sidang, lalu TA ditutup: selesai di tengah semester berjalan.
    completedDaysAgo: 10 },
  { key: "sid_revisi_lama", fullName: "Uji Mon Sidang Revisi Lama", nim: "2211529128", title: "Aplikasi Pengelolaan Kegiatan Kemahasiswaan Terpadu",
    defence: { status: "passed_with_revision", heldInDays: -45, start: "13:30", end: "15:30", score: 78, grade: "B+", revisions: { total: 2, approved: 1 } } }, // Perlu Perhatian: revisi belum selesai
  { key: "sid_revisi_final", fullName: "Uji Mon Sidang Revisi Final", nim: "2211529129", title: "Sistem Informasi Layanan Legalisir Ijazah",
    defence: { status: "passed_with_revision", heldInDays: -38, start: "09:00", end: "11:00", score: 80, grade: "A-", revisionFinalDaysAgo: 12, revisions: { total: 2, approved: 2 } } },
  { key: "sid_gagal", fullName: "Uji Mon Sidang Tidak Lulus", nim: "2211529130", title: "Aplikasi Pengelolaan Bank Data Penelitian",
    defence: { status: "failed", heldInDays: -22, start: "13:30", end: "15:30", score: 48, grade: "D" } },
  { key: "sid_batal", fullName: "Uji Mon Sidang Dibatalkan", nim: "2211529131", title: "Sistem Informasi Pemesanan Ruang Rapat",
    defence: { status: "cancelled", registeredDaysAgo: 12 } },
];

/** Ready to register, and the theses that show what the semester filter means. */
const OTHER_ACCOUNTS = [
  // Semua pembimbing menyetujui kesiapan seminar; belum mendaftar.
  { key: "siap_seminar", fullName: "Uji Mon Siap Daftar Seminar", nim: "2211529141", title: "Sistem Informasi Pengelolaan Kerja Praktik Terpadu",
    kind: "seminar", ready: true },
  // Lulus seminar semester lalu, semua pembimbing menyetujui kesiapan sidang; belum mendaftar.
  { key: "siap_sidang", fullName: "Uji Mon Siap Daftar Sidang", nim: "2211529142", title: "Aplikasi Pengelolaan Sertifikat Kompetensi",
    kind: "defence", ready: true },
  // Mulai semester lalu dan masih berjalan: masuk semester lalu dan semester berjalan.
  { key: "mulai_lalu", fullName: "Uji Mon Mulai Semester Lalu", nim: "2211529143", title: "Sistem Informasi Pengelolaan Lomba Mahasiswa",
    kind: "seminar" },
  // Selesai sebelum semester berjalan: masuk semester lalu, tidak masuk semester berjalan.
  { key: "selesai_lalu", fullName: "Uji Mon Selesai Semester Lalu", nim: "2211529144", title: "Aplikasi Pengelolaan Arsip Kurikulum",
    kind: "defence", finishedLastSemester: true },
];

const email = (key) => `ta_mon_${key}@fti.unand.ac.id`;

// ─────────────────────────────────────────────────────────────────────────────────────

async function requireRole(name) {
  const role = await prisma.userRole.findFirst({ where: { name } });
  if (!role) throw new Error(`Role "${name}" tidak ditemukan. Jalankan scripts/seed-master.js lebih dulu.`);
  return role;
}

async function requireLecturer(name) {
  const user = await prisma.user.findFirst({ where: { fullName: { startsWith: name }, lecturer: { isNot: null } } });
  if (!user) throw new Error(`Dosen "${name}" tidak ditemukan. Jalankan scripts/seed-master.js lebih dulu.`);
  return user;
}

async function ensureRoom(name) {
  return (await prisma.room.findFirst({ where: { name } })) ?? prisma.room.create({ data: { name, location: "Gedung Departemen Sistem Informasi", capacity: 30 } });
}

/** The semester running today and the one before it (created when the master seed has a gap). */
async function resolveSemesters() {
  const current =
    (await prisma.academicYear.findFirst({ where: { startDate: { lte: NOW }, endDate: { gte: NOW } }, orderBy: { startDate: "desc" } })) ??
    (await prisma.academicYear.findFirst({ where: { isActive: true } }));
  if (!current) throw new Error("Tidak ada tahun ajaran aktif. Jalankan scripts/seed-master.js lebih dulu.");

  const startYear = Number(current.year.split("/")[0]);
  const wanted =
    current.semester === "ganjil"
      ? { semester: "genap", year: `${startYear - 1}/${startYear}`, startDate: new Date(`${startYear}-02-01`), endDate: new Date(`${startYear}-07-31`) }
      : { semester: "ganjil", year: current.year, startDate: new Date(`${startYear}-08-01`), endDate: new Date(`${startYear + 1}-01-31`) };

  let previous = await prisma.academicYear.findFirst({ where: { semester: wanted.semester, year: wanted.year } });
  if (!previous) {
    previous = await prisma.academicYear.create({ data: { ...wanted, isActive: false, activeKey: null } });
    console.log(`  ✅ Tahun ajaran ${wanted.semester} ${wanted.year} ditambahkan (semester sebelum semester berjalan).`);
  }
  return { current, previous };
}

async function ensureStudent(account, passwordHash, studentRole) {
  let user = await prisma.user.findFirst({
    where: { OR: [{ email: email(account.key) }, { identityNumber: account.nim }] },
  });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: email(account.key),
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
    create: { id: user.id, status: "active", enrollmentYear: 2022, sksCompleted: 142 },
  });
  return user;
}

const MILESTONE_TITLES = [
  "Pengajuan Judul & BAB I",
  "BAB II - Tinjauan Pustaka",
  "BAB III - Metodologi",
  "BAB IV - Implementasi",
  "BAB V - Pengujian dan Penutup",
];

/** Eight completed sessions, one week apart, ending at `lastActivityAt`; five milestones done. */
async function createResearchHistory(thesisId, supervisorId, lastActivityAt) {
  for (let i = 0; i < 8; i++) {
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
  for (let i = 0; i < MILESTONE_TITLES.length; i++) {
    const doneAt = new Date(lastActivityAt.getTime() - (MILESTONE_TITLES.length - 1 - i) * 10 * DAY);
    await prisma.thesisMilestone.create({
      data: {
        thesisId,
        title: MILESTONE_TITLES[i],
        orderIndex: i + 1,
        phase: THESIS_PHASE.RESEARCH,
        status: "completed",
        progressPercentage: 100,
        completedAt: doneAt,
        validatedAt: doneAt,
        updatedAt: doneAt,
      },
    });
  }
}

/**
 * Columns of a seminar or defence row for its status. The day it is held is either
 * `heldInDays` from today or the absolute `heldOn`.
 */
function eventColumns(config, ctx, kind) {
  const isHeldStatus = ["passed", "passed_with_revision", "failed"].includes(config.status);
  const hasSchedule = config.status === "scheduled" || isHeldStatus;
  const heldOn = hasSchedule ? config.heldOn ?? calendarDay(config.heldInDays) : null;
  // Around midday WIB on the day it was held; relative events keep the "N days ago" of `ago`.
  const resultAt = isHeldStatus ? (config.heldOn ? new Date(heldOn.getTime() + 5 * HOUR) : ago(-config.heldInDays)) : null;

  const registeredAt = hasSchedule ? new Date(heldOn.getTime() - 21 * DAY + 2 * HOUR) : ago(config.registeredDaysAgo);
  const verifiedAt = hasSchedule
    ? new Date(heldOn.getTime() - 17 * DAY + 2 * HOUR)
    : config.verifiedDaysAgo != null ? ago(config.verifiedDaysAgo) : null;
  const scheduledAt = hasSchedule ? new Date(heldOn.getTime() - 10 * DAY + 2 * HOUR) : null;
  const revisionFinalizedAt = config.revisionFinalDaysAgo != null ? ago(config.revisionFinalDaysAgo) : null;

  return {
    status: config.status,
    registeredAt,
    verifiedAt,
    scheduledAt,
    date: heldOn,
    startTime: hasSchedule ? clock(config.start ?? "09:00") : null,
    endTime: hasSchedule ? clock(config.end ?? "11:00") : null,
    roomId: hasSchedule ? ctx.rooms[kind].id : null,
    finalScore: isHeldStatus ? config.score : null,
    resultFinalizedAt: resultAt,
    revisionFinalizedAt,
    cancelledReason: config.status === "cancelled" ? "Data uji: pendaftaran dibatalkan atas permintaan mahasiswa." : null,
    createdAt: registeredAt,
    updatedAt: revisionFinalizedAt ?? resultAt ?? scheduledAt ?? verifiedAt ?? registeredAt,
  };
}

/** Examiners exist from `examiner_assigned` on; they have scored once the event was held. */
function examinerRows(config, columns, ctx) {
  if (["registered", "verified", "cancelled"].includes(config.status)) return [];
  const scored = columns.resultFinalizedAt != null;
  const assignedAt = new Date((columns.verifiedAt ?? columns.registeredAt).getTime() + 2 * DAY);
  return [ctx.lecturers.examiner1, ctx.lecturers.examiner2].map((lecturer, index) => ({
    lecturerId: lecturer.id,
    order: index + 1,
    assignedAt,
    // The one waiting for a schedule still has an examiner who has not answered.
    availabilityStatus: config.status === "examiner_assigned" && index === 1 ? "pending" : "available",
    respondedAt: config.status === "examiner_assigned" && index === 1 ? null : new Date(assignedAt.getTime() + DAY),
    assessmentScore: scored ? config.score + (index === 0 ? 1 : -1) : null,
    assessmentSubmittedAt: scored ? columns.resultFinalizedAt : null,
  }));
}

const REVISION_NOTES = [
  "Perjelas rumusan masalah dan batasan penelitian pada BAB I.",
  "Lengkapi hasil pengujian dan pembahasannya pada BAB V.",
];

function revisionRows(config, columns, approverId) {
  if (!config.revisions) return [];
  return REVISION_NOTES.slice(0, config.revisions.total).map((description, index) => {
    const approved = index < config.revisions.approved;
    const approvedAt = approved ? columns.revisionFinalizedAt ?? new Date(columns.resultFinalizedAt.getTime() + 14 * DAY) : null;
    return {
      description,
      ...(approved
        ? { revisionAction: "Sudah diperbaiki sesuai catatan penguji.", studentSubmittedAt: new Date(approvedAt.getTime() - DAY), supervisorApprovedAt: approvedAt, approvedBy: approverId }
        : {}),
    };
  });
}

async function createSeminar(thesis, p1Relation, config, ctx) {
  const columns = eventColumns(config, ctx, "seminar");
  const seminar = await prisma.thesisSeminar.create({
    data: {
      thesisId: thesis.id,
      ...columns,
      ...(columns.resultFinalizedAt ? { resultFinalizedBy: p1Relation.id } : {}),
      ...(columns.revisionFinalizedAt ? { revisionFinalizedBy: p1Relation.id } : {}),
    },
  });
  const examiners = examinerRows(config, columns, ctx);
  for (const [index, examiner] of examiners.entries()) {
    const row = await prisma.thesisSeminarExaminer.create({ data: { thesisSeminarId: seminar.id, ...examiner } });
    // Revision notes hang on the examiner who gave them: one each.
    const revision = revisionRows(config, columns, p1Relation.id)[index];
    if (revision) await prisma.thesisSeminarRevision.create({ data: { seminarExaminerId: row.id, ...revision } });
  }
}

async function createDefence(thesis, p1Relation, config, ctx) {
  const columns = eventColumns(config, ctx, "defence");
  const defence = await prisma.thesisDefence.create({
    data: {
      thesisId: thesis.id,
      ...columns,
      ...(columns.resultFinalizedAt
        ? { resultFinalizedBy: p1Relation.id, examinerAverageScore: config.score, supervisorScore: config.score, supervisorAssessmentSubmittedAt: columns.resultFinalizedAt, grade: config.grade }
        : {}),
      ...(columns.revisionFinalizedAt ? { revisionFinalizedBy: p1Relation.id } : {}),
    },
  });
  const examiners = examinerRows(config, columns, ctx);
  for (const [index, examiner] of examiners.entries()) {
    const row = await prisma.thesisDefenceExaminer.create({ data: { thesisDefenceId: defence.id, ...examiner } });
    const revision = revisionRows(config, columns, p1Relation.id)[index];
    if (revision) await prisma.thesisDefenceRevision.create({ data: { defenceExaminerId: row.id, ...revision } });
  }
}

/** A registration that failed or was cancelled resets the approval, as the modules do. */
const keepsApproval = (config) => !!config && !["failed", "cancelled"].includes(config.status);

async function seedAccount(account, ctx) {
  const student = await ensureStudent(account, ctx.passwordHash, ctx.roles.student);
  if (await prisma.thesis.findFirst({ where: { studentId: student.id } })) {
    console.log(`  ⏭️  ${email(account.key)}: sudah punya tugas akhir, dilewati.`);
    return;
  }

  const { previous } = ctx.semesters;
  const isDefenceTrack = account.kind === "defence" || !!account.defence;
  const finishedLastSemester = !!account.finishedLastSemester;

  // Every thesis started in the previous semester; the one that finished there started a semester earlier.
  const startDate = finishedLastSemester
    ? new Date(previous.startDate.getTime() - 140 * DAY)
    : new Date(previous.endDate.getTime() - 75 * DAY);
  const completedAt = finishedLastSemester
    ? new Date(previous.endDate.getTime() - 20 * DAY)
    : account.completedDaysAgo != null ? ago(account.completedDaysAgo) : null;
  const lastActivityAt = finishedLastSemester ? new Date(previous.endDate.getTime() - 45 * DAY) : ago(completedAt ? 16 : 5);

  const thesis = await prisma.thesis.create({
    data: {
      studentId: student.id,
      title: account.title,
      thesisTopicId: ctx.topic.id,
      academicYearId: previous.id,
      startDate,
      createdAt: startDate,
      status: completedAt ? THESIS_STATUS.COMPLETED : THESIS_STATUS.RESEARCH,
      statusChangedAt: completedAt ?? startDate,
    },
  });

  const p1 = isDefenceTrack ? ctx.lecturers.defenceP1 : ctx.lecturers.seminarP1;
  const p2 = isDefenceTrack ? ctx.lecturers.defenceP2 : ctx.lecturers.seminarP2;
  // On the defence track the seminar was passed; on the seminar track the approval follows the registration.
  const seminarReady = isDefenceTrack || keepsApproval(account.seminar) || (account.kind === "seminar" && !!account.ready);
  const defenceReady = isDefenceTrack && (finishedLastSemester || keepsApproval(account.defence) || !!account.ready);
  let p1Relation = null;
  for (const [lecturer, role] of [[p1, ctx.roles.p1], [p2, ctx.roles.p2]]) {
    const relation = await prisma.thesisSupervisors.create({
      data: {
        thesisId: thesis.id,
        lecturerId: lecturer.id,
        roleId: role.id,
        activeRoleKey: `${thesis.id}:${role.id}`,
        seminarReady,
        defenceReady,
      },
    });
    if (role.id === ctx.roles.p1.id) p1Relation = relation;
  }

  // The audit rows the app writes on "Setujui", two days before the registration they led to
  // (or three days ago when the student has not registered yet), so the readiness cards show
  // when each supervisor approved (Lanjutan Paket E4).
  const approvers = [
    { lecturerId: p1.id, position: "pembimbing_1" },
    { lecturerId: p2.id, position: "pembimbing_2" },
  ];
  const beforeRegistration = (config, kind) => new Date(eventColumns(config, ctx, kind).registeredAt.getTime() - 2 * DAY);
  if (seminarReady) {
    const seminarConfig = isDefenceTrack
      ? { status: "passed", heldOn: new Date(previous.endDate.getTime() - (finishedLastSemester ? 110 : 10) * DAY) }
      : account.seminar;
    const approvedAt = seminarConfig ? beforeRegistration(seminarConfig, "seminar") : ago(3);
    await seedReadinessApprovals(prisma, { thesisId: thesis.id, kind: "seminar", approvedAt, supervisors: approvers });
  }
  if (defenceReady) {
    const defenceConfig = finishedLastSemester
      ? { status: "passed", heldOn: new Date(previous.endDate.getTime() - 35 * DAY) }
      : account.defence;
    const approvedAt = defenceConfig ? beforeRegistration(defenceConfig, "defence") : ago(3);
    await seedReadinessApprovals(prisma, { thesisId: thesis.id, kind: "defence", approvedAt, supervisors: approvers });
  }

  await createResearchHistory(thesis.id, p1.id, lastActivityAt);

  if (account.seminar) await createSeminar(thesis, p1Relation, account.seminar, ctx);
  if (isDefenceTrack) {
    // Seminar passed in the previous semester (the earlier one for the thesis that finished there).
    const heldOn = new Date(previous.endDate.getTime() - (finishedLastSemester ? 110 : 10) * DAY);
    await createSeminar(thesis, p1Relation, { status: "passed", heldOn, start: "09:00", end: "11:00", score: 81 }, ctx);
  }
  if (account.defence) await createDefence(thesis, p1Relation, account.defence, ctx);
  if (finishedLastSemester) {
    const heldOn = new Date(previous.endDate.getTime() - 35 * DAY);
    await createDefence(thesis, p1Relation, { status: "passed", heldOn, start: "09:00", end: "11:00", score: 86, grade: "A" }, ctx);
  }

  console.log(`  ✅ ${email(account.key)}: ${account.fullName}`);
}

/** The guide counts on the relative dates falling inside the running semester. */
function warnWhenOutsideSemester(current) {
  const configs = [...SEMINAR_ACCOUNTS.map((a) => a.seminar), ...DEFENCE_ACCOUNTS.map((a) => a.defence)];
  // The date that places an event in a semester: the day it is held, else its registration.
  const offsets = configs.map((c) => c.heldInDays ?? -c.registeredDaysAgo);
  const earliest = calendarDay(Math.min(...offsets) - 1);
  const latest = calendarDay(Math.max(...offsets));
  if (earliest < current.startDate || latest > current.endDate) {
    console.warn(
      "  ⚠️  Sebagian tanggal relatif jatuh di luar semester berjalan; angka per semester pada panduan bagian G tidak berlaku untuk seed ini.",
    );
  }
}

async function main() {
  console.log("🚀 Seeding data uji monitoring per semester (Paket E3)...");

  const topic = await prisma.thesisTopic.findFirst({ where: { name: TOPIC_NAME } });
  if (!topic) throw new Error(`Topik "${TOPIC_NAME}" tidak ditemukan. Jalankan scripts/seed-master.js lebih dulu.`);

  const semesters = await resolveSemesters();
  const lecturers = {};
  for (const [key, name] of Object.entries(LECTURER)) lecturers[key] = await requireLecturer(name);

  const ctx = {
    topic,
    semesters,
    lecturers,
    rooms: { seminar: await ensureRoom(ROOM.seminar), defence: await ensureRoom(ROOM.defence) },
    passwordHash: await bcrypt.hash(DEFAULT_PASSWORD, 10),
    roles: {
      student: await requireRole(ROLES.MAHASISWA),
      p1: await requireRole(ROLES.PEMBIMBING_1),
      p2: await requireRole(ROLES.PEMBIMBING_2),
    },
  };

  warnWhenOutsideSemester(semesters.current);

  const accounts = [...SEMINAR_ACCOUNTS, ...DEFENCE_ACCOUNTS, ...OTHER_ACCOUNTS];
  for (const account of accounts) {
    await seedAccount(account, ctx);
  }

  console.log(`\n✨ Selesai. ${accounts.length} akun uji diproses.`);
}

main()
  .catch((error) => {
    console.error("❌ Seeder gagal:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
