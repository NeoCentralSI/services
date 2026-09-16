import { PrismaClient } from "../src/generated/prisma/index.js";

const url = "mysql://root:@localhost:3306/mysql";
const prisma = new PrismaClient({ datasources: { db: { url } } });
try {
  await prisma.$executeRawUnsafe("DROP DATABASE IF EXISTS `_prisma_shadow_check`");
  console.log("OK: shadow database dropped");
} catch (e) {
  console.error("FAIL:", e.message);
} finally {
  await prisma.$disconnect();
}
