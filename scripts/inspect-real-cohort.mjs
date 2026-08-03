import prisma from "../src/config/prisma.js";
import { getLecturerQuotaSnapshot } from "../src/services/advisorQuota.service.js";
import { resolveOperationalAcademicYear } from "../src/helpers/academicYear.helper.js";

async function main() {
  const ay = await resolveOperationalAcademicYear();
  console.log("AY", ay?.id, ay?.year, ay?.semester);

  const theses = await prisma.thesis.findMany({
    include: {
      student: { select: { user: { select: { email: true, fullName: true, identityNumber: true } } } },
      thesisSupervisors: {
        where: { status: "active" },
        include: { lecturer: { select: { user: { select: { email: true, fullName: true } } } }, role: true },
      },
      advisorRequests: {
        select: { id: true, status: true, routeType: true, acceptedOverNormal: true, lecturerId: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const requests = await prisma.thesisAdvisorRequest.findMany({
    include: {
      student: { select: { user: { select: { email: true, fullName: true } } } },
      lecturer: { select: { user: { select: { email: true, fullName: true } } } },
    },
  });

  console.log("\n=== THESES ===");
  for (const t of theses) {
    console.log({
      id: t.id,
      title: t.title,
      proposal: t.proposalStatus,
      isProposal: t.isProposal,
      ta04At: t.ta04AssignmentIssuedAt,
      student: t.student?.user,
      supervisors: t.thesisSupervisors.map((s) => `${s.role?.name}:${s.lecturer?.user?.email}`),
      requests: t.advisorRequests,
    });
  }

  console.log("\n=== REQUESTS ===");
  for (const r of requests) {
    console.log({
      id: r.id,
      status: r.status,
      route: r.routeType,
      over: r.acceptedOverNormal,
      student: r.student?.user?.email,
      lecturer: r.lecturer?.user?.email,
      title: r.proposedTitle,
    });
  }

  const lecturers = [
    "pembimbing_si@fti.unand.ac.id",
    "sekdep_si@fti.unand.ac.id",
    "kadep_si@fti.unand.ac.id",
    "adi@fti.unand.ac.id",
    "hafzatin@fti.unand.ac.id",
    "welly@fti.unand.ac.id",
  ];
  console.log("\n=== QUOTA SNAPSHOTS ===");
  for (const email of lecturers) {
    const u = await prisma.user.findFirst({ where: { email }, select: { id: true, fullName: true } });
    if (!u || !ay) continue;
    const snap = await getLecturerQuotaSnapshot(u.id, ay.id);
    console.log(email, {
      max: snap?.quotaMax,
      aktif: snap?.activeCount,
      booking: snap?.bookingCount,
      sisa: snap?.normalAvailable,
      pendingKadep: snap?.pendingKadepCount,
      overquotaSah: snap?.overquotaSahCount,
      traffic: snap?.trafficLight,
    });
  }

  const dummyDocs = await prisma.document.findMany({
    where: { filePath: { startsWith: "uploads/dummy/" } },
    select: { id: true, fileName: true, filePath: true },
  });
  const allBatches = await prisma.ta04Batch.findMany({
    select: {
      id: true,
      version: true,
      status: true,
      documentId: true,
      document: { select: { fileName: true } },
      _count: { select: { members: true } },
    },
    orderBy: { version: "desc" },
  });

  console.log("\n=== DUMMY DOCS ===", dummyDocs.length);
  console.log("\n=== ALL BATCHES ===");
  for (const b of allBatches) console.log(b);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
