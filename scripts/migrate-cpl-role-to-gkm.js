/**
 * Moves every holder of the removed role "Tim Pengelola CPL" to GKM (CPL is managed by the GKM),
 * then deletes the role. Safe to run more than once.
 *
 *   node scripts/migrate-cpl-role-to-gkm.js
 */
import { PrismaClient } from "../src/generated/prisma/index.js";
import { ROLES } from "../src/constants/roles.js";

const OLD_ROLE = "Tim Pengelola CPL";
const prisma = new PrismaClient();

async function main() {
  const old = await prisma.userRole.findFirst({ where: { name: OLD_ROLE } });
  if (!old) {
    console.log(`Peran "${OLD_ROLE}" tidak ada; tidak ada yang dipindahkan.`);
    return;
  }
  const gkm = (await prisma.userRole.findFirst({ where: { name: ROLES.GKM } })) ?? (await prisma.userRole.create({ data: { name: ROLES.GKM } }));
  const holders = await prisma.userHasRole.findMany({ where: { roleId: old.id } });
  await prisma.$transaction(async (tx) => {
    for (const holder of holders) {
      await tx.userHasRole.upsert({
        where: { userId_roleId: { userId: holder.userId, roleId: gkm.id } },
        update: holder.status === "active" ? { status: "active" } : {},
        create: { userId: holder.userId, roleId: gkm.id, status: holder.status },
      });
    }
    await tx.userHasRole.deleteMany({ where: { roleId: old.id } });
    await tx.userRole.delete({ where: { id: old.id } });
  });
  console.log(`${holders.length} pengguna dipindahkan ke GKM; peran "${OLD_ROLE}" dihapus.`);
}

main()
  .catch((error) => {
    console.error("Gagal memindahkan peran:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
