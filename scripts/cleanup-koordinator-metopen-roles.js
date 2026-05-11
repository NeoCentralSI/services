/**
 * Cleanup duplikat user_roles untuk "Koordinator Matkul Metopen".
 *
 * Konteks: migrasi 20260510183000_normalize_koordinator_metopen_role melakukan rename
 * legacy 'Dosen Metodologi Penelitian' dan 'Dosen Pengampu Metopel' menjadi 'Koordinator
 * Matkul Metopen', lalu insert canonical dengan id literal 'Koordinator Matkul Metopen'.
 * Tapi ada UUID-row legacy dengan nama identik yang TIDAK di-merge. Skrip ini melakukan:
 *   1. Pilih row canonical (prioritas id literal 'Koordinator Matkul Metopen').
 *   2. Pindahkan referensi user_has_roles & thesis_participants ke canonical.
 *   3. Hapus duplikat row.
 *
 * Idempotent: aman dijalankan ulang.
 */

import prisma from "../src/config/prisma.js";

const TARGET_ROLE_NAME = "Koordinator Matkul Metopen";
const PREFERRED_CANONICAL_ID = "Koordinator Matkul Metopen";

async function main() {
  const candidates = await prisma.userRole.findMany({
    where: { name: TARGET_ROLE_NAME },
    select: { id: true, name: true },
    orderBy: { id: "asc" },
  });

  if (candidates.length <= 1) {
    console.log(`No duplicate '${TARGET_ROLE_NAME}' rows. (count=${candidates.length}). Nothing to do.`);
    return;
  }

  const canonical =
    candidates.find((row) => row.id === PREFERRED_CANONICAL_ID) ?? candidates[0];
  const duplicates = candidates.filter((row) => row.id !== canonical.id);

  console.log(`Canonical role row: id="${canonical.id}"`);
  console.log(`Duplicate rows to merge: ${duplicates.map((r) => r.id).join(", ")}`);

  await prisma.$transaction(async (tx) => {
    for (const dup of duplicates) {
      // Move user_has_roles → canonical (avoid PK collision)
      const userLinks = await tx.userHasRole.findMany({ where: { roleId: dup.id } });
      for (const link of userLinks) {
        const targetExists = await tx.userHasRole.findUnique({
          where: { userId_roleId: { userId: link.userId, roleId: canonical.id } },
        });
        if (targetExists) {
          await tx.userHasRole.delete({
            where: { userId_roleId: { userId: link.userId, roleId: dup.id } },
          });
          console.log(
            `  user_has_roles: deleted duplicate userId=${link.userId} (already had canonical role)`,
          );
        } else {
          await tx.userHasRole.update({
            where: { userId_roleId: { userId: link.userId, roleId: dup.id } },
            data: { roleId: canonical.id },
          });
          console.log(
            `  user_has_roles: migrated userId=${link.userId} → canonical role`,
          );
        }
      }

      // Move thesis_participants → canonical (jaga-jaga kalau ada referensi)
      const partsCount = await tx.thesisParticipant.count({ where: { roleId: dup.id } });
      if (partsCount > 0) {
        await tx.thesisParticipant.updateMany({
          where: { roleId: dup.id },
          data: { roleId: canonical.id },
        });
        console.log(`  thesis_participants: migrated ${partsCount} rows → canonical role`);
      }

      // Hapus duplicate role row
      await tx.userRole.delete({ where: { id: dup.id } });
      console.log(`  user_roles: deleted duplicate role row id="${dup.id}"`);
    }
  });

  console.log("\nCleanup selesai. Verifikasi:");
  const after = await prisma.userRole.findMany({
    where: { name: TARGET_ROLE_NAME },
    select: { id: true, name: true },
  });
  console.log(after);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
