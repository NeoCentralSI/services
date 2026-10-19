// The tables sorted by what needs attention (on the server), Permohonan as the
// lecturer's approval inbox, Perubahan and Evaluasi for the Ketua Departemen, and the change
// actions of Mahasiswa Bimbingan. Mutates central; run from app/backend after a clean seed
// with the seven seeders (see README):
//   node scripts/api-checks/e5-api.mjs
import { api, check, ids, login, run, summary } from "./lib-api.mjs";

const prisma = (await import(process.cwd() + "/src/config/prisma.js")).default;
const { CHANGE_REQUEST_STATUS_PRIORITY } = await import(process.cwd() + "/src/constants/thesis-change-request.js");
const { EVALUATION_STATUS_PRIORITY } = await import(process.cwd() + "/src/constants/thesis-guidance-evaluation.js");
const { LECTURER_INBOX_PRIORITY } = await import(process.cwd() + "/src/constants/lecturer-inbox.js");
const { EVENT_STATUS_PRIORITY } = await import(process.cwd() + "/src/constants/thesis-event-monitoring.js");

const HUSNIL = "pembimbing_si", AFRI = "sekdep_si", AINA = "penguji_si", ULLYA = "gkm_si", KADEP = "kadep_si";
const R = "Data uji E5: alasan pengalihan yang cukup panjang.";

/** True when the priorities never go down, and every group is newest first by `dateOf`. */
function inPriorityOrder(rows, priorityOf, dateOf = (row) => row.createdAt) {
  for (let i = 1; i < rows.length; i += 1) {
    const [a, b] = [priorityOf(rows[i - 1]), priorityOf(rows[i])];
    if (a > b) return false;
    if (a === b && dateOf && new Date(dateOf(rows[i - 1])) < new Date(dateOf(rows[i]))) return false;
  }
  return true;
}
const inboxPriority = (row) => LECTURER_INBOX_PRIORITY[row.kind][row.viewStatus];
const myStudents = async (who, status = "active") => (await api(who, "GET", `/thesisGuidance/lecturer/my-students?status=${status}`)).json?.students ?? [];
const rowOf = (rows, name) => rows.find((row) => row.fullName === name);

await run("1.4 Permohonan: kotak masuk persetujuan dosen", async () => {
  // Ullya: two supervisor requests waiting for her, the new-supervisor step of "Uji TA Tunggu
  // Pembimbing Baru", and "Uji TA Tunggu Pembimbing Lama" still at the previous supervisor.
  const inbox = await api(ULLYA, "GET", "/thesis-proposals/lecturer-inbox?pageSize=100");
  const rows = inbox.json?.data ?? [];
  check("200 dengan dua jenis baris", inbox.status === 200 && rows.some((r) => r.kind === "supervisor_request") && rows.some((r) => r.kind === "change_request"), `${inbox.status} ${rows.length}`);
  check("urutan: semua yang menunggu Anda di atas, lalu tiap tingkat, terbaru dulu", inPriorityOrder(rows, inboxPriority), rows.map((r) => `${r.kind[0]}:${r.viewStatus}`));
  const top = rows.slice(0, 3).map((r) => r.viewStatus).sort();
  check("tiga teratas: Menunggu Dosen, Sedang Ditinjau, Menunggu Persetujuan Anda", JSON.stringify(top) === JSON.stringify(["awaiting_me", "pending", "under_review"]), top);
  const mine = rows.find((r) => r.kind === "change_request" && r.viewStatus === "awaiting_me");
  check("langkah sebagai pembimbing baru tampil (Uji TA Tunggu Pembimbing Baru)", mine?.changeRequest?.student?.name === "Uji TA Tunggu Pembimbing Baru" && mine?.changeRequest?.viewer?.canDecideAsLecturer === true, mine?.changeRequest?.student?.name);
  const running = rows.find((r) => r.kind === "change_request" && r.viewStatus === "in_progress");
  check("langkah yang belum gilirannya: Sedang Berjalan (Uji TA Tunggu Pembimbing Lama)", running?.changeRequest?.student?.name === "Uji TA Tunggu Pembimbing Lama", running?.changeRequest?.student?.name);
  const old = await api(ULLYA, "GET", "/thesis-proposals/supervisor-requests/inbox");
  check("badge: menunggu = pengajuan pembimbing + langkah perubahan", inbox.json?.counts?.waiting === 3 && inbox.json?.counts?.waitingRequests === old.data?.waiting?.length && inbox.json?.counts?.waitingChanges === 1, JSON.stringify(inbox.json?.counts));

  // Jenis is one of four; both seed requests waiting around Ullya change a supervisor.
  const onlyChanges = await api(ULLYA, "GET", "/thesis-proposals/lecturer-inbox?kind=change_supervisor");
  check("filter Jenis Perubahan Pembimbing", (onlyChanges.json?.data ?? []).length === 2 && onlyChanges.json.data.every((r) => r.kind === "change_request"), onlyChanges.json?.meta);
  const onlyAssigned = await api(ULLYA, "GET", "/thesis-proposals/lecturer-inbox?status=assigned");
  check("filter Status Ditetapkan", (onlyAssigned.json?.data ?? []).length > 0 && onlyAssigned.json.data.every((r) => r.viewStatus === "assigned"), onlyAssigned.json?.meta);
  const search = await api(ULLYA, "GET", "/thesis-proposals/lecturer-inbox?search=Tunggu%20Pembimbing%20Baru");
  check("cari nama di server", search.json?.meta?.total === 1 && search.json?.data?.[0]?.kind === "change_request", search.json?.meta);

  // Husnil: Pembimbing 1 for the title of "Uji TA Batal Pengajuan" (waiting), the new supervisor
  // of "Uji TA Putus Langsung" (not his turn yet), and approved steps that now wait elsewhere.
  const husnil = await api(HUSNIL, "GET", "/thesis-proposals/lecturer-inbox?pageSize=50");
  const byName = Object.fromEntries((husnil.json?.data ?? []).filter((r) => r.kind === "change_request").map((r) => [r.changeRequest.student.name, r.viewStatus]));
  check("Husnil: judul menunggu Anda; langkah lain Sedang Berjalan", byName["Uji TA Batal Pengajuan"] === "awaiting_me" && byName["Uji TA Putus Langsung"] === "in_progress" && byName["Uji TA Tunggu Kadep"] === "in_progress", byName);
  check("mahasiswa ditolak (403)", (await api("ta_lancar", "GET", "/thesis-proposals/lecturer-inbox")).status === 403);
});

await run("1.4 Perubahan (Kadep)", async () => {
  const inbox = await api(KADEP, "GET", "/thesis-change-requests/inbox?pageSize=100");
  const rows = inbox.json?.data ?? [];
  check("urutan: Menunggu Keputusan Anda, Sedang Berjalan, Disetujui, Ditolak / Dibatalkan", inPriorityOrder(rows, (r) => CHANGE_REQUEST_STATUS_PRIORITY[r.viewStatus]), rows.map((r) => r.viewStatus));
  check("baris teratas: Uji TA Tunggu Kadep, Menunggu Keputusan Anda", rows[0]?.student?.name === "Uji TA Tunggu Kadep" && rows[0]?.viewStatus === "awaiting_decision", rows[0]?.student?.name);
  check("hitungan Menunggu Keputusan Anda 1, Sedang Berjalan 4", inbox.json?.counts?.awaitingDecision === 1 && inbox.json?.counts?.inProgress === 4, JSON.stringify(inbox.json?.counts));
  const kind = await api(KADEP, "GET", "/thesis-change-requests/inbox?kind=title");
  check("filter Jenis Judul", (kind.json?.data ?? []).length === 2 && kind.json.data.every((r) => r.requestType === "title" && !r.batchId), kind.json?.meta);
  const status = await api(KADEP, "GET", "/thesis-change-requests/inbox?status=in_progress");
  check("filter Status Sedang Berjalan", status.json?.meta?.total === 4 && status.json.data.every((r) => r.viewStatus === "in_progress"), status.json?.meta);
  check("pembimbing tidak punya tabel Perubahan (403)", (await api(HUSNIL, "GET", "/thesis-change-requests/inbox")).status === 403);
});

await run("1.4 Evaluasi (Kadep)", async () => {
  const inbox = await api(KADEP, "GET", "/thesis-guidance-evaluations/inbox?pageSize=100");
  const rows = inbox.json?.data ?? [];
  check("urutan: Menunggu Keputusan Anda di atas", inPriorityOrder(rows, (r) => EVALUATION_STATUS_PRIORITY[r.viewStatus]) && rows[0]?.viewStatus === "awaiting_decision", rows.map((r) => `${r.student?.name}:${r.viewStatus}`));
  check("hitungan menunggu 1", inbox.json?.counts?.awaitingDecision === 1, JSON.stringify(inbox.json?.counts));
  check("pembimbing tidak punya tabel Evaluasi (403)", (await api(HUSNIL, "GET", "/thesis-guidance-evaluations/inbox")).status === 403);
});

await run("1.4 Monitoring Seminar Hasil dan Sidang", async () => {
  for (const [path, kind] of [["/thesisGuidance/monitoring/seminars", "seminar"], ["/thesisGuidance/monitoring/defences", "defence"]]) {
    const res = await api(KADEP, "GET", path);
    const items = res.data?.items ?? [];
    const priority = EVENT_STATUS_PRIORITY[kind];
    check(`${kind}: urutan prioritas status modul, lalu terbaru`, res.status === 200 && items.length > 0 && inPriorityOrder(items, (r) => priority[r.status] ?? 99, (r) => r.date ?? r.registeredAt), items.map((r) => r.status));
  }
});

await run("3.2/3.3 aksi Mahasiswa Bimbingan", async () => {
  const husnil = await myStudents(HUSNIL);
  const open = rowOf(husnil, "Uji TA Batal Pengajuan");
  check("baris dengan pengajuan berjalan bertanda, tidak bisa diajukan atau dialihkan", open?.changeRequest?.hasOpenRequest === true && open.changeRequest.canSubmit === false && open.changeRequest.canTransfer === false && /pengajuan perubahan yang berjalan/.test(open.changeRequest.transferBlockReason ?? ""), open?.changeRequest);
  const free = husnil.find((row) => row.thesisStatus === "research" && row.changeRequest?.canTransfer);
  check("Pembimbing 1 tanpa penghalang: boleh mengajukan dan mengalihkan", free?.changeRequest?.canSubmit === true, free?.fullName);
  const seminar = husnil.find((row) => /seminar hasil/.test(row.changeRequest?.transferBlockReason ?? ""));
  check("setelah pendaftaran seminar hasil: tidak bisa dicentang, dengan alasan", !!seminar && seminar.changeRequest.canTransfer === false, seminar?.fullName);
  const due = husnil.find((row) => row.supervisionClock?.evaluationDue && row.roles?.[0] === "Pembimbing 1");
  check("ada baris Pembimbing 1 dengan evaluasi jatuh tempo (ikon Isi Evaluasi)", !!due, due?.fullName);

  const afri = await myStudents(AFRI);
  const p2 = afri.find((row) => row.roles?.[0] === "Pembimbing 2" && row.changeRequest?.canTransfer);
  check("Pembimbing 2: Ajukan Perubahan nonaktif dengan alasan, Alihkan boleh", p2?.changeRequest?.canSubmit === false && /aksi Alihkan di tabel Mahasiswa Bimbingan/.test(p2.changeRequest.blockReason ?? ""), p2?.fullName);

  // "Alihkan (1)": Afriyanti hands her Pembimbing 2 position over to Aina.
  await login(AINA);
  const transfer = await api(AFRI, "POST", "/thesis-change-requests/transfer", { thesisIds: [p2.thesisId], newSupervisorId: ids[AINA], reason: R });
  check("pengalihan diajukan", transfer.status < 300 && transfer.data?.requests?.length === 1, `${transfer.status} ${transfer.json?.message ?? ""}`);
  const requestId = transfer.data?.requests?.[0]?.id;
  const marked = rowOf(await myStudents(AFRI), p2.fullName);
  check("baris kini bertanda pengajuan berjalan", marked?.changeRequest?.hasOpenRequest === true && marked.changeRequest.canTransfer === false, marked?.changeRequest);
  const aina = await api(AINA, "GET", "/thesis-proposals/lecturer-inbox?kind=change_supervisor&status=awaiting_me");
  const step = (aina.json?.data ?? []).find((r) => r.id === requestId);
  check("Aina (pembimbing baru): Menunggu Persetujuan Anda di Permohonan", step?.changeRequest?.batchId && step.changeRequest.viewer.canDecideAsLecturer === true, aina.json?.meta);
  // The requester's own step was approved on submission, so the batch is not in her Permohonan.
  const afriInbox = await api(AFRI, "GET", "/thesis-proposals/lecturer-inbox?pageSize=100");
  check("Afriyanti (pengaju) tidak melihat pengalihannya sendiri di Permohonan", !(afriInbox.json?.data ?? []).some((r) => r.id === requestId), afriInbox.json?.meta);
  const kadepTransfer = await api(KADEP, "GET", "/thesis-change-requests/inbox?kind=transfer");
  check("Kadep: Jenis Alihkan, Sedang Berjalan", (kadepTransfer.json?.data ?? []).some((r) => r.id === requestId && r.viewStatus === "in_progress"), kadepTransfer.json?.meta);
  const approve = await api(AINA, "POST", `/thesis-change-requests/${requestId}/lecturer-decision`, { approve: true });
  check("Aina menyetujui dari Permohonan", approve.status < 300, `${approve.status} ${approve.json?.message ?? ""}`);
  const kadep = await api(KADEP, "GET", "/thesis-change-requests/inbox?pageSize=5");
  const first = (kadep.json?.data ?? []).filter((r) => r.viewStatus === "awaiting_decision").map((r) => r.id);
  check("Kadep: pengalihan naik ke Menunggu Keputusan Anda, di atas", first.includes(requestId) && kadep.json?.data?.[0]?.viewStatus === "awaiting_decision", kadep.json?.data?.map((r) => r.viewStatus));
  const after = await api(AINA, "GET", "/thesis-proposals/lecturer-inbox?kind=change_supervisor");
  check("Aina: langkahnya kini Sedang Berjalan (menunggu Ketua Departemen)", (after.json?.data ?? []).some((r) => r.id === requestId && r.viewStatus === "in_progress"), null);
});

process.exit(summary() ? 1 : 0);
