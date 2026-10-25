// Calendar and Agenda Mendatang (G1): who sees which TA event, the event details, and the
// agenda as the first five events from now on. Run on a clean seed (nine seeders).
import { api, check, run, summary } from "./lib-api.mjs";

const prisma = (await import(process.cwd() + "/src/config/prisma.js")).default;
const RANGE = "startDate=2025-01-01T00:00:00.000Z&endDate=2028-01-01T00:00:00.000Z";

await run("1 siapa melihat apa", async () => {
  const admin = await api("admin_si", "GET", `/calendar/my-events?${RANGE}`);
  const adminKinds = new Set((admin.json?.events ?? []).map((e) => e.kind));
  check("Admin melihat Seminar Hasil dan Sidang", admin.status === 200 && adminKinds.has("seminar") && adminKinds.has("defence"), [...adminKinds]);

  const scheduled = await prisma.thesisSeminar.count({ where: { status: { in: ["scheduled", "passed", "passed_with_revision", "failed"] }, date: { gte: new Date("2025-01-01"), lte: new Date("2028-01-01") } } });
  const adminSeminars = (admin.json?.events ?? []).filter((e) => e.kind === "seminar").length;
  check("Admin melihat semua seminar terjadwal, tanpa yang batal atau belum dijadwalkan", adminSeminars === scheduled, { adminSeminars, scheduled });

  // ta_demo_siap_seminar attended other students' seminars (audience).
  const audience = await api("ta_demo_siap_seminar", "GET", `/calendar/my-events?${RANGE}`);
  const others = (audience.json?.events ?? []).filter((e) => e.kind === "seminar");
  check("audiens melihat seminar yang dihadirinya", others.length > 0, others.length);
  check("audiens tidak melihat sidang orang lain", !(audience.json?.events ?? []).some((e) => e.kind === "defence"), null);

  const event = (admin.json?.events ?? []).find((e) => e.kind === "seminar" && e.participants?.length >= 3);
  check("event seminar: judul, status, lokasi, peserta berperan", !!event && event.title.startsWith("Seminar Hasil – ") && !!event.statusLabel && event.location !== undefined && event.participants.some((p) => p.roleLabel === "Mahasiswa") && event.participants.some((p) => String(p.roleLabel).startsWith("Penguji")), event && { title: event.title, statusLabel: event.statusLabel, roles: event.participants.map((p) => p.roleLabel) });
  check("tanggal seminar bukan tahun 1970", !!event && new Date(event.startDate).getUTCFullYear() > 2000, event?.startDate);
});

await run("2 Agenda Mendatang", async () => {
  const res = await api("admin_si", "GET", "/calendar/upcoming");
  const events = res.json?.events ?? [];
  const sorted = events.every((e, i) => i === 0 || new Date(events[i - 1].startDate) <= new Date(e.startDate));
  check("maksimal 5, urut waktu, dari sekarang", res.status === 200 && events.length <= 5 && sorted && events.every((e) => new Date(e.endDate ?? e.startDate) >= new Date(Date.now() - 60_000)), events.map((e) => e.startDate));
});

await run("3 Agenda per peran dan event tanpa jam", async () => {
  // The demo seeds a seminar and a defence going on now (DevTools-like "Mulai Sekarang").
  for (const [name, kinds] of [
    ["ta_demo_seminar_berlangsung", ["seminar"]],
    ["ta_demo_sidang_berlangsung", ["defence"]],
    ["kadep_si", ["seminar", "defence"]],
  ]) {
    const res = await api(name, "GET", "/calendar/upcoming");
    const got = new Set((res.json?.events ?? []).map((e) => e.kind));
    check(`${name}: Agenda memuat ${kinds.join(" dan ")} yang sedang berlangsung`, kinds.every((k) => got.has(k)), [...got]);
  }
  // An archived seminar without a time (as imported data) is all-day, never 00.00.
  const archived = await prisma.thesisSeminar.findFirst({ where: { status: { in: ["passed", "passed_with_revision", "failed"] }, startTime: { not: null } }, select: { id: true, date: true, startTime: true, endTime: true } });
  await prisma.thesisSeminar.update({ where: { id: archived.id }, data: { startTime: null, endTime: null } });
  const day = archived.date.toISOString().slice(0, 10);
  const res = await api("admin_si", "GET", `/calendar/my-events?startDate=${day}T00:00:00.000Z&endDate=${day}T23:59:59.000Z`);
  const event = (res.json?.events ?? []).find((e) => e.id === `seminar-${archived.id}`);
  check("seminar tanpa jam: event sepanjang hari pada tanggalnya", event?.allDay === true && event.startDate === day, event && { allDay: event.allDay, startDate: event.startDate });
  await prisma.thesisSeminar.update({ where: { id: archived.id }, data: { startTime: archived.startTime, endTime: archived.endTime } });
});

await prisma.$disconnect();
process.exit(summary() ? 1 : 0);
