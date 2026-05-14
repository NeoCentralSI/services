import { PrismaClient } from './src/generated/prisma/index.js';
const prisma = new PrismaClient();

async function debug() {
  try {
    const userCount = await prisma.user.count();
    console.log("Total Users:", userCount);
    
    // List some identity numbers
    const users = await prisma.user.findMany({
      take: 5,
      select: { identityNumber: true, fullName: true }
    });
    console.log("Sample Users:", users);
    
    const fariz = await prisma.user.findFirst({
      where: { identityNumber: "2211523034" }
    });
    console.log("Fariz Found:", !!fariz);
    if (fariz) console.log("Fariz Details:", fariz.fullName);

  } catch (err) {
    console.error("DEBUG ERROR:", err);
  } finally {
    await prisma.$disconnect();
  }
}

debug();
