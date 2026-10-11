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
 * - `lastActivityDaysAgo`: date of the last activity. It is written to `thesis.updatedAt`
 *   and to the latest completed session/milestone, so the derived activity level is the
 *   one named in the comment.
 * - `completedGuidances` / `milestones`: completed research-phase sessions and milestones
 *   ({ total, completed }).
 * - `seminar`: a results seminar row with the given status.
 * - `leave`: thesis on leave since `startedDaysAgo`.
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

async function seedAccount(account, ctx) {
  const student = await ensureStudent(account, ctx.passwordHash, ctx.roles.student);
  const existing = await prisma.thesis.findFirst({ where: { studentId: student.id } });
  if (existing) {
    console.log(`  ⏭️  ${account.email}: sudah punya tugas akhir, dilewati.`);
    return;
  }

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
      // `updatedAt` is one of the activity sources, so it is written explicitly.
      updatedAt: lastActivityAt,
      status: account.leave ? THESIS_STATUS.ON_LEAVE : THESIS_STATUS.RESEARCH,
      statusChangedAt: leaveStartedAt ?? startDate,
      ...(account.leave ? { statusBeforeLeave: THESIS_STATUS.RESEARCH, leaveStartedAt } : {}),
    },
  });

  const supervisors = [
    { email: account.p1, role: ctx.roles.p1 },
    ...(account.p2 ? [{ email: account.p2, role: ctx.roles.p2 }] : []),
  ];
  for (const supervisor of supervisors) {
    const lecturer = await requireUser(supervisor.email);
    await prisma.thesisSupervisors.create({
      data: {
        thesisId: thesis.id,
        lecturerId: lecturer.id,
        roleId: supervisor.role.id,
        activeRoleKey: `${thesis.id}:${supervisor.role.id}`,
        seminarReady: !!account.seminarReady,
      },
    });
  }

  const p1 = await requireUser(account.p1);
  await createCompletedGuidances(thesis.id, p1.id, account.completedGuidances ?? 0, lastActivityAt);
  await createMilestones(thesis.id, account.milestones ?? { total: 0, completed: 0 }, lastActivityAt);

  if (account.seminar) {
    const heldAt = daysAgo(account.seminar.daysAgo);
    await prisma.thesisSeminar.create({
      data: {
        thesisId: thesis.id,
        status: account.seminar.status,
        registeredAt: new Date(heldAt.getTime() - 14 * DAY),
        verifiedAt: new Date(heldAt.getTime() - 10 * DAY),
        scheduledAt: heldAt,
        date: heldAt,
        finalScore: 82,
        resultFinalizedAt: heldAt,
        createdAt: new Date(heldAt.getTime() - 14 * DAY),
        updatedAt: heldAt,
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
