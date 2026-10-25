// Yudisium period detail charts: participants per cohort, computed predicate and thesis topic
// (five largest plus "Lainnya"), for the viewers of the period. Run on a clean seed.
import { api, check, run, summary } from "./lib-api.mjs";

const prisma = (await import(process.cwd() + "/src/config/prisma.js")).default;

await run("1 ringkasan peserta periode yudisium", async () => {
  const period = await prisma.yudisium.findFirst({ where: { participants: { some: {} } }, select: { id: true } });
  const participants = await prisma.yudisiumParticipant.count({ where: { yudisiumId: period.id, status: { not: "rejected" } } });
  const res = await api("sekdep_si", "GET", `/yudisiums/${period.id}/participants/summary`);
  const data = res.data ?? {};
  check("Koordinator Yudisium membaca ringkasan", res.status === 200, res.status);
  check("jumlah peserta sama dengan tabel peserta (tanpa yang ditolak)", data.total === participants, { total: data.total, participants });
  const sum = (rows) => (rows ?? []).reduce((acc, row) => acc + row.count, 0);
  check("angkatan, predikat, dan topik menjumlah ke total", sum(data.enrollmentYears) === participants && sum(data.predicates) === participants && sum(data.topics) === participants, data);
  check("topik paling banyak enam batang (lima + Lainnya)", (data.topics ?? []).length <= 6, data.topics?.length);
  const student = await api("ta_demo_siap_seminar", "GET", `/yudisiums/${period.id}/participants/summary`);
  check("mahasiswa tidak boleh membaca ringkasan", student.status === 403, student.status);
  const missing = await api("sekdep_si", "GET", "/yudisiums/00000000-0000-4000-8000-000000000000/participants/summary");
  check("periode tidak dikenal: 404", missing.status === 404, missing.status);
});

await prisma.$disconnect();
process.exit(summary() ? 1 : 0);
