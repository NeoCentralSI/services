// Student status as the only source of leave and of the end of studies, Admin account rules,
// and the Log Aktivitas list. Run on a clean seed (eight seeders); it writes data.
import { api, check, ids, login, run, summary } from "./lib-api.mjs";

const ADMIN = "admin_si", KADEP = "kadep_si", SEKDEP = "sekdep_si", HUSNIL = "pembimbing_si", STUDENT = "ta_lambat";
const future = (days) => new Date(Date.now() + days * 86400000).toISOString();
const myThesis = async (who) => (await api(who, "GET", "/thesisGuidance/student/my-thesis")).json?.thesis;
const load = async (lecturerId) => {
  const overview = (await api(KADEP, "GET", "/supervision-quotas")).data;
  return (overview?.lecturers ?? []).find((l) => l.lecturerId === lecturerId);
};
const findLog = (logs, action, objectLabelPart) =>
  (logs ?? []).find((l) => l.action === action && (l.objectLabel ?? "").includes(objectLabelPart));

await login(STUDENT);
await login(HUSNIL);
await login(ADMIN);
const studentId = ids[STUDENT];
const husnilId = ids[HUSNIL];

await run("1 Aktif -> Cuti: TA dijeda", async () => {
  const before = await myThesis(STUDENT);
  check("mula-mula Penelitian dan tidak dijeda", before?.status === "research" && before?.supervisionClock?.isPaused === false, `${before?.status} ${before?.supervisionClock?.isPaused}`);
  const loadBefore = await load(husnilId);

  const res = await api(ADMIN, "PATCH", `/adminfeatures/students/${studentId}`, { status: "bss" });
  check("Admin mengubah status mahasiswa menjadi Cuti", res.status === 200 && res.data?.status === "bss", `${res.status} ${res.json?.message ?? ""}`);

  const t = await myThesis(STUDENT);
  check("TA tetap Penelitian, masa bimbingan berhenti, evaluasi tidak jatuh tempo", t?.status === "research" && t?.supervisionClock?.isPaused === true && t?.supervisionClock?.evaluationDue == null && t?.activityLevel == null, `${t?.status} paused=${t?.supervisionClock?.isPaused} due=${t?.supervisionClock?.evaluationDue}`);
  const req = await api(STUDENT, "POST", "/thesisGuidance/student/guidance/request", { supervisorId: husnilId, guidanceDate: future(3), studentNotes: "uji", duration: 60, milestoneIds: [crypto.randomUUID()] });
  check("ajukan bimbingan ditolak 403 dengan alasan cuti", req.status === 403 && /cuti/.test(req.json?.message ?? ""), `${req.status} ${req.json?.message}`);

  const mine = (await api(HUSNIL, "GET", "/thesisGuidance/lecturer/my-students")).json?.students ?? [];
  check("Mahasiswa Bimbingan dosen: tetap di Aktif dengan penanda cuti", mine.find((s) => s.thesisId === t?.id)?.isOnLeave === true);
  const monitoring = (await api(KADEP, "GET", "/thesisGuidance/monitoring/theses?pageSize=1000")).json?.data ?? [];
  check("Monitoring: penanda cuti", monitoring.find((x) => x.id === t?.id)?.isOnLeave === true);
  const dataTa = (await api(ADMIN, "GET", "/master-data-ta")).data ?? [];
  check("Data TA: penanda cuti", (Array.isArray(dataTa) ? dataTa : dataTa.theses ?? []).find((x) => x.id === t?.id)?.isOnLeave === true);
  const loadDuring = await load(husnilId);
  check("pembimbing tetap melekat dan dihitung di beban (kolom Cuti +1)", loadDuring?.activeCount === loadBefore?.activeCount && loadDuring?.breakdown?.onLeave === (loadBefore?.breakdown?.onLeave ?? 0) + 1, `${loadBefore?.activeCount}->${loadDuring?.activeCount} cuti ${loadDuring?.breakdown?.onLeave}`);
  const lecturerDetail = (await api(ADMIN, "GET", `/adminfeatures/lecturers/${husnilId}`)).data;
  check("detail dosen: penanda cuti di Mahasiswa Bimbingan Aktif", (lecturerDetail?.supervising ?? []).find((x) => x.thesisId === t?.id)?.isOnLeave === true);
});

await run("2 Cuti -> Aktif: TA dilanjutkan", async () => {
  const res = await api(ADMIN, "PATCH", `/adminfeatures/students/${studentId}`, { status: "active" });
  check("Admin mengembalikan status Aktif", res.status === 200, `${res.status} ${res.json?.message ?? ""}`);
  const t = await myThesis(STUDENT);
  check("masa bimbingan berjalan lagi", t?.status === "research" && t?.supervisionClock?.isPaused === false, `${t?.supervisionClock?.isPaused}`);
});

await run("3 Drop Out: TA Gagal, beban turun", async () => {
  const before = await load(husnilId);
  const res = await api(ADMIN, "PATCH", `/adminfeatures/students/${studentId}`, { status: "dropout" });
  check("Admin mengubah status menjadi Drop Out", res.status === 200, `${res.status} ${res.json?.message ?? ""}`);
  const dataTa = (await api(ADMIN, "GET", "/master-data-ta")).data ?? [];
  const row = (Array.isArray(dataTa) ? dataTa : dataTa.theses ?? []).find((x) => x.student?.id === studentId);
  check("TA Gagal dengan alasan Drop out, tanpa pembimbing aktif", row?.status === "failed" && row?.terminationReason === "dropped_out" && (row?.supervisors ?? []).length === 0, `${row?.status} ${row?.terminationReason} ${(row?.supervisors ?? []).length}`);
  const after = await load(husnilId);
  check("beban Pembimbing 1 turun satu", after?.activeCount === before?.activeCount - 1, `${before?.activeCount} -> ${after?.activeCount}`);
  const notif = (await api(HUSNIL, "GET", "/notification?limit=10")).json;
  const list = notif?.data?.notifications ?? notif?.notifications ?? notif?.data ?? [];
  check("pembimbing mendapat notifikasi penghentian", JSON.stringify(list).includes("Tugas Akhir Dihentikan"));
  const seed = (await api(ADMIN, "GET", "/master-data-ta")).data ?? [];
  const dropout = (Array.isArray(seed) ? seed : seed.theses ?? []).find((x) => x.student?.name === "Uji TA Drop Out");
  check("akun uji Drop Out dari seed: satu-satunya TA sudah Gagal (drop out)", dropout?.status === "failed" && dropout?.terminationReason === "dropped_out", `${dropout?.status} ${dropout?.terminationReason}`);
});

await run("4 keamanan peran Admin", async () => {
  const adminId = ids[ADMIN];
  const self = await api(ADMIN, "PATCH", `/adminfeatures/${adminId}`, { roles: ["Admin", "Penguji"] });
  check("Admin tidak dapat mengubah peran akunnya sendiri", self.status === 400 && /sendiri/.test(self.json?.message ?? ""), `${self.status} ${self.json?.message}`);
  const off = await api(ADMIN, "PATCH", `/adminfeatures/${adminId}`, { isVerified: false });
  check("Admin tidak dapat menonaktifkan akunnya sendiri", off.status === 400, `${off.status} ${off.json?.message}`);
  const mix = await api(ADMIN, "PATCH", `/adminfeatures/${husnilId}`, { roles: ["Admin", "Pembimbing 1"] });
  check("peran Admin tidak dapat digabung dengan peran dosen", mix.status === 400 && /tidak dapat digabung/.test(mix.json?.message ?? ""), `${mix.status} ${mix.json?.message}`);
  const created = await api(ADMIN, "POST", "/adminfeatures/users", { email: "n1_admin_mix@fti.unand.ac.id", fullName: "Uji Admin Campur", identityType: "NIP", identityNumber: "199001012020011099", roles: ["Admin", "Penguji"] });
  check("buat pengguna Admin + Penguji ditolak", created.status === 400, `${created.status} ${created.json?.message}`);
  const imported = await api(ADMIN, "POST", "/adminfeatures/users/import-excel", [
    { Email: "n1_import_mix@fti.unand.ac.id", "Nama Lengkap": "Uji Impor Campur", "NIM/NIP": "199001012020011098", "Tipe Identitas": "NIP", Role: "Admin, Penguji" },
    { Email: "admin_si@fti.unand.ac.id", "Nama Lengkap": "Admin SI", "NIM/NIP": "", Role: "Penguji" },
  ]);
  check("impor: kedua baris yang melanggar ditolak dan dilaporkan", imported.json?.failed === 2 && (imported.json?.errors ?? []).every((e) => /tidak dapat digabung/.test(e)), JSON.stringify(imported.json?.errors ?? imported.json));
  const me = (await api(ADMIN, "GET", "/adminfeatures/users?search=admin_si")).json?.users?.find((u) => u.id === adminId);
  check("peran admin_si tidak berubah", JSON.stringify(me?.roles?.map((r) => r.name)) === JSON.stringify(["Admin"]), me?.roles?.map((r) => r.name));
});

await run("5 Log Aktivitas", async () => {
  for (const who of [ADMIN, KADEP, SEKDEP]) {
    const res = await api(who, "GET", "/adminfeatures/audit-logs?pageSize=50");
    check(`${who} dapat membaca`, res.status === 200, res.status);
  }
  for (const who of [HUSNIL, STUDENT]) {
    const res = await api(who, "GET", "/adminfeatures/audit-logs");
    check(`${who} ditolak`, res.status === 403, res.status);
  }
  const logs = (await api(KADEP, "GET", "/adminfeatures/audit-logs?pageSize=100")).json?.logs ?? [];
  check("terbaru di atas", logs.length > 1 && new Date(logs[0].createdAt) >= new Date(logs[1].createdAt));
  check("perubahan status mahasiswa tercatat dengan nama objeknya", !!findLog(logs, "STUDENT_STATUS_CHANGED", "Uji Ta Lambat") || !!findLog(logs, "STUDENT_STATUS_CHANGED", "Uji TA Lambat"), logs.slice(0, 3).map((l) => `${l.action}:${l.objectLabel}`));
  check("penghentian TA tercatat", logs.some((l) => l.action === "THESIS_STATUS_CHANGED" && l.changes?.newValues?.terminationReason === "dropped_out"));
  check("impor pengguna tercatat dengan jumlah barisnya", logs.some((l) => l.action === "USERS_IMPORTED" && l.changes?.newValues?.failed === 2));
  check("aktivitas rutin mahasiswa tidak ikut tampil", logs.every((l) => !["GUIDANCE_REQUESTED", "MILESTONE_SUBMITTED"].includes(l.action)));
  const search = (await api(KADEP, "GET", `/adminfeatures/audit-logs?search=${encodeURIComponent("2211529002")}`)).json?.logs ?? [];
  check("cari objek lewat NIM", search.length >= 3 && search.every((l) => l.entityId), search.map((l) => l.action));
  const action = (await api(KADEP, "GET", "/adminfeatures/audit-logs?action=STUDENT_STATUS_CHANGED")).json?.logs ?? [];
  check("filter tindakan", action.length >= 3 && action.every((l) => l.action === "STUDENT_STATUS_CHANGED"), action.length);
  const tomorrow = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const none = (await api(KADEP, "GET", `/adminfeatures/audit-logs?dateFrom=${tomorrow}`)).json?.logs ?? [];
  check("rentang tanggal", none.length === 0, none.length);
});

process.exit(summary() ? 1 : 0);
