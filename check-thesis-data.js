import generated from "./src/generated/prisma/index.js";
const { PrismaClient } = generated;

const prisma = new PrismaClient();

async function main() {
  // Step 1: Get user
  const user = await prisma.user.findFirst({
    where: { fullName: { contains: "Nabil Rizki Navisa" } },
    select: { id: true, fullName: true, identityNumber: true },
  });
  console.log("=== USER ===");
  console.log(JSON.stringify(user, null, 2));
  if (!user) return;

  // Student.id = User.id (mapped as user_id in DB)
  // Thesis.studentId = Student.id = User.id
  const thesis = await prisma.thesis.findFirst({
    where: { studentId: user.id, isProposal: false },
    select: {
      id: true,
      title: true,
      isProposal: true,
      defenceRequestedAt: true,
      finalThesisDocumentId: true,
      thesisStatus: { select: { id: true, name: true } },
      thesisSupervisors: {
        select: {
          id: true,
          seminarReady: true,
          defenceReady: true,
          role: { select: { name: true } },
          lecturer: { select: { user: { select: { fullName: true } } } },
        },
      },
      thesisSeminars: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          date: true,
          finalScore: true,
          resultFinalizedAt: true,
          revisionFinalizedAt: true,
          createdAt: true,
        },
      },
    },
  });

  if (!thesis) {
    console.log("No thesis found!");
    return;
  }

  console.log("\n=== THESIS ===");
  console.log("ID:", thesis.id);
  console.log("Title:", thesis.title);
  console.log("Status:", thesis.thesisStatus?.name);
  console.log("Defence Requested At:", thesis.defenceRequestedAt);
  console.log("Final Document ID:", thesis.finalThesisDocumentId);

  console.log("\n=== SUPERVISORS ===");
  thesis.thesisSupervisors.forEach(s => {
    console.log(`  ${s.role.name}: ${s.lecturer.user.fullName} | seminarReady=${s.seminarReady} | defenceReady=${s.defenceReady}`);
  });

  console.log("\n=== SEMINARS (count=" + thesis.thesisSeminars.length + ") ===");
  thesis.thesisSeminars.forEach((sem, i) => {
    console.log(`  [${i}] status=${sem.status} | date=${sem.date} | score=${sem.finalScore} | resultFinalized=${sem.resultFinalizedAt} | revisionFinalized=${sem.revisionFinalizedAt}`);
  });

  if (thesis.thesisSeminars.length > 0) {
    const latest = thesis.thesisSeminars[0];
    const completed = latest.status === "passed" || (latest.status === "passed_with_revision" && !!latest.revisionFinalizedAt);
    console.log(`\n>>> isSeminarCompleted: ${completed} <<<`);
  } else {
    console.log("\n>>> NO SEMINAR RECORDS -> DefenceRequestCard will NOT show! <<<");
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
