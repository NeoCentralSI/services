// The way back to research for a thesis repeating its proposal.
// Mengulang proposal → unggah → minta revisi → unggah lagi → setujui → Penelitian with a new
// start date. Mutates central; run from app/backend after a clean seed (see README):
//   node scripts/api-checks/p7-api.mjs
import { api, check, run, summary, login } from "./lib-api.mjs";

const prisma = (await import(process.cwd() + "/src/config/prisma.js")).default;

const STUDENT = "ta_eval_tindak_lanjut"; // Pembimbing 1 Husnil, Pembimbing 2 Afriyanti, extension already over
const HUSNIL = "pembimbing_si", AFRI = "sekdep_si", ULLYA = "gkm_si", AINA = "penguji_si", KADEP = "kadep_si";
const pdf = (text) => new Blob([Buffer.from(`%PDF-1.7\n${text}\n%%EOF`)], { type: "application/pdf" });
const form = (blob, name) => {
  const body = new FormData();
  body.append("file", blob, name);
  return body;
};
const upload = (who, blob, name) => api(who, "POST", "/thesis-proposals/me/proposal-revision", undefined, { form: form(blob, name) });
const myThesis = async (who) => (await api(who, "GET", "/thesisGuidance/student/my-thesis")).json?.thesis;
const userIdOf = async (key) => (await prisma.user.findFirst({ where: { email: `${key}@fti.unand.ac.id` }, select: { id: true } }))?.id;

let thesis;
let firstId;
let secondId;

await run("0 bukan dari evaluasi", async () => {
  thesis = await myThesis(STUDENT);
  check("akun uji berstatus Penelitian", thesis?.status === "research" && Boolean(thesis?.startDate), `${thesis?.status} ${thesis?.startDate}`);
  const early = await upload(STUDENT, pdf("revisi 0"), "revisi-0.pdf");
  check("TA Penelitian tidak bisa mengunggah proposal revisi (403)", early.status === 403 && /hanya untuk tugas akhir yang mengulang proposal/.test(early.json?.message ?? ""), `${early.status} ${early.json?.message}`);
  const other = await upload("prop_ditetapkan", pdf("bukan evaluasi"), "x.pdf");
  check("TA Proposal biasa (bukan dari evaluasi) ditolak (403)", other.status === 403 && /hanya untuk tugas akhir yang mengulang proposal/.test(other.json?.message ?? ""), `${other.status} ${other.json?.message}`);
  const me = await api("prop_ditetapkan", "GET", "/thesis-proposals/me");
  check("bagian Proposal Revisi tidak berlaku untuk TA Proposal biasa", me.data?.proposalRevision?.applicable === false, me.data?.proposalRevision);
  const propThesis = await myThesis("prop_ditetapkan");
  const view = await api(AINA, "GET", `/thesis-proposals/theses/${propThesis?.id}/proposal-revision`);
  check("Pembimbing 1 TA Proposal biasa tidak bisa meninjau", view.status === 200 && view.data?.applicable === false && view.data?.canReview === false, view.data?.reviewBlockReason);
});

await run("1 mengulang proposal (evaluasi bimbingan)", async () => {
  const ev = await api(HUSNIL, "POST", "/thesis-guidance-evaluations", { thesisId: thesis.id, recommendation: "revise_proposal", observations: { noRevision: true }, notes: "Data uji Lanjutan Paket P." });
  check("Mengulang Proposal menunggu Kadep", ev.data?.status === "pending", `${ev.status} ${ev.json?.message ?? ""}`);
  const k = await api(KADEP, "POST", `/thesis-guidance-evaluations/${ev.data?.id}/decision`, { approve: true, notes: "Setuju." });
  check("Kadep menyetujui", k.data?.status === "approved", `${k.status} ${k.json?.message ?? ""}`);
  const t = await myThesis(STUDENT);
  check("TA berstatus Proposal, mengulang proposal, tanggal mulai dikosongkan", t?.status === "proposal" && t?.repeatingProposal === true && !t?.startDate, `${t?.status} ${t?.repeatingProposal} ${t?.startDate}`);
  const me = await api(STUDENT, "GET", "/thesis-proposals/me");
  const rev = me.data?.proposalRevision;
  check("bagian Proposal Revisi terbuka", rev?.applicable === true && rev?.canSubmit === true && rev?.current === null, rev);
  check("proposal final tetap terkunci dan menunjuk ke proposal revisi", me.data?.finalProposal?.canSubmit === false && /proposal revisi/.test(me.data?.finalProposal?.blockReason ?? ""), me.data?.finalProposal?.blockReason);
});

await run("2 unggah", async () => {
  const bad = await api(STUDENT, "POST", "/thesis-proposals/me/proposal-revision", undefined, { form: form(new Blob([Buffer.from("bukan pdf")], { type: "application/pdf" }), "x.pdf") });
  check("bukan PDF ditolak (400)", bad.status === 400 && /PDF/.test(bad.json?.message ?? ""), `${bad.status} ${bad.json?.message}`);
  const up = await upload(STUDENT, pdf("revisi 1"), "revisi-1.pdf");
  firstId = up.data?.revision?.id;
  check("proposal revisi diajukan", up.status === 200 && up.data?.revision?.status === "submitted" && up.data?.replaced === false, `${up.status} ${up.json?.message}`);
  const again = await upload(STUDENT, pdf("revisi 1b"), "revisi-1b.pdf");
  check("diganti sebelum ditinjau: baris yang sama", again.status === 200 && again.data?.replaced === true && again.data?.revision?.id === firstId && again.data?.revision?.file?.fileName === "revisi-1b.pdf", `${again.json?.message} ${again.data?.revision?.id === firstId}`);
  const husnilId = await userIdOf(HUSNIL);
  const note = await prisma.notification.findFirst({ where: { userId: husnilId, title: { startsWith: "Proposal Revisi" } }, orderBy: { createdAt: "desc" } });
  check("Pembimbing 1 diberi notifikasi", Boolean(note), note?.title);
  const url = again.data?.revision?.file?.url;
  const own = await fetch(`${process.env.BASE || "http://localhost:3000"}${url}`, { headers: { Authorization: `Bearer ${await login(STUDENT)}` } });
  const stranger = await fetch(`${process.env.BASE || "http://localhost:3000"}${url}`, { headers: { Authorization: `Bearer ${await login(ULLYA)}` } });
  check("berkas: mahasiswa 200, dosen lain 403", own.status === 200 && stranger.status === 403, `${own.status} ${stranger.status}`);
});

await run("3 minta revisi", async () => {
  const p2 = await api(AFRI, "POST", `/thesis-proposals/proposal-revisions/${firstId}/review`, { action: "approve" });
  check("Pembimbing 2 tidak bisa meninjau (403)", p2.status === 403 && /Hanya Pembimbing 1/.test(p2.json?.message ?? ""), `${p2.status} ${p2.json?.message}`);
  const p2view = await api(AFRI, "GET", `/thesis-proposals/theses/${thesis.id}/proposal-revision`);
  check("Pembimbing 2 melihat, tombol nonaktif dengan alasan", p2view.data?.applicable === true && p2view.data?.canReview === false && /Hanya Pembimbing 1/.test(p2view.data?.reviewBlockReason ?? ""), p2view.data?.reviewBlockReason);
  const stranger = await api(ULLYA, "GET", `/thesis-proposals/theses/${thesis.id}/proposal-revision`);
  check("dosen lain tidak bisa membaca (403)", stranger.status === 403, stranger.status);
  const short = await api(HUSNIL, "POST", `/thesis-proposals/proposal-revisions/${firstId}/review`, { action: "request_revision", notes: "kurang" });
  check("catatan < 10 karakter ditolak (400)", short.status === 400 && /minimal 10 karakter/.test(short.json?.message ?? ""), short.json?.message);
  const req = await api(HUSNIL, "POST", `/thesis-proposals/proposal-revisions/${firstId}/review`, { action: "request_revision", notes: "Perjelas metodologi dan rencana pengujian." });
  check("Minta Revisi: status perlu revisi, TA tetap Proposal", req.status === 200 && req.data?.revision?.status === "revision_requested" && req.data?.thesis === null, `${req.status} ${req.json?.message}`);
  const twice = await api(HUSNIL, "POST", `/thesis-proposals/proposal-revisions/${firstId}/review`, { action: "approve" });
  check("unggahan yang sudah ditinjau tidak bisa disetujui (400)", twice.status === 400, `${twice.status} ${twice.json?.message}`);
  const me = await api(STUDENT, "GET", "/thesis-proposals/me");
  check("mahasiswa melihat catatan dan boleh mengunggah lagi", me.data?.proposalRevision?.current?.reviewNotes === "Perjelas metodologi dan rencana pengujian." && me.data?.proposalRevision?.canSubmit === true && me.data?.proposalRevision?.replacesCurrent === false, me.data?.proposalRevision?.current);
  const studentId = await userIdOf(STUDENT);
  const note = await prisma.notification.findFirst({ where: { userId: studentId, title: "Proposal Revisi Perlu Diperbaiki" } });
  check("mahasiswa diberi notifikasi beserta catatan", /Perjelas metodologi/.test(note?.message ?? ""), note?.message);
});

await run("4 unggah lagi dan setujui", async () => {
  const up = await upload(STUDENT, pdf("revisi 2"), "revisi-2.pdf");
  secondId = up.data?.revision?.id;
  check("unggahan baru membuat baris baru", up.status === 200 && secondId && secondId !== firstId, `${up.status} ${up.json?.message}`);
  const view = await api(HUSNIL, "GET", `/thesis-proposals/theses/${thesis.id}/proposal-revision`);
  check("Pembimbing 1 bisa meninjau; riwayat memuat catatan sebelumnya", view.data?.canReview === true && view.data?.current?.id === secondId && view.data?.history?.[0]?.status === "revision_requested", view.data?.history?.map((r) => r.status));
  const before = Date.now();
  const ok = await api(HUSNIL, "POST", `/thesis-proposals/proposal-revisions/${secondId}/review`, { action: "approve" });
  check("Setujui: TA kembali ke Penelitian", ok.status === 200 && ok.data?.thesis?.status === "research", `${ok.status} ${ok.json?.message}`);
  const row = await prisma.thesis.findUnique({ where: { id: thesis.id }, select: { status: true, startDate: true, totalLeaveDays: true } });
  const started = row?.startDate ? new Date(row.startDate).getTime() : 0;
  check("masa bimbingan baru: tanggal mulai = waktu persetujuan, lebih baru dari yang lama", started >= before - 5000 && started > new Date(thesis.startDate).getTime() && row.totalLeaveDays === 0, `${row?.startDate} (lama ${thesis.startDate})`);
  const t = await myThesis(STUDENT);
  check("tidak lagi bertanda mengulang proposal", t?.status === "research" && t?.repeatingProposal === false, `${t?.status} ${t?.repeatingProposal}`);
  const studentId = await userIdOf(STUDENT);
  const afriId = await userIdOf(AFRI);
  const notes = await prisma.notification.findMany({ where: { title: "Proposal Revisi Disetujui", userId: { in: [studentId, afriId] } }, select: { userId: true } });
  check("notifikasi ke mahasiswa dan Pembimbing 2", new Set(notes.map((n) => n.userId)).size === 2, notes.length);
  const audits = await prisma.auditLog.findMany({ where: { OR: [{ entityId: secondId }, { entityId: thesis.id, action: "THESIS_STATUS_CHANGED" }] }, select: { action: true }, orderBy: { createdAt: "asc" } });
  check("audit: proposal revisi disetujui dan perubahan status", audits.some((a) => a.action === "PROPOSAL_REVISION_APPROVED") && audits.filter((a) => a.action === "THESIS_STATUS_CHANGED").length >= 2, audits.map((a) => a.action));
  const kadepNotes = await prisma.notification.count({ where: { title: "Proposal Revisi Disetujui", userId: await userIdOf(KADEP) } });
  check("tidak lewat Ketua Departemen", kadepNotes === 0, kadepNotes);
  const after = await upload(STUDENT, pdf("revisi 3"), "revisi-3.pdf");
  check("setelah kembali ke Penelitian tidak bisa mengunggah lagi (403)", after.status === 403, `${after.status} ${after.json?.message}`);
  const ctx = await api(HUSNIL, "GET", `/thesis-guidance-evaluations/context?thesisId=${thesis.id}`);
  check("evaluasi bimbingan belum jatuh tempo lagi (masa bimbingan dari nol)", ctx.status === 200 && ctx.data?.canSubmit === false, ctx.data?.blockReason);
});

const failed = summary();
await prisma.$disconnect();
process.exit(failed ? 1 : 0);
