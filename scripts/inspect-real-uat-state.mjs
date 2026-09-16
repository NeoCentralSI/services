import prisma from "../src/config/prisma.js";

async function main() {
  const counts = {
    dummyUsers: await prisma.user.count({ where: { email: { endsWith: "@dummy.ac.id" } } }),
    edgeNim: await prisma.user.count({ where: { identityNumber: { startsWith: "2399" } } }),
    uatNim: await prisma.user.count({ where: { identityNumber: { startsWith: "2388" } } }),
    realUsers: await prisma.user.count({ where: { email: { endsWith: "@fti.unand.ac.id" } } }),
    theses: await prisma.thesis.count(),
    requests: await prisma.thesisAdvisorRequest.count(),
    batches: await prisma.ta04Batch.count(),
    batchMembers: await prisma.ta04BatchMember.count(),
  };

  const batches = await prisma.ta04Batch.findMany({
    orderBy: { createdAt: "desc" },
    take: 15,
    select: {
      id: true,
      version: true,
      status: true,
      academicYearId: true,
      createdAt: true,
      document: { select: { id: true, fileName: true, filePath: true } },
      _count: { select: { members: true } },
    },
  });

  const members = await prisma.ta04BatchMember.findMany({
    include: {
      thesis: {
        select: {
          id: true,
          title: true,
          ta04AssignmentTitle: true,
          ta04AssignmentSupervisorNames: true,
          student: {
            select: {
              user: { select: { fullName: true, email: true, identityNumber: true } },
            },
          },
        },
      },
    },
  });

  const uatTitledTheses = await prisma.thesis.findMany({
    where: {
      OR: [
        { title: { contains: "UAT" } },
        { title: { contains: "EDGE" } },
        { ta04AssignmentTitle: { contains: "UAT" } },
        { ta04AssignmentTitle: { contains: "EDGE" } },
      ],
    },
    select: {
      id: true,
      title: true,
      ta04AssignmentTitle: true,
      ta04AssignmentSupervisorNames: true,
      ta04AssignmentIssuedAt: true,
      student: { select: { user: { select: { email: true, fullName: true, identityNumber: true } } } },
    },
  });

  const core = [
    "admin_si@fti.unand.ac.id",
    "kadep_si@fti.unand.ac.id",
    "sekdep_si@fti.unand.ac.id",
    "pembimbing_si@fti.unand.ac.id",
    "dimas_2311523026@fti.unand.ac.id",
    "john_2411522001@fti.unand.ac.id",
  ];
  const present = {};
  for (const email of core) {
    const u = await prisma.user.findFirst({
      where: { email },
      select: {
        id: true,
        fullName: true,
        identityNumber: true,
        student: { select: { eligibleMetopen: true } },
        lecturer: { select: { id: true } },
        userHasRoles: {
          where: { status: "active" },
          select: { role: { select: { name: true } } },
        },
      },
    });
    present[email] = u
      ? {
          name: u.fullName,
          nim: u.identityNumber,
          roles: u.userHasRoles.map((r) => r.role.name),
          eligible: u.student?.eligibleMetopen ?? null,
          isLecturer: Boolean(u.lecturer),
        }
      : null;
  }

  const realStudents = await prisma.user.findMany({
    where: {
      email: { endsWith: "@fti.unand.ac.id" },
      student: { isNot: null },
    },
    select: {
      email: true,
      fullName: true,
      identityNumber: true,
      student: { select: { eligibleMetopen: true, status: true } },
    },
    orderBy: { identityNumber: "asc" },
    take: 40,
  });

  const realLecturers = await prisma.user.findMany({
    where: {
      email: { endsWith: "@fti.unand.ac.id" },
      lecturer: { isNot: null },
    },
    select: {
      email: true,
      fullName: true,
      lecturer: { select: { id: true } },
      userHasRoles: {
        where: { status: "active" },
        select: { role: { select: { name: true } } },
      },
    },
    take: 40,
  });

  const docsWithUat = await prisma.document.findMany({
    where: {
      OR: [
        { fileName: { contains: "UAT" } },
        { fileName: { contains: "EDGE" } },
        { fileName: { contains: "TA04_BATCH" } },
      ],
    },
    select: { id: true, fileName: true, filePath: true },
    take: 30,
  });

  console.log(
    JSON.stringify(
      {
        counts,
        batches,
        members: members.map((m) => ({
          batchId: m.batchId,
          thesisId: m.thesisId,
          student: m.thesis?.student?.user,
          title: m.thesis?.title,
          ta04Title: m.thesis?.ta04AssignmentTitle,
        })),
        uatTitledTheses,
        present,
        realStudents,
        realLecturers: realLecturers.map((l) => ({
          email: l.email,
          name: l.fullName,
          roles: l.userHasRoles.map((r) => r.role.name),
        })),
        docsWithUat,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
