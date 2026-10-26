// API checks: SIA only reads, DevTools tab Proposal, old addresses gone,
// student master data per semester. Mutates central (runs the SIA sync against dummy-SIA);
// run from app/backend after a clean seed (see README): node scripts/api-checks/p6-api.mjs
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { api, check, run, summary } from "./lib-api.mjs";

const require = createRequire(process.cwd() + "/package.json");
require("dotenv").config({ quiet: true });
const SIA = (process.env.SIA_BASE_URL || "http://localhost:4000").replace(/\/$/, "");
const siaHeaders = { "x-api-token": process.env.SIA_API_TOKEN ?? "" };
const prisma = (await import(process.cwd() + "/src/config/prisma.js")).default;

const U = (key) => `prop_${key}`;
const KADEP = "kadep_si", ADMIN = "admin_si";

const studentIdOf = async (nim) =>
  (await prisma.user.findFirst({ where: { identityNumber: nim }, select: { student: { select: { id: true } } } }))?.student?.id;
const operational = await prisma.academicYear.findFirst({ where: { isActive: true } });
const flagsOf = async (studentId) =>
  prisma.studentAcademicYearSnapshot.findUnique({ where: { studentId_academicYearId: { studentId, academicYearId: operational.id } } });

await run("1 SIA hanya membaca", async () => {
  const oldSync = await fetch(`${SIA}/sync-ta`, { method: "POST", headers: { ...siaHeaders, "Content-Type": "application/json" }, body: "{}" });
  check("dummy-SIA: POST /sync-ta tidak ada lagi", oldSync.status === 404, oldSync.status);
  // K45: one route, one shape. The per-semester and per-student routes are gone.
  for (const path of ["/enrollments", `/enrollments/2211528015?academicYear=${encodeURIComponent(operational.year)}&semester=${operational.semester}`, "/students/2211528015", "/students/2211528015/current-courses"]) {
    const res = await fetch(`${SIA}${path}`, { headers: siaHeaders });
    check(`dummy-SIA: ${path.split("?")[0]} tidak ada lagi`, res.status === 404, res.status);
  }
  const students = await fetch(`${SIA}/students`, { headers: siaHeaders });
  const sj = await students.json();
  const first = sj.data?.[0] ?? {};
  check("dummy-SIA: GET /students memuat period dan rekam akademik semester berjalan", students.status === 200 && sj.period?.academicYear === operational.year && sj.period?.semester === operational.semester && Array.isArray(first.currentCourses) && "gpa" in first && "studentStatus" in first, { period: sj.period, keys: Object.keys(first).slice(0, 8) });
  // The flag NeoCentral derives from the current courses (Tugas Akhir = IF5001).
  const takesThesisOf = (nim) => (sj.data.find((r) => r.nim === nim)?.currentCourses ?? []).some((c) => c.code === "IF5001");
  const sem = { data: sj.data };

  const gone = await api(ADMIN, "POST", "/master-data-ta/sync-sia");
  check("central: POST /master-data-ta/sync-sia tidak ada lagi", gone.status === 404, gone.status);

  const sidNaik = await studentIdOf("2211528015");
  const sidOutside = await (async () => {
    const listed = new Set(sem.data.map((r) => String(r.nim)));
    const users = await prisma.user.findMany({ where: { student: { isNot: null } }, select: { identityNumber: true, student: { select: { id: true } } } });
    return users.find((u) => !listed.has(u.identityNumber))?.student?.id;
  })();
  const set = await api(ADMIN, "PATCH", `/devtools/students/${sidNaik}/period-flags`, { takingThesisCourse: true });
  check("DevTools: ubah penanda TA periode berjalan", set.status === 200 && set.data?.takingThesisCourse === true, set.json?.message);
  if (sidOutside) await api(ADMIN, "PATCH", `/devtools/students/${sidOutside}/period-flags`, { eligibleResearchMethod: true });
  const before = await flagsOf(sidNaik);
  check("penanda tersimpan bersumber devtools", before?.thesisCourseSource === "devtools", before?.thesisCourseSource);

  const sync = await api(ADMIN, "POST", "/sia/sync");
  const s = sync.json?.summary ?? {};
  check("sinkronisasi SIA berhasil dan membaca penanda semester", sync.status === 200 && !s.periodFlagsError && s.periodFlagsUpdated + s.periodFlagsCreated > 0 && Number(s.periodFlagsSkipped) === 0,
    { status: sync.status, created: s.periodFlagsCreated, updated: s.periodFlagsUpdated, skipped: s.periodFlagsSkipped, err: s.periodFlagsError });
  const after = await flagsOf(sidNaik);
  check("SIA berwenang atas mahasiswa yang didaftarnya: penanda kembali ke nilai SIA", after?.thesisCourseSource === "sia" && after?.takingThesisCourse === takesThesisOf("2211528015"), { source: after?.thesisCourseSource, value: after?.takingThesisCourse, sia: takesThesisOf("2211528015") });
  if (sidOutside) {
    const kept = await flagsOf(sidOutside);
    check("mahasiswa yang tidak didaftar SIA mempertahankan penandanya", kept?.eligibleResearchMethod === true && kept?.eligibilitySource === "devtools", kept?.eligibilitySource);
  } else {
    check("ada mahasiswa di luar daftar SIA untuk diuji", false, "tidak ada");
  }
  const status = await api(ADMIN, "GET", "/sia/sync/status");
  check("status sinkronisasi memuat periodFlagsError kosong", status.status === 200 && JSON.stringify(status.json).includes("periodFlagsError"), status.status);
});

await run("2 DevTools: waktu pengajuan pembimbing (aturan 72 jam)", async () => {
  const st = await api(U("menunggu"), "GET", "/thesis-proposals/me/supervisor-requests");
  const id = st.data?.activeRequest?.id;
  check("akun menunggu punya pengajuan aktif", Boolean(id), st.data?.activeRequest?.status);
  const early = await api(U("menunggu"), "POST", `/thesis-proposals/supervisor-requests/${id}/withdraw`);
  check("tarik sebelum 72 jam ditolak", early.status === 400 && /Tunggu \d+ jam lagi/.test(early.json?.message ?? ""), early.json?.message);
  const list = await api(ADMIN, "GET", "/devtools/supervisor-requests?search=2211528003");
  const row = (list.data ?? []).find((r) => r.id === id);
  check("DevTools menampilkan pengajuan dan kapan bisa ditarik", Boolean(row?.withdrawAvailableAt), row?.withdrawAvailableAt);
  const future = await api(ADMIN, "PATCH", `/devtools/supervisor-requests/${id}`, { createdAt: new Date(Date.now() + 3600e3).toISOString() });
  check("waktu di masa depan ditolak", future.status === 400, future.json?.message);
  const back = await api(ADMIN, "PATCH", `/devtools/supervisor-requests/${id}`, { createdAt: new Date(Date.now() - (72 * 60 + 1) * 60e3).toISOString() });
  check("mundurkan 72 jam", back.status === 200, back.json?.message);
  const audit = await prisma.auditLog.findFirst({ where: { action: "SUPERVISOR_REQUEST_TIME_OVERRIDDEN", entityId: id } });
  check("tercatat di audit log", Boolean(audit), audit?.action);
  const now = await api(U("menunggu"), "POST", `/thesis-proposals/supervisor-requests/${id}/withdraw`);
  check("sekarang bisa ditarik", now.status === 200 && now.data?.status === "withdrawn", `${now.status} ${now.data?.status} ${now.json?.message ?? ""}`);
  const nonAdmin = await api(KADEP, "GET", "/devtools/supervisor-requests");
  check("DevTools hanya untuk Admin", nonAdmin.status === 403, nonAdmin.status);
});

await run("3 alamat lama tidak ada lagi", async () => {
  for (const [method, path] of [
    ["GET", "/advisorRequest/access-state"],
    ["GET", "/metopen/me/archive"],
    ["GET", "/assessment/metopen/queue"],
    ["GET", "/rubric-metopen/criteria"],
    ["POST", "/thesis-supervisors/co-advisor"],
    // Removed later (Pembimbing 2 directly by Kadep had no caller).
    ["POST", "/thesis-supervisors/supervisor-2"],
  ]) {
    const r = await api(KADEP, method, path, method === "POST" ? {} : undefined);
    check(`${method} ${path} 404`, r.status === 404, r.status);
  }
});

await run("4 data mahasiswa per semester", async () => {
  const all = await api(ADMIN, "GET", "/adminfeatures/students?pageSize=500");
  const total = all.json?.meta?.total;
  const counts = {};
  for (const program of ["research-method", "thesis", "both", "none"]) {
    counts[program] = (await api(ADMIN, "GET", `/adminfeatures/students?pageSize=1&programFilter=${program}`)).json?.meta?.total;
  }
  check("filter program membagi habis daftar mahasiswa", counts["research-method"] + counts.thesis + counts.both + counts.none === total, { total, ...counts });
  check("konteks periode = periode berjalan", all.json?.academicYearContext?.id === operational.id, all.json?.academicYearContext?.label);
  const row = (all.json?.students ?? []).find((u) => u.identityNumber === "2211528015");
  check("baris mahasiswa membawa penanda SIA periode itu", row?.student?.semesterFlags?.source === "sia", row?.student?.semesterFlags);
});

const failed = summary();
await prisma.$disconnect();
process.exit(failed ? 1 : 0);
