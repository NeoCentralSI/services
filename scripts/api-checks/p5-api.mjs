// P5 API checks: attendance, Penilaian Proposal, result, promotion, exports, monitoring.
// Mutates central; run from app/backend after a clean seed (see README): node scripts/api-checks/p5-api.mjs
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { api, check, run, summary, login, ids } from "./lib-api.mjs";

const require = createRequire(process.cwd() + "/package.json");
const XLSX = require("xlsx");
const prisma = (await import(process.cwd() + "/src/config/prisma.js")).default;

const U = (key) => `prop_${key}`;
const AINA = "penguji_si", ULLYA = "gkm_si", HUSNIL = "pembimbing_si", KADEP = "kadep_si", SEKDEP = "sekdep_si", ADMIN = "admin_si";
const fixture = (name) => readFileSync(`scripts/fixtures/research-method-attendance-${name}.xlsx`);
const blob = (buf) => new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
const form = (fields, files) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  for (const [name, buf] of files) f.append("files", blob(buf), name);
  return f;
};
const pdf = () => new Blob([Buffer.from("%PDF-1.4\n% ulang\n%%EOF\n")], { type: "application/pdf" });
const pdfForm = () => { const f = new FormData(); f.append("file", pdf(), "proposal-ulang.pdf"); return f; };

/** A class file like the attendance export, with chosen rows. */
function classFile(rows) {
  const aoa = [
    ["REPORT PESERTA KELAS"], ["Matakuliah", ":", "Metodologi Penelitian"], ["Kelas", ":", "C"], ["Semester", ":", "Ganjil 2026/2027"], [],
    ["No", "NIM / BP", "Nama Mahasiswa", "Hadir", "Alpa", "Sakit", "Izin", "Total", "Persentase Hadir"],
    ...rows.map(([nim, name, present], i) => [i + 1, nim, name, present, 16 - present, 0, 0, 16, `${((present / 16) * 100).toFixed(2)}%`]),
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Sheet1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

let current, previous;
const attemptOf = async (key, yearId) => prisma.researchMethodAssessment.findFirst({
  where: { thesis: { student: { user: { email: `prop_${key}@fti.unand.ac.id` } } }, ...(yearId ? { academicYearId: yearId } : {}) },
  orderBy: { createdAt: "desc" },
});

await run("0 persiapan", async () => {
  for (const u of [AINA, ULLYA, HUSNIL, KADEP, SEKDEP, ADMIN]) await login(u);
  const years = await prisma.academicYear.findMany({ orderBy: { startDate: "desc" } });
  const op = (await import(process.cwd() + "/src/helpers/academicYear.helper.js")).resolveOperationalAcademicYear;
  current = await op();
  previous = years.find((y) => y.startDate < current.startDate);
  check("periode berjalan dan periode lalu ada", Boolean(current && previous), [current?.year, current?.semester, previous?.year, previous?.semester]);
});

await run("1 presensi", async () => {
  const ov = await api(HUSNIL, "GET", `/research-method/attendance-imports?academicYearId=${current.id}`);
  check("koordinator melihat presensi berlaku (seed)", ov.status === 200 && ov.data?.current?.totals?.totalRows === 9 && ov.data.current.records.length === 9, ov.data?.current?.totals);
  const sek = await api(SEKDEP, "GET", `/research-method/attendance-imports?academicYearId=${current.id}`);
  check("Sekdep membaca presensi", sek.status === 200, sek.status);
  const lec = await api(AINA, "GET", `/research-method/attendance-imports?academicYearId=${current.id}`);
  check("dosen biasa tidak membuka presensi (403)", lec.status === 403, lec.status);
  const noYear = await api(HUSNIL, "POST", "/research-method/attendance-imports/preview", undefined, { form: form({}, [["a.xlsx", fixture("kelas-a")]]) });
  check("tanpa periode ditolak 400", noYear.status === 400 && /Periode akademik wajib/.test(noYear.json?.message ?? ""), noYear.json?.message);
  const before = await prisma.researchMethodAttendanceImport.count();
  const prev = await api(HUSNIL, "POST", "/research-method/attendance-imports/preview", undefined, { form: form({ academicYearId: current.id }, [["kelas-a.xlsx", fixture("kelas-a")], ["kelas-b.xlsx", fixture("kelas-b")]]) });
  const auto = (prev.data?.willAutoZero ?? []).map((r) => r.identityNumber);
  check("pratinjau dua kelas: 9 baris, 1 tidak dikenal, nilai 0 untuk Final Terkirim (68,75%)",
    prev.status === 200 && prev.data?.totals?.totalRows === 9 && prev.data?.totals?.unmatchedRows === 1 && auto.includes("2211528011"),
    { totals: prev.data?.totals, auto });
  check("pratinjau tidak menulis apa pun", (await prisma.researchMethodAttendanceImport.count()) === before);
  const dup = await api(HUSNIL, "POST", "/research-method/attendance-imports/preview", undefined, { form: form({ academicYearId: current.id }, [["a1.xlsx", fixture("kelas-a")], ["a2.xlsx", fixture("kelas-a")]]) });
  check("NIM di dua berkas ditolak 400 dengan daftar", dup.status === 400 && /NIM yang muncul/.test(dup.json?.message ?? ""), dup.json?.message);
  const three = await api(HUSNIL, "POST", "/research-method/attendance-imports/preview", undefined, { form: form({ academicYearId: current.id }, [["a.xlsx", fixture("kelas-a")], ["b.xlsx", fixture("kelas-b")], ["s.xlsx", fixture("seed")]]) });
  check("lebih dari dua berkas ditolak", three.status === 400, three.json?.message);
  const bad = await api(HUSNIL, "POST", "/research-method/attendance-imports/preview", undefined, { form: form({ academicYearId: current.id }, [["x.xlsx", Buffer.from("bukan excel")]]) });
  check("berkas tidak terbaca ditolak 400", bad.status === 400, bad.json?.message);
  const notCoord = await api(SEKDEP, "POST", "/research-method/attendance-imports", undefined, { form: form({ academicYearId: current.id }, [["a.xlsx", fixture("kelas-a")]]) });
  check("hanya koordinator yang mengunggah (Sekdep 403)", notCoord.status === 403, notCoord.status);

  const up = await api(HUSNIL, "POST", "/research-method/attendance-imports", undefined, { form: form({ academicYearId: current.id }, [["kelas-a.xlsx", fixture("kelas-a")], ["kelas-b.xlsx", fixture("kelas-b")]]) });
  check("unggah dua kelas: Final Terkirim otomatis 0", up.status === 200 && up.data?.autoZeroed?.some((r) => r.identityNumber === "2211528011") && up.data?.import?.totals?.autoZeroedCount === 1, `${up.status} ${up.json?.message ?? ""} ${JSON.stringify(up.data?.import?.totals)}`);
  const final = await attemptOf("proposal_final", current.id);
  check("percobaan Final Terkirim: 0, final, tidak lulus", final?.attendanceAutoZeroedAt && final.finalScore === 0 && final.isFinalized && final.result === "failed", final && `${final.finalScore} ${final.result}`);
  const notif = await prisma.notification.findFirst({ where: { user: { email: "prop_proposal_final@fti.unand.ac.id" }, type: "research_method_attendance_auto_zero" } });
  check("mahasiswa diberi tahu", Boolean(notif), notif?.title);
  const after = await api(HUSNIL, "GET", `/research-method/attendance-imports?academicYearId=${current.id}`);
  check("presensi berlaku = unggahan terbaru; yang lama jadi riwayat", after.data?.current?.id === up.data?.import?.id && after.data?.history?.length === 1, after.data?.history?.length);
  const file = await api(SEKDEP, "GET", after.data?.current?.sourceFiles?.[0]?.url);
  check("berkas sumber bisa diunduh", file.status === 200 && file.bytes > 1000, `${file.status} ${file.bytes}`);

  const fixed = await api(HUSNIL, "POST", "/research-method/attendance-imports", undefined, {
    form: form({ academicYearId: current.id }, [["koreksi.xlsx", classFile([["2211528011", "Uji Proposal Final Terkirim", 13], ["2211528012", "Uji Proposal Presensi Kurang", 10]])]]),
  });
  const reopened = await attemptOf("proposal_final", current.id);
  check("unggahan koreksi yang memenuhi membuka kembali nilai 0 (fase proposal)", fixed.status === 200 && fixed.data?.reopenedCount >= 1 && !reopened.attendanceAutoZeroedAt && !reopened.isFinalized && reopened.result === null, `${fixed.status} ${fixed.data?.reopenedCount}`);
  // back to the full class so the other scenarios have their rows
  const full = await api(HUSNIL, "POST", "/research-method/attendance-imports", undefined, {
    form: form({ academicYearId: current.id }, [["kelas-penuh.xlsx", classFile([
      ["2211528001", "Uji Proposal Layak", 15], ["2211528010", "Uji Proposal Ditetapkan", 12], ["2211528011", "Uji Proposal Final Terkirim", 13],
      ["2211528012", "Uji Proposal Presensi Kurang", 10], ["2211528013", "Uji Proposal Siap Dinilai", 15], ["2211528014", "Uji Proposal Dinilai Pembimbing", 16],
      ["2211528015", "Uji Proposal Lulus Tunggu KRS", 13], ["2211528017", "Uji Proposal Tidak Lulus", 14],
    ])]]),
  });
  check("unggahan kelas lengkap untuk skenario berikutnya", full.status === 200, full.json?.message);
});

let siap;
await run("2 penilaian pembimbing (K9)", async () => {
  siap = await attemptOf("siap_dinilai", current.id);
  const form1 = await api(AINA, "GET", `/research-method/assessments/form?party=supervisor&academicYearId=${current.id}`);
  check("form pembimbing: 3 kriteria, bobot 75, nilai minimum 60", form1.data?.criteria?.length === 3 && form1.data?.weight === 75 && form1.data?.minimumScore === 60, form1.data && `${form1.data.criteria?.length} ${form1.data.weight}`);
  const form2 = await api(HUSNIL, "GET", `/research-method/assessments/form?party=coordinator&academicYearId=${current.id}`);
  check("form koordinator: 1 kriteria, bobot 25", form2.data?.criteria?.length === 1 && form2.data?.weight === 25, form2.data?.weight);
  const crit = form1.data.criteria;
  const pick = (c, score) => ({ criteriaId: c.id, rubricId: c.rubrics.find((r) => score >= r.minScore && score <= r.maxScore)?.id, score });
  const good = [pick(crit[0], 17), pick(crit[1], 33), pick(crit[2], 12)];
  const queue = await api(AINA, "GET", "/research-method/assessments/supervisor");
  const row = (queue.data?.rows ?? []).find((r) => r.id === siap.id);
  check("antrean Aina memuat Siap Dinilai yang bisa dinilai", row?.canScore === true, row?.scoreBlockReason);
  const waiting = (queue.data?.rows ?? []).find((r) => r.student?.identityNumber === "2211528010");
  check("mahasiswa tanpa proposal final tampil dengan alasan", waiting && waiting.canScore === false && /proposal final/.test(waiting.scoreBlockReason ?? ""), waiting?.scoreBlockReason);

  const noRubric = await api(AINA, "POST", `/research-method/assessments/${siap.id}/supervisor-score`, { scores: [{ criteriaId: crit[0].id, score: 17 }, good[1], good[2]] });
  check("rubrik wajib dipilih (400)", noRubric.status === 400 && /Rubrik penilaian wajib/.test(noRubric.json?.message ?? ""), noRubric.json?.message);
  const over = await api(AINA, "POST", `/research-method/assessments/${siap.id}/supervisor-score`, { scores: [{ ...good[0], score: 21 }, good[1], good[2]] });
  check("melebihi maksimum kriteria (400)", over.status === 400 && /melebihi batas maksimum/.test(over.json?.message ?? ""), over.json?.message);
  const range = await api(AINA, "POST", `/research-method/assessments/${siap.id}/supervisor-score`, { scores: [{ ...good[0], score: 3 }, good[1], good[2]] });
  check("di luar rentang rubrik (400)", range.status === 400 && /rentang rubrik/.test(range.json?.message ?? ""), range.json?.message);
  const missing = await api(AINA, "POST", `/research-method/assessments/${siap.id}/supervisor-score`, { scores: [good[0], good[1]] });
  check("semua kriteria wajib (400)", missing.status === 400 && /Semua kriteria wajib/.test(missing.json?.message ?? ""), missing.json?.message);
  const frac = await api(AINA, "POST", `/research-method/assessments/${siap.id}/supervisor-score`, { scores: [{ ...good[0], score: 16.5 }, good[1], good[2]] });
  check("skor pecahan ditolak (400)", frac.status === 400 && /bilangan bulat/.test(frac.json?.message ?? ""), frac.json?.message);
  const coordAsSup = await api(HUSNIL, "POST", `/research-method/assessments/${siap.id}/supervisor-score`, { scores: good });
  check("koordinator bukan pembimbing tidak bisa mengisi nilai pembimbing (403)", coordAsSup.status === 403, coordAsSup.status);

  const p2 = await api(ULLYA, "POST", `/research-method/assessments/${siap.id}/supervisor-score`, { scores: good });
  check("Pembimbing 2 mengisi sebagai cadangan: 62, penilai tercatat", p2.status === 200 && p2.data?.supervisorScore === 62 && /Ullya/i.test(p2.data?.supervisorName ?? ""), `${p2.status} ${p2.json?.message} ${p2.data?.supervisorScore} ${p2.data?.supervisorName}`);
  const again = await api(AINA, "POST", `/research-method/assessments/${siap.id}/supervisor-score`, { scores: good });
  check("nilai pembimbing terkunci setelah dikirim (403)", again.status === 403 && /terkunci/.test(again.json?.message ?? ""), again.json?.message);
  const student = await api(U("siap_dinilai"), "GET", `/research-method/assessments/${siap.id}`);
  check("mahasiswa belum melihat nilai sebelum final", student.status === 200 && student.data?.supervisorScore === null, student.data?.supervisorScore);
  const cnotif = await prisma.notification.findFirst({ where: { user: { email: "pembimbing_si@fti.unand.ac.id" }, type: "research_method_coordinator_pending" } });
  check("koordinator diberi tahu", Boolean(cnotif));
});

await run("3 penilaian koordinator dan hasil", async () => {
  const form2 = await api(HUSNIL, "GET", `/research-method/assessments/form?party=coordinator&academicYearId=${current.id}`);
  const c = form2.data.criteria[0];
  const score = (n) => [{ criteriaId: c.id, rubricId: c.rubrics.find((r) => n >= r.minScore && n <= r.maxScore)?.id, score: n }];
  const queue = await api(HUSNIL, "GET", "/research-method/assessments/coordinator");
  check("antrean koordinator memuat percobaan berproposal final", (queue.data?.rows ?? []).some((r) => r.id === siap.id && r.canScore), queue.data?.rows?.length);
  const fin = await api(HUSNIL, "POST", `/research-method/assessments/${siap.id}/coordinator-score`, { scores: score(20) });
  check("koordinator mengisi: final 82, lulus", fin.status === 200 && fin.data?.finalScore === 82 && fin.data?.isFinalized && fin.data?.result === "passed", `${fin.status} ${fin.json?.message} ${fin.data?.finalScore} ${fin.data?.result}`);
  const me = await api(U("siap_dinilai"), "GET", "/thesis-proposals/me");
  check("mahasiswa melihat nilai akhir dan hasil", me.data?.finalProposal?.current?.finalScore === 82 && me.data?.finalProposal?.current?.result === "passed", me.data?.finalProposal?.current);
  const t = await prisma.thesis.findFirst({ where: { student: { user: { email: "prop_siap_dinilai@fti.unand.ac.id" } } } });
  check("lulus tetapi masih fase proposal sampai proses kelulusan", t.status === "proposal", t.status);

  const lowCoord = await api(HUSNIL, "PATCH", `/research-method/academic-years/${current.id}/minimum-score`, { minimumScore: 70 });
  check("koordinator tidak mengubah nilai minimum (403)", lowCoord.status === 403, lowCoord.status);
  const setMin = await api(SEKDEP, "PATCH", `/research-method/academic-years/${current.id}/minimum-score`, { minimumScore: 70 });
  check("Sekdep menetapkan nilai minimum 70", setMin.status === 200 && setMin.data?.researchMethodMinimumScore === 70, setMin.json?.message);
  const dp = await attemptOf("dinilai_pembimbing", current.id);
  const fail = await api(HUSNIL, "POST", `/research-method/assessments/${dp.id}/coordinator-score`, { scores: score(8) });
  check("60 + 8 = 68 < 70: tidak lulus", fail.data?.finalScore === 68 && fail.data?.result === "failed", `${fail.status} ${fail.json?.message} ${fail.data?.finalScore} ${fail.data?.result}`);
  await api(SEKDEP, "PATCH", `/research-method/academic-years/${current.id}/minimum-score`, { minimumScore: 60 });
  const again = await api(HUSNIL, "POST", `/research-method/assessments/${dp.id}/coordinator-score`, { scores: score(9) });
  check("nilai final tidak bisa diubah (403)", again.status === 403, again.json?.message);

  const pk = await attemptOf("presensi_kurang", current.id);
  const blocked = await api(ULLYA, "POST", `/research-method/assessments/${pk.id}/supervisor-score`, { scores: [] });
  check("presensi < 75% (nilai 0): penilaian manual ditolak", blocked.status === 400 || blocked.status === 403, `${blocked.status} ${blocked.json?.message}`);
  const prevAttempt = await attemptOf("siap_naik", previous.id);
  const old = await api(AINA, "GET", `/research-method/assessments/supervisor?academicYearId=${previous.id}`);
  const oldRow = (old.data?.rows ?? []).find((r) => r.id === prevAttempt.id);
  check("periode lalu tampil sebagai riwayat, tidak bisa dinilai", oldRow && oldRow.canScore === false && /periode berjalan/.test(oldRow.scoreBlockReason ?? ""), oldRow?.scoreBlockReason);
});

await run("4 mengulang (K2)", async () => {
  const up = await api(U("tidak_lulus"), "POST", "/thesis-proposals/me/final-proposal", undefined, { form: pdfForm() });
  check("yang tidak lulus mengajukan proposal final periode baru", up.status === 200, `${up.status} ${up.json?.message}`);
  const rows = await prisma.researchMethodAssessment.findMany({ where: { thesis: { student: { user: { email: "prop_tidak_lulus@fti.unand.ac.id" } } } }, orderBy: { createdAt: "asc" } });
  check("dua percobaan: lama gagal tetap, baru terbuka", rows.length === 2 && rows[0].result === "failed" && rows[1].isFinalized === false && rows[1].academicYearId === current.id, rows.map((r) => `${r.academicYearId === current.id ? "kini" : "lalu"}:${r.result}`));
  const t = await prisma.thesis.findFirst({ where: { student: { user: { email: "prop_tidak_lulus@fti.unand.ac.id" } } }, include: { thesisSupervisors: { where: { status: "active" } } } });
  check("status tetap proposal, pembimbing dan judul tetap", t.status === "proposal" && t.thesisSupervisors.length > 0 && Boolean(t.title), t.status);
  const q = await api(ULLYA, "GET", "/research-method/assessments/supervisor");
  check("percobaan baru siap dinilai pembimbing", (q.data?.rows ?? []).some((r) => r.id === rows[1].id && r.canScore), (q.data?.rows ?? []).find((r) => r.id === rows[1].id)?.scoreBlockReason);
});

await run("5 naik ke Penelitian (K13, R18)", async () => {
  const forbidden = await api(AINA, "GET", "/research-method/promotions");
  check("dosen biasa tidak menjalankan proses kelulusan (403)", forbidden.status === 403, forbidden.status);
  const naikId = (await prisma.student.findFirst({ where: { user: { email: "prop_siap_naik@fti.unand.ac.id" } } })).id;
  await api(ADMIN, "PATCH", `/devtools/students/${naikId}/period-flags`, { takingThesisCourse: null });
  const p1 = await api(HUSNIL, "GET", "/research-method/promotions");
  const by = (rows, nim) => (rows ?? []).find((r) => r.student?.identityNumber === nim);
  check("data SIA belum ada: ditunda", by(p1.data?.rows, "2211528016")?.decision === "wait_sia", by(p1.data?.rows, "2211528016"));
  check("lulus periode ini: menunggu periode berikutnya", by(p1.data?.rows, "2211528015")?.decision === "wait_next_period" && by(p1.data?.rows, "2211528013")?.decision === "wait_next_period", [by(p1.data?.rows, "2211528015")?.decision, by(p1.data?.rows, "2211528013")?.decision]);
  check("yang tidak lulus bukan kandidat", !by(p1.data?.rows, "2211528017") && !by(p1.data?.rows, "2211528014"));
  await api(ADMIN, "PATCH", `/devtools/students/${naikId}/period-flags`, { takingThesisCourse: true });
  const runResult = await api(KADEP, "POST", "/research-method/promotions/run");
  check("proses kelulusan: Siap Naik naik", runResult.status === 200 && runResult.data?.promoted?.some((r) => r.student?.identityNumber === "2211528016"), runResult.data && `${runResult.data.promoted?.length} ${runResult.data.deferred?.length} ${runResult.data.failed?.length}`);
  const t = await prisma.thesis.findFirst({ where: { student: { user: { email: "prop_siap_naik@fti.unand.ac.id" } } } });
  check("status penelitian, startDate dan statusChangedAt terisi (K5)", t.status === "research" && Boolean(t.startDate) && Boolean(t.statusChangedAt), `${t.status} ${t.startDate}`);
  const audit = await prisma.auditLog.findFirst({ where: { action: "RESEARCH_METHOD_PROMOTED", entityId: t.id } });
  const statusAudit = await prisma.auditLog.findFirst({ where: { action: "THESIS_STATUS_CHANGED", entityId: t.id } });
  check("audit kelulusan dan perubahan status", Boolean(audit && statusAudit));
  const second = await api(KADEP, "POST", "/research-method/promotions/run");
  check("dijalankan ulang: tidak ada yang naik lagi", second.status === 200 && second.data?.promoted?.length === 0, second.data?.promoted?.length);
  const job = (await import(process.cwd() + "/src/jobs/research-method-promotion.job.js")).runResearchMethodPromotionJob;
  const jr = await job();
  check("job terjadwal berjalan tanpa galat", jr.failed === 0, jr);
});

await run("6 ekspor dan monitoring", async () => {
  const rec = await api(HUSNIL, "GET", `/research-method/exports/scores?academicYearId=${current.id}`);
  check("rekap nilai .xlsx", rec.status === 200 && rec.ct.includes("spreadsheetml"), `${rec.status} ${rec.ct}`);
  const raw = await fetch(`${process.env.BASE || "http://localhost:3000"}/research-method/exports/scores?academicYearId=${current.id}`, { headers: { Authorization: `Bearer ${await login(HUSNIL)}` } });
  const wb = XLSX.read(Buffer.from(await raw.arrayBuffer()));
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null });
  check("baris bobot = 20, 40, 25, 15 (konfigurasi periode)", JSON.stringify(rows[8].slice(3, 7)) === "[20,40,25,15]", rows[8]);
  const lulus = rows.find((r) => r[1] === "2211528015");
  check("baris Lulus Tunggu KRS: 18, 34, 20, 12", JSON.stringify(lulus?.slice(3, 7)) === "[18,34,20,12]", lulus);
  const kurang = rows.find((r) => r[1] === "2211528012");
  check("baris presensi kurang: semua 0", JSON.stringify(kurang?.slice(3, 7)) === "[0,0,0,0]", kurang);
  const belum = rows.find((r) => r[1] === "2211528010");
  check("belum dinilai: sel kosong", belum && belum.slice(3, 7).every((v) => v === null), belum);
  const titles = await api(KADEP, "GET", `/research-method/exports/passed-titles?academicYearId=${previous.id}`);
  check("daftar judul lulus .xlsx", titles.status === 200 && titles.ct.includes("spreadsheetml"), titles.status);
  const rawT = await fetch(`${process.env.BASE || "http://localhost:3000"}/research-method/exports/passed-titles?academicYearId=${previous.id}`, { headers: { Authorization: `Bearer ${await login(KADEP)}` } });
  const trows = XLSX.utils.sheet_to_json(XLSX.read(Buffer.from(await rawT.arrayBuffer())).Sheets["Judul Lulus"], { header: 1, defval: null });
  const nims = trows.slice(3).map((r) => r[1]);
  check("periode lalu: Siap Naik dan Sudah Naik, tanpa yang tidak lulus", nims.includes("2211528016") && nims.includes("2211528018") && !nims.includes("2211528017"), nims);
  const stu = await api(U("siap_dinilai"), "GET", `/research-method/exports/scores?academicYearId=${current.id}`);
  check("mahasiswa tidak bisa mengekspor (403)", stu.status === 403, stu.status);
  const mon = await api(SEKDEP, "GET", `/research-method/monitoring?academicYearId=${current.id}`);
  const s = mon.data?.summary;
  check("monitoring kelas: ringkasan dan baris", mon.status === 200 && s?.total >= 8 && s.passed >= 2 && s.failed >= 2 && mon.data.rows.every((r) => r.identityNumber), s);
  const row = mon.data?.rows?.find((r) => r.identityNumber === "2211528013");
  check("baris memuat pembimbing, penetapan, bimbingan proposal, presensi, nilai", row?.thesis?.supervisorAssignedAt && row.thesis.proposalGuidances === 2 && row.attendance?.isEligible && row.assessment?.finalScore === 82, row && JSON.stringify({ g: row.thesis?.proposalGuidances, a: row.attendance, s: row.assessment?.finalScore }));
});

const failed = summary();
await prisma.$disconnect();
process.exit(failed ? 1 : 0);
