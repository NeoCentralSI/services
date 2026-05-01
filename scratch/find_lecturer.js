import pkg from '@prisma/client';
const { PrismaClient } = pkg;
const prisma = new PrismaClient();

async function main() {
  const lecturers = await prisma.user.findMany({
    where: { lecturer: { isNot: null } },
    take: 5,
    select: { email: true }
  });
  console.log(JSON.stringify(lecturers, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
