// Small API client for the verification scripts: login per account, JSON or multipart calls,
// and a PASS/FAIL recorder.
export const BASE = process.env.BASE || "http://localhost:3000";
export const D = "@fti.unand.ac.id";
const tokens = {};
export const ids = {};
export const results = [];
let section = "";
export function find(obj, key) {
  if (!obj || typeof obj !== "object") return undefined;
  if (key in obj) return obj[key];
  for (const v of Object.values(obj)) { const r = find(v, key); if (r !== undefined) return r; }
  return undefined;
}
export async function login(name) {
  if (tokens[name]) return tokens[name];
  const res = await fetch(`${BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: name.includes("@") ? name : name + D, password: "password123" }) });
  const json = await res.json();
  tokens[name] = find(json, "accessToken");
  ids[name] = find(json, "user")?.id;
  if (!tokens[name]) throw new Error(`login ${name}: ${res.status} ${json?.message ?? ""}`);
  return tokens[name];
}
export function profileOf(name) { return ids[name]; }
export async function api(name, method, p, body, { form } = {}) {
  const token = await login(name);
  const headers = { Authorization: `Bearer ${token}` };
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
  const res = await fetch(BASE + p, { method, headers, body: payload });
  const ct = res.headers.get("content-type") || "";
  let json = null; let bytes = 0;
  if (ct.includes("json")) { try { json = await res.json(); } catch { /* empty */ } }
  else { bytes = (await res.arrayBuffer()).byteLength; }
  return { status: res.status, json, data: json?.data ?? json, ct, bytes, headers: res.headers };
}
export function check(label, ok, seen) {
  results.push({ section, label, ok: !!ok });
  const s = seen === undefined ? "" : ` :: ${typeof seen === "string" ? seen : JSON.stringify(seen)}`;
  console.log(`${ok ? "PASS" : "FAIL"} [${section}] ${label}${s}`.slice(0, 500));
}
export async function run(name, fn) {
  section = name;
  try { await fn(); } catch (e) { check("skenario berjalan tanpa galat", false, String(e?.stack ?? e).slice(0, 400)); }
}
export function summary() {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length} pemeriksaan, ${results.length - failed.length} lulus, ${failed.length} gagal`);
  for (const f of failed) console.log(" GAGAL:", f.section, "|", f.label);
  return failed.length;
}
