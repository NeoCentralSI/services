import prisma from "../src/config/prisma.js";

/**
 * Cleanup script: Reset thesis yang berstatus "accepted" tapi TIDAK pernah lewat
 * flow pengesahan resmi (proposalReviewedAt=null) ATAU data tidak lengkap
 * (tidak ada proposal final / SIA tidak konfirmasi MK TA).
 *
 * Thesis seperti ini adalah data legacy/test yang di-accept manual di DB, bukan
 * via reviewTitleReport KaDep. Mereka tidak memenuhi syarat batch TA-04 dan
 * menyesatkan UI (badge "Disahkan" padahal tidak pernah disahkan resmi).
 *
 * Reset ke proposalStatus=null + isProposal=true = kembali ke state akurat
 * "belum disahkan". Thesis tetap ada (tidak delete) untuk data historis.
 */
async function main() {
  const invalid = await prisma.thesis.findMany({
    where: {
      proposalStatus: "accepted",
      OR: [
        { proposalReviewedAt: null },
        { finalProposalVersionId: null },
        { student: { takingThesisCourse: { not: true } } },
      ],
    },
    select: {
      id: true,
      title: true,
      proposalReviewedAt: true,
      finalProposalVersionId: true,
      isProposal: true,
      student: {
        select: {
          takingThesisCourse: true,
          user: { select: { identityNumber: true, fullName: true } },
        },
      },
    },
  });

  if (invalid.length === 0) {
    console.log("✅ Tidak ada thesis invalid. Semua accepted thesis sudah lewat flow resmi.");
    await prisma.$disconnect();
    return;
  }

  console.log(`\n🔧 Reset ${invalid.length} thesis invalid (accepted → null):\n`);
  for (const t of invalid) {
    console.log(`  ${t.student?.user?.identityNumber} ${t.student?.user?.fullName}`);
    console.log(`    id: ${t.id}`);
    console.log(`    reviewedAt: ${t.proposalReviewedAt ? "set" : "null"}, finalVer: ${!!t.finalProposalVersionId}, takingCourse: ${t.student?.takingThesisCourse}`);
  }

  const ids = invalid.map((t) => t.id);
  const result = await prisma.thesis.updateMany({
    where: { id: { in: ids } },
    data: {
      proposalStatus: null,
      isProposal: true,
      proposalReviewedAt: null,
      proposalReviewedByUserId: null,
      proposalReviewNotes: null,
    },
  });

  console.log(`\n✅ Reset complete: ${result.count} thesis updated.`);
  console.log("   proposalStatus=null, isProposal=true, audit pengesahan dibersihkan.");

  // Verifikasi: cek thesis accepted tersisa
  const remainingAccepted = await prisma.thesis.count({
    where: { proposalStatus: "accepted" },
  });
  console.log(`\n📊 Thesis accepted tersisa: ${remainingAccepted}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("❌ Error:", err?.message || err);
  process.exit(1);
});
