// Paket E6: the title-change rule after the seminar (K34), the Jenis of Permohonan, the load in
// the supervisor picker, and the removed lecturer/department lists. Mutates central; run from
// app/backend after a clean seed with the seven seeders (see README):
//   node scripts/api-checks/e6-api.mjs
import { api, check, ids, login, run, summary } from "./lib-api.mjs";

const prisma = (await import(process.cwd() + "/src/config/prisma.js")).default;

const HUSNIL = "pembimbing_si", KADEP = "kadep_si";
const R = "Data uji E6: revisi judul setelah seminar hasil.";
const SEMINAR_IN_PROCESS = "Perubahan judul tidak dapat diajukan selama seminar hasil sedang berproses.";
const DEFENCE_IN_PROCESS = "Perubahan judul tidak dapat diajukan selama sidang tugas akhir sedang berproses.";
const context = async (who) => (await api(who, "GET", "/thesis-change-requests/context")).data;
const myThesis = async (who) => (await api(who, "GET", "/thesisGuidance/student/my-thesis")).json?.thesis;
const titleRequest = (newTitle) => ({ requestType: "title", newTitle, reason: R });

await run("6 aturan perubahan judul per tahap (K34)", async () => {
  // Seminar registered: title waits, supervisor closed.
  const active = await context("ta_seminar_aktif");
  check("seminar berproses: judul diblokir dengan alasannya", active?.typeBlocks?.title === SEMINAR_IN_PROCESS, active?.typeBlocks);
  check("seminar berproses: pembimbing hanya sebelum pendaftaran seminar", /sebelum pendaftaran seminar hasil/.test(active?.typeBlocks?.supervisor ?? ""), active?.typeBlocks?.supervisor);
  const blocked = await api("ta_seminar_aktif", "POST", "/thesis-change-requests", titleRequest("Judul Baru Saat Seminar Berproses"));
  check("seminar berproses: pengajuan judul ditolak 400 dengan alasan yang sama", blocked.status === 400 && blocked.json?.message === SEMINAR_IN_PROCESS, `${blocked.status} ${blocked.json?.message}`);

  // Defence registered (seminar passed).
  const defence = await context("ta_mon_sid_daftar");
  check("sidang berproses: judul diblokir dengan alasannya", defence?.typeBlocks?.title === DEFENCE_IN_PROCESS, defence?.typeBlocks?.title);

  // After the defence result, still in research.
  const afterDefence = await context("ta_mon_sid_revisi_lama");
  check("setelah hasil sidang difinalkan (TA masih Penelitian): judul boleh", afterDefence?.typeBlocks?.title === null && afterDefence?.canSubmit === true, afterDefence?.typeBlocks);
  check("setelah hasil sidang: pembimbing tetap tertutup", !!afterDefence?.typeBlocks?.supervisor && !!afterDefence?.typeBlocks?.both, afterDefence?.typeBlocks);

  // Completed thesis.
  const done = await api("ta_mon_sid_lulus", "POST", "/thesis-change-requests", titleRequest("Judul Baru Setelah Selesai"));
  check("TA Selesai: pengajuan judul ditolak 400", done.status === 400 && /berstatus "Penelitian"/.test(done.json?.message ?? ""), `${done.status} ${done.json?.message}`);
});

await run("6 judul berubah setelah seminar hasil (ta_lulus_seminar)", async () => {
  const before = await context("ta_lulus_seminar");
  check("setelah seminar: judul boleh, pembimbing dan judul & pembimbing tidak", before?.typeBlocks?.title === null && !!before?.typeBlocks?.supervisor && !!before?.typeBlocks?.both, before?.typeBlocks);
  const supervisor = await api("ta_lulus_seminar", "POST", "/thesis-change-requests", { requestType: "supervisor", supervisorRole: "pembimbing_2", newSupervisorId: ids[HUSNIL] ?? (await login(HUSNIL), ids[HUSNIL]), reason: R });
  check("setelah seminar: pengajuan pembimbing ditolak 400", supervisor.status === 400 && /sebelum pendaftaran seminar hasil/.test(supervisor.json?.message ?? ""), `${supervisor.status} ${supervisor.json?.message}`);

  const newTitle = "Rancang Bangun Sistem Uji Revisi Judul Setelah Seminar Hasil";
  const submitted = await api("ta_lulus_seminar", "POST", "/thesis-change-requests", titleRequest(newTitle));
  check("pengajuan judul setelah seminar diterima, rantai Pembimbing 1 → Ketua Departemen", submitted.status < 300 && JSON.stringify((submitted.data?.steps ?? []).map((s) => s.key)) === JSON.stringify(["main_supervisor", "kadep"]), `${submitted.status} ${submitted.json?.message ?? ""}`);
  const id = submitted.data?.id;

  // Permohonan: the step of Pembimbing 1 is "Perubahan Judul".
  const inbox = await api(HUSNIL, "GET", "/thesis-proposals/lecturer-inbox?kind=change_title&status=awaiting_me");
  check("Permohonan Husnil, Jenis Perubahan Judul: menunggu persetujuan", (inbox.json?.data ?? []).some((row) => row.id === id && row.changeRequest?.requestType === "title"), inbox.json?.meta);
  check("Pembimbing 1 menyetujui", (await api(HUSNIL, "POST", `/thesis-change-requests/${id}/lecturer-decision`, { approve: true })).status < 300);
  const decided = await api(KADEP, "POST", `/thesis-change-requests/${id}/decision`, { approve: true });
  check("Ketua Departemen menyetujui", decided.data?.status === "approved", `${decided.status} ${decided.json?.message ?? ""}`);
  const thesis = await myThesis("ta_lulus_seminar");
  check("judul TA kini judul baru", thesis?.title === newTitle, thesis?.title);

  // The seminar module reads the current title (it keeps no copy).
  const seminars = (await api(KADEP, "GET", "/thesisGuidance/monitoring/seminars")).data?.items ?? [];
  const seminar = seminars.find((item) => item.student?.name === "Uji TA Lulus Seminar");
  const detail = await api(KADEP, "GET", `/thesis-seminars/${seminar?.id}`);
  check("detail seminar hasil menampilkan judul terkini", detail.status === 200 && detail.data?.thesis?.title === newTitle, `${detail.status} ${detail.data?.thesis?.title}`);
});

await run("6 aturan diperiksa ulang saat Ketua Departemen memutuskan", async () => {
  // A title request of Uji TA Lancar (P1 Husnil), then a seminar is registered (inserted directly).
  const lancar = await myThesis("ta_lancar");
  const sent = await api("ta_lancar", "POST", "/thesis-change-requests", titleRequest("Judul Uji Pemeriksaan Ulang Saat Keputusan"));
  check("pengajuan judul sebelum seminar terkirim", sent.status < 300, `${sent.status} ${sent.json?.message ?? ""}`);
  const id = sent.data?.id;
  const seminar = await prisma.thesisSeminar.create({ data: { thesisId: lancar.id, status: "registered", registeredAt: new Date() } });

  const step = ((await api(HUSNIL, "GET", "/thesis-proposals/lecturer-inbox?kind=change_title&status=awaiting_me")).data ?? []).find((row) => row.id === id);
  check("Permohonan Husnil: baris bertanda terblokir dengan alasannya", (step?.changeRequest?.applyBlockReason ?? "").includes(SEMINAR_IN_PROCESS), step?.changeRequest?.applyBlockReason);
  // Paket E6 (lanjutan): the lecturer's step is refused with the same reason.
  const lecturerApprove = await api(HUSNIL, "POST", `/thesis-change-requests/${id}/lecturer-decision`, { approve: true });
  check("Pembimbing 1 menyetujui: ditolak 400 dengan alasan aturan", lecturerApprove.status === 400 && (lecturerApprove.json?.message ?? "").includes(SEMINAR_IN_PROCESS), `${lecturerApprove.status} ${lecturerApprove.json?.message}`);
  const kadepRow = ((await api(KADEP, "GET", "/thesis-change-requests/inbox?kind=title&status=in_progress")).data ?? []).find((row) => row.id === id);
  check("Perubahan Kadep: baris bertanda terblokir dengan alasannya", (kadepRow?.applyBlockReason ?? "").includes(SEMINAR_IN_PROCESS), kadepRow?.applyBlockReason);
  const approve = await api(KADEP, "POST", `/thesis-change-requests/${id}/decision`, { approve: true, notes: "Data uji E6: diputuskan langsung." });
  check("Kadep menyetujui: ditolak 400 dengan alasan aturan", approve.status === 400 && (approve.json?.message ?? "").includes(SEMINAR_IN_PROCESS), `${approve.status} ${approve.json?.message}`);
  check("pengajuan tetap menunggu, judul tidak berubah", (await context("ta_lancar"))?.openRequest?.status === "pending" && (await myThesis("ta_lancar"))?.title === lancar.title);
  const reject = await api(KADEP, "POST", `/thesis-change-requests/${id}/decision`, { approve: false, notes: "Data uji E6: seminar sudah didaftarkan." });
  check("Kadep tetap dapat menolaknya", reject.data?.status === "rejected", `${reject.status} ${reject.json?.message ?? ""}`);
  await prisma.thesisSeminar.delete({ where: { id: seminar.id } });

  // A supervisor request of Uji TA Satu Pembimbing (add Pembimbing 2 Ullya), then a seminar is verified.
  const satu = await myThesis("ta_satu_pembimbing");
  await login("gkm_si");
  const sup = await api("ta_satu_pembimbing", "POST", "/thesis-change-requests", { requestType: "supervisor", supervisorRole: "pembimbing_2", newSupervisorId: ids.gkm_si, reason: R });
  check("pengajuan pembimbing sebelum seminar terkirim", sup.status < 300, `${sup.status} ${sup.json?.message ?? ""}`);
  const verified = await prisma.thesisSeminar.create({ data: { thesisId: satu.id, status: "verified", registeredAt: new Date(), verifiedAt: new Date() } });
  const supApprove = await api(KADEP, "POST", `/thesis-change-requests/${sup.data?.id}/decision`, { approve: true, notes: "Data uji E6: diputuskan langsung." });
  check("pengajuan pembimbing: persetujuan ditolak 400 (sebelum pendaftaran seminar)", supApprove.status === 400 && /Perubahan pembimbing hanya dapat diajukan sampai sebelum pendaftaran seminar hasil/.test(supApprove.json?.message ?? ""), `${supApprove.status} ${supApprove.json?.message}`);
  check("pembimbing tidak bertambah", ((await myThesis("ta_satu_pembimbing"))?.supervisors ?? []).length === 1);
  await api(KADEP, "POST", `/thesis-change-requests/${sup.data?.id}/decision`, { approve: false, notes: "Data uji E6: seminar sudah didaftarkan." });
  await prisma.thesisSeminar.delete({ where: { id: verified.id } });
});

await run("3 Permohonan: Jenis dan pengaju", async () => {
  for (const kind of ["supervisor_request", "change_title", "change_supervisor", "change_both"]) {
    const res = await api("gkm_si", "GET", `/thesis-proposals/lecturer-inbox?kind=${kind}`);
    const rows = res.json?.data ?? [];
    const ok = res.status === 200 && rows.every((row) =>
      kind === "supervisor_request" ? row.kind === "supervisor_request" : row.kind === "change_request" && row.changeRequest?.requestType === kind.replace("change_", ""));
    check(`filter Jenis ${kind}`, ok, `${res.status} ${rows.length}`);
  }
});

await run("4 beban dosen di pemilih", async () => {
  const options = (await api("ta_lancar", "GET", "/thesis-change-requests/supervisor-options")).data ?? [];
  check("setiap pilihan dosen membawa beban bimbingan", options.length > 0 && options.every((option) => Number.isInteger(option.load?.activeCount) && Number.isInteger(option.load?.quotaMax)), JSON.stringify(options[0]));
});

await run("7 endpoint lama dihapus", async () => {
  for (const path of ["/thesis-change-requests/lecturer", "/thesis-change-requests/department", "/thesis-guidance-evaluations/lecturer", "/thesis-guidance-evaluations/department"]) {
    const res = await api(path.includes("department") ? KADEP : HUSNIL, "GET", path);
    check(`${path} → 404`, res.status === 404, res.status);
  }
});

process.exit(summary() ? 1 : 0);
