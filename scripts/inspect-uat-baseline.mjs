import prisma from "../src/config/prisma.js";

async function main() {
  const counts = {
    users: await prisma.user.count(),
    dummyUsers: await prisma.user.count({ where: { email: { endsWith: "@dummy.ac.id" } } }),
    realUsers: await prisma.user.count({ where: { email: { endsWith: "@fti.unand.ac.id" } } }),
    edge: await prisma.user.count({ where: { identityNumber: { startsWith: "23990000" } } }),
    uat2388: await prisma.user.count({ where: { identityNumber: { startsWith: "2388" } } }),
    requests: await prisma.thesisAdvisorRequest.count(),
    theses: await prisma.thesis.count(),
    attendanceImports: await prisma.metopenAttendanceImport.count(),
  };

  const core = [
    "admin_si@fti.unand.ac.id",
    "kadep_si@fti.unand.ac.id",
    "sekdep_si@fti.unand.ac.id",
    "pembimbing_si@fti.unand.ac.id",
    "dimas_2311523026@fti.unand.ac.id",
    "john_2411522001@fti.unand.ac.id",
    "uat.koordinator@dummy.ac.id",
    "garcia.hernandez@dummy.ac.id",
  ];
  const present = {};
  for (const email of core) {
    present[email] = Boolean(await prisma.user.findFirst({ where: { email }, select: { id: true } }));
  }

  const ay = await prisma.academicYear.findFirst({
    where: { isActive: true },
    select: { id: true, year: true, semester: true, startDate: true, endDate: true },
  });

  console.log(JSON.stringify({ counts, present, activeAy: ay }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
