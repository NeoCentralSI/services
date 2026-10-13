/**
 * Test data for the thesis research flow (Paket E): one student account per starting
 * state, so every manual-test scenario in PANDUAN_UJI_MANUAL_ALUR_TA.md can be run on its
 * own without editing the database.
 *
 * Run it after the four base seeders (from app/backend):
 *   node scripts/seed-master.js
 *   node scripts/seed-thesis-topics.js
 *   node scripts/seed-milestone-templates.js
 *   node scripts/seed-guidance-milestone.js
 *   node scripts/seed-thesis-research-flow.js
 *   node scripts/seed-thesis-monitoring.js   (Paket E3: seminar, sidang, and semester data)
 *
 * Dates are relative to the day the seeder runs, so "7 months ago" stays 7 months ago.
 * Idempotent: an account that already has a thesis is left as it is. Nothing is deleted.
 * Password of every account: password123.
 */
import bcrypt from "bcrypt";
import { PrismaClient } from "../src/generated/prisma/index.js";
import { ROLES } from "../src/constants/roles.js";
import { THESIS_STATUS, THESIS_PHASE } from "../src/constants/thesisStatus.js";

const prisma = new PrismaClient();

const DEFAULT_PASSWORD = "password123";
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date();

const daysAgo = (days) => new Date(NOW.getTime() - days * DAY);
function monthsAgo(months, extraDays = 0) {
  const date = new Date(NOW.getTime());
  date.setUTCMonth(date.getUTCMonth() - months);
  return new Date(date.getTime() - extraDays * DAY);
}

const LECTURER = Object.freeze({
  kadep: "kadep_si@fti.unand.ac.id",
  husnil: "pembimbing_si@fti.unand.ac.id",
  afriyanti: "sekdep_si@fti.unand.ac.id",
  aina: "penguji_si@fti.unand.ac.id",
  ullya: "gkm_si@fti.unand.ac.id",
});

const TOPIC_NAME = "Pengembangan Sistem (Enterprise Application)";

/**
 * One entry per account.
 * - `startedMonthsAgo`: where the supervision clock starts (`startDate`).
 * - `lastActivityDaysAgo`: date of the last activity: the latest completed session and
 *   milestone end on that day, so the derived activity level is the one named in the
 *   comment. The thesis row's `updatedAt` is not an activity source.
 * - `completedGuidances` / `milestones`: completed research-phase sessions and milestones
 *   ({ total, completed }).
 * - `seminar`: a results seminar row with the given status.
 * - `leave`: thesis on leave since `startedDaysAgo`.
 * - `openSessions`: scheduled (accepted) sessions with Pembimbing 1 a few days ahead.
 * - `changeRequest`: a pending change request submitted by the student, with
 *   `approvedSteps` lecturer steps already approved (0 = waiting for the first lecturer).
 * - `evaluation`: a guidance evaluation filled by Pembimbing 1: `pending` waits for the
 *   Ketua Departemen; `extensionEndedDaysAgo` stores an approved one-month extension that
 *   already ended, so the follow-up is due.
 */
const ACCOUNTS = [
  // ── B. Aktivitas dan Masa Bimbingan ────────────────────────────────────────────────
  {
    key: "lancar",
    email: "ta_lancar@fti.unand.ac.id",
    fullName: "Uji TA Lancar",
    nim: "2211529001",
    title: "Sistem Informasi Arsip Surat Departemen",
    p1: LECTURER.husnil,
    p2: LECTURER.afriyanti,
    startedMonthsAgo: 2, // masa bimbingan 2 bulan, tanpa jatuh tempo
    lastActivityDaysAgo: 5, // Lancar
    completedGuidances: 2,
    milestones: { total: 5, completed: 1 },
  },
  {
    key: "lambat",
    email: "ta_lambat@fti.unand.ac.id",
    fullName: "Uji TA Lambat",
    nim: "2211529002",
    title: "Aplikasi Pemantauan Kehadiran Praktikum",
    p1: LECTURER.husnil,
    p2: null,
    startedMonthsAgo: 7, // Evaluasi 6 bulan jatuh tempo
    lastActivityDaysAgo: 80, // Lambat
    completedGuidances: 3,
    milestones: { total: 5, completed: 2 },
  },
  {
    key: "berisiko",
    email: "ta_berisiko@fti.unand.ac.id",
    fullName: "Uji TA Berisiko",
    nim: "2211529003",
    title: "Sistem Pendukung Keputusan Pemilihan Laboratorium",
    p1: LECTURER.husnil,
    p2: LECTURER.aina,
    startedMonthsAgo: 13, // Evaluasi 1 tahun jatuh tempo
    lastActivityDaysAgo: 150, // Berisiko
    completedGuidances: 4,
    milestones: { total: 5, completed: 2 },
  },
  {
    key: "cuti",
    email: "ta_cuti@fti.unand.ac.id",
    fullName: "Uji TA Cuti",
    nim: "2211529004",
    title: "Aplikasi Pengelolaan Peminjaman Ruang Kuliah",
    p1: LECTURER.husnil,
    p2: LECTURER.afriyanti,
    startedMonthsAgo: 8,
    lastActivityDaysAgo: 70,
    completedGuidances: 3,
    milestones: { total: 5, completed: 2 },
    leave: { startedDaysAgo: 60 }, // BSS sejak 60 hari lalu: masa bimbingan berhenti
  },

  // ── C. Kesiapan seminar dan sidang ─────────────────────────────────────────────────
  {
    key: "siap_seminar",
    email: "ta_siap_seminar@fti.unand.ac.id",
    fullName: "Uji TA Siap Seminar",
    nim: "2211529005",
    title: "Sistem Informasi Pengelolaan Kerja Sama Departemen",
    p1: LECTURER.husnil,
    p2: LECTURER.afriyanti,
    startedMonthsAgo: 5,
    lastActivityDaysAgo: 3,
    completedGuidances: 8, // syarat seminar terpenuhi, belum disetujui pembimbing
    milestones: { total: 5, completed: 5 },
  },
  {
    key: "lulus_seminar",
    email: "ta_lulus_seminar@fti.unand.ac.id",
    fullName: "Uji TA Lulus Seminar",
    nim: "2211529006",
    title: "Aplikasi Pelaporan Kegiatan Kemahasiswaan",
    p1: LECTURER.husnil,
    p2: LECTURER.afriyanti,
    startedMonthsAgo: 5,
    lastActivityDaysAgo: 4,
    completedGuidances: 8,
    milestones: { total: 5, completed: 5 },
    seminarReady: true,
    seminar: { status: "passed", daysAgo: 14 }, // lulus seminar, belum disetujui untuk sidang
  },

  // ── D. Pengajuan Perubahan Tugas Akhir ─────────────────────────────────────────────
  {
    key: "ubah_judul",
    email: "ta_ubah_judul@fti.unand.ac.id",
    fullName: "Uji TA Ubah Judul",
    nim: "2211529007",
    title: "Sistem Informasi Pengelolaan Alumni",
    p1: LECTURER.husnil,
    p2: LECTURER.afriyanti,
    startedMonthsAgo: 3,
    lastActivityDaysAgo: 6,
    completedGuidances: 2,
    milestones: { total: 5, completed: 1 },
  },
  {
    key: "dua_pembimbing",
    email: "ta_dua_pembimbing@fti.unand.ac.id",
    fullName: "Uji TA Dua Pembimbing",
    nim: "2211529008",
    title: "Aplikasi Penjadwalan Praktikum Berbasis Web",
    p1: LECTURER.husnil,
    p2: LECTURER.aina, // ganti Pembimbing 1 dengan Pembimbing 2 yang naik posisi
    startedMonthsAgo: 3,
    lastActivityDaysAgo: 7,
    completedGuidances: 2,
    milestones: { total: 5, completed: 1 },
    openSessions: 1, // dibatalkan sistem saat Pembimbing 1 diganti
  },
  {
    key: "satu_pembimbing",
    email: "ta_satu_pembimbing@fti.unand.ac.id",
    fullName: "Uji TA Satu Pembimbing",
    nim: "2211529009",
    title: "Sistem Monitoring Inventaris Laboratorium",
    p1: LECTURER.husnil,
    p2: null, // tambah Pembimbing 2
    startedMonthsAgo: 3,
    lastActivityDaysAgo: 8,
    completedGuidances: 2,
    milestones: { total: 5, completed: 1 },
  },
  ...[1, 2, 3].map((n) => ({
    key: `alih_${n}`,
    email: `ta_alih_${n}@fti.unand.ac.id`,
    fullName: `Uji TA Alih ${n}`,
    nim: `221152901${n - 1}`,
    title: `Kajian Sistem Informasi Akademik Bagian ${n}`,
    p1: LECTURER.husnil, // dialihkan lewat "Alihkan Mahasiswa"
    p2: null,
    startedMonthsAgo: 3,
    lastActivityDaysAgo: 9,
    completedGuidances: 1,
    milestones: { total: 5, completed: 1 },
  })),
  {
    key: "seminar_aktif",
    email: "ta_seminar_aktif@fti.unand.ac.id",
    fullName: "Uji TA Seminar Aktif",
    nim: "2211529013",
    title: "Sistem Informasi Layanan Surat Mahasiswa",
    p1: LECTURER.husnil,
    p2: LECTURER.afriyanti,
    startedMonthsAgo: 5,
    lastActivityDaysAgo: 2,
    completedGuidances: 8,
    milestones: { total: 5, completed: 5 },
    seminarReady: true,
    seminar: { status: "registered", daysAgo: 2 }, // pengajuan perubahan harus ditolak
  },
  {
    key: "batal",
    email: "ta_batal@fti.unand.ac.id",
    fullName: "Uji TA Batal Pengajuan",
    nim: "2211529014",
    title: "Aplikasi Pencatatan Kegiatan Organisasi",
    p1: LECTURER.husnil,
    p2: null,
    startedMonthsAgo: 3,
    lastActivityDaysAgo: 5,
    completedGuidances: 1,
    milestones: { total: 5, completed: 1 },
    // Menunggu Pembimbing 1; mahasiswa membatalkannya.
    changeRequest: { requestType: "title", newTitle: "Aplikasi Pencatatan dan Pelaporan Kegiatan Organisasi", approvedSteps: 0 },
  },
  {
    key: "tunggu_pembimbing_lama",
    email: "ta_tunggu_pembimbing_lama@fti.unand.ac.id",
    fullName: "Uji TA Tunggu Pembimbing Lama",
    nim: "2211529015",
    title: "Sistem Informasi Pengaduan Fasilitas Kampus",
    p1: LECTURER.husnil,
    p2: LECTURER.afriyanti,
    startedMonthsAgo: 3,
    lastActivityDaysAgo: 5,
    completedGuidances: 1,
    milestones: { total: 5, completed: 1 },
    // Ganti Pembimbing 2: menunggu pembimbing sebelumnya (Afriyanti).
    changeRequest: { requestType: "supervisor", supervisorRole: "pembimbing_2", newSupervisor: LECTURER.ullya, approvedSteps: 0 },
  },
  {
    key: "tunggu_pembimbing_baru",
    email: "ta_tunggu_pembimbing_baru@fti.unand.ac.id",
    fullName: "Uji TA Tunggu Pembimbing Baru",
    nim: "2211529016",
    title: "Aplikasi Rekap Nilai Praktikum",
    p1: LECTURER.husnil,
    p2: null,
    startedMonthsAgo: 3,
    lastActivityDaysAgo: 5,
    completedGuidances: 1,
    milestones: { total: 5, completed: 1 },
    // Tambah Pembimbing 2: Pembimbing 1 sudah setuju, menunggu pembimbing baru (Ullya).
    changeRequest: { requestType: "supervisor", supervisorRole: "pembimbing_2", newSupervisor: LECTURER.ullya, approvedSteps: 1 },
  },
  {
    key: "tunggu_kadep",
    email: "ta_tunggu_kadep@fti.unand.ac.id",
    fullName: "Uji TA Tunggu Kadep",
    nim: "2211529017",
    title: "Sistem Informasi Bank Soal Ujian",
    p1: LECTURER.husnil,
    p2: LECTURER.afriyanti,
    startedMonthsAgo: 3,
    lastActivityDaysAgo: 5,
    completedGuidances: 1,
    milestones: { total: 5, completed: 1 },
    // Perubahan judul: Pembimbing 1 sudah setuju, menunggu Ketua Departemen.
    changeRequest: { requestType: "title", newTitle: "Sistem Informasi Bank Soal dan Analisis Butir Ujian", approvedSteps: 1 },
  },
  {
    key: "putus_langsung",
    email: "ta_putus_langsung@fti.unand.ac.id",
    fullName: "Uji TA Putus Langsung",
    nim: "2211529018",
    title: "Aplikasi Manajemen Tugas Kelompok",
    p1: LECTURER.aina,
    p2: null,
    startedMonthsAgo: 3,
    lastActivityDaysAgo: 5,
    completedGuidances: 1,
    milestones: { total: 5, completed: 1 },
    // Ganti Pembimbing 1 (Aina -> Husnil): langkah dosen belum berjalan; Kadep memutuskan langsung.
    changeRequest: { requestType: "supervisor", supervisorRole: "pembimbing_1", newSupervisor: LECTURER.husnil, approvedSteps: 0 },
  },

  // ── E. Evaluasi Bimbingan ──────────────────────────────────────────────────────────
  {
    key: "eval_lanjut",
    email: "ta_eval_lanjut@fti.unand.ac.id",
    fullName: "Uji TA Evaluasi Lanjut",
    nim: "2211529019",
    title: "Sistem Informasi Pengelolaan Beasiswa",
    p1: LECTURER.husnil,
    p2: LECTURER.afriyanti,
    startedMonthsAgo: 7, // evaluasi 6 bulan jatuh tempo -> "Lanjut Bimbingan"
    lastActivityDaysAgo: 20,
    completedGuidances: 5,
    milestones: { total: 5, completed: 3 },
  },
  {
    key: "eval_peringatan",
    email: "ta_eval_peringatan@fti.unand.ac.id",
    fullName: "Uji TA Evaluasi Peringatan",
    nim: "2211529020",
    title: "Aplikasi Monitoring Kegiatan Asisten Laboratorium",
    p1: LECTURER.husnil,
    p2: null,
    startedMonthsAgo: 7, // evaluasi 6 bulan jatuh tempo -> "Peringatan dan Perpanjangan 1 Bulan"
    lastActivityDaysAgo: 95,
    completedGuidances: 2,
    milestones: { total: 5, completed: 1 },
  },
  {
    key: "eval_tindak_lanjut",
    email: "ta_eval_tindak_lanjut@fti.unand.ac.id",
    fullName: "Uji TA Evaluasi Tindak Lanjut",
    nim: "2211529021",
    title: "Sistem Informasi Tracer Study Alumni",
    p1: LECTURER.husnil,
    p2: LECTURER.afriyanti,
    startedMonthsAgo: 9,
    lastActivityDaysAgo: 100,
    completedGuidances: 2,
    milestones: { total: 5, completed: 1 },
    openSessions: 1, // dibatalkan sistem saat mengulang proposal
    // Perpanjangan 1 bulan sudah berakhir: tindak lanjut jatuh tempo -> "Mengulang Proposal".
    evaluation: { recommendation: "extend_1_month", extensionEndedDaysAgo: 3 },
  },
  {
    key: "eval_1tahun",
    email: "ta_eval_1tahun@fti.unand.ac.id",
    fullName: "Uji TA Evaluasi Satu Tahun",
    nim: "2211529022",
    title: "Aplikasi Pengelolaan Arsip Skripsi",
    p1: LECTURER.husnil,
    p2: LECTURER.aina,
    startedMonthsAgo: 13, // evaluasi 1 tahun jatuh tempo -> "Dihentikan"
    lastActivityDaysAgo: 160,
    completedGuidances: 3,
    milestones: { total: 5, completed: 1 },
    openSessions: 1, // dibatalkan sistem saat TA dihentikan
  },
  {
    key: "eval_tunggu_kadep",
    email: "ta_eval_tunggu_kadep@fti.unand.ac.id",
    fullName: "Uji TA Evaluasi Tunggu Kadep",
    nim: "2211529023",
    title: "Sistem Informasi Jadwal Sidang Terpadu",
    p1: LECTURER.husnil,
    p2: null,
    startedMonthsAgo: 7,
    lastActivityDaysAgo: 90,
    completedGuidances: 2,
    milestones: { total: 5, completed: 1 },
    // Evaluasi 6 bulan menunggu Ketua Departemen (untuk skenario "ditolak Kadep").
    evaluation: { recommendation: "extend_1_month", pending: true },
  },

  // ── F. Overview: riwayat ───────────────────────────────────────────────────────────
  {
    key: "riwayat",
    email: "ta_riwayat@fti.unand.ac.id",
    fullName: "Uji TA Riwayat",
    nim: "2211529024",
    title: "Sistem Informasi Layanan Konseling Mahasiswa",
    p1: LECTURER.husnil,
    p2: LECTURER.afriyanti,
    startedMonthsAgo: 2,
    lastActivityDaysAgo: 4,
    completedGuidances: 2,
    milestones: { total: 5, completed: 1 },
    // TA sebelumnya dihentikan lewat evaluasi bimbingan; tampil di tab Riwayat.
    previousThesis: {
      title: "Aplikasi Pemesanan Kantin Kampus",
      startedMonthsAgo: 20,
      endedMonthsAgo: 6,
      terminationReason: "supervision_evaluation",
      terminationNote: "Data uji: dihentikan setelah evaluasi bimbingan 1 tahun.",
    },
  },
];

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
  let user = await prisma.user.findFirst({
    where: { OR: [{ email: account.email }, { identityNumber: account.nim }] },
  });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: account.email,
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
    create: { id: user.id, status: "active", enrollmentYear: 2022, sksCompleted: 138 },
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

/** Completed sessions end at `lastActivityAt`, one week apart going back. */
async function createCompletedGuidances(thesisId, supervisorId, count, lastActivityAt) {
  for (let i = 0; i < count; i++) {
    const approvedDate = new Date(lastActivityAt.getTime() - (count - 1 - i) * 7 * DAY);
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
}

async function createMilestones(thesisId, { total, completed }, lastActivityAt) {
  for (let i = 0; i < total; i++) {
    const isCompleted = i < completed;
    const doneAt = new Date(lastActivityAt.getTime() - (completed - 1 - i) * 10 * DAY);
    await prisma.thesisMilestone.create({
      data: {
        thesisId,
        title: MILESTONE_TITLES[i % MILESTONE_TITLES.length],
        orderIndex: i + 1,
        phase: THESIS_PHASE.RESEARCH,
        status: isCompleted ? "completed" : "not_started",
        progressPercentage: isCompleted ? 100 : 0,
        ...(isCompleted ? { completedAt: doneAt, validatedAt: doneAt, updatedAt: doneAt } : {}),
      },
    });
  }
}

/** Scheduled sessions a few days ahead, so a supervisor change has something to cancel. */
async function createOpenSessions(thesisId, supervisorId, count) {
  for (let i = 0; i < count; i++) {
    const scheduledAt = new Date(NOW.getTime() + (3 + i) * DAY);
    await prisma.thesisGuidance.create({
      data: {
        thesisId,
        supervisorId,
        requestedDate: scheduledAt,
        approvedDate: scheduledAt,
        duration: 60,
        studentNotes: "Bimbingan terjadwal: pembahasan bab berikutnya.",
        status: "accepted",
        phase: THESIS_PHASE.RESEARCH,
      },
    });
  }
}

const CHANGE_REASON = "Data uji: perubahan diajukan setelah diskusi dengan pembimbing.";

/**
 * A pending change request submitted by the student. The steps follow the chain of
 * thesis-change-request.service.js: a title change passes Pembimbing 1; a supervisor change
 * passes the previous supervisor (or Pembimbing 1 when a position is filled for the first
 * time) and then the new supervisor.
 */
async function createChangeRequest(thesis, student, account, ctx) {
  const config = account.changeRequest;
  const p1 = await requireUser(account.p1);
  const steps = [];
  const data = { requestType: config.requestType };

  if (config.requestType === "title") {
    data.previousTitle = thesis.title;
    data.newTitle = config.newTitle;
    steps.push({ role: "main_supervisor", lecturerId: p1.id });
  } else {
    const newSupervisor = await requireUser(config.newSupervisor);
    const currentEmail = config.supervisorRole === "pembimbing_1" ? account.p1 : account.p2;
    const current = currentEmail ? await requireUser(currentEmail) : null;
    data.supervisorRole = config.supervisorRole;
    data.replacedSupervisorLecturerId = current?.id ?? null;
    data.newSupervisorId = newSupervisor.id;
    steps.push(current ? { role: "previous_supervisor", lecturerId: current.id } : { role: "main_supervisor", lecturerId: p1.id });
    steps.push({ role: "new_supervisor", lecturerId: newSupervisor.id });
  }

  const submittedAt = daysAgo(3);
  await prisma.thesisChangeRequest.create({
    data: {
      thesisId: thesis.id,
      reason: CHANGE_REASON,
      requestedByUserId: student.id,
      createdAt: submittedAt,
      ...data,
      approvals: {
        create: steps.map((step, index) => ({
          ...step,
          stepOrder: index + 1,
          ...(index < config.approvedSteps
            ? { status: "approved", decidedAt: daysAgo(2 - index), notes: "Data uji: disetujui." }
            : {}),
        })),
      },
    },
  });
}

/**
 * A guidance evaluation filled by Pembimbing 1. `pending` leaves it for the Ketua
 * Departemen; otherwise it is stored as an approved one-month extension that already ended.
 */
async function createEvaluation(thesis, account, p1Relation, startDate) {
  const config = account.evaluation;
  const kadep = await requireUser(LECTURER.kadep);
  const filledAt = config.pending ? daysAgo(2) : daysAgo(config.extensionEndedDaysAgo + 32);
  const decidedAt = config.pending ? null : new Date(filledAt.getTime() + DAY);
  await prisma.thesisGuidanceEvaluation.create({
    data: {
      thesisId: thesis.id,
      thesisSupervisorId: p1Relation.id,
      evaluationType: "six_month",
      isFollowUp: false,
      observedNoGuidance: true,
      observedNoProgress: true,
      notes: "Data uji: bimbingan jarang dilakukan dan kemajuan belum berarti.",
      guidanceCount: account.completedGuidances ?? 0,
      supervisionStartedAt: startDate,
      elapsedDays: Math.floor((filledAt.getTime() - startDate.getTime()) / DAY),
      recommendation: config.recommendation,
      status: config.pending ? "pending" : "approved",
      createdAt: filledAt,
      ...(config.pending
        ? {}
        : {
          kadepApprovedBy: kadep.id,
          kadepApprovedAt: decidedAt,
          kadepNotes: "Data uji: disetujui.",
          extensionUntil: daysAgo(config.extensionEndedDaysAgo),
        }),
    },
  });
}

/** An earlier thesis of the same student that was stopped, for the Riwayat tab. */
async function createPreviousThesis(student, account, ctx) {
  const config = account.previousThesis;
  const startDate = monthsAgo(config.startedMonthsAgo);
  const endedAt = monthsAgo(config.endedMonthsAgo);
  const thesis = await prisma.thesis.create({
    data: {
      studentId: student.id,
      title: config.title,
      thesisTopicId: ctx.topic.id,
      academicYearId: ctx.academicYear.id,
      startDate,
      createdAt: startDate,
      updatedAt: endedAt,
      status: THESIS_STATUS.FAILED,
      statusChangedAt: endedAt,
      terminationReason: config.terminationReason,
      terminationNote: config.terminationNote,
      terminatedAt: endedAt,
    },
  });
  // A stopped thesis keeps its supervisors only as history (released).
  const p1 = await requireUser(account.p1);
  await prisma.thesisSupervisors.create({
    data: { thesisId: thesis.id, lecturerId: p1.id, roleId: ctx.roles.p1.id, status: "released", activeRoleKey: null },
  });
}

async function seedAccount(account, ctx) {
  const student = await ensureStudent(account, ctx.passwordHash, ctx.roles.student);
  const existing = await prisma.thesis.findFirst({ where: { studentId: student.id } });
  if (existing) {
    console.log(`  ⏭️  ${account.email}: sudah punya tugas akhir, dilewati.`);
    return;
  }

  if (account.previousThesis) await createPreviousThesis(student, account, ctx);

  const startDate = monthsAgo(account.startedMonthsAgo);
  const lastActivityAt = daysAgo(account.lastActivityDaysAgo);
  const leaveStartedAt = account.leave ? daysAgo(account.leave.startedDaysAgo) : null;

  const thesis = await prisma.thesis.create({
    data: {
      studentId: student.id,
      title: account.title,
      thesisTopicId: ctx.topic.id,
      academicYearId: ctx.academicYear.id,
      startDate,
      createdAt: startDate,
      status: account.leave ? THESIS_STATUS.ON_LEAVE : THESIS_STATUS.RESEARCH,
      statusChangedAt: leaveStartedAt ?? startDate,
      ...(account.leave ? { statusBeforeLeave: THESIS_STATUS.RESEARCH, leaveStartedAt } : {}),
    },
  });

  const supervisors = [
    { email: account.p1, role: ctx.roles.p1 },
    ...(account.p2 ? [{ email: account.p2, role: ctx.roles.p2 }] : []),
  ];
  let p1Relation = null;
  for (const supervisor of supervisors) {
    const lecturer = await requireUser(supervisor.email);
    const relation = await prisma.thesisSupervisors.create({
      data: {
        thesisId: thesis.id,
        lecturerId: lecturer.id,
        roleId: supervisor.role.id,
        activeRoleKey: `${thesis.id}:${supervisor.role.id}`,
        seminarReady: !!account.seminarReady,
      },
    });
    if (supervisor.role.id === ctx.roles.p1.id) p1Relation = relation;
  }

  const p1 = await requireUser(account.p1);
  await createCompletedGuidances(thesis.id, p1.id, account.completedGuidances ?? 0, lastActivityAt);
  await createMilestones(thesis.id, account.milestones ?? { total: 0, completed: 0 }, lastActivityAt);
  if (account.openSessions) await createOpenSessions(thesis.id, p1.id, account.openSessions);
  if (account.changeRequest) await createChangeRequest(thesis, student, account, ctx);
  if (account.evaluation) await createEvaluation(thesis, account, p1Relation, startDate);

  if (account.seminar) {
    // `daysAgo` is the day the seminar was held, or the day of a registration that has not
    // been held yet: that one has no schedule, score or result.
    const at = daysAgo(account.seminar.daysAgo);
    const wasHeld = account.seminar.status !== "registered";
    const registeredAt = wasHeld ? new Date(at.getTime() - 14 * DAY) : at;
    await prisma.thesisSeminar.create({
      data: {
        thesisId: thesis.id,
        status: account.seminar.status,
        registeredAt,
        createdAt: registeredAt,
        updatedAt: at,
        ...(wasHeld
          ? {
            verifiedAt: new Date(at.getTime() - 10 * DAY),
            scheduledAt: at,
            date: at,
            finalScore: 82,
            resultFinalizedAt: at,
          }
          : {}),
      },
    });
  }

  console.log(`  ✅ ${account.email}: ${account.fullName}`);
}

async function main() {
  console.log("🚀 Seeding data uji alur tugas akhir (Paket E)...");

  const academicYear = await prisma.academicYear.findFirst({ where: { isActive: true } });
  if (!academicYear) throw new Error("Tidak ada tahun ajaran aktif. Jalankan scripts/seed-master.js lebih dulu.");
  const topic = await prisma.thesisTopic.findFirst({ where: { name: TOPIC_NAME } });
  if (!topic) throw new Error(`Topik "${TOPIC_NAME}" tidak ditemukan. Jalankan scripts/seed-master.js lebih dulu.`);

  const ctx = {
    academicYear,
    topic,
    passwordHash: await bcrypt.hash(DEFAULT_PASSWORD, 10),
    roles: {
      student: await requireRole(ROLES.MAHASISWA),
      p1: await requireRole(ROLES.PEMBIMBING_1),
      p2: await requireRole(ROLES.PEMBIMBING_2),
    },
  };

  for (const account of ACCOUNTS) {
    await seedAccount(account, ctx);
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
