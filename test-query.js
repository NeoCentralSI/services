import pkg from '@prisma/client';
const { PrismaClient } = pkg;
const prisma = new PrismaClient();

async function main() {
  const failedSeminars = await prisma.thesisSeminar.findMany({
    where: { status: 'failed' },
    select: { id: true, thesisId: true, status: true, thesis: { select: { student: { select: { user: { select: { fullName: true } } } } } } }
  });
  console.log("Failed seminars:", JSON.stringify(failedSeminars, null, 2));

  const allSeminars = await prisma.thesisSeminar.findMany({
    select: { id: true, thesisId: true, status: true }
  });
  console.log("All seminars total:", allSeminars.length);

  const nonFailedSeminars = await prisma.thesisSeminar.findMany({
    where: { status: { not: 'failed' } },
    select: { id: true, thesisId: true, status: true }
  });
  console.log("Non-failed seminars total:", nonFailedSeminars.length);
}

main().catch(console.error).finally(() => prisma.$disconnect());
