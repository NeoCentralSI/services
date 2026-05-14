/**
 * Seed Seminar-Ready Data (Bimbingan Only)
 *
 * Makes a list of students seminar-ready by fulfilling bimbingan and supervisor requirements:
 *   1. Creates additional completed guidances (to reach MIN_BIMBINGAN = 8)
 *   2. Sets all supervisors' seminarReady = true
 *
 * Target Students:
 *   - Mustafa (2211522036)
 *   - Nabil (2211522018)
 *   - Ilham (2211522028)
 *   - Khalied (2211523030)
 *   - Fariz (2211523034)
 *   - Nouval (2211521020)
 *
 * Usage:
 *   node scripts/seed-seminar-ready.js
 *   node scripts/seed-seminar-ready.js --reset
 *
 * Note: Attendance requirements are now handled via archive/manual entry, so they are removed from this script.
 */

import { PrismaClient } from "../src/generated/prisma/index.js";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

const MIN_BIMBINGAN = 8;
const TARGET_IDENTITIES = [
  "2211522036", // Mustafa Fathur Rahman
  "2211522018", // Nabil
  "2211522028", // Ilham
  "2211523030", // Khalied
  "2211523034", // Fariz
  "2211521020", // Nouval
];

// ============================================================
// HELPERS
// ============================================================

function parseArgs() {
  const args = process.argv.slice(2);
  let reset = false;

  for (const arg of args) {
    if (arg === "--reset") {
      reset = true;
    }
  }

  return { reset };
}

async function getStudentData(identityNumber) {
  const user = await prisma.user.findFirst({
    where: { identityNumber },
    include: {
      student: true,
    },
  });

  if (!user || !user.student) {
    console.warn(`  ⚠️ Student with identity number ${identityNumber} not found, skipping.`);
    return null;
  }

  const thesis = await prisma.thesis.findFirst({
    where: { studentId: user.student.id },
    include: {
      thesisSupervisors: {
        include: {
          lecturer: { include: { user: true } },
        },
      },
      thesisGuidances: {
        where: { status: "completed" },
      },
    },
  });

  if (!thesis) {
    console.warn(`  ⚠️ No thesis found for student ${user.fullName}, skipping.`);
    return null;
  }

  return { user, student: user.student, thesis };
}

// ============================================================
// 1. SEED EXTRA GUIDANCES
// ============================================================
async function seedGuidances(thesis) {
  const completedCount = thesis.thesisGuidances.length;
  const needed = MIN_BIMBINGAN - completedCount;

  if (needed <= 0) {
    console.log(`  ⏭️  Already has ${completedCount}/${MIN_BIMBINGAN} completed guidances`);
    return;
  }

  console.log(`  📋 Adding ${needed} completed guidances (${completedCount} → ${MIN_BIMBINGAN})`);

  const primarySupervisor = thesis.thesisSupervisors[0];
  if (!primarySupervisor) {
    console.warn("  ⚠️ No supervisor found for thesis, skipping guidances.");
    return;
  }

  const topics = [
    "Review progress implementasi fitur utama",
    "Konsultasi desain arsitektur sistem",
    "Review BAB IV - Hasil dan Pembahasan",
    "Konsultasi pengujian dan analisis hasil",
    "Diskusi perbaikan dan optimasi sistem",
    "Review draft laporan tugas akhir",
    "Konsultasi persiapan seminar hasil",
    "Review presentasi seminar hasil",
  ];

  const feedbacks = [
    "Progress baik, lanjutkan implementasi fitur berikutnya.",
    "Arsitektur sudah sesuai. Tambahkan error handling yang lebih komprehensif.",
    "Penulisan sudah rapi. Perbaiki caption gambar dan tabel.",
    "Hasil pengujian sudah lengkap. Analisis perlu diperdalam.",
    "Optimasi sudah terlihat hasilnya. Dokumentasikan perbandingan performa.",
    "Draft laporan sudah 90% lengkap. Perbaiki abstrak dan kesimpulan.",
    "Persiapan sudah matang. Perhatikan waktu presentasi.",
    "Slide presentasi sudah baik. Fokus pada demo sistem saat seminar.",
  ];

  // Use recent dates
  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() - (needed * 7)); // Look back 1 week per guidance needed

  for (let i = 0; i < needed; i++) {
    const date = new Date(baseDate);
    date.setDate(baseDate.getDate() + i * 7); 

    await prisma.thesisGuidance.create({
      data: {
        thesisId: thesis.id,
        supervisorId: primarySupervisor.lecturerId,
        requestedDate: date,
        approvedDate: date,
        duration: 60,
        studentNotes: topics[i % topics.length],
        supervisorFeedback: feedbacks[i % feedbacks.length],
        sessionSummary: `Bimbingan membahas ${topics[i % topics.length].toLowerCase()}. (Seeded for readiness)`,
        status: "completed",
        completedAt: new Date(date.getTime() + 60 * 60 * 1000),
      },
    });
    console.log(`    ✅ Guidance #${completedCount + i + 1}: ${date.toISOString().split("T")[0]} - ${topics[i % topics.length].slice(0, 50)}`);
  }
}

// ============================================================
// 2. SET SUPERVISOR SEMINAR READY
// ============================================================
async function setSupervisorReady(thesis) {
  const supervisors = thesis.thesisSupervisors;

  if (supervisors.length === 0) {
    console.warn("  ⚠️ No supervisors found to mark as ready.");
    return;
  }

  await prisma.thesisSupervisors.updateMany({
    where: { thesisId: thesis.id },
    data: { seminarReady: true },
  });

  console.log(`    ✅ All ${supervisors.length} supervisors marked as seminarReady = true`);
}

// ============================================================
// RESET: Undo seminar-ready state (Bimbingan Only)
// ============================================================
async function resetSeminarReady(student, thesis) {
  // 1. Delete seeded guidances (those with the specific summary tag)
  const deletedGuidances = await prisma.thesisGuidance.deleteMany({
    where: {
      thesisId: thesis.id,
      status: "completed",
      sessionSummary: { contains: "(Seeded for readiness)" },
    },
  });
  console.log(`  🗑️  Deleted ${deletedGuidances.count} seeded guidances`);

  // 2. Reset supervisor seminarReady
  await prisma.thesisSupervisors.updateMany({
    where: { thesisId: thesis.id },
    data: { seminarReady: false },
  });
  console.log(`  🗑️  Reset all supervisors seminarReady = false`);
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  const { reset } = parseArgs();

  console.log("\n" + "=".repeat(60));
  console.log("🎓 SEED SEMINAR-READY DATA (BIMBINGAN ONLY)");
  console.log("=".repeat(60));
  console.log(`📅 Date: ${new Date().toISOString()}`);
  console.log(`🎯 Threshold: MIN_BIMBINGAN=${MIN_BIMBINGAN}`);
  console.log(`${reset ? "🔄 Mode: RESET" : "🌱 Mode: SEED"}`);
  console.log("=".repeat(60));

  for (const identity of TARGET_IDENTITIES) {
    const data = await getStudentData(identity);
    if (!data) continue;

    const { user, student, thesis } = data;
    console.log(`\n👤 Processing: ${user.fullName} (${identity})`);

    if (reset) {
      await resetSeminarReady(student, thesis);
    } else {
      await seedGuidances(thesis);
      await setSupervisorReady(thesis);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("✨ OPERATION COMPLETE!");
  console.log("=".repeat(60) + "\n");
}

main()
  .catch((e) => {
    console.error("\n❌ Error:", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
