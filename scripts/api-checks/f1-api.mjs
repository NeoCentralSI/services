// DevTools for Seminar Hasil, Sidang TA and Yudisium: every demo account of
// seed-thesis-final-stages.js is in the state it promises, read through the requirement checks of
// the modules (student overviews, assessment access, revisions); then each DevTools action is
// checked from the student, the lecturers and the Admin. Run on a clean seed (nine seeders); it
// writes data.
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

  const audienceSource = await prisma.thesisSeminar.count({ where: { status: { in: ["passed", "passed_with_revision"] }, thesis: { student: { user: { email: { startsWith: "ta_demo_" } } } } } });
  check("seed menyediakan seminar selesai sebagai sumber kehadiran audiens", audienceSource >= 1, audienceSource);
});

await run("2 akses DevTools", async () => {
  const sid = await studentId("seminar_berlangsung");
  const kadep = await api(KADEP, "GET", `/devtools/final-stages/${sid}`);
  const student = await api(demo("seminar_berlangsung"), "POST", `/devtools/final-stages/${sid}/seminar/status`, { target: "passed" });
  const anon = await fetch(`${BASE}/devtools/final-stages/${sid}`);
  check("non-Admin ditolak (403), tanpa login 401", kadep.status === 403 && student.status === 403 && anon.status === 401, `${kadep.status} ${student.status} ${anon.status}`);
  const bare = await fetch(`${BASE}/devtools-final-stages/final-stages/${sid}`);
  check("rute DevTools tidak terpasang di luar /devtools", bare.status === 404, bare.status);
  const overview = await dev("GET", `/final-stages/${sid}`);
  check("Admin membaca kartu seminar dan sidang", overview.status === 200 && overview.data?.seminar?.displayStatus === "ongoing" && overview.data.defence === null, overview.data?.seminar?.displayStatus);
});

await run("3 jadwal", async () => {
  const sid = await studentId("seminar_berlangsung");
  const card = (await dev("GET", `/final-stages/${sid}`)).data.seminar;
  const tomorrow = await dev("PATCH", `/final-stages/seminar/${card.id}/schedule`, { preset: "tomorrow" });
  const viewTomorrow = await seminarOverview("seminar_berlangsung");
  check("Besok: Terjadwal, status tersimpan tetap", tomorrow.status === 200 && viewTomorrow?.seminar?.status === "scheduled" && tomorrow.data.status === "scheduled", tomorrow.data);
  const now = await dev("PATCH", `/final-stages/seminar/${card.id}/schedule`, { preset: "now" });
  const viewNow = await seminarOverview("seminar_berlangsung");
  check("Mulai sekarang: Sedang Berlangsung bagi mahasiswa", now.status === 200 && viewNow?.seminar?.status === "ongoing", now.data);
  const past = await dev("PATCH", `/final-stages/seminar/${card.id}/schedule`, { preset: "past" });
  check("Sudah lewat: kemarin", past.status === 200 && past.data.date < new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10), past.data);
  const manual = await dev("PATCH", `/final-stages/seminar/${card.id}/schedule`, { date: "2020-01-06", startTime: "07:00", endTime: "07:30" });
  check("tanggal dan jam bebas, termasuk masa lampau", manual.status === 200 && manual.data.date === "2020-01-06" && manual.data.startTime === "07:00", manual.data);
  const bad = await dev("PATCH", `/final-stages/seminar/${card.id}/schedule`, { date: "2020-01-06", startTime: "10:00", endTime: "09:00" });
  check("jam mulai setelah jam selesai ditolak", bad.status === 400, bad.json?.message);
  await dev("PATCH", `/final-stages/seminar/${card.id}/schedule`, { preset: "now" });
  const audit = await prisma.auditLog.findFirst({ where: { action: "DEVTOOLS_DATA_CHANGED", entityId: card ? (await thesisOf("seminar_berlangsung")).id : "-" }, orderBy: { createdAt: "desc" } });
  check("tercatat di log audit: pelaku Admin, sumber DevTools", audit?.changes?.metadata?.source === "devtools" && audit.changes.metadata.operation === "schedule" && !!audit.userId, audit?.changes?.metadata);
});

await run("4 status seminar", async () => {
  const sid = await studentId("seminar_berlangsung");
  const preview = await dev("POST", `/final-stages/${sid}/seminar/preview`, { target: "passed_with_revision" });
  check("pratinjau efek samping sebelum konfirmasi", preview.status === 200 && preview.data?.effects?.some((e) => /Item revisi/.test(e)), preview.data?.effects);
  const notificationsBefore = await prisma.notification.count();
  const apply = await dev("POST", `/final-stages/${sid}/seminar/status`, { target: "passed_with_revision" });
  const view = await seminarOverview("seminar_berlangsung");
  const revisions = await api(demo("seminar_berlangsung"), "GET", `/thesis-seminars/${view?.seminar?.id}/revisions`);
  check("Lulus dengan Revisi: mahasiswa melihat hasil dan revisi yang belum selesai", apply.status === 200 && view?.seminar?.status === "passed_with_revision" && !!view.seminar.resultFinalizedAt && revisions.data?.summary?.total >= 1 && revisions.data.summary.finished === 0, revisions.data?.summary);
  const finalization = await api(KADEP, "GET", `/thesis-seminars/${view?.seminar?.id}/finalization`);
  check("pembimbing: nilai penguji terkirim dan konsisten dengan hasil", finalization.data?.allExaminerSubmitted === true && finalization.data.averageScore >= finalization.data.minimumPassingScore, finalization.data?.averageScore);
  const blocked = await defenceOverview("seminar_berlangsung");
  check("syarat sidang belum terpenuhi selama revisi seminar belum selesai", blocked?.checklist?.revisiSeminar?.met === false, blocked?.checklist?.revisiSeminar);
  const approve = await dev("POST", `/final-stages/${sid}/seminar/approve-revisions`);
  const afterApprove = await defenceOverview("seminar_berlangsung");
  check("Setujui semua revisi: revisi seminar selesai bagi syarat sidang", approve.status === 200 && afterApprove?.checklist?.revisiSeminar?.met === true, afterApprove?.checklist?.revisiSeminar);
  check("aksi DevTools tidak mengirim notifikasi", (await prisma.notification.count()) === notificationsBefore, await prisma.notification.count());

  const failed = await dev("POST", `/final-stages/${sid}/seminar/status`, { target: "failed" });
  const thesis = await thesisOf("seminar_berlangsung");
  const supervisors = await prisma.thesisSupervisors.findMany({ where: { thesisId: thesis.id } });
  const failedView = await seminarOverview("seminar_berlangsung");
  check("Tidak Lulus: persetujuan pembimbing direset, seminar menjadi riwayat, mahasiswa harus mendaftar ulang", failed.status === 200 && supervisors.every((s) => !s.seminarReady) && failedView?.seminar === null && failedView.checklist.pembimbing.met === false, failedView?.checklist?.pembimbing);
  const finalizationFailed = await api(KADEP, "GET", `/thesis-seminars/${(await prisma.thesisSeminar.findFirst({ where: { thesisId: thesis.id }, orderBy: { createdAt: "desc" } })).id}/finalization`);
  check("nilai akhir di bawah nilai minimum", finalizationFailed.data?.seminar?.finalScore < finalizationFailed.data?.minimumPassingScore, finalizationFailed.data?.seminar?.finalScore);

  const back = await dev("POST", `/final-stages/${sid}/seminar/status`, { target: "scheduled" });
  const backView = await seminarOverview("seminar_berlangsung");
  const restored = await prisma.thesisSupervisors.findMany({ where: { thesisId: thesis.id } });
  const examiners = await prisma.thesisSeminarExaminer.findMany({ where: { thesisSeminarId: backView?.seminar?.id } });
  check("mundur ke Terjadwal: hasil dan revisi hilang, nilai menjadi draf, persetujuan dipulihkan, bisa dinilai ulang", back.status === 200 && backView?.seminar?.status === "ongoing" && !backView.seminar.resultFinalizedAt && restored.every((s) => s.seminarReady) && examiners.every((e) => e.assessmentScore !== null && !e.assessmentSubmittedAt), examiners.map((e) => [e.assessmentScore, !!e.assessmentSubmittedAt]));
  const finalize = await api(KADEP, "GET", `/thesis-seminars/${backView?.seminar?.id}/finalization`);
  check("pembimbing bisa menetapkan hasil lagi setelah penguji mengirim nilai", finalize.data?.supervisor?.canFinalize === true && finalize.data.allExaminerSubmitted === false, finalize.data?.supervisor);

  const registered = await dev("POST", `/final-stages/${sid}/seminar/status`, { target: "registered" });
  const registeredRow = await prisma.thesisSeminar.findFirst({ where: { thesisId: thesis.id }, orderBy: { createdAt: "desc" }, include: { examiners: true, requirementDocuments: true } });
  check("mundur ke Terdaftar: penguji dan jadwal dihapus, dokumen kembali menunggu verifikasi", registered.status === 200 && registeredRow.status === "registered" && registeredRow.examiners.length === 0 && !registeredRow.date && registeredRow.requirementDocuments.every((d) => d.status === "submitted"), registeredRow.requirementDocuments.length);
  const adminView = await api(ADMIN, "GET", `/thesis-seminars/${registeredRow.id}`);
  check("Admin melihat seminar Terdaftar dengan dokumen untuk diverifikasi", adminView.status === 200, adminView.status);
});

await run("5 status sidang dan TA", async () => {
  const sid = await studentId("sidang_berlangsung");
  const guard = await dev("POST", `/final-stages/${sid}/seminar/status`, { target: "scheduled" });
  check("penjaga urutan: seminar tidak bisa dimundurkan saat sudah ada sidang", guard.status === 409 && /Hapus sidang mahasiswa ini terlebih dahulu/.test(guard.json?.message ?? ""), guard.json?.message);
  const guardDelete = await dev("DELETE", `/final-stages/${sid}/seminar`);
  check("penjaga urutan: seminar tidak bisa dihapus saat sudah ada sidang", guardDelete.status === 409, guardDelete.status);

  const preview = await dev("POST", `/final-stages/${sid}/defence/preview`, { target: "passed" });
  check("pratinjau Lulus: TA akan menjadi Selesai", preview.data?.effects?.includes("TA akan menjadi Selesai"), preview.data?.effects);
  const passed = await dev("POST", `/final-stages/${sid}/defence/status`, { target: "passed" });
  const thesis = await thesisOf("sidang_berlangsung");
  const yud = await yudisiumOverview("sidang_berlangsung");
  check("Lulus: TA Selesai lewat jalur asli, syarat lulus sidang yudisium terpenuhi", passed.status === 200 && thesis.status === "completed" && yud?.checklist?.lulusSidang?.met === true, thesis.status);
  const lifecycle = await prisma.auditLog.findFirst({ where: { entityId: thesis.id, action: "THESIS_STATUS_CHANGED" }, orderBy: { createdAt: "desc" } });
  check("perubahan TA tercatat seperti jalur asli (sumber sidang)", lifecycle?.changes?.newValues?.status === "completed" && lifecycle.changes.metadata?.source === "defence", lifecycle?.changes);
  const finalization = await api(KADEP, "GET", `/thesis-defences/${passed.data?.id}/finalization`);
  check("nilai pembimbing dan penguji terisi, nilai akhir mencapai minimum", finalization.data?.defence?.finalScore >= finalization.data?.minimumPassingScore && finalization.data.supervisorAssessmentSubmitted === true, finalization.data?.defence?.finalScore);

  const back = await dev("POST", `/final-stages/${sid}/defence/status`, { target: "scheduled" });
  const reopened = await thesisOf("sidang_berlangsung");
  const view = await defenceOverview("sidang_berlangsung");
  const row = await prisma.thesisDefence.findUnique({ where: { id: passed.data?.id } });
  check("mundur Lulus → Terjadwal: TA kembali Penelitian, hasil hilang, nilai pembimbing draf", back.status === 200 && reopened.status === "research" && view?.defence?.status === "ongoing" && !row.resultFinalizedAt && row.supervisorScore !== null && !row.supervisorAssessmentSubmittedAt, reopened.status);

  const revision = await dev("POST", `/final-stages/${sid}/defence/status`, { target: "passed_with_revision" });
  const stillResearch = await thesisOf("sidang_berlangsung");
  check("Lulus dengan Revisi: TA tetap Penelitian sampai revisi difinalkan", revision.status === 200 && stillResearch.status === "research", stillResearch.status);
  const approve = await dev("POST", `/final-stages/${sid}/defence/approve-revisions`);
  const done = await thesisOf("sidang_berlangsung");
  check("Setujui semua revisi sidang: TA Selesai", approve.status === 200 && done.status === "completed", done.status);

  const failed = await dev("POST", `/final-stages/${sid}/defence/status`, { target: "failed" });
  const failedThesis = await thesisOf("sidang_berlangsung");
  const failedView = await defenceOverview("sidang_berlangsung");
  check("Tidak Lulus: TA kembali Penelitian, persetujuan sidang direset", failed.status === 200 && failedThesis.status === "research" && failedView?.checklist?.pembimbing?.met === false && failedView.defence === null, failedView?.checklist?.pembimbing);

  const create = await dev("POST", `/final-stages/${sid}/defence/preview`, { target: "scheduled", mode: "create" });
  check("Buat sidang: syarat yang belum terpenuhi tampil di pratinjau", create.data?.prerequisites?.some((p) => /kesiapan sidang/.test(p)), create.data?.prerequisites);
  const created = await dev("POST", `/final-stages/${sid}/defence/status`, { target: "scheduled", mode: "create" });
  const createdView = await defenceOverview("sidang_berlangsung");
  check("Buat sidang Terjadwal: percobaan baru, penguji dan jadwal terisi", created.status === 200 && createdView?.defence?.status === "scheduled" && createdView.defence.examiners?.length >= 2, createdView?.defence?.status);

  const remove = await dev("DELETE", `/final-stages/${sid}/defence`);
  const removedView = await defenceOverview("sidang_berlangsung");
  check("Hapus sidang: kembali ke riwayat percobaan sebelumnya (Tidak Lulus)", remove.status === 200 && removedView?.defence === null, removedView?.defence);
});

await run("6 buat dan hapus seminar, dokumen resmi", async () => {
  const sid = await studentId("seminar_revisi");
  const view = await seminarOverview("seminar_revisi");
  const pdf = await api(demo("seminar_revisi"), "GET", `/thesis-seminars/${view?.seminar?.id}/assessment-result`);
  const doc = await prisma.officialGeneratedDocument.findFirst({ where: { sourceId: view?.seminar?.id, status: "current" } });
  check("dokumen hasil terbit saat diunduh (jalur asli)", pdf.status === 200 && !!doc, pdf.status);
  const preview = await dev("POST", `/final-stages/${sid}/seminar/preview`, { target: "passed" });
  check("pratinjau menyebut dokumen resmi yang akan dicabut", preview.data?.effects?.some((e) => /1 dokumen resmi akan dicabut/.test(e)), preview.data?.effects);
  await dev("POST", `/final-stages/${sid}/seminar/status`, { target: "passed" });
  const verify = await fetch(`${BASE}/official-documents/${doc?.verificationToken}`).then((r) => r.json());
  check("hasil berubah: dokumen resmi lama dicabut", (verify?.data ?? verify)?.status === "revoked", (verify?.data ?? verify)?.status);

  const fresh = await prisma.user.findFirst({ where: { email: "ta_mon_mulai_lalu@fti.unand.ac.id" }, select: { id: true } });
  const createPreview = await dev("POST", `/final-stages/${fresh.id}/seminar/preview`, { target: "verified", mode: "create" });
  const create = await dev("POST", `/final-stages/${fresh.id}/seminar/status`, { target: "verified", mode: "create" });
  const created = await api("ta_mon_mulai_lalu", "GET", "/thesis-seminars/me/overview");
  check("Buat seminar Terverifikasi: syarat dipenuhi otomatis, dokumen terverifikasi", create.status === 200 && created.data?.allChecklistMet === true && created.data?.seminar?.status === "verified", createPreview.data?.prerequisites);
  const removePreview = await dev("POST", `/final-stages/${fresh.id}/seminar/preview`, { mode: "delete" });
  const remove = await dev("DELETE", `/final-stages/${fresh.id}/seminar`);
  const removed = await api("ta_mon_mulai_lalu", "GET", "/thesis-seminars/me/overview");
  check("Hapus seminar: belum mendaftar lagi, persetujuan pembimbing tetap", remove.status === 200 && removed.data?.seminar === null && removed.data?.checklist?.pembimbing?.met === true, removePreview.data?.effects);
});

await run("7 yudisium", async () => {
  const periods = (await dev("GET", "/yudisium/periods")).data ?? [];
  const period = periods.find((p) => p.status === "open");
  check("periode yudisium terbuka dari seed", !!period, periods.map((p) => p.status));
  const closed = await dev("PATCH", `/yudisium/periods/${period.id}`, { preset: "close" });
  const adminList = await api(ADMIN, "GET", "/yudisiums");
  const listed = (adminList.data ?? []).find?.((y) => y.id === period.id);
  check("Tutup pendaftaran sekarang: status periode Ditutup (dihitung dari tanggal)", closed.data?.status === "closed" && (!listed || listed.status === "closed"), closed.data?.status);
  const event = await dev("PATCH", `/yudisium/periods/${period.id}`, { preset: "event" });
  check("Acara hari ini: berlangsung", event.data?.status === "ongoing", event.data?.status);
  const opened = await dev("PATCH", `/yudisium/periods/${period.id}`, { preset: "open" });
  check("Buka pendaftaran sekarang: dibuka lagi", opened.data?.status === "open", opened.data?.status);

  const sid = await studentId("siap_yudisium");
  const register = await dev("POST", `/yudisium/students/${sid}/register`, { yudisiumId: period.id });
  const view = await yudisiumOverview("siap_yudisium");
  check("Daftar ke periode: exit survey terisi, dokumen terunggah, status Terdaftar", register.status === 200 && view?.participantStatus === "registered" && view.checklist.exitSurvey.met === true, view?.participantStatus);
  const participant = (await dev("GET", `/yudisium/students/${sid}`)).data.participants[0];
  const eligible = await dev("POST", `/yudisium/participants/${participant.id}/status`, { target: "eligible" });
  const eligibleRow = await prisma.yudisiumParticipant.findUnique({ where: { id: participant.id } });
  const scores = await prisma.studentCplScore.findMany({ where: { studentId: sid } });
  check("Memenuhi Syarat: berkas terverifikasi dan CPL tervalidasi", eligible.status === 200 && eligibleRow.status === "eligible" && !!eligibleRow.requirementVerifiedAt && !!eligibleRow.cplValidatedAt && scores.every((s) => s.status === "validated"), eligibleRow.status);
  const final = await dev("POST", `/yudisium/participants/${participant.id}/status`, { target: "finalized" });
  const student = await prisma.student.findUnique({ where: { id: sid } });
  const finalView = await yudisiumOverview("siap_yudisium");
  check("Final: CPL final, status mahasiswa tidak diubah DevTools", final.status === 200 && finalView?.participantStatus === "finalized" && student.status === "active", student.status);
  const guard = await dev("POST", `/final-stages/${sid}/defence/status`, { target: "scheduled" });
  check("penjaga urutan: sidang tidak bisa diubah saat sudah terdaftar di yudisium", guard.status === 409 && /periode yudisium/.test(guard.json?.message ?? ""), guard.json?.message);
  const back = await dev("POST", `/yudisium/participants/${participant.id}/status`, { target: "rejected" });
  const backRow = await prisma.yudisiumParticipant.findUnique({ where: { id: participant.id } });
  check("Ditolak: tidak memenuhi kedua syarat", back.status === 200 && backRow.status === "rejected" && !(backRow.requirementVerifiedAt && backRow.cplValidatedAt), backRow.status);
  const remove = await dev("DELETE", `/yudisium/participants/${participant.id}`);
  const removed = await yudisiumOverview("siap_yudisium");
  check("Hapus dari periode: keikutsertaan, persyaratan, dan exit survey hilang", remove.status === 200 && removed?.participantStatus === null && removed.checklist.exitSurvey.met === false, removed?.participantStatus);

  const cplSid = await studentId("yudisium_cpl_kurang");
  const cplStudent = (await dev("GET", `/yudisium/students/${cplSid}`)).data;
  const failing = cplStudent.cpl.find((c) => !c.passed);
  const rec = await dev("POST", `/yudisium/students/${cplSid}/cpl/${failing.cplId}/recommendation`, { action: "create" });
  check("Rekomendasi CPL dibuat (nilai tetap di bawah minimal)", rec.status === 200 && rec.data.cpl.find((c) => c.cplId === failing.cplId)?.hasRecommendation === true, rec.json?.message);
  const resolve = await dev("POST", `/yudisium/students/${cplSid}/cpl/${failing.cplId}/recommendation`, { action: "resolve" });
  const resolved = resolve.data?.cpl?.find((c) => c.cplId === failing.cplId);
  check("Rekomendasi diselesaikan: nilai lama disimpan, nilai baru memenuhi, tervalidasi", resolve.status === 200 && resolved?.passed && resolved.oldScore === failing.score && resolved.status === "validated", resolved);
  const del = await dev("POST", `/yudisium/students/${cplSid}/cpl/${failing.cplId}/recommendation`, { action: "delete" });
  const deleted = del.data?.cpl?.find((c) => c.cplId === failing.cplId);
  check("Rekomendasi dihapus: nilai sebelum perbaikan kembali", del.status === 200 && deleted?.score === failing.score && !deleted.hasRecommendation && deleted.status === "calculated", deleted);
  const allPass = await dev("POST", `/yudisium/students/${cplSid}/cpl/all-pass`);
  const oneFail = await dev("POST", `/yudisium/students/${cplSid}/cpl/one-fail`);
  check("Semua memenuhi lalu Buat satu CPL tidak memenuhi", allPass.data?.cpl?.every((c) => c.passed) && oneFail.data?.cpl?.filter((c) => !c.passed).length === 1, oneFail.data?.cpl?.map((c) => c.score));
  const items = await dev("POST", `/yudisium/participants/${cplStudent.participants[0].id}/requirements`, { action: "approve" });
  check("Semua item persyaratan terverifikasi; status tetap Terdaftar karena CPL belum tervalidasi", items.data?.requirementVerified === true && items.data.participantStatus === "registered", items.data);
});

await prisma.$disconnect();
process.exit(summary() ? 1 : 0);
