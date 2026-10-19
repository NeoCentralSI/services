// API checks: proposal-phase guidance and milestones, final proposal, proposal templates.
// Mutates central; run from app/backend after a clean seed (see README): node scripts/api-checks/p4-api.mjs
import { api, check, run, summary, login, ids } from "./lib-api.mjs";

const prisma = (await import(process.cwd() + "/src/config/prisma.js")).default;
const milestoneService = await import(process.cwd() + "/src/services/thesisGuidance/milestone.service.js");

const U = (key) => `prop_${key}`;
const AINA = "penguji_si", ULLYA = "gkm_si", HUSNIL = "pembimbing_si", KADEP = "kadep_si", SEKDEP = "sekdep_si", ADMIN = "admin_si";
const pdf = (text = "proposal") => new Blob([Buffer.from(`%PDF-1.4\n% ${text}\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n`)], { type: "application/pdf" });
const form = (blob, name = "proposal.pdf") => { const f = new FormData(); f.append("file", blob, name); return f; };
const myThesis = async (who) => (await api(who, "GET", "/thesisGuidance/student/my-thesis")).data?.thesis;
const soon = () => new Date(Date.now() + 2 * 86400000).toISOString();

let ditetapkan, aina;
await run("0 persiapan", async () => {
  for (const u of [AINA, ULLYA, HUSNIL, KADEP, SEKDEP, ADMIN]) await login(u);
  aina = ids[AINA];
  ditetapkan = await myThesis(U("ditetapkan"));
  check("TA fase proposal terbaca di my-thesis dengan fase berjalan dan penetapan",
    ditetapkan?.status === "proposal" && ditetapkan?.currentPhase === "proposal" && ditetapkan?.proposalPhaseOpen === true && Boolean(ditetapkan?.supervisorAssignedAt),
    { status: ditetapkan?.status, currentPhase: ditetapkan?.currentPhase, open: ditetapkan?.proposalPhaseOpen });
  check("hitungan per fase tersedia (seed: 1 pengajuan bimbingan proposal menunggu)", ditetapkan?.phases?.proposal?.guidances?.total === 1 && ditetapkan?.phases?.proposal?.guidances?.completed === 0 && ditetapkan?.phases?.research?.guidances?.total === 0, ditetapkan?.phases);
});

await run("1 gerbang sebelum penetapan", async () => {
  const t = await myThesis(U("diterima"));
  check("TA disetujui tetapi belum ditetapkan: fase proposal tertutup", t?.status === "proposal" && t?.proposalPhaseOpen === false, { open: t?.proposalPhaseOpen });
  const req = await api(U("diterima"), "POST", "/thesisGuidance/student/guidance/request", { supervisorId: aina, guidanceDate: soon(), studentNotes: "uji", duration: 60, milestoneIds: ["00000000-0000-0000-0000-000000000000"] });
  check("ajukan bimbingan ditolak 403 dengan alasan penetapan", req.status === 403 && /Penetapan Pembimbing/.test(req.json?.message ?? ""), `${req.status} ${req.json?.message}`);
  const ms = await api(U("diterima"), "POST", `/milestones/thesis/${t?.id}`, { title: "Milestone uji" });
  check("buat milestone ditolak 403 dengan alasan penetapan", ms.status === 403 && /Penetapan Pembimbing/.test(ms.json?.message ?? ""), `${ms.status} ${ms.json?.message}`);
  const fp = await api(U("diterima"), "POST", "/thesis-proposals/me/final-proposal", undefined, { form: form(pdf()) });
  check("proposal final ditolak 403 sebelum penetapan", fp.status === 403 && /Penetapan Pembimbing/.test(fp.json?.message ?? ""), `${fp.status} ${fp.json?.message}`);
});

let guidanceId;
await run("2 satu sesi bimbingan proposal penuh", async () => {
  const blocked = await api(U("ditetapkan"), "POST", "/thesisGuidance/student/guidance/request", { supervisorId: aina, guidanceDate: soon(), studentNotes: "Bahas latar belakang proposal", duration: 60, milestoneIds: ["00000000-0000-0000-0000-000000000000"] });
  check("pengajuan kedua ditolak selama masih ada yang menunggu (aturan bimbingan yang sudah ada)", blocked.status === 400 && /belum direspon/.test(blocked.json?.message ?? ""), `${blocked.status} ${blocked.json?.message ?? ""}`);
  const pendingList = await api(U("ditetapkan"), "GET", "/thesisGuidance/student/guidance");
  guidanceId = (pendingList.data?.items ?? pendingList.json?.items ?? []).find((g) => g.status === "requested")?.id;
  check("pengajuan bimbingan proposal dari seed menunggu dosen", Boolean(guidanceId), guidanceId);
  const row = await prisma.thesisGuidance.findUnique({ where: { id: guidanceId ?? "-" }, select: { phase: true } });
  check("fase sesi ditetapkan server: proposal", row?.phase === "proposal", row?.phase);
  const queue = await api(AINA, "GET", "/thesisGuidance/lecturer/requests?pageSize=50");
  const item = (queue.data?.requests ?? queue.json?.requests ?? queue.data ?? []).find?.((r) => r.id === guidanceId);
  check("masuk antrean permintaan dosen dengan Jenis proposal", item?.phase === "proposal", item ? item.phase : JSON.stringify(queue.json).slice(0, 160));
  const ap = await api(AINA, "PATCH", `/thesisGuidance/lecturer/requests/${guidanceId}/approve`, {});
  check("dosen menyetujui", ap.status < 300, `${ap.status} ${ap.json?.message ?? ""}`);
  const back = await api(ADMIN, "PATCH", `/devtools/guidances/${guidanceId}`, { approvedDate: new Date(Date.now() - 3600000).toISOString() });
  check("DevTools memundurkan jadwal", back.status < 300, back.status);
  const sum = await api(U("ditetapkan"), "POST", `/thesisGuidance/student/guidance/${guidanceId}/submit-summary`, { sessionSummary: "Latar belakang disepakati.", actionItems: "Perbaiki rumusan masalah." });
  check("mahasiswa mengirim ringkasan", sum.status < 300, `${sum.status} ${sum.json?.message ?? ""}`);
  const ok = await api(AINA, "PUT", `/thesisGuidance/lecturer/guidance/${guidanceId}/approve-summary`);
  check("dosen menyetujui ringkasan: sesi selesai", ok.status < 300, `${ok.status} ${ok.json?.message ?? ""}`);
  const list = await api(U("ditetapkan"), "GET", "/thesisGuidance/student/guidance");
  const mine = (list.data?.items ?? list.json?.items ?? []).find((g) => g.id === guidanceId);
  check("daftar mahasiswa memuat sesi dengan Jenis proposal dan status selesai", mine?.phase === "proposal" && mine?.status === "completed", mine && `${mine.phase} ${mine.status}`);
  const t = await myThesis(U("ditetapkan"));
  check("hitungan: proposal 1 sesi selesai, penelitian 0", t?.phases?.proposal?.guidances?.completed === 1 && t?.phases?.research?.guidances?.completed === 0 && t?.stats?.completedGuidances === 0, { phases: t?.phases, stats: t?.stats?.completedGuidances });
  const sr = await api(U("ditetapkan"), "GET", `/milestones/thesis/${t?.id}/seminar-readiness`);
  const g = (sr.data?.requirements ?? sr.json?.data?.requirements ?? []).find?.((r) => r.key === "guidance");
  check("kesiapan seminar tetap menghitung penelitian saja (0 dari 8)", /^0 dari 8/.test(g?.detail ?? ""), g?.detail ?? sr.status);
});

await run("3 milestone fase proposal", async () => {
  const tpl = await api(U("ditetapkan"), "GET", "/milestones/templates?phase=proposal");
  const templates = tpl.data ?? [];
  check("template proposal umum (tanpa topik) terbaca mahasiswa", templates.length === 4 && templates.every((t) => t.phase === "proposal" && !t.topicId), templates.length);
  const make = await api(U("ditetapkan"), "POST", `/milestones/thesis/${ditetapkan.id}/from-templates`, { templateIds: templates.map((t) => t.id) });
  check("memasang template proposal tanpa syarat topik", make.status < 300, `${make.status} ${make.json?.message ?? ""}`);
  const list = await api(U("ditetapkan"), "GET", `/milestones/thesis/${ditetapkan.id}`);
  check("daftar bawaan = fase berjalan (proposal), bisa diubah", list.json?.phase === "proposal" && list.json?.currentPhase === "proposal" && list.json?.readOnlyReason === null && (list.data ?? []).length === 4, { phase: list.json?.phase, n: (list.data ?? []).length, ro: list.json?.readOnlyReason });
  const research = await api(U("ditetapkan"), "GET", `/milestones/thesis/${ditetapkan.id}?phase=research`);
  check("fase penelitian kosong dan baca-saja", (research.data ?? []).length === 0 && Boolean(research.json?.readOnlyReason), research.json?.readOnlyReason);
  const again = await api(U("ditetapkan"), "POST", `/milestones/thesis/${ditetapkan.id}/from-templates`, { templateIds: [templates[0].id] });
  check("template tidak bisa dipasang dua kali pada fase yang sama", again.status === 400, again.json?.message);
  const researchTpl = await prisma.thesisMilestoneTemplate.findFirst({ where: { phase: "research", isActive: true } });
  const wrong = await api(U("ditetapkan"), "POST", `/milestones/thesis/${ditetapkan.id}/from-templates`, { templateIds: [researchTpl?.id] });
  check("template fase penelitian ditolak di fase proposal", wrong.status === 400, wrong.json?.message);
});

await run("4 TA yang sudah naik: proposal baca-saja, hitungan seminar tetap", async () => {
  const t = await myThesis(U("naik"));
  check("fase berjalan penelitian, dua fase terhitung", t?.currentPhase === "research" && t?.phases?.proposal?.guidances?.completed === 3 && t?.phases?.research?.guidances?.completed === 2, t?.phases);
  const prop = await api(U("naik"), "GET", `/milestones/thesis/${t?.id}?phase=proposal`);
  const ms = prop.data ?? [];
  check("milestone proposal tampil baca-saja: Fase proposal sudah selesai", ms.length > 0 && /Fase proposal sudah selesai/.test(prop.json?.readOnlyReason ?? ""), { n: ms.length, ro: prop.json?.readOnlyReason });
  const edit = await api(U("naik"), "PATCH", `/milestones/${ms[0]?.id}`, { title: "Diubah" });
  check("mengubah milestone proposal ditolak 403", edit.status === 403 && /hanya dapat dibaca/.test(edit.json?.message ?? ""), `${edit.status} ${edit.json?.message}`);
  const list = await api(U("naik"), "GET", "/thesisGuidance/student/guidance");
  const items = list.data?.items ?? list.json?.items ?? [];
  check("riwayat bimbingan memuat kedua fase", items.filter((g) => g.phase === "proposal").length === 3 && items.filter((g) => g.phase === "research").length === 2, items.map((g) => g.phase));
  const sr = await api(U("naik"), "GET", `/milestones/thesis/${t?.id}/seminar-readiness`);
  const g = (sr.data?.requirements ?? []).find?.((r) => r.key === "guidance");
  check("kesiapan seminar: 2 dari 8 (sesi proposal tidak dihitung)", /^2 dari 8/.test(g?.detail ?? ""), g?.detail);
});

await run("5 aturan kesiapan seminar tidak berubah", async () => {
  const theses = await prisma.thesis.findMany({
    where: { status: "research" },
    select: { id: true, thesisSupervisors: { where: { status: "active" }, select: { lecturerId: true }, take: 1 } },
  });
  let same = 0, differ = [];
  for (const thesis of theses) {
    const lecturerId = thesis.thesisSupervisors[0]?.lecturerId;
    if (!lecturerId) continue;
    const researchCompleted = await prisma.thesisGuidance.count({ where: { thesisId: thesis.id, phase: "research", status: "completed" } });
    const readiness = await milestoneService.getThesisSeminarReadiness(thesis.id, lecturerId);
    const detail = (readiness.requirements ?? []).find((r) => r.key === "guidance")?.detail ?? "";
    if (detail.startsWith(`${researchCompleted} dari`)) same += 1; else differ.push(`${thesis.id}:${detail}/${researchCompleted}`);
  }
  check(`semua TA penelitian (${theses.length}) menghitung sesi penelitian saja`, differ.length === 0 && same > 0, differ.slice(0, 3));
});

let attemptUrl;
await run("6 proposal final", async () => {
  const bad = await api(U("ditetapkan"), "POST", "/thesis-proposals/me/final-proposal", undefined, { form: form(new Blob([Buffer.from("PK\u0003\u0004 bukan pdf")], { type: "application/pdf" })) });
  check("berkas bukan PDF ditolak 400", bad.status === 400 && /PDF/.test(bad.json?.message ?? ""), `${bad.status} ${bad.json?.message}`);
  const up = await api(U("ditetapkan"), "POST", "/thesis-proposals/me/final-proposal", undefined, { form: form(pdf("versi 1"), "proposal-v1.pdf") });
  check("proposal final diajukan", up.status === 200 && up.data?.replaced === false && /\/proposal\//.test(up.data?.attempt?.file?.url ?? ""), `${up.status} ${up.json?.message}`);
  const first = up.data?.attempt?.file?.url;
  const re = await api(U("ditetapkan"), "POST", "/thesis-proposals/me/final-proposal", undefined, { form: form(pdf("versi 2"), "proposal-v2.pdf") });
  attemptUrl = re.data?.attempt?.file?.url;
  check("proposal final diganti sebelum penilaian", re.status === 200 && re.data?.replaced === true && attemptUrl !== first, re.json?.message);
  const me = await api(U("ditetapkan"), "GET", "/thesis-proposals/me");
  check("ringkasan mahasiswa memuat proposal final periode berjalan", me.data?.finalProposal?.current?.file?.fileName === "proposal-v2.pdf" && me.data?.finalProposal?.canSubmit === true, me.data?.finalProposal?.current?.file);
  const rows = await prisma.researchMethodAssessment.count({ where: { thesisId: ditetapkan.id } });
  check("satu baris percobaan per TA per semester", rows === 1, rows);
  const old = await api(U("ditetapkan"), "GET", first);
  check("berkas lama sudah dihapus", old.status === 404, old.status);
  const notif = await prisma.notification.findFirst({ where: { userId: aina, type: "final_proposal_submitted" } });
  check("pembimbing diberi notifikasi", Boolean(notif), notif?.title);
  const locked = await api(U("dinilai_pembimbing"), "POST", "/thesis-proposals/me/final-proposal", undefined, { form: form(pdf()) });
  check("setelah nilai pembimbing masuk: tidak bisa diganti (400)", locked.status === 400 && /sudah dimulai/.test(locked.json?.message ?? ""), `${locked.status} ${locked.json?.message}`);
  const research = await api(U("naik"), "POST", "/thesis-proposals/me/final-proposal", undefined, { form: form(pdf()) });
  check("TA fase penelitian: ditolak 403", research.status === 403, `${research.status} ${research.json?.message}`);
  const retake = await api(U("tidak_lulus"), "GET", "/thesis-proposals/me");
  check("mengulang: percobaan lama tampil sebagai riwayat dengan hasil", (retake.data?.finalProposal?.history ?? []).some((a) => a.result === "failed"), retake.data?.finalProposal?.history?.map((a) => `${a.academicYear?.label}:${a.result}`));
});

await run("7 akses berkas proposal final", async () => {
  for (const [who, expected] of [[U("ditetapkan"), 200], [AINA, 200], [HUSNIL, 200], [KADEP, 200], [SEKDEP, 200], [ADMIN, 200], [ULLYA, 403], [U("naik"), 403]]) {
    const r = await api(who, "GET", attemptUrl);
    check(`${who}: ${expected}`, r.status === expected, r.status);
  }
});

await run("8 dosen: Mahasiswa Bimbingan fase proposal", async () => {
  const list = await api(AINA, "GET", "/thesisGuidance/lecturer/my-students?status=proposal");
  const students = list.json?.students ?? list.data?.students ?? [];
  check("filter Fase Proposal memuat mahasiswa proposal Aina", students.some((s) => s.thesisId === ditetapkan.id) && students.every((s) => s.thesisStatus === "proposal"), students.map((s) => s.fullName));
  const row = students.find((s) => s.thesisId === ditetapkan.id);
  check("hitungan baris mengikuti fase proposal", row?.completedGuidanceCount === 1 && row?.totalMilestones === 4, row && `${row.completedGuidanceCount} ${row.totalMilestones}`);
  const active = await api(AINA, "GET", "/thesisGuidance/lecturer/my-students");
  check("filter bawaan Aktif tetap tanpa mahasiswa proposal", (active.json?.students ?? []).every((s) => s.thesisStatus !== "proposal"), (active.json?.students ?? []).map((s) => s.thesisStatus));
  const detail = await api(AINA, "GET", `/thesisGuidance/lecturer/my-students/${ditetapkan.id}`);
  const d = detail.data;
  check("detail mahasiswa proposal terbuka dengan fase dan milestone berfase", detail.status === 200 && d?.currentPhase === "proposal" && (d?.milestones ?? []).every((m) => m.phase === "proposal") && d?.guidanceHistory?.items?.[0]?.phase === "proposal", `${detail.status} ${d?.currentPhase}`);
  const ms = (d?.milestones ?? [])[0];
  const fb = await api(AINA, "POST", `/milestones/${ms?.id}/feedback`, { feedback: "Perjelas tujuan penelitian." });
  check("dosen memberi feedback milestone proposal", fb.status < 300, `${fb.status} ${fb.json?.message ?? ""}`);
});

await run("9 template milestone proposal (Kelola > Metode Penelitian; hanya Sekdep)", async () => {
  const list = await api(HUSNIL, "GET", "/research-method/milestone-templates");
  check("koordinator membaca daftar", list.status === 200 && list.data?.length === 4 && list.data.every((t) => typeof t.usedCount === "number"), list.status);
  // Only the Sekretaris Departemen manages the proposal templates.
  const co = await api(HUSNIL, "POST", "/research-method/milestone-templates", { name: "Template koordinator" });
  check("koordinator tidak bisa menambah (403)", co.status === 403, co.status);
  const st = await api(U("ditetapkan"), "GET", "/research-method/milestone-templates");
  check("mahasiswa tidak bisa membuka pengelolaan (403)", st.status === 403, st.status);
  const short = await api(SEKDEP, "POST", "/research-method/milestone-templates", { name: "ab" });
  check("nama terlalu pendek ditolak 400", short.status === 400, short.json?.details?.[0]?.message ?? short.json?.message);
  const add = await api(SEKDEP, "POST", "/research-method/milestone-templates", { name: "Revisi Akhir Proposal", description: "Perbaikan setelah masukan pembimbing." });
  check("Sekdep menambah template", add.status === 201 && add.data?.phase === "proposal" && add.data?.topicId === null && add.data?.orderIndex === 4, `${add.status} ${add.data?.orderIndex}`);
  const ids2 = (await api(SEKDEP, "GET", "/research-method/milestone-templates")).data.map((t) => t.id);
  const reordered = [ids2.at(-1), ...ids2.slice(0, -1)];
  const ro = await api(SEKDEP, "PATCH", "/research-method/milestone-templates/reorder", { templateIds: reordered });
  check("urutan disimpan", ro.status === 200 && ro.data?.[0]?.id === add.data?.id, ro.json?.message);
  const partial = await api(SEKDEP, "PATCH", "/research-method/milestone-templates/reorder", { templateIds: reordered.slice(1) });
  check("urutan tidak lengkap ditolak 400", partial.status === 400, partial.json?.message);
  const off = await api(SEKDEP, "PATCH", `/research-method/milestone-templates/${add.data?.id}`, { isActive: false });
  check("template dinonaktifkan", off.status === 200 && off.data?.isActive === false, off.status);
  const studentView = await api(U("siap_dinilai"), "GET", "/milestones/templates?phase=proposal");
  check("mahasiswa hanya melihat template aktif", !(studentView.data ?? []).some((t) => t.id === add.data?.id), (studentView.data ?? []).length);
  const del = await api(SEKDEP, "DELETE", `/research-method/milestone-templates/${add.data?.id}`);
  check("template dihapus", del.status === 200, del.status);
  const used = (await api(SEKDEP, "GET", "/research-method/milestone-templates")).data.find((t) => t.usedCount > 0);
  check("template yang dipakai mahasiswa menghitung pemakaiannya", Boolean(used), used?.usedCount);
});

const failed = summary();
await prisma.$disconnect();
process.exit(failed ? 1 : 0);
