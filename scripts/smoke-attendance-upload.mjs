// Smoke test E2E: simulasi alur upload presensi Metopel pada level service
// (memotong layer HTTP/multer). Ini meniru data yang multer assemble dari
// file xlsx — buffer Excel dummy 2 baris mahasiswa dengan 1 ineligible.

import * as XLSX from "xlsx";
import { PrismaClient } from "../src/generated/prisma/index.js";
import {
  uploadMetopenAttendance,
  getLatestMetopenAttendanceImport,
} from "../src/services/metopenAttendance.service.js";

const prisma = new PrismaClient();

function buildAttendanceWorkbook(rows) {
  const aoa = [
    ["Matakuliah", ":", "Metode Penelitian"],
    ["Kelas", ":", "TA-DUMMY-A"],
    ["Semester", ":", "2025/2026 - Genap"],
    ["Filter Jenis", ":", "Semua"],
    ["Dosen", ":", "Dr. Smoke Tester"],
    [],
    ["NIM", "Nama Mahasiswa", "Hadir", "Alpa", "Sakit", "Izin", "Total", "Persentase Hadir"],
    ...rows,
  ];

  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Presensi");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

async function pickActorUserId() {
  const koord = await prisma.user.findFirst({
    where: {
      userHasRoles: {
        some: { status: "active", role: { name: "Koordinator Metopen" } },
      },
    },
    select: { id: true, fullName: true },
  });
  if (koord) return koord.id;
  const fallback = await prisma.user.findFirst({ select: { id: true } });
  return fallback?.id ?? null;
}

async function main() {
  console.log("=================================================");
  console.log("  SMOKE TEST: uploadMetopenAttendance E2E");
  console.log("=================================================");

  const actorUserId = await pickActorUserId();
  console.log(`actorUserId = ${actorUserId}`);
  if (!actorUserId) {
    throw new Error("Tidak ada user di DB untuk dipakai sebagai actor.");
  }

  const buffer = buildAttendanceWorkbook([
    ["SMOKE001", "Smoke Tester 1", 14, 0, 1, 1, 16, 0.9375],
    ["SMOKE002", "Smoke Tester 2", 5, 11, 0, 0, 16, 0.3125],
  ]);

  const file = {
    buffer,
    originalname: "smoke-test-presensi.xlsx",
    size: buffer.length,
    mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };

  console.log("\n[1] Calling uploadMetopenAttendance(...)");
  const result = await uploadMetopenAttendance(file, actorUserId, {});
  console.log("    ✓ upload OK");
  console.log("    totals=", result.totals);
  console.log("    importId=", result.import?.id);
  console.log(
    `    document.fileName=${result.import?.document?.fileName}, fileSize=${result.import?.document?.fileSize}`,
  );

  console.log("\n[2] Reading latest import via getLatestMetopenAttendanceImport()");
  const latest = await getLatestMetopenAttendanceImport();
  console.log(
    `    latest.id=${latest?.id} totalRows=${latest?.totalRows} eligibleRows=${latest?.eligibleRows}`,
  );

  // Cleanup smoke data — keep DB tidy.
  console.log("\n[3] Cleanup smoke import + records + document");
  const importId = result.import?.id;
  if (importId) {
    await prisma.$transaction(async (tx) => {
      await tx.metopenAttendanceRecord.deleteMany({ where: { importId } });
      const importRow = await tx.metopenAttendanceImport.findUnique({
        where: { id: importId },
        select: { documentId: true },
      });
      await tx.metopenAttendanceImport.delete({ where: { id: importId } });
      if (importRow?.documentId) {
        await tx.document.delete({ where: { id: importRow.documentId } });
      }
    });
    console.log("    ✓ cleanup done");
  }

  console.log("\n=== SMOKE PASS — endpoint upload presensi siap dipakai ===");
}

main()
  .catch((e) => {
    console.error("\n!!! SMOKE FAIL !!!");
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
