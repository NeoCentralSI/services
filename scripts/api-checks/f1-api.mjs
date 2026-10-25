// Demo accounts of seed-thesis-final-stages.js are in the state they promise, read through the
// requirement checks of the modules (student overviews, assessment access, revisions); then the
// DevTools tables change status and dates directly (no side effect, no notification, logged).
// Run on a clean seed (nine seeders); it writes data.
import { api, BASE, check, login, run, summary } from "./lib-api.mjs";

const prisma = (await import(process.cwd() + "/src/config/prisma.js")).default;
const ADMIN = "admin_si", KADEP = "kadep_si", PENGUJI = "penguji_si", GKM = "gkm_si";
const demo = (key) => `ta_demo_${key}`;
const studentId = async (key) => (await prisma.user.findFirst({ where: { email: `${demo(key)}@fti.unand.ac.id` }, select: { id: true } }))?.id;
const seminarOverview = async (key) => (await api(demo(key), "GET", "/thesis-seminars/me/overview")).data;
const defenceOverview = async (key) => (await api(demo(key), "GET", "/thesis-defences/me/overview")).data;
const yudisiumOverview = async (key) => (await api(demo(key), "GET", "/yudisiums/me/overview")).data;
const dev = (method, path, body) => api(ADMIN, method, `/devtools${path}`, body);
const thesisOf = async (key) => prisma.thesis.findFirst({ where: { studentId: await studentId(key) }, orderBy: { createdAt: "desc" } });

await run("1 akun seed", async () => {
  const siap = await seminarOverview("siap_seminar");
  check("Siap Daftar Seminar: semua syarat seminar terpenuhi, belum mendaftar, bisa unggah", siap?.allChecklistMet === true && siap.seminar === null && siap.canUpload === true, siap?.checklist);

  const berlangsung = await seminarOverview("seminar_berlangsung");
  check("Seminar Berlangsung: Sedang Berlangsung", berlangsung?.seminar?.status === "ongoing", berlangsung?.seminar?.status);
  const form = await api(PENGUJI, "GET", `/thesis-seminars/${berlangsung?.seminar?.id}/assessment`);
  check("Seminar Berlangsung: penguji membuka form penilaian (siap dinilai)", form.status === 200 && form.data?.seminar?.status === "ongoing" && !form.data?.examiner?.assessmentSubmittedAt, form.status);

  const revisi = await seminarOverview("seminar_revisi");
  const items = await api(demo("seminar_revisi"), "GET", `/thesis-seminars/${revisi?.seminar?.id}/revisions`);
  check("Seminar Lulus Revisi: lulus dengan revisi, revisi belum selesai", revisi?.seminar?.status === "passed_with_revision" && items.data?.summary?.total === 2 && items.data?.summary?.finished === 0, items.data?.summary);

  const siapSidang = await defenceOverview("siap_sidang");
  check("Siap Daftar Sidang: seminar lulus, revisi selesai, syarat sidang terpenuhi, belum mendaftar", siapSidang?.allChecklistMet === true && siapSidang.defence === null, siapSidang?.checklist);

  const sidang = await defenceOverview("sidang_berlangsung");
  check("Sidang Berlangsung: Sedang Berlangsung", sidang?.defence?.status === "ongoing", sidang?.defence?.status);
  const supervisorForm = await api(KADEP, "GET", `/thesis-defences/${sidang?.defence?.id}/assessment`);
  const examinerForm = await api(GKM, "GET", `/thesis-defences/${sidang?.defence?.id}/assessment`);
  check("Sidang Berlangsung: pembimbing dan penguji membuka form penilaian", supervisorForm.status === 200 && examinerForm.status === 200, `${supervisorForm.status} ${examinerForm.status}`);

  const sidangRevisi = await defenceOverview("sidang_revisi");
  const thesisRevisi = await thesisOf("sidang_revisi");
  const defenceRevisions = await api(demo("sidang_revisi"), "GET", `/thesis-defences/${sidangRevisi?.defence?.id}/revisions`);
  check("Sidang Lulus Revisi: revisi belum selesai, TA masih Penelitian", sidangRevisi?.defence?.status === "passed_with_revision" && thesisRevisi?.status === "research" && defenceRevisions.data?.summary?.finished === 0, defenceRevisions.data?.summary);

  const siapYud = await yudisiumOverview("siap_yudisium");
  const thesisYud = await thesisOf("siap_yudisium");
  const academic = Object.entries(siapYud?.checklist ?? {}).filter(([key]) => key !== "exitSurvey").every(([, item]) => item.met);
  check("Siap Yudisium: TA Selesai, periode sedang buka, syarat akademik terpenuhi, exit survey bisa diisi", thesisYud?.status === "completed" && siapYud?.yudisium?.status === "open" && academic && siapYud.checklist.exitSurvey.isAvailable === true && siapYud.participantStatus === null, siapYud?.yudisium?.status);

  const cpl = await yudisiumOverview("yudisium_cpl_kurang");
  const failing = (cpl?.cplScores ?? []).filter((s) => !s.passed);
  check("Peserta Yudisium CPL Kurang: terdaftar di periode buka, satu CPL tidak memenuhi", cpl?.participantStatus === "registered" && cpl?.yudisium?.status === "open" && failing.length === 1, failing.map((s) => s.code));

  const both = await api(ADMIN, "GET", "/adminfeatures/students?page=1&pageSize=100&programFilter=both");
  check("Metopen + TA Semester Ini: mengambil keduanya di semester aktif", both.json?.students?.some((s) => s.fullName === "Uji Demo Metopen dan TA Semester Ini"), both.json?.meta?.total);

  const blocked = await seminarOverview("tidak_ambil_ta");
  check("Tidak Mengambil TA: TA Penelitian, syarat mata kuliah TA tidak terpenuhi", blocked?.checklist?.mataKuliahTa?.met === false && blocked.allChecklistMet === false, blocked?.checklist?.mataKuliahTa);

  const audienceSource = await prisma.thesisSeminar.count({ where: { status: { in: ["passed", "passed_with_revision"] }, thesis: { student: { user: { email: { startsWith: "ta_demo_" } } } } } });
  check("seed menyediakan seminar selesai sebagai sumber kehadiran audiens", audienceSource >= 1, audienceSource);
});

await run("2 akses DevTools", async () => {
  const kadep = await api(KADEP, "GET", "/devtools/seminars");
  const student = await api(demo("seminar_berlangsung"), "PATCH", "/devtools/seminars/x", { status: "passed" });
  const anon = await fetch(`${BASE}/devtools/seminars`);
  check("non-Admin ditolak (403), tanpa login 401", kadep.status === 403 && student.status === 403 && anon.status === 401, `${kadep.status} ${student.status} ${anon.status}`);
  const bare = await fetch(`${BASE}/devtools-final-stages/seminars`);
  check("rute DevTools tidak terpasang di luar /devtools", bare.status === 404, bare.status);
  const old = await dev("GET", `/final-stages/${await studentId("seminar_berlangsung")}`);
  check("panel dan endpoint F1 sudah tidak ada", old.status === 404, old.status);
});

await run("3 tabel Seminar Hasil dan Sidang", async () => {
  const list = await dev("GET", "/seminars?search=Uji Demo Seminar Berlangsung");
  const row = list.data?.find?.((r) => r.studentName === "Uji Demo Seminar Berlangsung") ?? list.json?.data?.[0];
  check("daftar seminar dengan cari: mahasiswa, status, tanggal, jam", list.status === 200 && row?.status === "scheduled" && !!row.date && !!row.startTime, row);
  const notificationsBefore = await prisma.notification.count();
  const past = await dev("PATCH", `/seminars/${row.id}`, { preset: "past" });
  check("Sudah lewat: kemarin, status tetap", past.status === 200 && past.json?.data?.status === "scheduled" && past.json.data.date < new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10), past.json?.data);
  const now = await dev("PATCH", `/seminars/${row.id}`, { preset: "now" });
  const view = await seminarOverview("seminar_berlangsung");
  check("Mulai sekarang: mahasiswa melihat Sedang Berlangsung", now.status === 200 && view?.seminar?.status === "ongoing", view?.seminar?.status);
  const direct = await dev("PATCH", `/seminars/${row.id}`, { status: "passed", date: "2020-01-06", startTime: "23:00", endTime: "06:00" });
  const stored = await prisma.thesisSeminar.findUnique({ where: { id: row.id }, include: { examiners: true } });
  const thesis = await thesisOf("seminar_berlangsung");
  const supervisors = await prisma.thesisSupervisors.findMany({ where: { thesisId: thesis.id } });
  check("status dan jadwal ditulis langsung, tanpa validasi aplikasi dan tanpa efek samping", direct.status === 200 && stored.status === "passed" && !stored.resultFinalizedAt && stored.finalScore === null && stored.examiners.every((e) => !e.assessmentSubmittedAt) && supervisors.every((s) => s.seminarReady), { status: stored.status, finalScore: stored.finalScore });
  check("tidak ada notifikasi", (await prisma.notification.count()) === notificationsBefore, await prisma.notification.count());
  const audit = await prisma.auditLog.findFirst({ where: { action: "DEVTOOLS_DATA_CHANGED", entityId: thesis.id }, orderBy: { createdAt: "desc" } });
  check("tercatat di Log Aktivitas: pelaku Admin, sumber DevTools", audit?.changes?.metadata?.source === "devtools" && audit.changes.newValues?.eventStatus === "passed" && !!audit.userId, audit?.changes);
  const bad = await dev("PATCH", `/seminars/${row.id}`, { status: "ongoing" });
  check("status di luar enum ditolak", bad.status === 400, bad.json?.message);
  await dev("PATCH", `/seminars/${row.id}`, { status: "scheduled", preset: undefined });
  const defences = await dev("GET", "/defences?status=passed_with_revision");
  check("tabel sidang dengan filter status", defences.status === 200 && (defences.json?.data ?? []).every((r) => r.status === "passed_with_revision") && (defences.json?.data ?? []).some((r) => r.studentName === "Uji Demo Sidang Lulus Revisi"), defences.json?.meta);
});

await run("4 tabel Yudisium", async () => {
  const periods = await dev("GET", "/yudisium-periods");
  const period = periods.json?.data?.find((p) => p.name.startsWith("Yudisium Ganjil"));
  check("daftar periode: nama, buka, tutup, acara", periods.status === 200 && !!period?.registrationOpenDate && !!period.eventDate, period);
  const close = new Date(Date.now() - 60 * 1000).toISOString();
  const changed = await dev("PATCH", `/yudisium-periods/${period.id}`, { registrationCloseDate: close });
  const view = await yudisiumOverview("siap_yudisium");
  check("tanggal ditulis langsung; status periode dihitung dari tanggal", changed.status === 200 && (view?.yudisium === null || view?.yudisium?.status === "closed"), view?.yudisium?.status ?? null);
  await dev("PATCH", `/yudisium-periods/${period.id}`, { registrationCloseDate: new Date(Date.now() + 14 * 86400e3).toISOString() });
  const participants = await dev("GET", "/yudisium-participants?search=Uji Demo Yudisium CPL Kurang");
  const participant = participants.json?.data?.[0];
  check("daftar peserta: mahasiswa, periode, status", participant?.status === "registered" && participant.periodName === period.name, participant);
  const set = await dev("PATCH", `/yudisium-participants/${participant.id}`, { status: "finalized" });
  const student = await prisma.student.findUnique({ where: { id: await studentId("yudisium_cpl_kurang") } });
  const scores = await prisma.studentCplScore.findMany({ where: { studentId: student.id } });
  check("status peserta langsung, tanpa efek samping (mahasiswa tetap Aktif, CPL tidak final)", set.status === 200 && set.json?.data?.status === "finalized" && student.status === "active" && scores.every((s) => s.status !== "finalized"), student.status);
  await dev("PATCH", `/yudisium-participants/${participant.id}`, { status: "registered" });
});

await prisma.$disconnect();
process.exit(summary() ? 1 : 0);
