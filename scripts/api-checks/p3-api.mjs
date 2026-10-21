// API checks: Penetapan Pembimbing on a clean seed (see README).
// Mutates central. Run from app/backend: node scripts/api-checks/p3-api.mjs
import { api, check, run, summary, login } from "./lib-api.mjs";

const prisma = (await import(process.cwd() + "/src/config/prisma.js")).default;
const { runSupervisorAssignmentReminderJob } = await import(process.cwd() + "/src/jobs/supervisor-assignment-reminder.job.js");

const U = (key) => `prop_${key}`;
const KADEP = "kadep_si", SEKDEP = "sekdep_si", ADMIN = "admin_si", ULLYA = "gkm_si";
const nim = (key) => ({ diterima: "2211528008", batal: "2211528009", ditetapkan: "2211528010", ditinjau: "2211528005" })[key];

let overview;
let assignedAtBefore;
await run("0 persiapan", async () => {
  for (const u of [KADEP, SEKDEP, ADMIN, ULLYA]) await login(u);
  overview = (await api(KADEP, "GET", "/thesis-proposals/supervisor-assignments")).data;
  const diterima = overview?.entries?.find((e) => e.studentNim === nim("diterima"));
  check("susunan semester berjalan: 8 mahasiswa, 6 sudah di versi 1, 2 baru (Diterima, Batal)",
    overview?.entries?.length === 8 && overview?.currentBatch?.version === 1 && overview?.newCount === 2 && diterima?.inCurrentBatch === false,
    { n: overview?.entries?.length, v: overview?.currentBatch?.version, newCount: overview?.newCount });
  check("perlu diterbitkan ulang", overview?.upToDate === false && overview?.needsIssue === true);
  check("baris memuat pembimbing per dosen dan nama gabungan untuk PDF", Array.isArray(diterima?.supervisors) && diterima.supervisors[0]?.role === "Pembimbing 1" && typeof diterima?.supervisorNames === "string", diterima?.supervisors);
  const me = await api(U("ditetapkan"), "GET", "/thesis-proposals/me");
  assignedAtBefore = me.data?.assignment?.assignedAt;
  check("mahasiswa yang sudah ditetapkan melihat status dan tanggalnya", me.data?.assignment?.assigned === true && Boolean(assignedAtBefore), me.data?.assignment);
});

await run("1 akses", async () => {
  const sek = await api(SEKDEP, "GET", "/thesis-proposals/supervisor-assignments");
  check("Sekdep bisa melihat penetapan", sek.status === 200, sek.status);
  const adm = await api(ADMIN, "GET", "/thesis-proposals/supervisor-assignments");
  check("Admin bisa melihat penetapan", adm.status === 200, adm.status);
  const stu = await api(U("diterima"), "GET", "/thesis-proposals/supervisor-assignments");
  check("mahasiswa tidak bisa melihat daftar penetapan (403)", stu.status === 403, stu.status);
  const lec = await api(ULLYA, "GET", "/thesis-proposals/supervisor-assignments");
  check("dosen biasa tidak bisa melihat daftar penetapan (403)", lec.status === 403, lec.status);
  const sekIssue = await api(SEKDEP, "POST", "/thesis-proposals/supervisor-assignments", { academicYearId: overview.academicYear.id });
  check("Sekdep tidak bisa menerbitkan (403)", sekIssue.status === 403, sekIssue.status);
  const prev = await api(KADEP, "GET", "/thesis-proposals/supervisor-assignments/preview");
  check("Kadep pratinjau PDF", prev.status === 200 && prev.ct.includes("pdf") && prev.bytes > 1000, `${prev.status} ${prev.ct} ${prev.bytes}`);
  const sekPrev = await api(SEKDEP, "GET", "/thesis-proposals/supervisor-assignments/preview");
  check("Sekdep tidak bisa pratinjau (403)", sekPrev.status === 403, sekPrev.status);
  const kFile = await api(KADEP, "GET", overview.currentBatch.fileUrl);
  check("Kadep unduh versi berlaku", kFile.status === 200 && kFile.ct.includes("pdf"), `${kFile.status} ${kFile.ct}`);
  const sFile = await api(SEKDEP, "GET", overview.currentBatch.fileUrl);
  check("Sekdep tidak bisa unduh selama susunan belum diterbitkan ulang (400)", sFile.status === 400 && /belum diperbarui/.test(sFile.json?.message), `${sFile.status} ${sFile.json?.message}`);
  const stuFile = await api(U("ditetapkan"), "GET", overview.currentBatch.fileUrl);
  check("mahasiswa tidak bisa unduh PDF penetapan (403)", stuFile.status === 403, stuFile.status);
  const me = await api(U("diterima"), "GET", "/thesis-proposals/me");
  check("mahasiswa menunggu penetapan: alasan tampil, tanpa berkas", me.data?.assignment?.assigned === false && /Penetapan Pembimbing/.test(me.data?.assignment?.waitingReason) && !JSON.stringify(me.data).includes("fileUrl"), me.data?.assignment);
});

await run("2 pengingat Kadep", async () => {
  const first = await runSupervisorAssignmentReminderJob();
  check("pengingat dikirim untuk periode yang menunggu", first.reminded >= 1, first);
  const second = await runSupervisorAssignmentReminderJob();
  check("pengingat tidak diulang dalam 24 jam", second.reminded === 0 && second.skipped >= 1, second);
});

await run("2b batal sebelum penetapan", async () => {
  const reqs = await api(U("batal"), "GET", "/thesis-proposals/me/supervisor-requests");
  const id = reqs.data?.activeRequest?.id;
  const cancel = await api(U("batal"), "POST", `/thesis-proposals/supervisor-requests/${id}/withdraw`);
  check("mahasiswa membatalkan pengajuan yang sudah disetujui", cancel.status === 200 && cancel.data?.status === "cancelled", `${cancel.status} ${cancel.json?.message}`);
  const ov = (await api(KADEP, "GET", "/thesis-proposals/supervisor-assignments")).data;
  check("yang batal keluar dari susunan (7 mahasiswa, 1 baru)", ov?.entries?.length === 7 && ov?.newCount === 1 && !ov.entries.some((e) => e.studentNim === nim("batal")), { n: ov?.entries?.length, newCount: ov?.newCount });
});

let v2;
await run("3 terbitkan", async () => {
  const issue = await api(KADEP, "POST", "/thesis-proposals/supervisor-assignments", { academicYearId: overview.academicYear.id });
  v2 = issue.data;
  check("versi 2 terbit, 1 mahasiswa baru ditetapkan", issue.status === 200 && v2?.alreadyIssued === false && v2?.newlyAssigned === 1 && v2?.currentBatch?.version === 2 && v2?.upToDate === true, `${issue.status} ${issue.json?.message}`);
  check("versi 1 digantikan, riwayat 2 versi", v2?.batches?.length === 2 && v2.batches.find((b) => b.version === 1)?.status === "superseded", v2?.batches?.map((b) => `${b.version}:${b.status}`));
  check("berkas memakai nama netral", /^Penetapan-Pembimbing-.*-v2\.pdf$/.test(v2?.currentBatch?.fileName ?? ""), v2?.currentBatch?.fileName);
  const me = await api(U("diterima"), "GET", "/thesis-proposals/me");
  check("mahasiswa baru: status ditetapkan, tanpa alasan menunggu", me.data?.assignment?.assigned === true && me.data?.assignment?.version === 2 && me.data?.assignment?.waitingReason === null, me.data?.assignment);
  const reqs = await api(U("diterima"), "GET", "/thesis-proposals/me/supervisor-requests");
  check("pengajuan berstatus assigned", reqs.data?.activeRequest?.status === "assigned" || reqs.data?.requests?.[0]?.status === "assigned", reqs.data?.requests?.map((r) => r.status));
  const older = await api(U("ditetapkan"), "GET", "/thesis-proposals/me");
  check("tanggal penetapan mahasiswa lama tidak berubah", older.data?.assignment?.assignedAt === assignedAtBefore, [assignedAtBefore, older.data?.assignment?.assignedAt]);
  const thesis = await prisma.thesis.findFirst({ where: { student: { user: { identityNumber: nim("diterima") } } }, select: { supervisorAssignedAt: true } });
  check("thesis.supervisor_assigned_at terisi", Boolean(thesis?.supervisorAssignedAt));
  const notif = await prisma.notification.findFirst({ where: { user: { identityNumber: nim("diterima") }, type: "supervisor_assignment_issued" } });
  check("notifikasi ke mahasiswa", Boolean(notif), notif?.message);
  const audit = await prisma.auditLog.findFirst({ where: { action: "SUPERVISOR_ASSIGNMENT_ISSUED" }, orderBy: { createdAt: "desc" } });
  check("audit SUPERVISOR_ASSIGNMENT_ISSUED", Boolean(audit));
});

await run("4 terbitkan ulang tanpa perubahan", async () => {
  const again = await api(KADEP, "POST", "/thesis-proposals/supervisor-assignments", { academicYearId: overview.academicYear.id });
  check("susunan sama: tidak membuat versi baru", again.status === 200 && again.data?.alreadyIssued === true && again.data?.currentBatch?.version === 2, again.json?.message);
  const sFile = await api(SEKDEP, "GET", v2.currentBatch.fileUrl);
  check("Sekdep unduh versi berlaku setelah lengkap", sFile.status === 200 && sFile.ct.includes("pdf"), sFile.status);
  const old = v2.batches.find((b) => b.version === 1);
  const sOld = await api(SEKDEP, "GET", old.fileUrl);
  check("Sekdep tidak bisa unduh versi yang digantikan", sOld.status === 400, sOld.status);
  const kOld = await api(KADEP, "GET", old.fileUrl);
  check("Kadep tetap bisa unduh versi lama (bukti beku)", kOld.status === 200, kOld.status);
});

await run("5 pembatalan setelah penetapan", async () => {
  const reqs = await api(U("diterima"), "GET", "/thesis-proposals/me/supervisor-requests");
  const id = reqs.data?.requests?.[0]?.id;
  const cancel = await api(U("diterima"), "POST", `/thesis-proposals/supervisor-requests/${id}/withdraw`);
  check("pengajuan yang sudah ditetapkan tidak bisa dibatalkan", cancel.status >= 400 && cancel.status < 500, `${cancel.status} ${cancel.json?.message}`);
});

await run("6 susunan berubah lagi", async () => {
  const inbox = await api(ULLYA, "GET", "/thesis-proposals/supervisor-requests/inbox");
  const req = inbox.data?.waiting?.find((r) => r.student?.identityNumber === nim("ditinjau"));
  const acc = await api(ULLYA, "POST", `/thesis-proposals/supervisor-requests/${req?.id}/respond`, { action: "accept" });
  check("Ullya menerima pengajuan yang sedang ditinjau", acc.status === 200 && acc.data?.status === "accepted", `${acc.status} ${acc.json?.message}`);
  const ov = (await api(KADEP, "GET", "/thesis-proposals/supervisor-assignments")).data;
  check("penetapan kembali perlu diterbitkan (1 baru)", ov?.upToDate === false && ov?.newCount === 1 && ov?.entries?.length === 8, { upToDate: ov?.upToDate, newCount: ov?.newCount, n: ov?.entries?.length });
  const issue = await api(KADEP, "POST", "/thesis-proposals/supervisor-assignments", { academicYearId: overview.academicYear.id });
  check("versi 3 terbit", issue.data?.currentBatch?.version === 3 && issue.data?.newlyAssigned === 1, issue.data?.currentBatch?.version);
});

await run("7 periode lain", async () => {
  const years = await prisma.academicYear.findMany({ orderBy: [{ year: "desc" }, { semester: "desc" }] });
  const previous = years.find((y) => y.id !== overview.academicYear.id && !y.isActive);
  const prev = await api(KADEP, "GET", `/thesis-proposals/supervisor-assignments?academicYearId=${previous?.id}`);
  check("periode sebelumnya: versi berlaku sesuai susunan", prev.status === 200 && prev.data?.currentBatch && prev.data?.upToDate === true, { status: prev.status, n: prev.data?.entries?.length, v: prev.data?.currentBatch?.version, upToDate: prev.data?.upToDate });
  const empty = years.find((y) => y.id !== overview.academicYear.id && y.id !== previous?.id);
  if (empty) {
    const none = await api(KADEP, "POST", "/thesis-proposals/supervisor-assignments", { academicYearId: empty.id });
    check("periode tanpa mahasiswa: 400", none.status === 400 && /Tidak ada mahasiswa/.test(none.json?.message), `${none.status} ${none.json?.message}`);
  }
  const unknown = await api(KADEP, "GET", "/thesis-proposals/supervisor-assignments?academicYearId=tidak-ada");
  check("periode tidak dikenal: 404", unknown.status === 404, unknown.status);
});

const failed = summary();
await prisma.$disconnect();
process.exit(failed ? 1 : 0);
