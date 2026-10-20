// API checks: Penilaian Proposal (drafts, free order, a pass starts research at once), the
// semester's locks, access, the seminar gate of the course, exports and Monitoring Kelas.
// Mutates central; run from app/backend after a clean seed (see README): node scripts/api-checks/p5-api.mjs
import { createRequire } from "node:module";
import { api, check, run, summary, login, ids } from "./lib-api.mjs";

const require = createRequire(process.cwd() + "/package.json");
const XLSX = require("xlsx");
const prisma = (await import(process.cwd() + "/src/config/prisma.js")).default;

const U = (key) => `prop_${key}`;
const AINA = "penguji_si", ULLYA = "gkm_si", HUSNIL = "pembimbing_si", KADEP = "kadep_si", SEKDEP = "sekdep_si", ADMIN = "admin_si";
const PASSED = "Proposal dinyatakan lulus; tugas akhir masuk fase Penelitian.";
const LOCKED_DELETE = "Penilaian proposal semester ini sudah dimulai; CPMK, kriteria, dan rubrik tidak dapat dihapus.";
const LOCKED_SCORE = "Penilaian proposal semester ini sudah dimulai; skor maksimum kriteria dan rentang rubrik tidak dapat diubah.";
const LOCKED_MINIMUM = "Nilai minimum lulus terkunci karena sudah ada hasil penilaian final pada semester ini.";
const pdf = () => new Blob([Buffer.from("%PDF-1.4\n% ulang\n%%EOF\n")], { type: "application/pdf" });
const pdfForm = () => { const f = new FormData(); f.append("file", pdf(), "proposal-ulang.pdf"); return f; };

let current, previous;
const attemptOf = async (key, yearId) => prisma.researchMethodAssessment.findFirst({
  where: { thesis: { student: { user: { email: `prop_${key}@fti.unand.ac.id` } } }, ...(yearId ? { academicYearId: yearId } : {}) },
  orderBy: { createdAt: "desc" },
});
const thesisOf = (key) => prisma.thesis.findFirst({ where: { student: { user: { email: `prop_${key}@fti.unand.ac.id` } } } });
const near = (a, b) => a && b && Math.abs(new Date(a).getTime() - new Date(b).getTime()) < 2000;

await run("0 persiapan", async () => {
  for (const u of [AINA, ULLYA, HUSNIL, KADEP, SEKDEP, ADMIN]) await login(u);
  const years = await prisma.academicYear.findMany({ orderBy: { startDate: "desc" } });
  const op = (await import(process.cwd() + "/src/helpers/academicYear.helper.js")).resolveOperationalAcademicYear;
  current = await op();
  previous = years.find((y) => y.startDate < current.startDate);
  check("periode berjalan dan periode lalu ada", Boolean(current && previous), [current?.year, current?.semester, previous?.year, previous?.semester]);
});

await run("1 data seed menurut aturan baru", async () => {
  const lulus = await attemptOf("lulus", current.id);
  const tLulus = await thesisOf("lulus");
  check("lulus semester ini (64 + 20 = 84): TA langsung Penelitian, tanggal mulai = saat nilai kedua", lulus?.result === "passed" && lulus.finalScore === 84 && tLulus.status === "research" && near(tLulus.startDate, lulus.finalizedAt),
    { result: lulus?.result, status: tLulus?.status, startDate: tLulus?.startDate, finalizedAt: lulus?.finalizedAt });
  const pk = await attemptOf("presensi_kurang", current.id);
  const tPk = await thesisOf("presensi_kurang");
  const sPk = await prisma.student.findFirst({ where: { user: { email: "prop_presensi_kurang@fti.unand.ac.id" } } });
  check("lulus, presensi kurang: Penelitian, mata kuliah belum lulus di SIA", pk?.result === "passed" && pk.finalScore === 80 && tPk.status === "research" && sPk.researchMethodCompleted === false,
    { result: pk?.result, score: pk?.finalScore, status: tPk?.status, completed: sPk?.researchMethodCompleted });
  const fail = await attemptOf("tidak_lulus", previous.id);
  check("tidak lulus semester lalu (37 + 10 = 47): tetap Proposal", fail?.result === "failed" && fail.finalScore === 47 && (await thesisOf("tidak_lulus")).status === "proposal", fail?.finalScore);
  const draft = await attemptOf("draf_pembimbing", current.id);
  const draftDetails = await prisma.researchMethodSupervisorAssessmentDetail.count({ where: { assessmentId: draft.id } });
  check("draf pembimbing: dua rincian tanpa nilai pembimbing", draft.supervisorScore === null && draftDetails === 2, { score: draft.supervisorScore, details: draftDetails });
  check("tabel presensi tidak ada lagi", prisma.researchMethodAttendanceImport === undefined && prisma.researchMethodAttendanceRecord === undefined);
  const gone = await Promise.all(["/research-method/attendance-imports", "/research-method/promotions"].map((p) => api(HUSNIL, "GET", p)));
  check("rute presensi dan proses kelulusan tidak ada (404)", gone.every((r) => r.status === 404), gone.map((r) => r.status));
});

let siap;
await run("2 penilaian pembimbing: draf dan kirim", async () => {
  siap = await attemptOf("siap_dinilai", current.id);
  const form1 = await api(AINA, "GET", `/research-method/assessments/form?party=supervisor&academicYearId=${current.id}`);
  check("form pembimbing: 3 kriteria, bobot 75, nilai minimum 60, rubrik sebagai acuan", form1.data?.criteria?.length === 3 && form1.data?.weight === 75 && form1.data?.minimumScore === 60 && form1.data.criteria.every((c) => c.rubrics.length === 3), form1.data && `${form1.data.criteria?.length} ${form1.data.weight}`);
  const crit = form1.data.criteria;
  const good = [{ criteriaId: crit[0].id, score: 17 }, { criteriaId: crit[1].id, score: 33 }, { criteriaId: crit[2].id, score: 12 }];
  const queue = await api(AINA, "GET", "/research-method/assessments/supervisor");
  const row = (queue.data?.rows ?? []).find((r) => r.id === siap.id);
  check("antrean Aina memuat Siap Dinilai yang bisa dinilai, tanpa draf", row?.canScore === true && row.ownDraftSaved === false, row?.scoreBlockReason);
  const waiting = (queue.data?.rows ?? []).find((r) => r.student?.identityNumber === "2211528010");
  check("mahasiswa tanpa proposal final tampil dengan alasan", waiting && waiting.canScore === false && /proposal final/.test(waiting.scoreBlockReason ?? ""), waiting?.scoreBlockReason);

  const over = await api(AINA, "POST", `/research-method/assessments/${siap.id}/supervisor-score`, { scores: [{ ...good[0], score: 21 }, good[1], good[2]] });
  check("melebihi maksimum kriteria (400)", over.status === 400 && /melebihi batas maksimum/.test(over.json?.message ?? ""), over.json?.message);
  const missing = await api(AINA, "POST", `/research-method/assessments/${siap.id}/supervisor-score`, { scores: [good[0], good[1]] });
  check("kirim: semua kriteria wajib (400)", missing.status === 400 && /Semua kriteria wajib/.test(missing.json?.message ?? ""), missing.json?.message);
  const frac = await api(AINA, "POST", `/research-method/assessments/${siap.id}/supervisor-score`, { scores: [{ ...good[0], score: 16.5 }, good[1], good[2]] });
  check("skor pecahan ditolak (400)", frac.status === 400 && /bilangan bulat/.test(frac.json?.message ?? ""), frac.json?.message);
  const coordAsSup = await api(HUSNIL, "POST", `/research-method/assessments/${siap.id}/supervisor-score`, { scores: good });
  check("koordinator bukan pembimbing tidak bisa mengisi nilai pembimbing (403)", coordAsSup.status === 403, coordAsSup.status);

  const draft = await api(AINA, "POST", `/research-method/assessments/${siap.id}/supervisor-score`, { scores: [good[0]], isDraft: true });
  const afterDraft = await attemptOf("siap_dinilai", current.id);
  const draftRows = await prisma.researchMethodSupervisorAssessmentDetail.count({ where: { assessmentId: siap.id } });
  check("Simpan Draf: satu kriteria tersimpan, nilai pembimbing belum ada", draft.status === 200 && draft.json?.message === "Draf penilaian disimpan" && afterDraft.supervisorScore === null && draftRows === 1, `${draft.status} ${draft.json?.message} ${draftRows}`);
  const again = await api(AINA, "POST", `/research-method/assessments/${siap.id}/supervisor-score`, { scores: good, isDraft: true });
  check("Simpan Draf bisa diulang (tiga kriteria)", again.status === 200 && (await prisma.researchMethodSupervisorAssessmentDetail.count({ where: { assessmentId: siap.id } })) === 3, again.status);
  const own = await api(AINA, "GET", `/research-method/assessments/${siap.id}/supervisor-form`);
  check("form pembimbing memuat drafnya sendiri", own.data?.own?.status === "draft" && own.data.criteria.map((c) => c.score).join() === "17,33,12" && own.data.other?.submitted === false, own.data?.own);
  const queueDraft = (await api(AINA, "GET", "/research-method/assessments/supervisor")).data?.rows?.find((r) => r.id === siap.id);
  check("antrean pembimbing menandai Draf Tersimpan", queueDraft?.ownDraftSaved === true && queueDraft.supervisorScore === null, queueDraft?.ownDraftSaved);
  const coordForm = await api(HUSNIL, "GET", `/research-method/assessments/${siap.id}/coordinator-form`);
  check("draf tidak terlihat koordinator dan tidak dihitung", coordForm.data?.other?.submitted === false && coordForm.data.other.total === null && coordForm.data.other.criteria.length === 0, coordForm.data?.other);
  const coordView = await api(HUSNIL, "GET", `/research-method/assessments/${siap.id}`);
  check("detail untuk koordinator: tanpa rincian draf", coordView.data?.supervisorScore === null && coordView.data.supervisorDetails.length === 0, coordView.data?.supervisorDetails?.length);

  const p2 = await api(ULLYA, "POST", `/research-method/assessments/${siap.id}/supervisor-score`, { scores: good });
  check("Pembimbing 2 mengirim sebagai cadangan: 62, penilai tercatat", p2.status === 200 && p2.json?.message === "Nilai pembimbing dikirim" && p2.data?.supervisorScore === 62 && /Ullya/i.test(p2.data?.supervisorName ?? ""), `${p2.status} ${p2.json?.message} ${p2.data?.supervisorScore} ${p2.data?.supervisorName}`);
  const locked = await api(AINA, "POST", `/research-method/assessments/${siap.id}/supervisor-score`, { scores: good });
  check("nilai pertama yang dikirim mengunci (403)", locked.status === 403 && /terkunci/.test(locked.json?.message ?? ""), locked.json?.message);
  const lockedDraft = await api(AINA, "POST", `/research-method/assessments/${siap.id}/supervisor-score`, { scores: good, isDraft: true });
  check("draf setelah terkirim ditolak (403)", lockedDraft.status === 403, lockedDraft.status);
  const student = await api(U("siap_dinilai"), "GET", `/research-method/assessments/${siap.id}`);
  check("mahasiswa belum melihat nilai sebelum final", student.status === 200 && student.data?.supervisorScore === null, student.data?.supervisorScore);
  const cnotif = await prisma.notification.findFirst({ where: { user: { email: "pembimbing_si@fti.unand.ac.id" }, type: "research_method_coordinator_pending" } });
  check("koordinator diberi tahu", Boolean(cnotif));
});

await run("3 urutan bebas, hasil, dan masuk Penelitian", async () => {
  const form2 = await api(HUSNIL, "GET", `/research-method/assessments/form?party=coordinator&academicYearId=${current.id}`);
  const c = form2.data.criteria[0];
  check("form koordinator: 1 kriteria, bobot 25", form2.data?.criteria?.length === 1 && form2.data?.weight === 25, form2.data?.weight);
  const score = (n) => [{ criteriaId: c.id, score: n }];

  // Koordinator lebih dulu, lalu pembimbing.
  const pf = await attemptOf("proposal_final", current.id);
  const first = await api(HUSNIL, "POST", `/research-method/assessments/${pf.id}/coordinator-score`, { scores: score(20) });
  check("koordinator boleh mengirim lebih dulu: belum final", first.status === 200 && first.data?.coordinatorScore === 20 && first.data?.isFinalized === false, `${first.status} ${first.json?.message}`);
  const supForm = await api(AINA, "GET", `/research-method/assessments/${pf.id}/supervisor-form`);
  check("form pembimbing memuat nilai koordinator sebagai acuan", supForm.data?.other?.submitted === true && supForm.data.other.total === 20 && supForm.data.other.criteria[0]?.score === 20 && supForm.data.own.status === "empty", supForm.data?.other);
  const sc = (await api(AINA, "GET", `/research-method/assessments/form?party=supervisor&academicYearId=${current.id}`)).data.criteria;
  const second = await api(AINA, "POST", `/research-method/assessments/${pf.id}/supervisor-score`, { scores: [{ criteriaId: sc[0].id, score: 17 }, { criteriaId: sc[1].id, score: 33 }, { criteriaId: sc[2].id, score: 12 }] });
  const tPf = await thesisOf("proposal_final");
  check("nilai kedua (pembimbing): final 82, lulus, TA langsung Penelitian", second.status === 200 && second.data?.finalScore === 82 && second.data?.result === "passed" && tPf.status === "research" && Boolean(tPf.startDate),
    `${second.status} ${second.json?.message} ${second.data?.finalScore} ${tPf.status}`);
  const audit = await prisma.auditLog.findFirst({ where: { action: "RESEARCH_METHOD_PROMOTED", entityId: tPf.id } });
  const statusAudit = await prisma.auditLog.findFirst({ where: { action: "THESIS_STATUS_CHANGED", entityId: tPf.id } });
  check("audit masuk Penelitian dan perubahan status", Boolean(audit && statusAudit));
  const notifs = await prisma.notification.findMany({ where: { message: PASSED, user: { email: { in: ["prop_proposal_final@fti.unand.ac.id", "penguji_si@fti.unand.ac.id"] } } } });
  check("mahasiswa dan pembimbing diberi tahu: \"Proposal dinyatakan lulus; tugas akhir masuk fase Penelitian.\"", notifs.length === 2, notifs.length);

  // Pembimbing lebih dulu (bagian 2), lalu koordinator.
  const fin = await api(HUSNIL, "POST", `/research-method/assessments/${siap.id}/coordinator-score`, { scores: score(20) });
  const tSiap = await thesisOf("siap_dinilai");
  check("koordinator mengirim kedua: final 82, lulus, Penelitian", fin.status === 200 && fin.data?.finalScore === 82 && fin.data?.result === "passed" && tSiap.status === "research", `${fin.status} ${fin.json?.message} ${fin.data?.finalScore} ${tSiap.status}`);
  const me = await api(U("siap_dinilai"), "GET", "/thesis-proposals/me");
  check("mahasiswa melihat nilai akhir dan hasil", me.data?.finalProposal?.current?.finalScore === 82 && me.data?.finalProposal?.current?.result === "passed", me.data?.finalProposal?.current);

  const dp = await attemptOf("dinilai_pembimbing", current.id);
  const fail = await api(HUSNIL, "POST", `/research-method/assessments/${dp.id}/coordinator-score`, { scores: score(15) });
  const tDp = await thesisOf("dinilai_pembimbing");
  check("40 + 15 = 55 < 60: tidak lulus, TA tetap Proposal", fail.data?.finalScore === 55 && fail.data?.result === "failed" && tDp.status === "proposal", `${fail.status} ${fail.json?.message} ${fail.data?.finalScore} ${tDp.status}`);
  const failNotif = await prisma.notification.findFirst({ where: { user: { email: "prop_dinilai_pembimbing@fti.unand.ac.id" }, type: "research_method_assessment_finalized" } });
  check("mahasiswa yang tidak lulus diberi tahu", Boolean(failNotif), failNotif?.message);
  const again = await api(HUSNIL, "POST", `/research-method/assessments/${dp.id}/coordinator-score`, { scores: score(19) });
  check("nilai final tidak bisa diubah (403)", again.status === 403, again.json?.message);

  const prevAttempt = await attemptOf("naik", previous.id);
  const old = await api(ULLYA, "GET", `/research-method/assessments/supervisor?academicYearId=${previous.id}`);
  const oldRow = (old.data?.rows ?? []).find((r) => r.id === prevAttempt.id);
  check("semester lalu tampil sebagai riwayat, tidak bisa dinilai", oldRow && oldRow.canScore === false && /semester berjalan/.test(oldRow.scoreBlockReason ?? ""), oldRow?.scoreBlockReason);
});

await run("4 kunci CPMK, rubrik, dan nilai minimum", async () => {
  const summaryNow = await api(SEKDEP, "GET", `/research-method/weight-summary?academicYearId=${current.id}`);
  check("ringkasan bobot semester berjalan: penilaian sudah dimulai, nilai minimum terkunci", summaryNow.data?.assessmentStarted === true && summaryNow.data?.minimumScoreLocked === true, summaryNow.data && [summaryNow.data.assessmentStarted, summaryNow.data.minimumScoreLocked]);
  const cpmks = await api(SEKDEP, "GET", `/research-method/cpmks?academicYearId=${current.id}`);
  check("CPMK semester berjalan bertanda terkunci", (cpmks.data ?? []).length === 3 && cpmks.data.every((c) => c.hasAssessmentDetails === true), (cpmks.data ?? []).map((c) => c.hasAssessmentDetails));
  const del = await api(SEKDEP, "DELETE", `/research-method/cpmks/${cpmks.data[0].id}`);
  check("hapus CPMK ditolak dengan alasannya", del.status === 400 && del.json?.message === LOCKED_DELETE, `${del.status} ${del.json?.message}`);
  const config = await api(SEKDEP, "GET", `/research-method/assessment-configuration?assessor=supervisor&academicYearId=${current.id}`);
  const criterion = config.data?.find((cp) => cp.assessmentCriterias?.length)?.assessmentCriterias?.[0];
  const rubric = criterion?.assessmentRubrics?.[0];
  const delCrit = await api(SEKDEP, "DELETE", `/research-method/criteria/${criterion?.id}?assessor=supervisor`);
  check("hapus kriteria ditolak", delCrit.status === 400 && delCrit.json?.message === LOCKED_DELETE, `${delCrit.status} ${delCrit.json?.message}`);
  const delRub = await api(SEKDEP, "DELETE", `/research-method/rubrics/${rubric?.id}?assessor=supervisor`);
  check("hapus rubrik ditolak", delRub.status === 400 && delRub.json?.message === LOCKED_DELETE, `${delRub.status} ${delRub.json?.message}`);
  const max = await api(SEKDEP, "PATCH", `/research-method/criteria/${criterion?.id}?assessor=supervisor`, { maxScore: criterion.maxScore - 1 });
  check("ubah skor maksimum kriteria ditolak", max.status === 400 && max.json?.message === LOCKED_SCORE, `${max.status} ${max.json?.message}`);
  const range = await api(SEKDEP, "PATCH", `/research-method/rubrics/${rubric?.id}?assessor=supervisor`, { maxScore: rubric.maxScore - 1 });
  check("ubah rentang rubrik ditolak", range.status === 400 && range.json?.message === LOCKED_SCORE, `${range.status} ${range.json?.message}`);
  const add = await api(SEKDEP, "POST", "/research-method/criteria?assessor=supervisor", { researchMethodCpmkId: cpmks.data[0].id, name: "Kriteria baru", maxScore: 1 });
  check("tambah kriteria ditolak", add.status === 400 && add.json?.message === LOCKED_SCORE, `${add.status} ${add.json?.message}`);
  const name = await api(SEKDEP, "PATCH", `/research-method/criteria/${criterion?.id}?assessor=supervisor`, { name: `${criterion.name} (diperbarui)` });
  const desc = await api(SEKDEP, "PATCH", `/research-method/rubrics/${rubric?.id}?assessor=supervisor`, { description: "Kurang: deskripsi diperbarui." });
  check("nama kriteria dan deskripsi rubrik tetap bisa diubah", name.status === 200 && desc.status === 200, [name.status, desc.status, name.json?.message, desc.json?.message]);
  const min = await api(SEKDEP, "PATCH", `/research-method/academic-years/${current.id}/minimum-score`, { minimumScore: 70 });
  check("nilai minimum semester berjalan terkunci (ada hasil final)", min.status === 400 && min.json?.message === LOCKED_MINIMUM, `${min.status} ${min.json?.message}`);
  const coordMin = await api(HUSNIL, "PATCH", `/research-method/academic-years/${current.id}/minimum-score`, { minimumScore: 70 });
  check("koordinator tidak mengubah nilai minimum (403)", coordMin.status === 403, coordMin.status);
  const empty = (await prisma.academicYear.findMany({ where: { researchMethodAssessments: { none: {} } }, orderBy: { startDate: "desc" } }))[0];
  const free = empty ? await api(SEKDEP, "PATCH", `/research-method/academic-years/${empty.id}/minimum-score`, { minimumScore: 65 }) : null;
  check("semester tanpa hasil final: nilai minimum bisa diubah", free?.status === 200 && free.data?.researchMethodMinimumScore === 65, free && `${free.status} ${free.json?.message}`);
});

await run("5 akses Penilaian Proposal", async () => {
  for (const [who, expected] of [[HUSNIL, 200], [KADEP, 403], [SEKDEP, 403], [ADMIN, 403], [AINA, 403]]) {
    const r = await api(who, "GET", `/research-method/assessments/coordinator?academicYearId=${current.id}`);
    check(`antrean koordinator: ${who} ${expected}`, r.status === expected, r.status);
  }
  const draft = await attemptOf("draf_pembimbing", current.id);
  const kadepForm = await api(KADEP, "GET", `/research-method/assessments/${draft.id}/coordinator-form`);
  check("form koordinator untuk Kadep ditolak (403)", kadepForm.status === 403, kadepForm.status);
  const otherLecturer = await api(ULLYA, "GET", `/research-method/assessments/${draft.id}/supervisor-form`);
  check("form pembimbing untuk dosen yang bukan pembimbingnya ditolak (403)", otherLecturer.status === 403, otherLecturer.status);
  for (const who of [KADEP, SEKDEP]) {
    const mon = await api(who, "GET", `/research-method/monitoring?academicYearId=${current.id}`);
    check(`${who} memakai Monitoring Kelas (200)`, mon.status === 200, mon.status);
  }
});

await run("6 lulus proposal, presensi kurang: Penelitian, seminar menunggu mata kuliah", async () => {
  const thesis = await api(U("presensi_kurang"), "GET", "/thesisGuidance/student/my-thesis");
  check("TA Penelitian dengan fase berjalan Penelitian (bimbingan dan milestone penelitian terbuka)", thesis.data?.thesis?.status === "research" && thesis.data.thesis.currentPhase === "research", { status: thesis.data?.thesis?.status, phase: thesis.data?.thesis?.currentPhase });
  const before = await api(U("presensi_kurang"), "GET", "/thesis-seminars/me/overview");
  check("syarat seminar \"Lulus Mata Kuliah Metode Penelitian\" belum terpenuhi", before.status === 200 && before.data?.checklist?.metopen?.met === false && before.data?.allChecklistMet === false, before.data?.checklist?.metopen);
  const sid = (await prisma.student.findFirst({ where: { user: { email: "prop_presensi_kurang@fti.unand.ac.id" } } })).id;
  const set = await api(ADMIN, "PATCH", `/adminfeatures/students/${sid}`, { researchMethodCompleted: true });
  const after = await api(U("presensi_kurang"), "GET", "/thesis-seminars/me/overview");
  check("setelah SIA/Admin mencatat lulus mata kuliah, syarat itu terpenuhi", set.status === 200 && after.data?.checklist?.metopen?.met === true, [set.status, after.data?.checklist?.metopen]);
});

await run("7 mengulang", async () => {
  const up = await api(U("tidak_lulus"), "POST", "/thesis-proposals/me/final-proposal", undefined, { form: pdfForm() });
  check("yang tidak lulus mengajukan proposal final semester baru", up.status === 200, `${up.status} ${up.json?.message}`);
  const rows = await prisma.researchMethodAssessment.findMany({ where: { thesis: { student: { user: { email: "prop_tidak_lulus@fti.unand.ac.id" } } } }, orderBy: { createdAt: "asc" } });
  check("dua percobaan: lama gagal tetap, baru terbuka", rows.length === 2 && rows[0].result === "failed" && rows[1].isFinalized === false && rows[1].academicYearId === current.id, rows.map((r) => `${r.academicYearId === current.id ? "kini" : "lalu"}:${r.result}`));
  const t = await prisma.thesis.findFirst({ where: { student: { user: { email: "prop_tidak_lulus@fti.unand.ac.id" } } }, include: { thesisSupervisors: { where: { status: "active" } } } });
  check("status tetap proposal, pembimbing dan judul tetap", t.status === "proposal" && t.thesisSupervisors.length > 0 && Boolean(t.title), t.status);
  const q = await api(ULLYA, "GET", "/research-method/assessments/supervisor");
  check("percobaan baru siap dinilai pembimbing", (q.data?.rows ?? []).some((r) => r.id === rows[1].id && r.canScore), (q.data?.rows ?? []).find((r) => r.id === rows[1].id)?.scoreBlockReason);
});

await run("8 ekspor dan monitoring", async () => {
  const rec = await api(HUSNIL, "GET", `/research-method/exports/scores?academicYearId=${current.id}`);
  check("rekap nilai .xlsx", rec.status === 200 && rec.ct.includes("spreadsheetml"), `${rec.status} ${rec.ct}`);
  const raw = await fetch(`${process.env.BASE || "http://localhost:3000"}/research-method/exports/scores?academicYearId=${current.id}`, { headers: { Authorization: `Bearer ${await login(HUSNIL)}` } });
  const wb = XLSX.read(Buffer.from(await raw.arrayBuffer()));
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null });
  check("ID Kelas dan Nama Kelas dikosongkan, barisnya tetap", rows[2]?.[0] === "ID Kelas" && rows[2][2] === null && rows[3]?.[0] === "Nama Kelas" && rows[3][2] === null, [rows[2], rows[3]]);
  check("baris bobot = 20, 40, 25, 15 (konfigurasi semester)", JSON.stringify(rows[8].slice(3, 7)) === "[20,40,25,15]", rows[8]);
  const lulus = rows.find((r) => r[1] === "2211528015");
  check("baris Lulus: 18, 34, 20, 12", JSON.stringify(lulus?.slice(3, 7)) === "[18,34,20,12]", lulus);
  const kurang = rows.find((r) => r[1] === "2211528012");
  check("baris lulus, presensi kurang: nilainya sendiri (17, 32, 19, 12)", JSON.stringify(kurang?.slice(3, 7)) === "[17,32,19,12]", kurang);
  const draf = rows.find((r) => r[1] === "2211528016");
  check("draf pembimbing tidak terekspor: sel kosong", draf && draf.slice(3, 7).every((v) => v === null), draf);
  const belum = rows.find((r) => r[1] === "2211528010");
  check("belum dinilai: sel kosong", belum && belum.slice(3, 7).every((v) => v === null), belum);
  const titles = await fetch(`${process.env.BASE || "http://localhost:3000"}/research-method/exports/passed-titles?academicYearId=${current.id}`, { headers: { Authorization: `Bearer ${await login(KADEP)}` } });
  const trows = XLSX.utils.sheet_to_json(XLSX.read(Buffer.from(await titles.arrayBuffer())).Sheets["Judul Lulus"], { header: 1, defval: null });
  const nims = trows.slice(3).map((r) => r[1]).sort();
  check("judul lulus semester ini: yang lulus saja", JSON.stringify(nims) === JSON.stringify(["2211528011", "2211528012", "2211528013", "2211528015"]), nims);
  const stu = await api(U("siap_dinilai"), "GET", `/research-method/exports/scores?academicYearId=${current.id}`);
  check("mahasiswa tidak bisa mengekspor (403)", stu.status === 403, stu.status);
  const mon = await api(SEKDEP, "GET", `/research-method/monitoring?academicYearId=${current.id}`);
  const s = mon.data?.summary;
  check("ringkasan dua grafik: tahapan dan hasil", s && Object.keys(s).sort().join() === "assigned,failed,finalProposal,finalized,notFinalized,passed,total,withSupervisor" && s.passed === 4 && s.failed === 1 && s.notFinalized === s.total - s.finalized, s);
  const row = mon.data?.rows?.find((r) => r.identityNumber === "2211528013");
  check("baris memuat kedua nilai dan penilainya, tanpa presensi", row?.assessment?.finalScore === 82 && row.assessment.supervisorScore === 62 && /Ullya/i.test(row.assessment.supervisorName ?? "") && /Husnil/i.test(row.assessment.coordinatorName ?? "") && row.thesis?.status === "research" && !("attendance" in row),
    row && JSON.stringify({ a: row.assessment, s: row.thesis?.status }));
  const draftRow = mon.data?.rows?.find((r) => r.identityNumber === "2211528016");
  check("draf tidak tampil di monitoring", draftRow?.assessment?.supervisorScore === null && draftRow.assessment.supervisorName === null, draftRow?.assessment);
});

const failed = summary();
await prisma.$disconnect();
process.exit(failed ? 1 : 0);
