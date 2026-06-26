import prisma from "../src/config/prisma.js";

async function main() {
  const theses = await prisma.thesis.findMany({
    select: {
      id: true,
      title: true,
      proposalStatus: true,
      isProposal: true,
      thesisStatusId: true,
      finalProposalVersionId: true,
      academicYearId: true,
      proposalReviewedAt: true,
      createdAt: true,
      student: {
        select: {
          id: true,
          eligibleMetopen: true,
          takingThesisCourse: true,
          user: { select: { fullName: true, identityNumber: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  console.log(`\n📋 Total thesis (latest 30): ${theses.length}`);
  console.log("─".repeat(120));
  console.log("proposalStatus | isProposal | takingThesisCourse | finalProposalVersionId | title");
  console.log("─".repeat(120));
  for (const t of theses) {
    const nim = t.student?.user?.identityNumber ?? "?";
    const name = t.student?.user?.fullName ?? "?";
    console.log(
      `${(t.proposalStatus ?? "null").padEnd(16)} | ${String(t.isProposal).padEnd(10)} | ${String(t.student?.takingThesisCourse ?? "null").padEnd(18)} | ${(t.finalProposalVersionId ? "yes" : "NO").padEnd(20)} | ${nim} ${name} — ${(t.title ?? "(no title)").slice(0, 40)}`,
    );
  }

  const statusCounts = await prisma.thesis.groupBy({
    by: ["proposalStatus"],
    _count: true,
  });
  console.log("\n📊 Status distribution:");
  statusCounts.forEach((s) => {
    console.log(`  ${s.proposalStatus ?? "null"}: ${s._count}`);
  });

  // Cek thesisStatus entries
  const thesisStatuses = await prisma.thesisStatus.findMany({ select: { id: true, name: true } });
  console.log("\n📋 ThesisStatus entries in DB:");
  thesisStatuses.forEach((s) => console.log(`  ${s.id} → ${s.name}`));
  const bimbingan = thesisStatuses.find((s) => s.name === "Bimbingan");
  console.log(`  Bimbingan exists? ${bimbingan ? "YES (id=" + bimbingan.id + ")" : "NO — accept akan throw!"}`);

  // Cek accepted thesis: apakah muncul di history query pattern
  const accepted = theses.filter((t) => t.proposalStatus === "accepted");
  console.log(`\n✅ Thesis accepted: ${accepted.length}`);
  accepted.forEach((t) => {
    console.log(`  ${t.student?.user?.identityNumber} ${t.student?.user?.fullName}`);
    console.log(`    thesisStatusId: ${t.thesisStatusId ?? "(null)"} ← harus ter-set ke Bimbingan`);
    console.log(`    proposalReviewedAt: ${t.proposalReviewedAt?.toISOString() ?? "(null)"}`);
  });

  // Cek submitted thesis: apakah 5 syarat terpenuhi (bisa disahkan)?
  const submitted = theses.filter((t) => t.proposalStatus === "submitted");
  console.log(`\n⏳ Thesis submitted (antrean KaDep): ${submitted.length}`);
  for (const t of submitted) {
    const supervisors = await prisma.thesisParticipant.findMany({
      where: { thesisId: t.id, status: "active" },
      include: { role: { select: { name: true } } },
    });
    const hasP1 = supervisors.some((s) => s.role?.name === "Pembimbing 1");
    const hasP2 = supervisors.some((s) => s.role?.name === "Pembimbing 2");
    const score = await prisma.researchMethodScore.findFirst({
      where: { thesisId: t.id },
      orderBy: { createdAt: "desc" },
    });
    const ok = [
      hasP1,
      !!t.finalProposalVersionId,
      !!score?.supervisorScore && (!hasP2 || (!!score.coSignedAt && !!score.coSignedByLecturerId)),
      score?.lecturerScore != null,
      t.student?.takingThesisCourse === true,
      score?.isFinalized === true,
      score?.attendanceAutoZeroedAt == null,
    ];
    const allOk = ok.every(Boolean);
    console.log(`  ${t.student?.user?.identityNumber} ${t.student?.user?.fullName} — ${allOk ? "✅ siap disahkan" : "❌ belum siap"}`);
    if (!allOk) {
      console.log(`     P1=${hasP1} finalVer=${!!t.finalProposalVersionId} takingCourse=${t.student?.takingThesisCourse} superScore=${score?.supervisorScore ?? "null"} lectScore=${score?.lecturerScore ?? "null"} finalized=${score?.isFinalized} cosignedAt=${score?.coSignedAt ?? "null"} autoZero=${score?.attendanceAutoZeroedAt != null}`);
    }
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("❌ Error:", err?.message || err);
  process.exit(1);
});
