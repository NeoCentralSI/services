// API checks against a freshly seeded `central`. Read-only (GET), except the logins.
const { EVENT_STATUS_PRIORITY } = await import(process.cwd() + "/src/constants/thesis-event-monitoring.js");
const BASE = process.env.BASE || "http://localhost:3000";
const D = "@fti.unand.ac.id";
const results = [];
let section = "";
function find(obj, key) {
  if (!obj || typeof obj !== "object") return undefined;
  if (key in obj) return obj[key];
  for (const v of Object.values(obj)) { const r = find(v, key); if (r !== undefined) return r; }
  return undefined;
}
const sessions = {};
async function login(name) {
  if (sessions[name]) return sessions[name];
  const res = await fetch(`${BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: name + D, password: "password123" }) });
  const json = await res.json();
  const token = find(json, "accessToken");
  if (!token) throw new Error(`login ${name} gagal: ${res.status}`);
  return (sessions[name] = { token });
}
async function get(name, path) {
  const headers = name ? { Authorization: `Bearer ${(await login(name)).token}` } : {};
  const res = await fetch(BASE + path, { headers });
  let json = null;
  try { json = await res.json(); } catch { /* no body */ }
  return { status: res.status, json, data: json?.data ?? json };
}
function check(label, ok, seen) {
  results.push({ section, label, ok: !!ok });
  console.log(`${ok ? "PASS" : "FAIL"} [${section}] ${label}${seen !== undefined ? ` :: ${typeof seen === "string" ? seen : JSON.stringify(seen)}`.slice(0, 330) : ""}`);
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const names = (rows) => rows.map((r) => (r.student?.name ?? "").replace("Uji Mon ", "")).sort();
const q = (id) => (id ? `?academicYear=${id}` : "");

const KADEP = "kadep_si";
section = "0 filter";
const filters = (await get(KADEP, "/thesisGuidance/monitoring/filters")).data;
const sem = Object.fromEntries(filters.academicYears.map((a) => [a.label.trim(), a]));
check("daftar semester memuat semua semester yang sudah mulai", eq(filters.academicYears.map((a) => a.label.trim()), ["Ganjil 2026/2027", "Genap 2025/2026", "Ganjil 2025/2026", "Genap 2024/2025", "Ganjil 2024/2025"]), filters.academicYears.map((a) => a.label.trim()));
check("hanya Ganjil 2026/2027 bertanda berjalan", eq(filters.academicYears.filter((a) => a.isActive).map((a) => a.label.trim()), ["Ganjil 2026/2027"]));
const NOW_ID = sem["Ganjil 2026/2027"].value, PREV_ID = sem["Genap 2025/2026"].value, OLD_ID = sem["Ganjil 2025/2026"].value;

section = "1 filter semester (Bimbingan)";
const views = { berjalan: NOW_ID, lalu: PREV_ID, semua: undefined };
const dash = {}, list = {};
for (const [name, id] of Object.entries(views)) {
  dash[name] = (await get(KADEP, `/thesisGuidance/monitoring/dashboard${q(id)}`)).data;
  list[name] = (await get(KADEP, `/thesisGuidance/monitoring/theses?pageSize=1000${id ? `&academicYear=${id}` : ""}`)).json.data;
}
const statusOf = (d) => Object.fromEntries(d.statusDistribution.map((s) => [s.id, s.count]));
// Uji Mon Sidang Revisi Final is seeded Selesai (revision finalized), one research
// thesis fewer and one completed more; a Selesai thesis has no activity level (one Lancar fewer).
// Uji TA Cuti counts as research (leave follows the student status); Uji TA Drop Out adds one
// failed thesis that ended a month ago (running in this and the previous semester).
check("semester berjalan: status", eq(statusOf(dash.berjalan), { research: 56, completed: 2, failed: 1 }), statusOf(dash.berjalan));
check("semester lalu: status", eq(statusOf(dash.lalu), { research: 54, completed: 4, failed: 3 }), statusOf(dash.lalu));
check("semua semester: status", eq(statusOf(dash.semua), { research: 56, completed: 4, failed: 3 }), statusOf(dash.semua));
const inList = (view, name) => list[view].find((t) => t.student.name === name);
check("Mulai Semester Lalu: masuk semester berjalan dan semester lalu", inList("berjalan", "Uji Mon Mulai Semester Lalu") && inList("lalu", "Uji Mon Mulai Semester Lalu"), inList("berjalan", "Uji Mon Mulai Semester Lalu")?.startSemester);
check("Mulai Semester Lalu: kolom Mulai = Genap 2025/2026, status Penelitian", inList("berjalan", "Uji Mon Mulai Semester Lalu")?.startSemester === "Genap 2025/2026" && inList("berjalan", "Uji Mon Mulai Semester Lalu")?.status === "research");
check("Selesai Semester Lalu: tidak masuk semester berjalan", !inList("berjalan", "Uji Mon Selesai Semester Lalu"));
check("Selesai Semester Lalu: masuk semester lalu berstatus Selesai, Mulai = Ganjil 2025/2026", inList("lalu", "Uji Mon Selesai Semester Lalu")?.status === "completed" && inList("lalu", "Uji Mon Selesai Semester Lalu")?.startSemester === "Ganjil 2025/2026", inList("lalu", "Uji Mon Selesai Semester Lalu")?.startSemester);
check("Sidang Lulus (selesai di tengah semester): masuk semester berjalan berstatus Selesai", inList("berjalan", "Uji Mon Sidang Lulus")?.status === "completed");
check("Uji TA Cuti (mahasiswa cuti): masuk semester berjalan, status Penelitian dengan penanda cuti", inList("berjalan", "Uji TA Cuti")?.status === "research" && inList("berjalan", "Uji TA Cuti")?.isOnLeave === true && inList("berjalan", "Uji TA Cuti")?.supervisionClock?.isPaused === true);
check("Uji TA Lancar (mulai semester ini): tidak masuk semester lalu", inList("berjalan", "Uji TA Lancar") && !inList("lalu", "Uji TA Lancar"), inList("berjalan", "Uji TA Lancar")?.startSemester);
// The table shows one thesis per student: a stopped thesis is hidden while the student has a
// newer one in the same list. Uji TA Riwayat: the stopped thesis shows in the previous semester
// (the new one had not started), and is hidden under "Semua Semester".
check("tabel: jumlah baris berjalan/lalu/semua", eq([list.berjalan.length, list.lalu.length, list.semua.length], [59, 61, 62]), [list.berjalan.length, list.lalu.length, list.semua.length]);
check("Uji TA Riwayat: TA yang dihentikan tampil di semester lalu, TA barunya di semester berjalan", list.lalu.filter((t) => t.student.name === "Uji TA Riwayat").map((t) => t.status).join() === "failed" && list.berjalan.filter((t) => t.student.name === "Uji TA Riwayat").map((t) => t.status).join() === "research" && list.semua.filter((t) => t.student.name === "Uji TA Riwayat").map((t) => t.status).join() === "research");
const months = (d) => d.guidanceTrend.map((t) => t.month);
check("tren semester berjalan hanya Agu–Okt 2026", eq(months(dash.berjalan), ["2026-08", "2026-09", "2026-10"]), dash.berjalan.guidanceTrend);
check("tren semester lalu hanya Feb–Jul 2026", eq(months(dash.lalu), ["2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07"]), dash.lalu.guidanceTrend);
check("tren semua semester lebih panjang", months(dash.semua).length === 13 && months(dash.semua)[0] === "2025-08", months(dash.semua));
check("aktivitas dihitung terhadap hari ini (sama untuk berjalan dan semua)", eq(dash.berjalan.activityDistribution.map((a) => a.count), [40, 4, 11]) && eq(dash.semua.activityDistribution.map((a) => a.count), [40, 4, 11]), dash.berjalan.activityDistribution.map((a) => `${a.name}:${a.count}`));
check("aktivitas semester lalu", eq(dash.lalu.activityDistribution.map((a) => a.count), [38, 4, 11]), dash.lalu.activityDistribution.map((a) => `${a.name}:${a.count}`));
check("Siap Seminar (ringkasan Bimbingan) = 1 pada ketiga pilihan", eq([dash.berjalan.summary.totalReadyForSeminar, dash.lalu.summary.totalReadyForSeminar, dash.semua.summary.totalReadyForSeminar], [1, 1, 1]));
const report = {};
for (const [name, id] of Object.entries(views)) report[name] = (await get(KADEP, `/thesisGuidance/monitoring/report${q(id)}`)).data;
check("laporan memakai filter yang sama (jumlah TA berjalan/lalu/semua)", eq([report.berjalan.summary.totalTheses, report.lalu.summary.totalTheses, report.semua.summary.totalTheses], [59, 61, 63]), [report.berjalan.summary.totalTheses, report.lalu.summary.totalTheses, report.semua.summary.totalTheses]);
check("laporan: nama periode", eq([report.berjalan.academicYear, report.lalu.academicYear, report.semua.academicYear], ["Ganjil 2026/2027", "Genap 2025/2026", "Semua Semester"]));
const oldList = (await get(KADEP, `/thesisGuidance/monitoring/theses?pageSize=1000&academicYear=${OLD_ID}`)).json.data;
check("Ganjil 2025/2026: Selesai Semester Lalu ikut (mulai di semester itu)", oldList.some((t) => t.student.name === "Uji Mon Selesai Semester Lalu") && !oldList.some((t) => t.student.name === "Uji Mon Mulai Semester Lalu"), oldList.length);

for (const [kind, path, label] of [["seminar", "seminars", "2 tab Seminar Hasil"], ["defence", "defences", "3 tab Sidang"]]) {
  section = label;
  const d = {};
  for (const [name, id] of Object.entries(views)) d[name] = (await get(KADEP, `/thesisGuidance/monitoring/${path}${q(id)}`)).data;
  const expected = kind === "seminar"
    ? {
        berjalan: { total: 13, inProcess: 5, scheduled: 2, passed: 4, revisionPending: 1, notPassed: 2 },
        lalu: { total: 13, inProcess: 0, scheduled: 0, passed: 13, revisionPending: 0, notPassed: 0 },
        semua: { total: 26, inProcess: 5, scheduled: 2, passed: 17, revisionPending: 1, notPassed: 2 },
      }
    : {
        berjalan: { total: 11, inProcess: 4, scheduled: 2, passed: 3, revisionPending: 1, notPassed: 2, averageFinalScore: 80.67 },
        lalu: { total: 1, inProcess: 0, scheduled: 0, passed: 1, revisionPending: 0, notPassed: 0, averageFinalScore: 86 },
        semua: { total: 12, inProcess: 4, scheduled: 2, passed: 4, revisionPending: 1, notPassed: 2, averageFinalScore: 82 },
      };
  for (const view of Object.keys(views)) check(`kartu ringkasan (${view})`, eq(d[view].summary, expected[view]), d[view].summary);
  check("jenis data", d.berjalan.kind === kind);
  const word = kind === "seminar" ? "Seminar" : "Sidang";
  check("Siap Mendaftar (berjalan)", eq(names(d.berjalan.readyToRegister), [`Siap Daftar ${word}`]), names(d.berjalan.readyToRegister));
  check("Siap Mendaftar: pembimbing ikut", d.berjalan.readyToRegister[0]?.supervisors.length === 2, d.berjalan.readyToRegister[0]?.supervisors);
  const up = d.berjalan.upcoming;
  check("Jadwal Mendatang (berjalan): satu, terjadwal", up.length === 1 && d.berjalan.upcomingTotal === 1 && up[0].status === "scheduled" && up[0].student.name === `Uji Mon ${word} Terjadwal`, up.map((u) => `${u.student.name} ${u.date?.slice(0, 10)} ${u.startTime?.slice(11, 16)}-${u.endTime?.slice(11, 16)} ${u.room} | ${u.examiners.map((e) => e.name).join(", ")}`));
  check("Jadwal Mendatang: ruangan, jam dan dua penguji", up[0]?.room === (kind === "seminar" ? "Ruang Seminar SI" : "Ruang Sidang SI") && up[0]?.examiners.length === 2 && up[0]?.startTime?.slice(11, 16) === (kind === "seminar" ? "09:00" : "13:30"));
  check("Jadwal Mendatang kosong untuk semester lalu", d.lalu.upcoming.length === 0 && d.lalu.upcomingTotal === 0);
  const att = d.berjalan.attention.map((a) => [a.student.name.replace(`Uji Mon ${word} `, ""), a.attention.reason, a.attention.reasonLabel, a.attention.days]);
  const expectedAtt = kind === "seminar"
    ? [["Revisi Lama", "revision", "Revisi belum selesai", 40], ["Belum Dijadwalkan", "scheduling", "Belum dijadwalkan", 20], ["Verifikasi Lama", "document_verification", "Menunggu verifikasi dokumen", 10], ["Hasil Tertunda", "result_finalization", "Hasil belum difinalkan", 5]]
    : [["Revisi Lama", "revision", "Revisi belum selesai", 45], ["Belum Dijadwalkan", "scheduling", "Belum dijadwalkan", 18], ["Verifikasi Lama", "document_verification", "Menunggu verifikasi dokumen", 9], ["Hasil Tertunda", "result_finalization", "Hasil belum difinalkan", 6]];
  check("Perlu Perhatian (berjalan): empat alasan, terlama dulu", eq(att, expectedAtt), att);
  check("Perlu Perhatian kosong untuk semester lalu", d.lalu.attention.length === 0);
  check("Perlu Perhatian semua semester = semester berjalan", eq(d.semua.attention.map((a) => a.id), d.berjalan.attention.map((a) => a.id)));
  const byStatus = (rows) => rows.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {});
  const expectedStatus = kind === "seminar"
    ? { scheduled: 2, registered: 3, verified: 1, examiner_assigned: 1, passed: 2, passed_with_revision: 2, failed: 1, cancelled: 1 }
    : { scheduled: 2, registered: 2, verified: 1, examiner_assigned: 1, passed: 1, passed_with_revision: 2, failed: 1, cancelled: 1 };
  const seen = byStatus(d.berjalan.items);
  check("tabel (berjalan): tiap status terisi", Object.entries(expectedStatus).every(([k, v]) => seen[k] === v) && d.berjalan.items.length === expected.berjalan.total, seen);
  const refDate = (r) => r.date ?? r.registeredAt;
  // The order of the seminar and defence modules (status priority), then the
  // latest first inside the same priority.
  const priority = EVENT_STATUS_PRIORITY[kind];
  check("tabel urut prioritas status modul, lalu terbaru dulu", d.berjalan.items.every((r, i, a) => i === 0 || priority[a[i - 1].status] < priority[r.status] || (priority[a[i - 1].status] === priority[r.status] && refDate(a[i - 1]) >= refDate(r))), d.berjalan.items.map((r) => `${r.status} ${refDate(r).slice(0, 10)}`));
  const finalRev = d.berjalan.items.find((r) => r.student.name === `Uji Mon ${word} Revisi Final`);
  check("lulus dengan revisi yang sudah final punya revisionFinalizedAt", finalRev?.status === "passed_with_revision" && !!finalRev.revisionFinalizedAt, finalRev?.revisionFinalizedAt);
  if (kind === "seminar") {
    check("seminar semester lalu: 13 lulus, tidak ada di semester berjalan", d.lalu.items.every((r) => r.status === "passed" && r.date < "2026-08-01") && !d.berjalan.items.some((r) => d.lalu.items.some((p) => p.id === r.id)), d.lalu.items[0]?.date);
    check("Uji TA Seminar Aktif: pendaftaran bersih (tanpa jadwal dan nilai)", (() => { const r = d.berjalan.items.find((x) => x.student.name === "Uji TA Seminar Aktif"); return r?.status === "registered" && r.date === null && r.finalScore === null; })());
    check("Uji TA Lulus Seminar ikut di semester berjalan", d.berjalan.items.some((x) => x.student.name === "Uji TA Lulus Seminar" && x.status === "passed" && x.finalScore === 82));
  } else {
    const scores = d.berjalan.items.filter((r) => ["passed", "passed_with_revision"].includes(r.status)).map((r) => `${r.finalScore} ${r.grade}`).sort();
    check("tiga sidang lulus bernilai (rata-rata 80,67)", eq(scores, ["78 B+", "80 A-", "84 A"]), scores);
    check("sidang semester lalu: Selesai Semester Lalu (86 A)", eq(d.lalu.items.map((r) => `${r.student.name} ${r.status} ${r.finalScore} ${r.grade}`), ["Uji Mon Selesai Semester Lalu passed 86 A"]), d.lalu.items.map((r) => r.student.name));
  }
}

section = "4 izin peran";
for (const path of ["/thesisGuidance/monitoring/seminars", "/thesisGuidance/monitoring/defences"]) {
  for (const [who, expected] of [["kadep_si", 200], ["sekdep_si", 200], ["gkm_si", 200], ["pembimbing_si", 403], ["penguji_si", 403], ["admin_si", 403], ["ta_lancar", 403]]) {
    const res = await get(who, `${path}?academicYear=${NOW_ID}`);
    check(`${path.split("/").pop()} ${who} → ${expected}`, res.status === expected, res.status);
  }
  check(`${path.split("/").pop()} tanpa token → 401`, (await get(null, path)).status === 401);
  const post = await fetch(BASE + path, { method: "POST", headers: { Authorization: `Bearer ${(await login(KADEP)).token}`, "Content-Type": "application/json" }, body: "{}" });
  check(`${path.split("/").pop()} POST → 404 (baca-saja)`, post.status === 404, post.status);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length} pemeriksaan, ${results.length - failed.length} lulus, ${failed.length} gagal`);
if (failed.length) { for (const f of failed) console.log(" GAGAL:", f.section, "|", f.label); process.exitCode = 1; }
