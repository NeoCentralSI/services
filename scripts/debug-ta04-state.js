/**
 * Debug script: verifikasi state thesis yang "sudah disahkan" tapi tidak muncul
 * di riwayat / overview mahasiswa masih "belum masuk antrean".
 *
 * Jalankan: node scripts/debug-ta04-state.js <studentId|thesisId|nim>
 *
 * Output: state lengkap thesis + 5 syarat + queue readiness + history visibility.
 */
import prisma from "../src/config/prisma.js";

async function debugTa04State(identifier) {
  console.log(`\n🔍 Debug TA-04 state untuk identifier: "${identifier}"\n`);

  // Cari thesis by studentId, thesisId, atau NIM (via User.identityNumber).
  let student = null;
  let thesis = null;

  // Coba by NIM (identityNumber di User).
  const user = await prisma.user.findFirst({
    where: { identityNumber: identifier },
    select: { id: true, fullName: true, identityNumber: true },
  });
  if (user) {
    student = await prisma.student.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        eligibleMetopen: true,
        takingThesisCourse: true,
        thesisCourseEnrollmentSource: true,
      },
    });
  }

  // Cari thesis by studentId atau thesisId langsung.
  if (student) {
    thesis = await prisma.thesis.findFirst({
      where: { studentId: student.id },
      orderBy: { createdAt: "desc" },
    });
  } else {
    thesis = await prisma.thesis.findUnique({ where: { id: identifier } }).catch(() => null);
    if (thesis) {
      student = await prisma.student.findUnique({
        where: { id: thesis.studentId },
        select: { id: true, eligibleMetopen: true, takingThesisCourse: true },
      });
      if (student) {
        const u = await prisma.user.findUnique({
          where: { id: student.id },
          select: { fullName: true, identityNumber: true },
        });
        if (u) console.log(`👤 Mahasiswa: ${u.fullName} (${u.identityNumber})`);
      }
    }
  }

  if (!thesis) {
    console.log("❌ Thesis tidak ditemukan. Cek identifier (studentId/thesisId/NIM).");
    return;
  }

  console.log("─".repeat(60));
  console.log("📋 THESIS STATE");
  console.log("─".repeat(60));
  console.log(`  thesisId: ${thesis.id}`);
  console.log(`  title: ${thesis.title ?? "(kosong)"}`);
  console.log(`  proposalStatus: "${thesis.proposalStatus}"  ← HARUS "accepted" jika sudah disahkan`);
  console.log(`  isProposal: ${thesis.isProposal}`);
  console.log(`  thesisStatusId: ${thesis.thesisStatusId ?? "(null)"}  ← HARUS ter-set jika sudah disahkan`);
  console.log(`  finalProposalVersionId: ${thesis.finalProposalVersionId ?? "(null)"}`);
  console.log(`  academicYearId: ${thesis.academicYearId ?? "(null)"}`);
  console.log(`  proposalReviewedAt: ${thesis.proposalReviewedAt?.toISOString() ?? "(null)"}`);
  console.log(`  proposalReviewedByUserId: ${thesis.proposalReviewedByUserId ?? "(null)"}`);
  console.log(`  titleApprovalDocumentId: ${thesis.titleApprovalDocumentId ?? "(null)"}`);

  console.log("\n─".repeat(60));
  console.log("👨‍🎓 STUDENT STATE");
  console.log("─".repeat(60));
  if (!student) {
    console.log("  ❌ Student tidak ditemukan");
  } else {
    console.log(`  studentId: ${student.id}`);
    console.log(`  eligibleMetopen: ${student.eligibleMetopen}`);
    console.log(`  takingThesisCourse: ${student.takingThesisCourse}  ← HARUS true untuk TA-04`);
  }

  console.log("\n─".repeat(60));
  console.log("👥 PEMBIMBING (ThesisParticipant active)");
  console.log("─".repeat(60));
  const supervisors = await prisma.thesisParticipant.findMany({
    where: { thesisId: thesis.id, status: "active" },
    include: { role: { select: { name: true } }, lecturer: { include: { user: { select: { fullName: true } } } } },
  });
  if (supervisors.length === 0) {
    console.log("  ❌ Tidak ada pembimbing aktif (P1 wajib!)");
  } else {
    supervisors.forEach((s, i) => {
      console.log(`  ${i + 1}. ${s.role?.name} — ${s.lecturer?.user?.fullName ?? "?"}`);
    });
  }

  console.log("\n─".repeat(60));
  console.log("📝 NILAI TA-03 (ResearchMethodScore)");
  console.log("─".repeat(60));
  const score = await prisma.researchMethodScore.findFirst({
    where: { thesisId: thesis.id },
    orderBy: { createdAt: "desc" },
    select: {
      supervisorScore: true,
      lecturerScore: true,
      finalScore: true,
      isFinalized: true,
      coSignedAt: true,
      coSignedByLecturerId: true,
      attendanceAutoZeroedAt: true,
    },
  });
  if (!score) {
    console.log("  ❌ Tidak ada ResearchMethodScore");
  } else {
    console.log(`  supervisorScore: ${score.supervisorScore ?? "(null)"}`);
    console.log(`  lecturerScore: ${score.lecturerScore ?? "(null)"}`);
    console.log(`  finalScore: ${score.finalScore ?? "(null)"}`);
    console.log(`  isFinalized: ${score.isFinalized}  ← HARUS true untuk TA-04`);
    console.log(`  coSignedAt: ${score.coSignedAt?.toISOString() ?? "(null)"}`);
    console.log(`  coSignedByLecturerId: ${score.coSignedByLecturerId ?? "(null)"}`);
    console.log(`  attendanceAutoZeroedAt: ${score.attendanceAutoZeroedAt?.toISOString() ?? "(null)"}`);
  }

  console.log("\n─".repeat(60));
  console.log("✅ DIAGNOSA 5 SYARAT TA-04");
  console.log("─".repeat(60));
  const hasP1 = supervisors.some((s) => s.role?.name === "Pembimbing 1");
  const hasP2 = supervisors.some((s) => s.role?.name === "Pembimbing 2");
  const checks = [
    { label: "1. Pembimbing resmi P1 aktif", ok: hasP1 },
    { label: "2. Proposal final disubmit", ok: !!thesis.finalProposalVersionId },
    {
      label: "3. TA-03A (P1 + P2 cosign bila ada)",
      ok: !!score?.supervisorScore && (!hasP2 || (!!score.coSignedAt && !!score.coSignedByLecturerId)),
    },
    { label: "4. TA-03B (Koordinator)", ok: score?.lecturerScore != null },
    { label: "5. SIA takingThesisCourse=true", ok: student?.takingThesisCourse === true },
    { label: "6. isFinalized=true", ok: score?.isFinalized === true },
    { label: "7. Bukan auto-zero", ok: score?.attendanceAutoZeroedAt == null },
  ];
  checks.forEach((c) => console.log(`  ${c.ok ? "✅" : "❌"} ${c.label}`));
  const allOk = checks.every((c) => c.ok);

  console.log("\n─".repeat(60));
  console.log("🔍 RIWAYAT PENGESAHAN (getKadepTitleReportHistory visibility)");
  console.log("─".repeat(60));
  const isInHistory = thesis.proposalStatus === "accepted" || thesis.proposalStatus === "rejected";
  console.log(`  proposalStatus: "${thesis.proposalStatus}"`);
  console.log(`  Akan muncul di riwayat? ${isInHistory ? "YA (filter accepted/rejected)" : "TIDAK — status bukan accepted/rejected"}`);

  console.log("\n─".repeat(60));
  console.log("🎯 KESIMPULAN");
  console.log("─".repeat(60));
  if (thesis.proposalStatus === "accepted") {
    console.log('  ✅ proposalStatus="accepted" — seharusnya MUNCUL di riwayat + overview tampil "Disahkan".');
    console.log("  Jika tetap tidak muncul → kemungkinan:");
    console.log("    a. Backend belum di-restart dengan kode terbaru (jalankan: pnpm run dev)");
    console.log("    b. Cache frontend stale (hard refresh: Ctrl+Shift+R)");
    console.log("    c. API /metopen/kadep/title-reports/history throw 500 — cek Network tab & log backend");
  } else if (thesis.proposalStatus === "submitted") {
    console.log('  ⚠️  proposalStatus="submitted" — masih di antrean, BELUM disahkan.');
    console.log('  KaDep perlu klik "Sahkan TA-04" di tab Pengesahan.');
    console.log("  Jika KaDep sudah klik tapi gagal, cek toast error / log backend.");
  } else if (thesis.proposalStatus === null) {
    console.log("  ❌ proposalStatus=null — belum pernah masuk antrean KaDep.");
    console.log("  5 syarat TA-04: " + (allOk ? "SEMUA terpenuhi → syncProposalQueue seharusnya enqueue" : "BELUM terpenuhi (lihat ❌ di atas)"));
    if (allOk) {
      console.log('  Semua syarat OK tapi belum enqueue → coba POST /metopen/me/proposal-queue/sync');
      console.log("  atau jalankan SIA sync job untuk trigger syncKadepProposalQueueForStudent.");
    }
  } else {
    console.log(`  ⚠️  proposalStatus="${thesis.proposalStatus}" — status intermediate.`);
  }

  console.log("\n─".repeat(60));
  console.log("💡 REKOMENDASI");
  console.log("─".repeat(60));
  console.log("  1. Restart backend: cd services && pnpm run dev");
  console.log("  2. Hard refresh frontend: Ctrl+Shift+R");
  console.log('  3. Cek Network tab saat klik "Sahkan":');
  console.log('     - POST .../title-report/review → response harus 200 {proposalStatus:"accepted"}');
  console.log("     - GET .../title-reports/history → harus berisi thesis ini");
  console.log('     - GET .../me/proposal-approval → queueReadiness.proposalStatus harus "accepted"');
  console.log('  4. Jika POST review return 400 → baca pesan error (re-assert 5 syarat gagal)');

  await prisma.$disconnect();
}

const identifier = process.argv[2];
if (!identifier) {
  console.log("Usage: node scripts/debug-ta04-state.js <studentId|thesisId|nim>");
  console.log("Contoh: node scripts/debug-ta04-state.js 2399000001");
  process.exit(1);
}

debugTa04State(identifier).catch((err) => {
  console.error("❌ Debug script error:", err?.message || err);
  process.exit(1);
});
