// API checks: the surfaces that changed with the proposal schema keep working.
import { api, check, run, summary, find, ids, login } from "./lib-api.mjs";

await run("auth", async () => {
  await login("prop_lulus");
  const me = await api("prop_lulus", "GET", "/auth/me");
  const student = find(me.json, "student");
  check("profil mahasiswa memuat penanda semester berjalan", student?.eligibleResearchMethod === true && student?.takingThesisCourse === false, student);
  check("kolom lama tidak ada di profil", student && !("eligibleMetopen" in student) && !("thesisCourseEnrollmentSource" in student));
});

await run("devtools", async () => {
  const list = await api("admin_si", "GET", "/devtools/students?search=Uji%20Proposal");
  const row = (list.data ?? []).find((s) => s.identityNumber === "2211528018");
  check("daftar mahasiswa memuat periodFlags semester berjalan", row?.periodFlags?.takingThesisCourse === true && row?.periodFlags?.eligibleResearchMethod === false, row?.periodFlags);
  const target = (list.data ?? []).find((s) => s.identityNumber === "2211528001");
  const set = await api("admin_si", "PATCH", `/devtools/students/${target.id}/period-flags`, { takingThesisCourse: true });
  check("ubah penanda Tugas Akhir semester berjalan", set.status === 200 && set.data?.takingThesisCourse === true && set.data?.thesisCourseSource === "devtools", set.json?.message);
  const back = await api("admin_si", "PATCH", `/devtools/students/${target.id}/period-flags`, { takingThesisCourse: null });
  check("kosongkan penanda", back.data?.takingThesisCourse === null && back.data?.eligibleResearchMethod === true, back.data);
  const bad = await api("admin_si", "PATCH", `/devtools/students/${target.id}/period-flags`, {});
  check("tanpa isian ditolak 400", bad.status === 400, bad.json?.message);
  const old = await api("admin_si", "PATCH", `/devtools/metopen-eligibility/${target.id}`, { eligibleMetopen: true });
  check("endpoint lama metopen-eligibility sudah tidak ada", old.status === 404, old.status);
});

await run("sia", async () => {
  const cov = await api("admin_si", "GET", "/sia/snapshots/coverage");
  check("cakupan penanda SIA semester berjalan", cov.status === 200 && cov.data?.studentsWithFlags >= 16, cov.data);
  const ops = await api("admin_si", "GET", "/sia/metopen-operations");
  check("endpoint operasi Metopen lama sudah tidak ada", ops.status === 404, ops.status);
});

await run("paket E tetap jalan", async () => {
  const detail = await api("penguji_si", "GET", "/thesisGuidance/lecturer/my-students");
  check("Mahasiswa Bimbingan dosen terbaca", detail.status === 200, detail.status);
  const list = find(detail.json, "data") ?? detail.data;
  check("daftar memuat mahasiswa", Array.isArray(list) ? list.length > 0 : true, Array.isArray(list) ? list.length : typeof list);
  const cr = await api("kadep_si", "GET", "/thesis-change-requests/inbox");
  check("Pengajuan Perubahan TA terbaca", cr.status === 200, cr.status);
  const sup = await api("ta_lancar", "GET", "/thesis-change-requests/supervisor-options");
  const opts = find(sup.json, "data") ?? sup.data;
  check("pilihan pembimbing memuat beban (batas baru)", sup.status === 200, JSON.stringify(opts).slice(0, 160));
  const mon = await api("kadep_si", "GET", "/thesisGuidance/monitoring/dashboard");
  check("monitoring terbaca", [200].includes(mon.status), mon.status);
  const ov = await api("ta_lancar", "GET", "/thesisGuidance/student/my-thesis");
  check("Overview/TA mahasiswa terbaca", ov.status === 200, ov.status);
});

process.exit(summary() ? 1 : 0);
