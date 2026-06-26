import prisma from "../src/config/prisma.js";

async function main() {
  const accepted = await prisma.thesis.findMany({
    where: { proposalStatus: "accepted" },
    select: {
      id: true,
      title: true,
      proposalReviewedAt: true,
      finalProposalVersionId: true,
      isProposal: true,
      academicYearId: true,
      student: {
        select: {
          id: true,
          takingThesisCourse: true,
          user: { select: { identityNumber: true, fullName: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`\n📋 All accepted thesis: ${accepted.length}\n`);
  console.log("NIM            | Name                     | reviewedAt           | finalVer | takingCourse | eligible | academicYearId");
  console.log("-".repeat(130));
  for (const t of accepted) {
    const nim = t.student?.user?.identityNumber ?? "?";
    const name = (t.student?.user?.fullName ?? "?").slice(0, 24);
    const reviewed = t.proposalReviewedAt ? t.proposalReviewedAt.toISOString().slice(0, 19) : "null";
    const finalVer = t.finalProposalVersionId ? "yes" : "NO";
    const taking = t.student?.takingThesisCourse === true ? "true" : String(t.student?.takingThesisCourse ?? "null");
    const eligible = !!t.finalProposalVersionId && t.student?.takingThesisCourse === true;
    console.log(`${nim.padEnd(14)} | ${name.padEnd(24)} | ${reviewed.padEnd(19)} | ${finalVer.padEnd(8)} | ${taking.padEnd(12)} | ${String(eligible).padEnd(8)} | ${t.academicYearId ?? "null"}`);
  }

  // Identifikasi yang TIDAK eligible (data invalid: tidak pernah lewat flow resmi)
  const invalid = accepted.filter(
    (t) => !t.proposalReviewedAt || !t.finalProposalVersionId || t.student?.takingThesisCourse !== true,
  );
  console.log(`\n❌ Invalid (will be reset to null): ${invalid.length}`);
  invalid.forEach((t) => {
    console.log(`  ${t.student?.user?.identityNumber} ${t.student?.user?.fullName} — reviewedAt=${t.proposalReviewedAt ? "set" : "null"} finalVer=${!!t.finalProposalVersionId} takingCourse=${t.student?.takingThesisCourse}`);
  });

  // Yang valid (lewat flow resmi, punya proposalReviewedAt + data lengkap)
  const valid = accepted.filter(
    (t) => !!t.proposalReviewedAt && !!t.finalProposalVersionId && t.student?.takingThesisCourse === true,
  );
  console.log(`\n✅ Valid (tetap accepted): ${valid.length}`);
  valid.forEach((t) => {
    console.log(`  ${t.student?.user?.identityNumber} ${t.student?.user?.fullName}`);
  });

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Error:", err?.message || err);
  process.exit(1);
});
