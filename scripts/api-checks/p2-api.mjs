// P2 API checks: Pengajuan Pembimbing and the supervision limits on a clean seed.
// Mutates central; rerun after a clean seed (see README).
import { api, check, run, summary, ids, login } from "./lib-api.mjs";

const U = (key) => `prop_${key}`;
const AINA = "penguji_si", ULLYA = "gkm_si", HUSNIL = "pembimbing_si", KADEP = "kadep_si", SEKDEP = "sekdep_si";
const body = (extra = {}) => ({
  topicId: null,
  proposedTitle: "Rancang Bangun Sistem Informasi Pemantauan Proposal Tugas Akhir",
  backgroundSummary: "Proses pemantauan proposal masih manual dan tersebar.",
  problemStatement: "Bagaimana memusatkan data pemantauan proposal tugas akhir.",
  proposedSolution: "Membangun modul web terpusat dengan notifikasi.",
  researchObject: "Departemen Sistem Informasi",
  researchPermitStatus: "in_process",
  ...extra,
});

let topicId;
let lecturerIds = {};
await run("0 persiapan", async () => {
  for (const u of [AINA, ULLYA, HUSNIL, KADEP, SEKDEP]) await login(u);
  lecturerIds = { aina: ids[AINA], ullya: ids[ULLYA], husnil: ids[HUSNIL] };
  const topics = await api(U("layak"), "GET", "/topics");
  const list = topics.data?.topics ?? topics.data ?? [];
  topicId = (Array.isArray(list) ? list : []).find((t) => t.name === "Enterprise System")?.id;
  check("topik tersedia lewat /topics untuk mahasiswa", Boolean(topicId), topics.status);
});

await run("1 kelayakan", async () => {
  const no = await api(U("tidak_layak"), "GET", "/thesis-proposals/me/supervisor-requests");
  check("tidak layak: canSubmit false dengan alasan tanpa istilah SIA (Paket P9)", no.data?.submission?.canSubmit === false && no.data?.submission?.blockedReason === "Anda belum terdaftar mengambil mata kuliah Metode Penelitian semester ini. Hubungi Admin Departemen bila ini keliru.", no.data?.submission?.blockedReason);
  const cat = await api(U("tidak_layak"), "GET", "/thesis-proposals/catalog");
  check("tidak layak: katalog 403", cat.status === 403, cat.json?.message);
  const yes = await api(U("layak"), "GET", "/thesis-proposals/me/supervisor-requests");
  check("layak: canSubmit true", yes.data?.submission?.canSubmit === true, yes.data?.submission);
  const catalog = await api(U("layak"), "GET", "/thesis-proposals/catalog");
  const by = Object.fromEntries((catalog.data ?? []).map((c) => [c.lecturerId, c]));
  check("katalog: Husnil penuh (31/10), Aina mendekati batas (9), Ullya tersedia (7)",
    by[lecturerIds.husnil]?.level === "full" && by[lecturerIds.aina]?.level === "near_limit" && by[lecturerIds.ullya]?.level === "available",
    [by[lecturerIds.husnil], by[lecturerIds.aina], by[lecturerIds.ullya]].map((c) => c && `${c.fullName}:${c.activeCount}/${c.hardLimit}:${c.level}`));
});

await run("2 draf dan aturan judul", async () => {
  const draft = await api(U("layak"), "PUT", "/thesis-proposals/me/supervisor-request-draft", { topicId, proposedTitle: "Draf judul sementara saja" });
  check("draf tersimpan", draft.status === 200 && draft.data?.topicId === topicId, draft.json?.message);
  const short = await api(U("layak"), "POST", "/thesis-proposals/supervisor-requests", body({ topicId, proposedTitle: "Judul", lecturerId: lecturerIds.ullya }));
  check("judul < 12 karakter ditolak", short.status === 400 && /terlalu pendek/.test(short.json?.message), short.json?.message);
  const asTopic = await api(U("layak"), "POST", "/thesis-proposals/supervisor-requests", body({ topicId, proposedTitle: "Enterprise System", lecturerId: lecturerIds.ullya }));
  check("judul sama dengan topik ditolak", asTopic.status === 400 && /topik atau kelompok keilmuan/.test(asTopic.json?.message), asTopic.json?.message);
  const noJust = await api(U("layak"), "POST", "/thesis-proposals/supervisor-requests", body({ topicId, lecturerId: lecturerIds.husnil }));
  check("ke dosen penuh tanpa alasan mahasiswa ditolak", noJust.status === 400 && /minimal 20 karakter/.test(noJust.json?.message), noJust.json?.message);
});

let directId;
await run("3 jalur pilih dosen sendiri", async () => {
  const sub = await api(U("layak"), "POST", "/thesis-proposals/supervisor-requests", body({ topicId, lecturerId: lecturerIds.ullya }));
  directId = sub.data?.id;
  check("pengajuan ke Ullya: pending, rute direct", sub.status === 201 && sub.data?.status === "pending" && sub.data?.route === "direct", `${sub.status} ${sub.data?.status} ${sub.data?.route} ${sub.json?.message ?? ""}`);
  const again = await api(U("layak"), "POST", "/thesis-proposals/supervisor-requests", body({ topicId, lecturerId: lecturerIds.aina }));
  check("pengajuan kedua ditolak", again.status === 403 && /masih memiliki pengajuan/.test(again.json?.message), again.json?.message);
  const early = await api(U("layak"), "POST", `/thesis-proposals/supervisor-requests/${directId}/withdraw`);
  check("tarik sebelum 72 jam ditolak (Tunggu 72 jam lagi)", early.status === 400 && /Tunggu 72 jam lagi/.test(early.json?.message), early.json?.message);
  const inbox = await api(ULLYA, "GET", "/thesis-proposals/supervisor-requests/inbox");
  check("muncul di Permohonan Pembimbing Ullya bertanda periode berjalan", (inbox.data?.waiting ?? []).some((r) => r.id === directId && r.isCurrentPeriod === true), inbox.data?.waiting?.length);
  check("beban Ullya di kotak masuk", inbox.data?.load?.activeCount === 7 && inbox.data?.load?.hardLimit === 10, inbox.data?.load);
  const other = await api(AINA, "POST", `/thesis-proposals/supervisor-requests/${directId}/respond`, { action: "accept" });
  check("dosen lain 403", other.status === 403, other.status);
  const detailOther = await api(U("menunggu"), "GET", `/thesis-proposals/supervisor-requests/${directId}`);
  check("detail pengajuan orang lain 403", detailOther.status === 403, detailOther.status);
  const review = await api(ULLYA, "POST", `/thesis-proposals/supervisor-requests/${directId}/review`);
  check("ditandai sedang ditinjau", review.data?.status === "under_review", review.data?.status);
  const rej = await api(ULLYA, "POST", `/thesis-proposals/supervisor-requests/${directId}/respond`, { action: "reject", rejectionReason: "no" });
  check("tolak dengan alasan < 5 karakter ditolak", rej.status === 400, rej.json?.message);
  const acc = await api(ULLYA, "POST", `/thesis-proposals/supervisor-requests/${directId}/respond`, { action: "accept", approvalNote: "Topik sesuai." });
  check("diterima: accepted dan TA lahir", acc.data?.status === "accepted" && Boolean(acc.data?.thesis?.id) && acc.data?.thesis?.status === "proposal", `${acc.data?.status} ${acc.data?.thesis?.status}`);
  const st = await api(U("layak"), "GET", "/thesis-proposals/me/supervisor-requests");
  check("mahasiswa: tidak bisa mengajukan lagi, pengajuan aktif = accepted", st.data?.submission?.canSubmit === false && st.data?.activeRequest?.status === "accepted", st.data?.submission?.blockedReason);
  const load = await api(ULLYA, "GET", "/thesis-proposals/supervisor-requests/inbox");
  check("beban Ullya bertambah 1 (K3: langsung dihitung)", load.data?.load?.activeCount === 8 && load.data?.load?.level === "near_limit", load.data?.load);
  const cancel = await api(U("layak"), "POST", `/thesis-proposals/supervisor-requests/${directId}/withdraw`);
  check("batal setelah diterima (sebelum penetapan): cancelled", cancel.data?.status === "cancelled", `${cancel.status} ${cancel.json?.message}`);
  const after = await api(ULLYA, "GET", "/thesis-proposals/supervisor-requests/inbox");
  check("relasi pembimbing dilepas: beban Ullya kembali 7", after.data?.load?.activeCount === 7, after.data?.load?.activeCount);
  const resub = await api(U("layak"), "GET", "/thesis-proposals/me/supervisor-requests");
  check("setelah batal: boleh mengajukan lagi, draf tersimpan", resub.data?.submission?.canSubmit === true && resub.data?.draft?.proposedTitle, resub.data?.submission);
});

await run("4 tarik setelah 72 jam", async () => {
  const st = await api(U("lewat_72"), "GET", "/thesis-proposals/me/supervisor-requests");
  const id = st.data?.activeRequest?.id;
  check("pengajuan lewat 72 jam: withdrawAvailableAt sudah lewat", id && new Date(st.data.activeRequest.withdrawAvailableAt) < new Date(), st.data?.activeRequest?.withdrawAvailableAt);
  const wd = await api(U("lewat_72"), "POST", `/thesis-proposals/supervisor-requests/${id}/withdraw`);
  check("ditarik: withdrawn", wd.data?.status === "withdrawn" && wd.data?.withdrawCount === 1, `${wd.status} ${wd.json?.message}`);
  const st2 = await api(U("lewat_72"), "GET", "/thesis-proposals/me/supervisor-requests");
  check("setelah ditarik boleh mengajukan lagi", st2.data?.submission?.canSubmit === true, st2.data?.submission?.blockedReason);
});

await run("5 di atas batas keras", async () => {
  const st = await api(U("menunggu"), "GET", "/thesis-proposals/me/supervisor-requests");
  const id = st.data?.activeRequest?.id;
  const acc = await api(AINA, "POST", `/thesis-proposals/supervisor-requests/${id}/respond`, { action: "accept" });
  check("Aina (9, di bawah batas keras 10) menerima langsung", acc.data?.status === "accepted", `${acc.data?.status} ${acc.json?.message}`);
  const inbox = await api(AINA, "GET", "/thesis-proposals/supervisor-requests/inbox");
  check("Aina kini penuh (10/10)", inbox.data?.load?.activeCount === 10 && inbox.data?.load?.level === "full", inbox.data?.load);
  // Overquota request already forwarded by the seed.
  const q = await api(KADEP, "GET", "/thesis-proposals/supervisor-requests/kadep-queue");
  const oq = (q.data?.overQuota ?? [])[0];
  check("antrean Kadep: 1 di atas kuota dengan pratinjau beban, 1 lewat departemen", (q.data?.overQuota ?? []).length === 1 && (q.data?.department ?? []).length === 1 && oq?.lecturerLoad?.projectedCount === 32 && oq?.lecturerLoad?.overBy === 22, oq?.lecturerLoad);
  const rej = await api(KADEP, "POST", `/thesis-proposals/supervisor-requests/${oq.id}/decision`, { action: "reject", notes: "Tidak" });
  check("Kadep tidak bisa menolak pengajuan di atas kuota", rej.status === 400 && /tidak dapat ditolak/.test(rej.json?.message), rej.json?.message);
  const rec = await api(KADEP, "GET", `/thesis-proposals/supervisor-requests/${oq.id}/recommendations`);
  check("rekomendasi maks 3, kelompok keilmuan sama, bukan penuh", Array.isArray(rec.data?.alternatives) && rec.data.alternatives.length <= 3 && rec.data.alternatives.every((a) => a.level !== "full"), rec.data?.alternatives?.map((a) => `${a.fullName}:${a.activeCount}`));
  const assignable = await api(KADEP, "GET", `/thesis-proposals/supervisor-requests/${oq.id}/assignable-lecturers`);
  check("daftar alihkan: semua dosen yang menerima pengajuan, termasuk yang penuh", (assignable.data?.lecturers ?? []).length >= 10 && assignable.data.lecturers.some((l) => l.level === "full"), assignable.data?.lecturers?.length);
  const app = await api(KADEP, "POST", `/thesis-proposals/supervisor-requests/${oq.id}/decision`, { action: "approve", notes: "Disetujui di atas kuota." });
  check("Kadep menyetujui: accepted, acceptedOverNormal, TA lahir dengan Husnil", app.data?.status === "accepted" && app.data?.acceptedOverNormal === true && app.data?.supervisor?.id === lecturerIds.husnil && app.data?.thesis?.status === "proposal", `${app.data?.status} ${app.json?.message}`);
});

await run("6 lecturer di atas batas keras menerima", async () => {
  // A new request to Aina (now 10/10) must carry the student's justification; Aina forwards.
  const sub = await api(U("lewat_72"), "POST", "/thesis-proposals/supervisor-requests", body({ topicId, lecturerId: lecturerIds.aina, proposedTitle: "Aplikasi Pencatatan Kegiatan Pengabdian Masyarakat", studentJustification: "Topik saya melanjutkan proyek pengabdian Bu Aina tahun lalu." }));
  check("pengajuan ke dosen penuh dengan alasan: rute over_quota", sub.data?.route === "over_quota" && sub.data?.status === "pending", `${sub.data?.route} ${sub.json?.message ?? ""}`);
  const noReason = await api(AINA, "POST", `/thesis-proposals/supervisor-requests/${sub.data.id}/respond`, { action: "accept" });
  check("dosen penuh menerima tanpa pertimbangan ditolak", noReason.status === 400 && /minimal 10 karakter/.test(noReason.json?.message), noReason.json?.message);
  const fwd = await api(AINA, "POST", `/thesis-proposals/supervisor-requests/${sub.data.id}/respond`, { action: "accept", lecturerOverquotaReason: "Satu mahasiswa saya sidang bulan ini." });
  check("diteruskan ke Kadep", fwd.data?.status === "pending_kadep" && fwd.data?.forwardedBy?.id === lecturerIds.aina, `${fwd.data?.status} ${fwd.json?.message}`);
  const target = (await api(KADEP, "GET", `/thesis-proposals/supervisor-requests/${sub.data.id}/assignable-lecturers`)).data.lecturers.find((l) => l.lecturerId === lecturerIds.ullya);
  const red = await api(KADEP, "POST", `/thesis-proposals/supervisor-requests/${sub.data.id}/decision`, { action: "redirect", targetLecturerId: target.lecturerId, notes: "Dialihkan ke Ullya." });
  check("Kadep mengalihkan ke Ullya: redirected, pembimbing efektif Ullya", red.data?.status === "redirected" && red.data?.supervisor?.id === lecturerIds.ullya && red.data?.acceptedOverNormal === false, `${red.data?.status} ${red.json?.message}`);
});

await run("7 jalur departemen", async () => {
  const q = await api(KADEP, "GET", "/thesis-proposals/supervisor-requests/kadep-queue");
  const dep = (q.data?.department ?? [])[0];
  const noTarget = await api(KADEP, "POST", `/thesis-proposals/supervisor-requests/${dep.id}/decision`, { action: "approve" });
  check("setujui tanpa memilih dosen ditolak", noTarget.status === 400 && /memilih dosen/.test(noTarget.json?.message), noTarget.json?.message);
  const shortNotes = await api(KADEP, "POST", `/thesis-proposals/supervisor-requests/${dep.id}/decision`, { action: "request_revision", notes: "Perbaiki" });
  check("minta revisi dengan catatan < 10 karakter ditolak", shortNotes.status === 400, shortNotes.json?.message);
  const rev = await api(KADEP, "POST", `/thesis-proposals/supervisor-requests/${dep.id}/decision`, { action: "request_revision", notes: "Perjelas objek penelitian dan solusinya." });
  check("revisi diminta", rev.data?.status === "revision_requested", rev.data?.status);
  const st = await api(U("departemen"), "GET", "/thesis-proposals/me/supervisor-requests");
  check("mahasiswa: revisi diminta, boleh mengajukan ulang dari draf", st.data?.submission?.canSubmit === true && st.data?.submission?.revisionRequested === true && st.data?.draft?.proposedTitle, st.data?.submission);
  const resub = await api(U("departemen"), "POST", "/thesis-proposals/supervisor-requests", { researchObject: "Departemen Sistem Informasi Universitas Andalas" });
  check("ajukan ulang dari draf: pending_kadep, pengajuan lama ditutup", resub.data?.status === "pending_kadep" && resub.data?.route === "department", `${resub.data?.status} ${resub.json?.message}`);
  const all = await api(U("departemen"), "GET", "/thesis-proposals/me/supervisor-requests");
  check("riwayat: pengajuan revisi berstatus closed", all.data?.requests?.some((r) => r.id === dep.id && r.status === "closed"), all.data?.requests?.map((r) => r.status));
  const appr = await api(KADEP, "POST", `/thesis-proposals/supervisor-requests/${resub.data.id}/decision`, { action: "approve", targetLecturerId: lecturerIds.ullya, notes: "Ditetapkan departemen." });
  check("disetujui dengan dosen pilihan Kadep", appr.data?.status === "accepted" && appr.data?.supervisor?.id === lecturerIds.ullya, `${appr.data?.status} ${appr.json?.message}`);
});

await run("8 batas bimbingan", async () => {
  const ov = await api(KADEP, "GET", "/supervision-quotas");
  check("layar batas: batas umum 8/10 berlaku, beban per dosen", ov.data?.general?.softLimit === 8 && ov.data?.applicable?.source === "general" && ov.data?.lecturers?.length >= 10, ov.data?.applicable);
  const aina = ov.data.lecturers.find((l) => l.lecturerId === lecturerIds.aina);
  check("rincian beban Aina", aina?.breakdown?.waitingAssignment >= 2, aina?.breakdown);
  const bad = await api(SEKDEP, "PUT", "/supervision-quotas/general", { softLimit: 12, hardLimit: 10 });
  check("lunak > keras ditolak", bad.status === 400, bad.json?.message);
  const period = await api(SEKDEP, "PUT", `/supervision-quotas/periods/${ov.data.academicYear.id}`, { softLimit: 10, hardLimit: 12 });
  check("batas periode berjalan 10/12 menimpa batas umum", period.data?.applicable?.source === "period" && period.data?.applicable?.hardLimit === 12, period.data?.applicable);
  const cat = await api(U("lewat_72"), "GET", "/supervision-quotas");
  check("mahasiswa tidak boleh membaca layar batas", cat.status === 403, cat.status);
  const clear = await api(KADEP, "DELETE", `/supervision-quotas/periods/${ov.data.academicYear.id}`);
  check("hapus batas periode: kembali ke batas umum", clear.data?.applicable?.source === "general", clear.data?.applicable);
  const close = await api(ULLYA, "PATCH", "/supervision-quotas/me/accepting-requests", { acceptingRequests: false });
  check("dosen menutup penerimaan pengajuan", close.data?.acceptingRequests === false, close.json?.message);
  const sub = await api(U("ditinjau"), "GET", "/thesis-proposals/me/supervisor-requests");
  check("pengajuan yang sedang ditinjau tetap ada", sub.data?.activeRequest?.status === "under_review", sub.data?.activeRequest?.status);
  const open = await api(ULLYA, "PATCH", "/supervision-quotas/me/accepting-requests", { acceptingRequests: true });
  check("dosen membuka kembali", open.data?.acceptingRequests === true);
});

process.exit(summary() ? 1 : 0);
