import prisma from "../src/config/prisma.js";
import {
  getKadepTitleReportHistory,
  getStudentProposalApprovalStatus,
  getPendingTitleReports,
} from "../src/services/metopen.service.js";

async function main() {
  console.log("\n════════════════════════════════════════════════════════════");
  console.log(" TEST 1: getKadepTitleReportHistory() — apa yang dikembalikan?");
  console.log("════════════════════════════════════════════════════════════");
  try {
    const history = await getKadepTitleReportHistory();
    console.log(`✅ Returned ${history.length} rows`);
    history.forEach((h, i) => {
      console.log(`  ${i + 1}. ${h.studentNim} ${h.studentName} — proposalStatus=${h.proposalStatus} reviewedAt=${h.reviewedAt?.toISOString() ?? "null"}`);
    });
  } catch (err) {
    console.log(`❌ THREW: ${err?.message || err}`);
    console.log(err?.stack);
  }

  console.log("\n════════════════════════════════════════════════════════════");
  console.log(" TEST 2: getPendingTitleReports() — antrean KaDep sekarang");
  console.log("════════════════════════════════════════════════════════════");
  try {
    const pending = await getPendingTitleReports();
    console.log(`✅ Returned ${pending.length} rows`);
    pending.forEach((p, i) => {
      console.log(`  ${i + 1}. ${p.studentNim} ${p.studentName}`);
    });
  } catch (err) {
    console.log(`❌ THREW: ${err?.message || err}`);
    console.log(err?.stack);
  }

  console.log("\n════════════════════════════════════════════════════════════");
  console.log(" TEST 3: getStudentProposalApprovalStatus untuk 6 thesis accepted");
  console.log("════════════════════════════════════════════════════════════");
  const acceptedTheses = await prisma.thesis.findMany({
    where: { proposalStatus: "accepted" },
    select: { id: true, studentId: true, student: { select: { user: { select: { identityNumber: true, fullName: true } } } } },
  });
  for (const t of acceptedTheses) {
    console.log(`\n  ${t.student?.user?.identityNumber} ${t.student?.user?.fullName}:`);
    try {
      const result = await getStudentProposalApprovalStatus(t.studentId);
      const thesis = result.thesis;
      if (!thesis) {
        console.log("    ❌ thesis=null (findStudentThesis tidak menemukan)");
        continue;
      }
      console.log(`    proposalStatus: ${thesis.proposalStatus}`);
      console.log(`    queueReadiness: ready=${thesis.queueReadiness?.ready} block=${thesis.queueReadiness?.block} proposalStatus=${thesis.queueReadiness?.proposalStatus}`);
      console.log(`    → UI label akan: ${thesis.proposalStatus === "accepted" ? "Disahkan ✅" : "BUKAN Disahkan ⚠️"}`);
    } catch (err) {
      console.log(`    ❌ THREW: ${err?.message || err}`);
    }
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("❌ Fatal:", err?.message || err);
  process.exit(1);
});
