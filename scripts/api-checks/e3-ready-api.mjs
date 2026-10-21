// A student approved by every supervisor shows up in "Siap Mendaftar", and leaves it
// when an approval is withdrawn. Writes readiness approvals: run on a clean seed of the six
// seeders (see README), e.g. right after e3-api.mjs, which only reads.
const BASE = process.env.BASE || "http://localhost:3000", D = "@fti.unand.ac.id";
function find(obj, key) { if (!obj || typeof obj !== "object") return undefined; if (key in obj) return obj[key]; for (const v of Object.values(obj)) { const r = find(v, key); if (r !== undefined) return r; } return undefined; }
const tokens = {};
async function api(name, method, path, body) {
  if (!tokens[name]) { const r = await fetch(`${BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: name + D, password: "password123" }) }); tokens[name] = find(await r.json(), "accessToken"); }
  const res = await fetch(BASE + path, { method, headers: { Authorization: `Bearer ${tokens[name]}`, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json, data: json?.data ?? json };
}
let failed = 0;
let total = 0;
const check = (label, ok, seen) => { total += 1; if (!ok) failed += 1; console.log(`${ok ? "PASS" : "FAIL"} ${label}${seen !== undefined ? " :: " + JSON.stringify(seen) : ""}`); };
const ready = async (path) => (await api("kadep_si", "GET", `/thesisGuidance/monitoring/${path}`)).data.readyToRegister.map((r) => r.student.name).sort();
const thesisOf = async (student) => (await api(student, "GET", "/thesisGuidance/student/my-thesis")).json?.thesis;

const sem = await thesisOf("ta_siap_seminar");
const sbase = `/milestones/thesis/${sem.id}/seminar-readiness`;
check("awal: Siap Mendaftar seminar hanya Uji Mon Siap Daftar Seminar", JSON.stringify(await ready("seminars")) === JSON.stringify(["Uji Mon Siap Daftar Seminar"]), await ready("seminars"));
await api("ta_siap_seminar", "POST", `${sbase}/request`);
const a1 = await api("pembimbing_si", "POST", `${sbase}/approve`, {});
check("satu dari dua pembimbing menyetujui: belum masuk Siap Mendaftar", a1.status < 300 && !(await ready("seminars")).includes("Uji TA Siap Seminar"), a1.status);
const a2 = await api("sekdep_si", "POST", `${sbase}/approve`, {});
check("kedua pembimbing menyetujui: Uji TA Siap Seminar masuk Siap Mendaftar", a2.status < 300 && JSON.stringify(await ready("seminars")) === JSON.stringify(["Uji Mon Siap Daftar Seminar", "Uji TA Siap Seminar"]), await ready("seminars"));
const dash = (await api("kadep_si", "GET", "/thesisGuidance/monitoring/dashboard")).data;
check("angka Siap Seminar di ringkasan Bimbingan ikut menjadi 2", dash.summary.totalReadyForSeminar === 2, dash.summary.totalReadyForSeminar);
const rv = await api("pembimbing_si", "POST", `${sbase}/revoke`, {});
check("persetujuan dibatalkan: keluar dari Siap Mendaftar", rv.status < 300 && JSON.stringify(await ready("seminars")) === JSON.stringify(["Uji Mon Siap Daftar Seminar"]), await ready("seminars"));

const def = await thesisOf("ta_lulus_seminar");
const dbase = `/milestones/thesis/${def.id}/defence-readiness`;
check("awal: Siap Mendaftar sidang hanya Uji Mon Siap Daftar Sidang", JSON.stringify(await ready("defences")) === JSON.stringify(["Uji Mon Siap Daftar Sidang"]), await ready("defences"));
await api("ta_lulus_seminar", "POST", `${dbase}/request`);
const d1 = await api("pembimbing_si", "POST", `${dbase}/approve`, {});
const d2 = await api("sekdep_si", "POST", `${dbase}/approve`, {});
check("kedua pembimbing menyetujui kesiapan sidang: Uji TA Lulus Seminar masuk Siap Mendaftar", d1.status < 300 && d2.status < 300 && JSON.stringify(await ready("defences")) === JSON.stringify(["Uji Mon Siap Daftar Sidang", "Uji TA Lulus Seminar"]), await ready("defences"));
check("Uji TA Lulus Seminar tidak masuk Siap Mendaftar seminar (seminarnya sudah lulus)", !(await ready("seminars")).includes("Uji TA Lulus Seminar"));
console.log(`\n${total} pemeriksaan, ${total - failed} lulus, ${failed} gagal`);
process.exitCode = failed ? 1 : 0;
