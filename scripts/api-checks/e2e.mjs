// End-to-end API scenarios for Paket E against a freshly seeded `central`.
const BASE = process.env.BASE || "http://localhost:3000";
const D = "@fti.unand.ac.id";
const results = [];
let section = "";

function find(obj, key) {
  if (!obj || typeof obj !== "object") return undefined;
  if (key in obj) return obj[key];
  for (const v of Object.values(obj)) {
    const r = find(v, key);
    if (r !== undefined) return r;
  }
  return undefined;
}
const sessions = {};
async function login(name) {
  if (sessions[name]) return sessions[name];
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: name + D, password: "password123" }),
  });
  const json = await res.json();
  const token = find(json, "accessToken");
  if (!token) throw new Error(`login ${name} gagal: ${res.status}`);
  sessions[name] = { token, id: find(json, "user")?.id };
  return sessions[name];
}
async function api(name, method, path, body) {
  const { token } = await login(name);
  const res = await fetch(BASE + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* no body */ }
  return { status: res.status, json, data: json?.data ?? json };
}
function check(label, ok, seen) {
  results.push({ section, label, ok: !!ok });
  console.log(`${ok ? "PASS" : "FAIL"} [${section}] ${label}${seen !== undefined ? ` :: ${typeof seen === "string" ? seen : JSON.stringify(seen)}`.slice(0, 260) : ""}`);
}
const myThesis = async (student) => (await api(student, "GET", "/thesisGuidance/student/my-thesis")).json?.thesis;
const sup = (thesis) => (thesis?.supervisors ?? []).map((s) => `${s.role}:${s.name}`).sort().join(" | ");
const R = "Data uji E2E: alasan pengajuan yang cukup panjang.";
const lecturerDecide = (who, id, approve = true, notes = null) => api(who, "POST", `/thesis-change-requests/${id}/lecturer-decision`, { approve, notes });
const kadepDecide = (id, approve = true, notes = null) => api("kadep_si", "POST", `/thesis-change-requests/${id}/decision`, { approve, notes });

const HUSNIL = "pembimbing_si", AFRI = "sekdep_si", AINA = "penguji_si", ULLYA = "gkm_si", KADEP = "kadep_si";

async function run(name, fn) {
  section = name;
  try { await fn(); } catch (e) { check("skenario berjalan tanpa galat", false, String(e?.message ?? e)); }
}

await run("0 data seed", async () => {
  const list = await api(HUSNIL, "GET", "/thesisGuidance/lecturer/my-students?pageSize=100&limit=100");
  const rows = find(list.json, "students") ?? find(list.json, "data") ?? [];
  const by = (n) => (Array.isArray(rows) ? rows : []).find((r) => JSON.stringify(r).includes(n));
  const level = (n) => { const r = by(n); return r ? `${r.activityLevel}/${r.supervisionClock?.evaluationDue ?? "-"}/${r.supervisionClock?.elapsedLabel}` : "tidak ada"; };
  check("my-students 200", list.status === 200, list.status);
  check("Uji TA Lancar = active, tanpa jatuh tempo", level("Uji TA Lancar").startsWith("active/-"), level("Uji TA Lancar"));
  check("Uji TA Lambat = slow, six_month", level("Uji TA Lambat").startsWith("slow/six_month"), level("Uji TA Lambat"));
  check("Uji TA Berisiko = at_risk, one_year", level("Uji TA Berisiko").startsWith("at_risk/one_year"), level("Uji TA Berisiko"));
  const dash = await api(KADEP, "GET", "/thesisGuidance/monitoring/dashboard");
  const due = (find(dash.json, "evaluationDueStudents") ?? []).map((r) => `${r.student?.name}:${r.evaluationDue}`);
  check("monitoring dashboard 200", dash.status === 200, dash.status);
  check("Perlu Evaluasi memuat 6 akun yang jatuh tempo", ["Uji TA Lambat", "Uji TA Berisiko", "Uji TA Evaluasi Lanjut", "Uji TA Evaluasi Peringatan", "Uji TA Evaluasi Tindak Lanjut", "Uji TA Evaluasi Satu Tahun"].every((n) => due.some((d) => d.startsWith(n + ":"))), due);
  check("Perlu Evaluasi tidak memuat Tunggu Kadep", !due.some((d) => d.startsWith("Uji TA Evaluasi Tunggu Kadep")), null);
  check("Tindak lanjut bertanda extension_follow_up", due.includes("Uji TA Evaluasi Tindak Lanjut:extension_follow_up"), null);
  const dist = find(dash.json, "activityDistribution");
  check("distribusi aktivitas ada", !!dist, dist);
});

await run("1 perubahan judul", async () => {
  const before = await myThesis("ta_ubah_judul");
  const same = await api("ta_ubah_judul", "POST", "/thesis-change-requests", { requestType: "title", newTitle: before.title, reason: R });
  check("judul sama ditolak 400", same.status === 400, same.json?.message);
  const newTitle = "Sistem Informasi Pengelolaan dan Pelacakan Alumni";
  const created = await api("ta_ubah_judul", "POST", "/thesis-change-requests", { requestType: "title", newTitle, reason: R });
  check("pengajuan dibuat", created.status < 300 && created.data?.status === "pending", `${created.status} ${created.json?.message ?? ""}`);
  const id = created.data?.id;
  check("langkah: Pembimbing 1 lalu Kadep", (created.data?.steps ?? []).map((s) => s.key).join(">") === "main_supervisor>kadep", (created.data?.steps ?? []).map((s) => `${s.key}:${s.status}`));
  const second = await api("ta_ubah_judul", "POST", "/thesis-change-requests", { requestType: "title", newTitle: newTitle + " II", reason: R });
  check("pengajuan kedua ditolak selama masih berjalan", second.status === 400, second.json?.message);
  const p2 = await lecturerDecide(AFRI, id);
  check("Pembimbing 2 tidak boleh memutuskan langkah P1", p2.status === 403, p2.json?.message);
  const l = await lecturerDecide(HUSNIL, id);
  check("Pembimbing 1 menyetujui", l.status < 300 && l.data?.currentStep === "kadep", `${l.status} ${l.data?.currentStep}`);
  const k = await kadepDecide(id);
  check("Kadep menyetujui", k.status < 300 && k.data?.status === "approved", `${k.status} ${k.json?.message ?? ""}`);
  const after = await myThesis("ta_ubah_judul");
  check("judul TA berubah", after.title === newTitle, after.title);
});

await run("2 ganti P1, P2 naik posisi", async () => {
  const aina = await login(AINA);
  const before = await myThesis("ta_dua_pembimbing");
  const created = await api("ta_dua_pembimbing", "POST", "/thesis-change-requests", { requestType: "supervisor", supervisorRole: "pembimbing_1", newSupervisorId: aina.id, reason: R });
  check("pengajuan dibuat", created.status < 300, `${created.status} ${created.json?.message ?? ""}`);
  const id = created.data?.id;
  check("langkah: pembimbing sebelumnya > pembimbing baru > kadep", (created.data?.steps ?? []).map((s) => s.key).join(">") === "previous_supervisor>new_supervisor>kadep", (created.data?.steps ?? []).map((s) => s.key));
  const early = await lecturerDecide(AINA, id);
  check("pembimbing baru belum giliran (403)", early.status === 403, early.json?.message);
  check("Husnil menyetujui", (await lecturerDecide(HUSNIL, id)).status < 300);
  check("Aina menyetujui", (await lecturerDecide(AINA, id)).status < 300);
  const k = await kadepDecide(id);
  check("Kadep menyetujui", k.data?.status === "approved", `${k.status} ${k.json?.message ?? ""}`);
  const after = await myThesis("ta_dua_pembimbing");
  check("Aina menjadi Pembimbing 1 dan Pembimbing 2 kosong", after.supervisors.length === 1 && /1/.test(after.supervisors[0].role) && after.supervisors[0].id === aina.id, `${sup(before)}  =>  ${sup(after)}`);
  const g = await api("ta_dua_pembimbing", "GET", "/thesisGuidance/student/guidance?pageSize=50");
  const items = find(g.json, "items") ?? find(g.json, "guidances") ?? [];
  const cancelled = items.filter((x) => x.status === "cancelled");
  check("sesi terjadwal dengan Husnil dibatalkan sistem", cancelled.length === 1 && !items.some((x) => x.status === "accepted"), cancelled.map((x) => `${x.cancelledBy}:${x.cancelReason}`));
});

await run("3 tambah P2", async () => {
  const ullya = await login(ULLYA);
  const husnil = await login(HUSNIL);
  const bad = await api("ta_satu_pembimbing", "POST", "/thesis-change-requests", { requestType: "supervisor", supervisorRole: "pembimbing_2", newSupervisorId: husnil.id, reason: R });
  check("P1 tidak bisa dijadikan P2 (400)", bad.status === 400, bad.json?.message);
  const created = await api("ta_satu_pembimbing", "POST", "/thesis-change-requests", { requestType: "supervisor", supervisorRole: "pembimbing_2", newSupervisorId: ullya.id, reason: R });
  check("pengajuan dibuat", created.status < 300, `${created.status} ${created.json?.message ?? ""}`);
  const id = created.data?.id;
  check("langkah: Pembimbing 1 > pembimbing baru > kadep", (created.data?.steps ?? []).map((s) => s.key).join(">") === "main_supervisor>new_supervisor>kadep", (created.data?.steps ?? []).map((s) => s.key));
  check("Husnil menyetujui", (await lecturerDecide(HUSNIL, id)).status < 300);
  check("Ullya menyetujui", (await lecturerDecide(ULLYA, id)).status < 300);
  const k = await kadepDecide(id);
  check("Kadep menyetujui", k.data?.status === "approved", `${k.status} ${k.json?.message ?? ""}`);
  const after = await myThesis("ta_satu_pembimbing");
  check("Ullya menjadi Pembimbing 2", after.supervisors.some((s) => s.id === ullya.id && /2/.test(s.role)), sup(after));
});

await run("4 alihkan tiga mahasiswa, satu ditolak", async () => {
  const aina = await login(AINA);
  const theses = [];
  for (const n of [1, 2, 3]) theses.push(await myThesis(`ta_alih_${n}`));
  const empty = await api(HUSNIL, "POST", "/thesis-change-requests/transfer", { thesisIds: [], newSupervisorId: aina.id, reason: R });
  check("tanpa mahasiswa ditolak 400", empty.status === 400, empty.json?.message);
  const t = await api(HUSNIL, "POST", "/thesis-change-requests/transfer", { thesisIds: theses.map((x) => x.id), newSupervisorId: aina.id, reason: R });
  const requests = t.data?.requests ?? [];
  const batchId = t.data?.batchId;
  check("tiga pengajuan dalam satu kelompok", t.status < 300 && requests.length === 3 && !!batchId, `${t.status} ${t.json?.message ?? ""}`);
  check("langkah pengaju disetujui otomatis", requests.every((r) => r.steps[0].key === "previous_supervisor" && r.steps[0].status === "approved" && r.currentStep === "new_supervisor"), requests[0]?.steps?.map((s) => `${s.key}:${s.status}`));
  for (const r of requests) check(`Aina menyetujui ${r.student?.name}`, (await lecturerDecide(AINA, r.id)).status < 300);
  const dept = await api(KADEP, "GET", "/thesis-change-requests/department?scope=pending&pageSize=100");
  const rows = (dept.data?.data ?? dept.data ?? []);
  check("Kadep melihat ketiganya dengan batchId yang sama", (Array.isArray(rows) ? rows : []).filter((r) => r.batchId === batchId).length === 3, Array.isArray(rows) ? rows.length : rows);
  const third = requests.find((r) => r.thesisId === theses[2].id);
  const noReason = await kadepDecide(third.id, false);
  check("menolak tanpa alasan ditolak 400", noReason.status === 400, noReason.json?.message);
  const rej = await kadepDecide(third.id, false, "Data uji: beban dosen tujuan sudah penuh.");
  check("Alih 3 ditolak Kadep", rej.data?.status === "rejected", `${rej.status} ${rej.json?.message ?? ""}`);
  const batch = await api(KADEP, "POST", `/thesis-change-requests/batch/${batchId}/decision`, { approve: true, notes: null });
  check("Setujui Semua menyetujui dua sisanya", batch.status < 300, `${batch.status} ${JSON.stringify(batch.data).slice(0, 120)}`);
  const after = [];
  for (const n of [1, 2, 3]) after.push(await myThesis(`ta_alih_${n}`));
  check("Alih 1 dan 2 dibimbing Aina", after[0].supervisors[0]?.id === aina.id && after[1].supervisors[0]?.id === aina.id, after.map(sup));
  check("Alih 3 tetap dibimbing Husnil", after[2].supervisors[0]?.id === (await login(HUSNIL)).id, sup(after[2]));
});

await run("5 Kadep memutuskan langsung", async () => {
  const husnil = await login(HUSNIL);
  const dept = await api(KADEP, "GET", "/thesis-change-requests/department?scope=pending&pageSize=100&search=Putus");
  const rows = dept.data?.data ?? dept.data ?? [];
  const req = (Array.isArray(rows) ? rows : []).find((r) => r.student?.name === "Uji TA Putus Langsung");
  check("pengajuan tampil di Kadep walau langkah dosen belum berjalan", !!req && req.currentStep === "previous_supervisor", req?.currentStep);
  const noReason = await kadepDecide(req.id, true);
  check("menyetujui langsung tanpa alasan ditolak 400", noReason.status === 400, noReason.json?.message);
  const ok = await kadepDecide(req.id, true, "Data uji: pembimbing lama berhalangan tetap.");
  check("disetujui langsung dengan alasan", ok.data?.status === "approved", `${ok.status} ${ok.json?.message ?? ""}`);
  check("langkah dosen bertanda tidak dijalankan", (ok.data?.steps ?? []).filter((s) => s.key !== "kadep").every((s) => s.skipped), (ok.data?.steps ?? []).map((s) => `${s.key}:${s.status}:${s.skipped}`));
  const after = await myThesis("ta_putus_langsung");
  check("Pembimbing 1 menjadi Husnil", after.supervisors.length === 1 && after.supervisors[0].id === husnil.id, sup(after));
});

await run("5b batal, ditolak dosen, tunggu kadep", async () => {
  const ctx = await api("ta_batal", "GET", "/thesis-change-requests/context");
  const open = find(ctx.json, "openRequest") ?? find(ctx.json, "open");
  check("ta_batal punya pengajuan berjalan", !!open?.id, Object.keys(ctx.data ?? {}));
  const c = await api("ta_batal", "POST", `/thesis-change-requests/${open?.id}/cancel`);
  check("mahasiswa membatalkan", c.data?.status === "cancelled", `${c.status} ${c.json?.message ?? ""}`);
  const lec = await api(AFRI, "GET", "/thesis-change-requests/lecturer");
  const mine = (lec.data?.awaitingMe ?? []).find((r) => r.student?.name === "Uji TA Tunggu Pembimbing Lama");
  check("Afriyanti melihat pengajuan menunggu dirinya", !!mine, (lec.data?.awaitingMe ?? []).map((r) => r.student?.name));
  const r0 = await lecturerDecide(AFRI, mine.id, false);
  check("menolak tanpa alasan 400", r0.status === 400, r0.json?.message);
  const r1 = await lecturerDecide(AFRI, mine.id, false, "Data uji: belum ada alasan kuat.");
  check("ditolak dosen menutup pengajuan", r1.data?.status === "rejected", `${r1.status} ${r1.json?.message ?? ""}`);
  const lu = await api(ULLYA, "GET", "/thesis-change-requests/lecturer");
  const forUllya = (lu.data?.awaitingMe ?? []).find((r) => r.student?.name === "Uji TA Tunggu Pembimbing Baru");
  check("Ullya melihat pengajuan menunggu dirinya", !!forUllya, (lu.data?.awaitingMe ?? []).map((r) => r.student?.name));
  const a = await lecturerDecide(ULLYA, forUllya.id);
  check("Ullya menyetujui, giliran Kadep", a.data?.currentStep === "kadep", a.data?.currentStep);
  const dept = await api(KADEP, "GET", "/thesis-change-requests/department?scope=pending&pageSize=100");
  const rows = dept.data?.data ?? dept.data ?? [];
  const tk = (Array.isArray(rows) ? rows : []).find((r) => r.student?.name === "Uji TA Tunggu Kadep");
  const before = await myThesis("ta_tunggu_kadep");
  const rej = await kadepDecide(tk.id, false, "Data uji: judul terlalu luas.");
  check("Kadep menolak", rej.data?.status === "rejected", `${rej.status} ${rej.json?.message ?? ""}`);
  check("judul tidak berubah", (await myThesis("ta_tunggu_kadep")).title === before.title, before.title);
  const blocked = await api("ta_seminar_aktif", "POST", "/thesis-change-requests", { requestType: "title", newTitle: "Judul Baru Untuk Uji Coba Penolakan", reason: R });
  check("terdaftar seminar: pengajuan ditolak 400", blocked.status === 400, blocked.json?.message);
});

await run("6 evaluasi 6 bulan > perpanjangan > mengulang proposal", async () => {
  const t = await myThesis("ta_eval_peringatan");
  const ctx = await api(HUSNIL, "GET", `/thesis-guidance-evaluations/context?thesisId=${t.id}`);
  check("tahap six_month, boleh diisi", ctx.data?.stage === "six_month" && ctx.data?.canSubmit === true, `${ctx.status} ${ctx.data?.stage} ${ctx.data?.blockReason}`);
  check("pilihan: continue, extend_1_month", (ctx.data?.allowedRecommendations ?? []).join(",") === "continue,extend_1_month", ctx.data?.allowedRecommendations);
  const wrong = await api(HUSNIL, "POST", "/thesis-guidance-evaluations", { thesisId: t.id, recommendation: "terminate_supervision", observations: {} });
  check("Dihentikan tidak boleh di tahap 6 bulan (400)", wrong.status === 400, wrong.json?.message);
  const ev = await api(HUSNIL, "POST", "/thesis-guidance-evaluations", { thesisId: t.id, recommendation: "extend_1_month", observations: { noGuidance: true, noProgress: true }, notes: "Data uji E2E." });
  check("evaluasi tersimpan, menunggu Kadep", ev.data?.status === "pending" && ev.data?.requiresKadep === true, `${ev.status} ${ev.json?.message ?? ""}`);
  check("dasar evaluasi tersalin", ev.data?.basis?.guidanceCount === 2 && ev.data?.basis?.elapsedDays > 180, ev.data?.basis);
  const again = await api(HUSNIL, "POST", "/thesis-guidance-evaluations", { thesisId: t.id, recommendation: "continue", observations: {} });
  check("evaluasi kedua ditolak selama menunggu (400)", again.status === 400, again.json?.message);
  const k = await api(KADEP, "POST", `/thesis-guidance-evaluations/${ev.data?.id}/decision`, { approve: true, notes: null });
  check("Kadep menyetujui", k.data?.status === "approved" && !!k.data?.extensionUntil, `${k.status} ${k.data?.extensionUntil}`);
  const days = (new Date(k.data?.extensionUntil) - Date.now()) / 86400000;
  check("batas perpanjangan sekitar 1 bulan dari keputusan", days > 27 && days < 32, days.toFixed(1));
  const sctx = await api("ta_eval_peringatan", "GET", "/thesis-guidance-evaluations/context");
  check("mahasiswa melihat peringatan akademik", !!sctx.data?.academicWarning?.extensionUntil && sctx.data?.canSubmit === false, sctx.data?.academicWarning);
  const after = await api(HUSNIL, "GET", `/thesis-guidance-evaluations/context?thesisId=${t.id}`);
  check("tindak lanjut belum waktunya", after.data?.canSubmit === false && /Belum waktunya/.test(after.data?.blockReason ?? ""), after.data?.blockReason);

  // Follow-up on the account whose extension has already ended.
  const f = await myThesis("ta_eval_tindak_lanjut");
  const fctx = await api(HUSNIL, "GET", `/thesis-guidance-evaluations/context?thesisId=${f.id}`);
  check("tahap extension_follow_up", fctx.data?.stage === "extension_follow_up" && (fctx.data?.allowedRecommendations ?? []).join(",") === "continue,revise_proposal", `${fctx.data?.stage} ${fctx.data?.allowedRecommendations}`);
  const p2 = await api(AFRI, "POST", "/thesis-guidance-evaluations", { thesisId: f.id, recommendation: "continue", observations: {} });
  check("Pembimbing 2 tidak boleh mengisi (403)", p2.status === 403, p2.json?.message);
  const fev = await api(HUSNIL, "POST", "/thesis-guidance-evaluations", { thesisId: f.id, recommendation: "revise_proposal", observations: { noRevision: true }, notes: "Data uji E2E." });
  check("Mengulang Proposal menunggu Kadep", fev.data?.status === "pending", `${fev.status} ${fev.json?.message ?? ""}`);
  const fk = await api(KADEP, "POST", `/thesis-guidance-evaluations/${fev.data?.id}/decision`, { approve: true, notes: "Setuju." });
  check("Kadep menyetujui", fk.data?.status === "approved", `${fk.status} ${fk.json?.message ?? ""}`);
  const fa = await myThesis("ta_eval_tindak_lanjut");
  check("status TA menjadi proposal dan bertanda mengulang proposal", fa?.status === "proposal" && fa?.repeatingProposal === true, `${fa?.status} ${fa?.repeatingProposal}`);
  check("judul dan pembimbing tetap", fa?.title === f.title && sup(fa) === sup(f), sup(fa));
  const g = await api("ta_eval_tindak_lanjut", "GET", "/thesisGuidance/student/guidance?pageSize=50");
  const items = find(g.json, "items") ?? find(g.json, "guidances") ?? [];
  check("sesi terjadwal dibatalkan sistem", !items.some((x) => x.status === "accepted"), items.map((x) => x.status));
  const husnil = await login(HUSNIL);
  const req = await api("ta_eval_tindak_lanjut", "POST", "/thesisGuidance/student/guidance/request", { supervisorId: husnil.id, guidanceDate: new Date(Date.now() + 3 * 86400000).toISOString(), studentNotes: "uji", duration: 60, milestoneIds: [crypto.randomUUID()] });
  check("ajukan bimbingan ditolak dengan alasan mengulang proposal", req.status === 403 && /Mengulang proposal/.test(req.json?.message ?? ""), `${req.status} ${req.json?.message}`);
});

await run("7 evaluasi 1 tahun > dihentikan", async () => {
  const t = await myThesis("ta_eval_1tahun");
  const ctx = await api(HUSNIL, "GET", `/thesis-guidance-evaluations/context?thesisId=${t.id}`);
  check("tahap one_year", ctx.data?.stage === "one_year" && (ctx.data?.allowedRecommendations ?? []).join(",") === "continue,terminate_supervision", `${ctx.data?.stage} ${ctx.data?.allowedRecommendations}`);
  const noNotes = await api(HUSNIL, "POST", "/thesis-guidance-evaluations", { thesisId: t.id, recommendation: "continue", observations: {} });
  check("Lanjut Bimbingan tanpa keterangan ditolak (400)", noNotes.status === 400, noNotes.json?.message);
  const ev = await api(HUSNIL, "POST", "/thesis-guidance-evaluations", { thesisId: t.id, recommendation: "terminate_supervision", observations: { noGuidance: true, noProgress: true, noResponse: true }, notes: "Data uji E2E." });
  check("Dihentikan menunggu Kadep", ev.data?.status === "pending", `${ev.status} ${ev.json?.message ?? ""}`);
  const list = await api(KADEP, "GET", "/thesis-guidance-evaluations/department?scope=pending&pageSize=100");
  const rows = list.data?.data ?? list.data ?? [];
  check("tampil di daftar Kadep", (Array.isArray(rows) ? rows : []).some((r) => r.id === ev.data?.id), Array.isArray(rows) ? rows.map((r) => r.student?.name) : rows);
  const k = await api(KADEP, "POST", `/thesis-guidance-evaluations/${ev.data?.id}/decision`, { approve: true, notes: null });
  check("Kadep menyetujui", k.data?.status === "approved", `${k.status} ${k.json?.message ?? ""}`);
  const after = await myThesis("ta_eval_1tahun");
  check("status TA menjadi failed", after?.status === "failed", after?.status);
  const hist = await api("ta_eval_1tahun", "GET", "/thesisGuidance/student/thesis-history");
  const item = (hist.json?.theses ?? []).find((x) => x.id === t.id);
  check("riwayat memuat alasan supervision_evaluation", item?.terminationReason === "supervision_evaluation" && !!item?.terminatedAt, `${item?.terminationReason} ${item?.terminatedAt}`);
  const g = await api("ta_eval_1tahun", "GET", "/thesisGuidance/student/guidance?pageSize=50");
  const items = find(g.json, "items") ?? find(g.json, "guidances") ?? [];
  check("sesi terjadwal dibatalkan sistem", g.status !== 200 || !items.some((x) => x.status === "accepted"), `${g.status} ${items.map((x) => x.status)}`);

  // Lanjut Bimbingan (recorded at once) and a rejection by Kadep.
  const l = await myThesis("ta_eval_lanjut");
  const lev = await api(HUSNIL, "POST", "/thesis-guidance-evaluations", { thesisId: l.id, recommendation: "continue", observations: {} });
  check("Lanjut Bimbingan langsung tercatat tanpa Kadep", lev.data?.status === "approved" && lev.data?.requiresKadep === false, `${lev.status} ${lev.data?.status} ${lev.json?.message ?? ""}`);
  const lctx = await api(HUSNIL, "GET", `/thesis-guidance-evaluations/context?thesisId=${l.id}`);
  check("tidak ada lagi yang jatuh tempo", lctx.data?.stage === null && lctx.data?.history?.length === 1, `${lctx.data?.stage} ${lctx.data?.blockReason}`);
  const w = await myThesis("ta_eval_tunggu_kadep");
  const wl = await api(KADEP, "GET", "/thesis-guidance-evaluations/department?scope=pending&pageSize=100");
  const wrow = (wl.data?.data ?? wl.data ?? []).find((r) => r.thesisId === w.id);
  const r0 = await api(KADEP, "POST", `/thesis-guidance-evaluations/${wrow?.id}/decision`, { approve: false });
  check("menolak tanpa catatan 400", r0.status === 400, r0.json?.message);
  const r1 = await api(KADEP, "POST", `/thesis-guidance-evaluations/${wrow?.id}/decision`, { approve: false, notes: "Data uji: dasar belum cukup." });
  check("Kadep menolak evaluasi", r1.data?.status === "rejected", `${r1.status} ${r1.json?.message ?? ""}`);
  const wctx = await api(HUSNIL, "GET", `/thesis-guidance-evaluations/context?thesisId=${w.id}`);
  check("setelah ditolak, Pembimbing 1 boleh mengisi lagi", wctx.data?.canSubmit === true && wctx.data?.stage === "six_month", `${wctx.data?.stage} ${wctx.data?.blockReason}`);
  check("TA tetap research tanpa peringatan", (await myThesis("ta_eval_tunggu_kadep")).status === "research" && !wctx.data?.academicWarning, null);
  const lancar = await myThesis("ta_lancar");
  const nctx = await api(HUSNIL, "GET", `/thesis-guidance-evaluations/context?thesisId=${lancar.id}`);
  check("ta_lancar: belum waktunya", nctx.data?.canSubmit === false && /Belum waktunya/.test(nctx.data?.blockReason ?? ""), nctx.data?.blockReason);
});

await run("8 kesiapan seminar dan sidang tanpa unggah", async () => {
  const t = await myThesis("ta_siap_seminar");
  const base = `/milestones/thesis/${t.id}/seminar-readiness`;
  const s0 = await api("ta_siap_seminar", "GET", base);
  check("syarat seminar terpenuhi, belum disetujui", s0.data?.requirementsMet === true && (s0.data?.supervisors ?? []).every((s) => !s.approved && !s.hasApproved), `${s0.status} ${JSON.stringify(s0.data?.requirements ?? []).slice(0, 160)}`);
  const rq = await api("ta_siap_seminar", "POST", `${base}/request`);
  check("Minta Persetujuan tanpa berkas berhasil", rq.status < 300, `${rq.status} ${rq.json?.message ?? ""}`);
  const a1 = await api(HUSNIL, "POST", `${base}/approve`, {});
  const a2 = await api(AFRI, "POST", `${base}/approve`, {});
  check("dua pembimbing menyetujui", a1.status < 300 && a2.status < 300, `${a1.status} ${a1.json?.message ?? ""} / ${a2.status} ${a2.json?.message ?? ""}`);
  const s1 = await api("ta_siap_seminar", "GET", base);
  check("kesiapan seminar disetujui penuh", s1.data?.seminarReadiness?.isFullyApproved === true || s1.data?.canRegisterSeminar === true, JSON.stringify(s1.data?.seminarReadiness ?? {}).slice(0, 200));
  const rv = await api(HUSNIL, "POST", `${base}/revoke`, {});
  const s2 = await api("ta_siap_seminar", "GET", base);
  check("Batalkan Persetujuan mengembalikan status", rv.status < 300 && s2.data?.canRegisterSeminar !== true, `${rv.status} ${rv.json?.message ?? ""}`);

  const lam = await myThesis("ta_lambat");
  const lb = `/milestones/thesis/${lam.id}/seminar-readiness`;
  const l0 = await api("ta_lambat", "GET", lb);
  check("ta_lambat: syarat belum terpenuhi dengan alasan", l0.data?.requirementsMet === false && !!l0.data?.requestBlockedReason && !!l0.data?.approveBlockedReason, l0.data?.requestBlockedReason);
  const lr = await api("ta_lambat", "POST", `${lb}/request`);
  const la = await api(HUSNIL, "POST", `${lb}/approve`, {});
  check("permintaan dan persetujuan ditolak backend", lr.status >= 400 && la.status >= 400, `${lr.status} ${lr.json?.message} / ${la.status} ${la.json?.message}`);

  const d = await myThesis("ta_lulus_seminar");
  const db = `/milestones/thesis/${d.id}/defence-readiness`;
  const d0 = await api("ta_lulus_seminar", "GET", db);
  check("syarat sidang terpenuhi (lulus seminar)", d0.data?.requirementsMet === true, `${d0.status} ${JSON.stringify(d0.data?.requirements ?? []).slice(0, 200)}`);
  const dr = await api("ta_lulus_seminar", "POST", `${db}/request`);
  const da1 = await api(HUSNIL, "POST", `${db}/approve`, {});
  const da2 = await api(AFRI, "POST", `${db}/approve`, {});
  check("Minta Persetujuan sidang dan dua persetujuan berhasil", dr.status < 300 && da1.status < 300 && da2.status < 300, `${dr.status} ${dr.json?.message ?? ""} / ${da1.status} ${da1.json?.message ?? ""} / ${da2.status} ${da2.json?.message ?? ""}`);
  const d1 = await api("ta_lulus_seminar", "GET", db);
  check("kesiapan sidang disetujui penuh", (d1.data?.supervisors ?? []).length === 2 && (d1.data?.supervisors ?? []).every((s) => s.approved || s.hasApproved || s.ready), JSON.stringify(d1.data?.supervisors ?? []).slice(0, 220));
  const ectx = await api(HUSNIL, "GET", `/thesis-guidance-evaluations/context?thesisId=${d.id}`);
  check("lulus seminar: tidak ada evaluasi jatuh tempo", ectx.data?.canSubmit === false && ectx.data?.stage === null, ectx.data?.blockReason);
});

await run("9 TA cuti", async () => {
  const t = await myThesis("ta_cuti");
  check("status on_leave, masa bimbingan berhenti, tanpa tingkat aktivitas", t?.status === "on_leave" && t?.supervisionClock?.isPaused === true && t?.activityLevel == null, `${t?.status} paused=${t?.supervisionClock?.isPaused} level=${t?.activityLevel} ${t?.supervisionClock?.elapsedLabel} due=${t?.supervisionClock?.evaluationDue}`);
  check("tidak ada evaluasi jatuh tempo selama cuti", t?.supervisionClock?.evaluationDue == null, t?.supervisionClock?.evaluationDue);
  const cr = await api("ta_cuti", "POST", "/thesis-change-requests", { requestType: "title", newTitle: "Judul Baru Selama Masa Cuti", reason: R });
  check("pengajuan perubahan ditolak 400", cr.status === 400, cr.json?.message);
  const husnil = await login(HUSNIL);
  const req = await api("ta_cuti", "POST", "/thesisGuidance/student/guidance/request", { supervisorId: husnil.id, guidanceDate: new Date(Date.now() + 3 * 86400000).toISOString(), studentNotes: "uji", duration: 60, milestoneIds: [crypto.randomUUID()] });
  check("ajukan bimbingan ditolak 403", req.status === 403, `${req.status} ${req.json?.message}`);
  const ev = await api(HUSNIL, "POST", "/thesis-guidance-evaluations", { thesisId: t.id, recommendation: "continue", observations: {} });
  check("evaluasi ditolak selama cuti", ev.status >= 400, `${ev.status} ${ev.json?.message}`);
  const sr = await api("ta_cuti", "POST", `/milestones/thesis/${t.id}/seminar-readiness/request`);
  check("minta persetujuan seminar ditolak selama cuti", sr.status >= 400, `${sr.status} ${sr.json?.message}`);
  const back = await api("admin_si", "PATCH", `/master-data-ta/${t.id}`, { status: "research" });
  check("Admin mengembalikan ke Penelitian", back.status < 300, `${back.status} ${back.json?.message ?? ""}`);
  const a = await myThesis("ta_cuti");
  check("masa bimbingan tidak menghitung hari cuti", a?.status === "research" && a?.supervisionClock?.isPaused === false && a?.supervisionClock?.elapsedDays < 8 * 31 - 55, `${a?.status} ${a?.supervisionClock?.elapsedLabel} (${a?.supervisionClock?.elapsedDays} hari) level=${a?.activityLevel}`);
});

await run("10 overview, riwayat, devtools", async () => {
  const hist = await api("ta_riwayat", "GET", "/thesisGuidance/student/thesis-history");
  const failed = (hist.json?.theses ?? []).filter((x) => x.status === "failed");
  check("ta_riwayat: satu TA Gagal dengan alasan dan catatan", failed.length === 1 && failed[0].terminationReason === "supervision_evaluation" && !!failed[0].terminationNote, failed.map((x) => `${x.title}:${x.terminationReason}`));
  const cur = await myThesis("ta_riwayat");
  check("ta_riwayat: TA berjalan tetap research", cur?.status === "research", cur?.status);
  const lancar = await myThesis("ta_lancar");
  check("ta_lancar: 2 sesi selesai, 1 dari 5 milestone", lancar?.stats?.completedGuidances === 2 && lancar?.stats?.completedMilestones === 1 && lancar?.stats?.totalMilestones === 5, lancar?.stats);
  const no = await api("test_nothesis", "GET", "/thesisGuidance/student/my-thesis");
  check("test_nothesis: detail TA 404", no.status === 404, no.status);
  const so = await api("test_nothesis", "GET", "/thesis-seminars/me/overview");
  const dox = await api("test_nothesis", "GET", "/thesis-defences/me/overview");
  check("test_nothesis: ringkasan seminar dan sidang 200 tanpa TA", so.status === 200 && dox.status === 200, `${so.status} ${dox.status}`);
  const ec = await api("test_nothesis", "GET", "/thesis-guidance-evaluations/context");
  const cc = await api("test_nothesis", "GET", "/thesis-change-requests/context");
  check("test_nothesis: konteks evaluasi dan perubahan tidak galat", ec.status === 200 && cc.status === 200, `${ec.status} ${cc.status} ${cc.json?.message ?? ""}`);

  const dv = await api("admin_si", "GET", "/devtools/guidances?search=Uji%20TA%20Lancar&pageSize=20");
  const rows = find(dv.json, "items") ?? find(dv.json, "data") ?? [];
  check("DevTools: daftar sesi dengan pencarian", dv.status === 200 && Array.isArray(rows) && rows.length === 2, `${dv.status} ${Array.isArray(rows) ? rows.length : JSON.stringify(dv.json).slice(0, 120)}`);
  const first = rows[0];
  const when = new Date(Date.now() - 86400000).toISOString();
  const pt = await api("admin_si", "PATCH", `/devtools/guidances/${first?.id}`, { approvedDate: when });
  check("DevTools: ubah waktu disetujui", pt.status < 300, `${pt.status} ${pt.json?.message ?? ""}`);
  const bad = await api("admin_si", "PATCH", `/devtools/guidances/${first?.id}`, { requestedDate: null });
  check("DevTools: mengosongkan waktu diusulkan ditolak", bad.status === 400, `${bad.status} ${bad.json?.message}`);
  const forb = await api(HUSNIL, "GET", "/devtools/guidances");
  check("DevTools: selain Admin ditolak 403", forb.status === 403, forb.status);
});

const failed = results.filter((r) => !r.ok);
console.log(`\nTOTAL ${results.length} pemeriksaan, ${results.length - failed.length} lulus, ${failed.length} gagal`);
for (const f of failed) console.log(`  GAGAL [${f.section}] ${f.label}`);
process.exitCode = failed.length ? 1 : 0;
