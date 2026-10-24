// Replay of the supervisor assignment test steps in their order,
// through the same API calls, to confirm the numbers that build on earlier steps (Ullya's load,
// "Terbitkan Penetapan (5 baru)", 11 students in version 2, version 3 after Pembimbing 2).
// Mutates central; run from app/backend after a clean seed:
//   node scripts/api-checks/p9r-api.mjs
import { api, check, run, summary, ids, login } from "./lib-api.mjs";

const U = (key) => `prop_${key}`;
const AINA = "penguji_si", ULLYA = "gkm_si", HUSNIL = "pembimbing_si", KADEP = "kadep_si";
const NIM = { diterima: "2211528008", ditinjau: "2211528005", layak: "2211528001", atasKuota: "2211528006", departemen: "2211528007", ditetapkan: "2211528010", batal: "2211528009" };
const byNim = (rows, nim) => (rows ?? []).find((r) => r.student?.identityNumber === nim);
const board = async () => (await api(KADEP, "GET", "/thesis-proposals/supervisor-assignments/board")).data;
const ullyaLoad = async () => (await api(ULLYA, "GET", "/thesis-proposals/supervisor-requests/inbox")).data?.load?.activeCount;
const mine = async (key) => (await api(U(key), "GET", "/thesis-proposals/me/supervisor-requests")).data;

let topicId;
let lecturer = {};
const form = (extra = {}) => ({
  topicId,
  proposedTitle: "Rancang Bangun Sistem Informasi Pemantauan Proposal Tugas Akhir",
  backgroundSummary: "Proses pemantauan proposal masih manual dan tersebar.",
  problemStatement: "Bagaimana memusatkan data pemantauan proposal tugas akhir.",
  proposedSolution: "Membangun modul web terpusat dengan notifikasi.",
  researchObject: "Departemen Sistem Informasi",
  researchPermitStatus: "in_process",
  ...extra,
});

await run("0 persiapan", async () => {
  for (const u of [AINA, ULLYA, HUSNIL, KADEP]) await login(u);
  // This long replay accepts several students with the same lecturer. The quota-only route
  // is verified separately; reserve enough semester places for this assignment replay.
  const current = await board();
  await api(KADEP, "PUT", `/supervision-quotas/periods/${current.academicYear.id}`, { semesterQuota: 10 });
  lecturer = { aina: ids[AINA], ullya: ids[ULLYA], husnil: ids[HUSNIL] };
  const topics = await api(U("layak"), "GET", "/topics");
  const list = topics.data?.topics ?? topics.data ?? [];
  topicId = (Array.isArray(list) ? list : []).find((t) => t.name === "Enterprise System")?.id;
  check("topik dan dosen ditemukan", topicId && lecturer.aina && lecturer.ullya && lecturer.husnil, { topicId });
});

await run("3.4 draf", async () => {
  const saved = await api(U("layak"), "PUT", "/thesis-proposals/me/supervisor-request-draft", form({ lecturerId: lecturer.ullya }));
  const state = await mine("layak");
  check("Simpan Draf: draf tersimpan dengan Ullya", saved.status === 200 && state?.draft?.lecturerId === lecturer.ullya && !state?.activeRequest, saved.json?.message);
});

await run("3.5 keputusan Kadep pada antrean awal", async () => {
  const start = await board();
  check("hari seed: Terbitkan Penetapan (2 baru), 8 mahasiswa", start?.newCount === 2 && start?.counts?.cohort === 8, { newCount: start?.newCount, cohort: start?.counts?.cohort });
  const oq = byNim(start?.rows, NIM.atasKuota);
  const red = await api(KADEP, "POST", `/thesis-proposals/supervisor-requests/${oq?.request?.id}/decision`, { action: "redirect", targetLecturerId: lecturer.ullya, notes: "Dialihkan ke Ullya." });
  const afterRedirect = byNim((await board())?.rows, NIM.atasKuota);
  check("Alihkan ke Ullya: baris Disetujui, Belum Ditetapkan", red.data?.status === "redirected" && afterRedirect?.submission === "approved" && afterRedirect?.assignment?.inCohort === true && afterRedirect?.assignment?.assigned === false, { status: red.data?.status, row: afterRedirect && [afterRedirect.submission, afterRedirect.assignment] });
  check("beban Ullya 8 (7 + yang dialihkan)", (await ullyaLoad()) === 8, await ullyaLoad());

  const dep = byNim(start?.rows, NIM.departemen);
  const rev = await api(KADEP, "POST", `/thesis-proposals/supervisor-requests/${dep?.request?.id}/decision`, { action: "request_revision", notes: "Perjelas objek penelitian dan solusinya." });
  const revRow = byNim((await board())?.rows, NIM.departemen);
  check("Minta Revisi: baris Revisi Diminta", rev.data?.status === "revision_requested" && revRow?.submission === "revision_requested", revRow?.submission);
  const st = await mine("departemen");
  check("mahasiswa: Perlu Revisi (boleh mengajukan ulang dari draf)", st?.submission?.revisionRequested === true && st?.submission?.canSubmit === true && !st?.activeRequest, st?.submission);
  const resub = await api(U("departemen"), "POST", "/thesis-proposals/supervisor-requests", { researchObject: "Departemen Sistem Informasi Universitas Andalas" });
  const resubRow = byNim((await board())?.rows, NIM.departemen);
  check("ajukan ulang: Jalur Departemen · Menunggu Keputusan lagi; yang lama Ditutup", resub.data?.status === "pending_kadep" && resubRow?.submission === "department_waiting" && resubRow?.history?.some((r) => r.status === "closed"), resubRow && [resubRow.submission, resubRow.history.map((r) => r.status)]);
  const appr = await api(KADEP, "POST", `/thesis-proposals/supervisor-requests/${resub.data?.id}/decision`, { action: "approve", targetLecturerId: lecturer.aina, notes: "Ditetapkan departemen." });
  check("Tetapkan Pembimbing Aina: Disetujui", appr.data?.status === "accepted" && byNim((await board())?.rows, NIM.departemen)?.submission === "approved", appr.data?.status);
});

await run("3.6 Permohonan dan jalur Pilih Dosen Sendiri", async () => {
  const sub = await api(U("layak"), "POST", "/thesis-proposals/supervisor-requests", {});
  check("Lanjutkan Draf → Ajukan: terkirim ke Ullya", sub.data?.status === "pending" && sub.data?.lecturer?.id === lecturer.ullya, `${sub.status} ${sub.json?.message}`);
  const inbox = await api(ULLYA, "GET", "/thesis-proposals/lecturer-inbox?page=1&pageSize=10");
  const waiting = (inbox.data ?? []).filter((r) => r.kind === "supervisor_request" && ["pending", "under_review"].includes(r.viewStatus)).map((r) => r.supervisorRequest?.student?.identityNumber);
  check("Permohonan Ullya: Layak, Lewat 72, Ditinjau menunggu; beban 8", waiting.includes(NIM.layak) && waiting.includes("2211528004") && waiting.includes(NIM.ditinjau) && (await ullyaLoad()) === 8, { waiting, load: await ullyaLoad() });
  const acc = await api(ULLYA, "POST", `/thesis-proposals/supervisor-requests/${sub.data?.id}/respond`, { action: "accept" });
  check("Terima: beban Ullya 9", acc.data?.status === "accepted" && (await ullyaLoad()) === 9, await ullyaLoad());
  const cancel = await api(U("layak"), "POST", `/thesis-proposals/supervisor-requests/${sub.data?.id}/withdraw`);
  const st = await mine("layak");
  check("Batalkan Pengajuan: beban Ullya kembali 8; draf tetap", cancel.data?.status === "cancelled" && (await ullyaLoad()) === 8 && st?.draft?.proposedTitle && !st?.activeRequest, await ullyaLoad());
  const ditinjau = (await api(ULLYA, "GET", "/thesis-proposals/supervisor-requests/inbox")).data?.waiting?.find((r) => r.student?.identityNumber === NIM.ditinjau);
  const accD = await api(ULLYA, "POST", `/thesis-proposals/supervisor-requests/${ditinjau?.id}/respond`, { action: "accept" });
  const rowD = byNim((await board())?.rows, NIM.ditinjau);
  check("Terima Uji Proposal Ditinjau: masuk susunan, Belum Ditetapkan", accD.data?.status === "accepted" && rowD?.assignment?.inCohort && !rowD.assignment.assigned, rowD?.assignment);
});

await run("3.7 di atas kuota", async () => {
  const sub = await api(U("layak"), "POST", "/thesis-proposals/supervisor-requests", form({ lecturerId: lecturer.husnil, studentJustification: "Topik saya melanjutkan penelitian Pak Husnil tentang sistem enterprise." }));
  check("ke Husnil dengan alasan: over_quota", sub.data?.route === "over_quota", `${sub.data?.route} ${sub.json?.message}`);
  const fwd = await api(HUSNIL, "POST", `/thesis-proposals/supervisor-requests/${sub.data?.id}/respond`, { action: "accept", lecturerOverquotaReason: "Satu mahasiswa saya sidang bulan ini." });
  const row = byNim((await board())?.rows, NIM.layak);
  check("diteruskan: Di Atas Kuota · Menunggu Keputusan, calon Husnil", fwd.data?.status === "pending_kadep" && row?.submission === "over_quota_waiting" && row?.candidate?.lecturerId === lecturer.husnil, row?.submission);
  const app = await api(KADEP, "POST", `/thesis-proposals/supervisor-requests/${sub.data?.id}/decision`, { action: "approve", notes: "Disetujui di atas kuota." });
  check("Setujui: Disetujui, Belum Ditetapkan", app.data?.status === "accepted" && byNim((await board())?.rows, NIM.layak)?.submission === "approved", app.data?.status);
});

await run("3.8 tarik setelah 72 jam", async () => {
  const st = await mine("lewat_72");
  const wd = await api(U("lewat_72"), "POST", `/thesis-proposals/supervisor-requests/${st?.activeRequest?.id}/withdraw`);
  const after = await mine("lewat_72");
  check("ditarik; kartu Draf Tersimpan (draf ada) atau Belum Diajukan (tanpa draf)", wd.data?.status === "withdrawn" && after?.submission?.canSubmit === true, { draft: Boolean(after?.draft?.proposedTitle) });
  console.log(`INFO draf prop_lewat_72 setelah ditarik: ${after?.draft?.proposedTitle ? "ada" : "tidak ada"}`);
});

await run("3.10 menerbitkan", async () => {
  const batal = await mine("batal");
  await api(U("batal"), "POST", `/thesis-proposals/supervisor-requests/${batal?.activeRequest?.id}/withdraw`);
  const b = await board();
  const pending = (b?.rows ?? []).filter((r) => r.assignment?.inCohort && !r.assignment.assigned).map((r) => r.student?.identityNumber).sort();
  const expected = [NIM.diterima, NIM.ditinjau, NIM.layak, NIM.atasKuota, NIM.departemen].sort();
  check("Terbitkan Penetapan (5 baru): Diterima, Ditinjau, Layak, Atas Kuota, Departemen; 11 mahasiswa", b?.newCount === 5 && b?.counts?.cohort === 11 && JSON.stringify(pending) === JSON.stringify(expected) && !byNim(b?.rows, NIM.batal)?.assignment?.inCohort, { newCount: b?.newCount, cohort: b?.counts?.cohort, pending });
  const issued = await api(KADEP, "POST", "/thesis-proposals/supervisor-assignments", { academicYearId: b?.academicYear?.id });
  const after = await board();
  check("versi 2 berlaku; semua Ditetapkan (versi 2)", issued.status === 200 && after?.currentBatch?.version === 2 && after?.rows?.filter((r) => r.assignment?.inCohort).every((r) => r.assignment.assigned && r.assignment.version === 2) && after?.upToDate === true, { status: issued.status, v: after?.currentBatch?.version });
});

await run("3.11 Pembimbing 2 ke dosen penuh setelah terbit", async () => {
  const sent = await api(U("ditetapkan"), "POST", "/thesisGuidance/student/request-supervisor-2", { lecturerId: lecturer.husnil });
  const row = (await api(HUSNIL, "GET", "/thesis-proposals/lecturer-inbox?kind=supervisor2")).data?.[0];
  const ok = await api(HUSNIL, "PATCH", `/thesisGuidance/lecturer/supervisor2-requests/${row?.id}/approve`);
  const b = await board();
  const p2 = byNim(b?.rows, NIM.ditetapkan);
  check("Pembimbing 2 · Menunggu Keputusan di baris teratas", sent.status < 300 && ok.status === 200 && b?.rows?.[0]?.studentId === p2?.studentId && p2?.submission === "supervisor2_waiting", b?.rows?.slice(0, 2).map((r) => r.submission));
  await api(KADEP, "POST", `/thesisGuidance/kadep/supervisor2-requests/${p2?.supervisor2Request?.requestId}/approve`);
  const b2 = await board();
  check("setelah Setujui: Terbitkan Penetapan (ada perubahan) — perlu terbit, tanpa yang baru", b2?.needsIssue === true && b2?.newCount === 0, { needsIssue: b2?.needsIssue, newCount: b2?.newCount });
  const issued = await api(KADEP, "POST", "/thesis-proposals/supervisor-assignments", { academicYearId: b2?.academicYear?.id });
  const b3 = await board();
  check("versi 3 berlaku, versi 2 digantikan", issued.status === 200 && b3?.currentBatch?.version === 3 && b3?.batches?.find((x) => x.version === 2)?.status === "superseded", b3?.batches?.map((x) => `${x.version}:${x.status}`));
});

const failed = summary();
process.exit(failed ? 1 : 0);
