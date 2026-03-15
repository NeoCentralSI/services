/**
 * Seed Seminar-Ready Data
 *
 * Makes a student seminar-ready by fulfilling all checklist requirements:
 *   1. Creates additional completed guidances (to reach MIN_BIMBINGAN)
 *   2. Creates mock seminars from other students + attendance records (to reach MIN_KEHADIRAN)
 *   3. Sets all supervisors' seminarReady = true
 *
 * Usage:
 *   node scripts/seed-seminar-ready.js                    # default: mustafa_2211522036
 *   node scripts/seed-seminar-ready.js 2211522018         # specify student by identity number
 *   node scripts/seed-seminar-ready.js --reset            # reset seminar-ready state for default student
 *   node scripts/seed-seminar-ready.js 2211522018 --reset # reset specific student
 *
 * Respects env: SEMINAR_MIN_BIMBINGAN (default 8), SEMINAR_MIN_KEHADIRAN (default 8)
 */

import { PrismaClient } from "../src/generated/prisma/index.js";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

const MIN_BIMBINGAN = Number(process.env.SEMINAR_MIN_BIMBINGAN) || 8;
const MIN_KEHADIRAN = Number(process.env.SEMINAR_MIN_KEHADIRAN) || 8;
const DEFAULT_IDENTITY = "2211522036"; // Mustafa Fathur Rahman

// ============================================================
// HELPERS
// ============================================================

function parseArgs() {
  const args = process.argv.slice(2);
  let identityNumber = DEFAULT_IDENTITY;
  let reset = false;

  for (const arg of args) {
    if (arg === "--reset") {
      reset = true;
    } else if (/^\d+$/.test(arg)) {
      identityNumber = arg;
    }
  }

  return { identityNumber, reset };
}

async function getStudentData(identityNumber) {
  const user = await prisma.user.findFirst({
    where: { identityNumber },
    include: {
      student: true,
    },
  });

  if (!user || !user.student) {
    throw new Error(`Student with identity number ${identityNumber} not found`);
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
    throw new Error(`No thesis found for student ${user.fullName}`);
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

  console.log(`  📋 Adding ${needed} completed guidances (${completedCount} → ${completedCount + needed})`);

  const primarySupervisor = thesis.thesisSupervisors[0];
  if (!primarySupervisor) {
    throw new Error("No supervisor found for thesis");
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

  // Start dates after existing guidances
  const baseDate = new Date("2025-12-01");

  for (let i = 0; i < needed; i++) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() + i * 14); // every 2 weeks

    await prisma.thesisGuidance.create({
      data: {
        thesisId: thesis.id,
        supervisorId: primarySupervisor.lecturerId,
        requestedDate: date,
        approvedDate: date,
        duration: 60,
        studentNotes: topics[i % topics.length],
        supervisorFeedback: feedbacks[i % feedbacks.length],
        sessionSummary: `Bimbingan membahas ${topics[i % topics.length].toLowerCase()}. Mahasiswa menunjukkan progress yang baik.`,
        status: "completed",
        completedAt: new Date(date.getTime() + 60 * 60 * 1000),
      },
    });
    console.log(`    ✅ Guidance #${completedCount + i + 1}: ${date.toISOString().split("T")[0]} - ${topics[i % topics.length].slice(0, 50)}`);
  }
}

// ============================================================
// 2. SEED SEMINAR ATTENDANCE
// ============================================================
async function seedAttendance(student, thesis) {
  // Count existing attendance
  const existingAttendance = await prisma.thesisSeminarAudience.count({
    where: {
      studentId: student.id,
      isPresent: true,
    },
  });

  const needed = MIN_KEHADIRAN - existingAttendance;

  if (needed <= 0) {
    console.log(`  ⏭️  Already has ${existingAttendance}/${MIN_KEHADIRAN} seminar attendances`);
    return;
  }

  console.log(`  📋 Creating ${needed} seminar attendance records (${existingAttendance} → ${existingAttendance + needed})`);

  // Find other students' theses (not this student's) to create mock seminars
  const otherTheses = await prisma.thesis.findMany({
    where: {
      studentId: { not: student.id },
    },
    include: {
      student: {
        include: { user: true },
      },
    },
    take: needed,
  });

  if (otherTheses.length < needed) {
    console.log(`  ⚠️  Only ${otherTheses.length} other theses available (need ${needed}). Will create what we can.`);
  }

  const baseDate = new Date("2025-10-01");

  // Get the first supervisor for approvedBy
  const approver = thesis.thesisSupervisors[0];

  for (let i = 0; i < Math.min(needed, otherTheses.length); i++) {
    const otherThesis = otherTheses[i];
    const seminarDate = new Date(baseDate);
    seminarDate.setDate(seminarDate.getDate() + i * 7); // weekly

    // Check if this other thesis already has a passed seminar
    let seminar = await prisma.thesisSeminar.findFirst({
      where: {
        thesisId: otherThesis.id,
        status: "passed",
      },
    });

    // Create a mock passed seminar if none exists
    if (!seminar) {
      seminar = await prisma.thesisSeminar.create({
        data: {
          thesisId: otherThesis.id,
          status: "passed",
          registeredAt: new Date(seminarDate.getTime() - 14 * 24 * 60 * 60 * 1000),
          date: seminarDate,
          startTime: new Date("1970-01-01T09:00:00"),
          endTime: new Date("1970-01-01T11:00:00"),
          finalScore: 75 + Math.floor(Math.random() * 15),
          grade: "B+",
          resultFinalizedAt: seminarDate,
        },
      });
      console.log(`    📝 Created mock seminar for ${otherThesis.student?.user?.fullName || "unknown"}`);
    }

    // Check if audience record already exists
    const existing = await prisma.thesisSeminarAudience.findUnique({
      where: {
        thesisSeminarId_studentId: {
          thesisSeminarId: seminar.id,
          studentId: student.id,
        },
      },
    });

    if (!existing) {
      await prisma.thesisSeminarAudience.create({
        data: {
          thesisSeminarId: seminar.id,
          studentId: student.id,
          isPresent: true,
          registeredAt: new Date(seminarDate.getTime() - 7 * 24 * 60 * 60 * 1000),
          approvedAt: seminarDate,
          approvedBy: approver?.id || null,
        },
      });
      console.log(`    ✅ Attendance #${existingAttendance + i + 1}: ${seminarDate.toISOString().split("T")[0]} - ${otherThesis.student?.user?.fullName || "Seminar"}`);
    } else {
      console.log(`    ⏭️  Attendance already exists for seminar of ${otherThesis.student?.user?.fullName || "unknown"}`);
    }
  }
}

// ============================================================
// 3. SET SUPERVISOR SEMINAR READY
// ============================================================
async function setSupervisorReady(thesis) {
  const supervisors = thesis.thesisSupervisors;

  if (supervisors.every((s) => s.seminarReady)) {
    console.log(`  ⏭️  All ${supervisors.length} supervisors already marked seminarReady`);
    return;
  }

  await prisma.thesisSupervisors.updateMany({
    where: { thesisId: thesis.id },
    data: { seminarReady: true },
  });

  for (const sup of supervisors) {
    const name = sup.lecturer?.user?.fullName || sup.lecturerId;
    console.log(`    ✅ ${name}: seminarReady = true`);
  }
}

// ============================================================
// RESET: Undo seminar-ready state
// ============================================================
async function resetSeminarReady(student, thesis) {
  console.log("\n🔄 RESETTING seminar-ready state...\n");

  // 1. Delete seeded guidances (those with specific session summaries from this script)
  const deletedGuidances = await prisma.thesisGuidance.deleteMany({
    where: {
      thesisId: thesis.id,
      status: "completed",
      sessionSummary: { contains: "Mahasiswa menunjukkan progress yang baik" },
    },
  });
  console.log(`  🗑️  Deleted ${deletedGuidances.count} seeded guidances`);

  // 2. Delete audience records for this student
  const deletedAudiences = await prisma.thesisSeminarAudience.deleteMany({
    where: { studentId: student.id },
  });
  console.log(`  🗑️  Deleted ${deletedAudiences.count} audience records`);

  // 3. Delete mock seminars created by this script (passed seminars for other students that have no examiners)
  const otherTheses = await prisma.thesis.findMany({
    where: { studentId: { not: student.id } },
    select: { id: true },
  });
  const otherThesisIds = otherTheses.map((t) => t.id);

  const mockSeminars = await prisma.thesisSeminar.findMany({
    where: {
      thesisId: { in: otherThesisIds },
      status: "passed",
      examiners: { none: {} },
    },
    select: { id: true },
  });

  if (mockSeminars.length > 0) {
    // Delete audiences first (FK constraint)
    await prisma.thesisSeminarAudience.deleteMany({
      where: { thesisSeminarId: { in: mockSeminars.map((s) => s.id) } },
    });
    const deletedSeminars = await prisma.thesisSeminar.deleteMany({
      where: { id: { in: mockSeminars.map((s) => s.id) } },
    });
    console.log(`  🗑️  Deleted ${deletedSeminars.count} mock seminars`);
  }

  // 4. Reset supervisor seminarReady
  await prisma.thesisSupervisors.updateMany({
    where: { thesisId: thesis.id },
    data: { seminarReady: false },
  });
  console.log(`  🗑️  Reset all supervisors seminarReady = false`);

  console.log("\n✅ Reset complete. Student is back to pre-seminar state.");
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  const { identityNumber, reset } = parseArgs();

  console.log("\n" + "=".repeat(60));
  console.log("🎓 SEED SEMINAR-READY DATA");
  console.log("=".repeat(60));
  console.log(`📅 Date: ${new Date().toISOString()}`);
  console.log(`🎯 Student: ${identityNumber}`);
  console.log(`📊 Thresholds: MIN_BIMBINGAN=${MIN_BIMBINGAN}, MIN_KEHADIRAN=${MIN_KEHADIRAN}`);
  console.log(`${reset ? "🔄 Mode: RESET" : "🌱 Mode: SEED"}`);
  console.log("=".repeat(60));

  const { user, student, thesis } = await getStudentData(identityNumber);
  console.log(`\n👤 Student: ${user.fullName} (${identityNumber})`);
  console.log(`📖 Thesis: ${thesis.title}`);
  console.log(`👥 Supervisors: ${thesis.thesisSupervisors.map((s) => s.lecturer?.user?.fullName).join(", ")}`);

  if (reset) {
    await resetSeminarReady(student, thesis);
  } else {
    console.log("\n--- 1. Guidances ---");
    await seedGuidances(thesis);

    console.log("\n--- 2. Seminar Attendance ---");
    await seedAttendance(student, thesis);

    console.log("\n--- 3. Supervisor Readiness ---");
    await setSupervisorReady(thesis);

    // Summary
    const finalGuidanceCount = await prisma.thesisGuidance.count({
      where: { thesisId: thesis.id, status: "completed" },
    });
    const finalAttendanceCount = await prisma.thesisSeminarAudience.count({
      where: { studentId: student.id, isPresent: true },
    });

    console.log("\n" + "=".repeat(60));
    console.log("✨ SEED COMPLETE!");
    console.log("=".repeat(60));
    console.log(`   📆 Guidances: ${finalGuidanceCount}/${MIN_BIMBINGAN} ${finalGuidanceCount >= MIN_BIMBINGAN ? "✅" : "❌"}`);
    console.log(`   👥 Attendance: ${finalAttendanceCount}/${MIN_KEHADIRAN} ${finalAttendanceCount >= MIN_KEHADIRAN ? "✅" : "❌"}`);
    console.log(`   ✅ Supervisors: All seminarReady = true`);
    console.log(`   🎯 All checklist met: ${finalGuidanceCount >= MIN_BIMBINGAN && finalAttendanceCount >= MIN_KEHADIRAN ? "YES ✅" : "NO ❌"}`);
  }
}

main()
  .catch((e) => {
    console.error("\n❌ Error:", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
