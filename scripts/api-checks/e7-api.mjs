// Paket E7 (K28): a passed defence makes the thesis Selesai, the defence and seminar pages still
// find it, and undoing the result returns it to Penelitian. Mutates central; run from app/backend
// after a clean seed with the seven seeders (see README):
//   node scripts/api-checks/e7-api.mjs
//   node scripts/api-checks/e7-api.mjs --siapkan   # only the preparation, for the manual guide (I)
//
// Preparation through Prisma (there is no API to hold a defence): a scheduled defence in the past
// with two examiners whose scores are in, and the supervisor's score. Everything after that goes
// through the API: the result, the revisions, their finalization, the pages.
import { api, check, ids, login, run, summary } from "./lib-api.mjs";

const prisma = (await import(process.cwd() + "/src/config/prisma.js")).default;

const HUSNIL = "pembimbing_si", SEKDEP = "sekdep_si", ADMIN = "admin_si";
const AINA = "penguji_si", ULLYA = "gkm_si";
const REASON = "Dibatalkan otomatis: tugas akhir selesai.";
const R = "Data uji E7: perubahan yang masih menunggu saat sidang lulus.";
const DAY = 86400000;

// Away from the seeded sessions (relative to now): six days ahead, 09:00 WIB.
const inSixDaysAtNine = () => { const d = new Date(Date.now() + 6 * DAY); d.setUTCHours(2, 0, 0, 0); return d.toISOString(); };
const userId = async (who) => { await login(who); return ids[who]; };
const studentThesis = async (who) => {
  const user = await prisma.user.findFirst({ where: { email: `${who}@fti.unand.ac.id` }, select: { student: { select: { id: true } } } });
  return prisma.thesis.findFirst({ where: { studentId: user.student.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
};
const myThesis = async (who) => (await api(who, "GET", "/thesisGuidance/student/my-thesis")).json?.thesis;
const defenceOverview = async (who) => api(who, "GET", "/thesis-defences/me/overview");
const load = async () => (await api(HUSNIL, "GET", "/supervision-quotas/me")).data?.me;
const notificationsOf = async (who) => {
  const res = await api(who, "GET", "/notification?limit=50");
  const list = res.json?.notifications ?? res.json?.data?.notifications ?? res.json?.data ?? [];
  return Array.isArray(list) ? list : [];
};

/** A defence held yesterday, scores in, waiting for the supervisor to finalize the result. */
async function heldDefence(thesisId, { examinerScore, supervisorScore, revisionNotes = null }) {
  const yesterday = new Date(Date.now() - DAY);
  const date = new Date(Date.UTC(yesterday.getUTCFullYear(), yesterday.getUTCMonth(), yesterday.getUTCDate()));
  const defence = await prisma.thesisDefence.create({
    data: {
      thesisId,
      status: "scheduled",
      registeredAt: new Date(Date.now() - 30 * DAY),
      verifiedAt: new Date(Date.now() - 25 * DAY),
      scheduledAt: new Date(Date.now() - 10 * DAY),
      date,
      startTime: new Date("1970-01-01T09:00:00.000Z"),
      endTime: new Date("1970-01-01T11:00:00.000Z"),
      supervisorScore,
      supervisorAssessmentSubmittedAt: yesterday,
    },
  });
  let order = 1;
  for (const who of [AINA, ULLYA]) {
    await prisma.thesisDefenceExaminer.create({
      data: {
        thesisDefenceId: defence.id,
        lecturerId: await userId(who),
        order: order++,
        assignedAt: new Date(Date.now() - 20 * DAY),
        availabilityStatus: "available",
        respondedAt: new Date(Date.now() - 19 * DAY),
        assessmentScore: examinerScore,
        assessmentSubmittedAt: yesterday,
        revisionNotes: revisionNotes ? `${revisionNotes} (${who})` : null,
      },
    });
  }
  return defence;
}

/** The three defences of the manual guide (PANDUAN_UJI_MANUAL_ALUR_TA.md, section I). */
const MANUAL = [
  { who: "ta_eval_tunggu_kadep", examinerScore: 50, supervisorScore: 30, note: "I.1 lulus tanpa revisi" },
  { who: "ta_lulus_seminar", examinerScore: 50, supervisorScore: 28, revisionNotes: "Perbaiki bab pembahasan", note: "I.2–I.3 lulus dengan revisi" },
  { who: "ta_lancar", examinerScore: 20, supervisorScore: 10, note: "I.4 tidak lulus (nilai akhir 30)" },
];

/** Lanjutan Paket E7: seed-thesis-rubrics.js fills the minimum passing scores of the running semester. */
async function minimumScores() {
  const ay = (await api(SEKDEP, "GET", "/supervision-quotas")).data?.academicYear;
  return prisma.academicYear.findUnique({ where: { id: ay?.id ?? "" }, select: { thesisSeminarMinimumScore: true, thesisDefenceMinimumScore: true } });
}
const UNAPPROVE_AFTER_FINAL = "Revisi sudah difinalkan. Batalkan finalisasi lebih dulu.";

if (process.argv.includes("--siapkan")) {
  const min = await minimumScores();
  console.log(`Nilai minimum kelulusan semester berjalan (dari seed-thesis-rubrics.js): seminar ${min?.thesisSeminarMinimumScore ?? "kosong"}, sidang ${min?.thesisDefenceMinimumScore ?? "kosong"}`);
  for (const { who, note, ...scores } of MANUAL) {
    const thesis = await studentThesis(who);
    const existing = await prisma.thesisDefence.findFirst({ where: { thesisId: thesis.id, status: "scheduled", resultFinalizedAt: null } });
    const defence = existing ?? await heldDefence(thesis.id, scores);
    console.log(`${note}: ${who} → /tugas-akhir/sidang/${defence.id}${existing ? " (sudah ada)" : ""}`);
  }
  await prisma.$disconnect();
  process.exit(0);
}

await run("0 persiapan", async () => {
  const min = await minimumScores();
  check("seed: nilai minimum kelulusan seminar dan sidang semester berjalan 65 (seed-thesis-rubrics.js)", min?.thesisSeminarMinimumScore === 65 && min?.thesisDefenceMinimumScore === 65, min);
});

await run("I.1 lulus tanpa revisi → Selesai (ta_eval_tunggu_kadep)", async () => {
  const who = "ta_eval_tunggu_kadep";
  const thesis = await studentThesis(who);
  const husnil = await userId(HUSNIL);
  // Rows that close with the thesis: an open guidance request, a pending change request, and
  // the 6-month evaluation that waits for the Ketua Departemen (seeded).
  const milestone = await prisma.thesisMilestone.findFirst({ where: { thesisId: thesis.id, status: { not: "completed" } } });
  const guidance = await api(who, "POST", "/thesisGuidance/student/guidance/request", { supervisorId: husnil, guidanceDate: inSixDaysAtNine(), studentNotes: "Data uji E7", duration: 60, milestoneIds: [milestone?.id] });
  check("persiapan: mahasiswa mengajukan bimbingan", guidance.status === 201 || guidance.status === 200, `${guidance.status} ${guidance.json?.message}`);
  const change = await api(who, "POST", "/thesis-change-requests", { requestType: "title", newTitle: "Judul Uji E7 Yang Masih Menunggu", reason: R });
  check("persiapan: mahasiswa mengajukan perubahan judul", change.status === 201 || change.status === 200, `${change.status} ${change.json?.message}`);
  const evaluation = await prisma.thesisGuidanceEvaluation.findFirst({ where: { thesisId: thesis.id, status: "pending" } });
  check("persiapan: evaluasi menunggu Ketua Departemen ada", !!evaluation);

  const before = await load();
  const defence = await heldDefence(thesis.id, { examinerScore: 50, supervisorScore: 30 });
  const fin = await api(HUSNIL, "POST", `/thesis-defences/${defence.id}/finalize`, { recommendRevision: false });
  check("pembimbing menetapkan hasil: lulus", fin.status === 200 && fin.data?.status === "passed", `${fin.status} ${fin.json?.message} ${fin.data?.status}`);

  const after = await prisma.thesis.findUnique({ where: { id: thesis.id } });
  check("TA otomatis Selesai, statusChangedAt terisi", after.status === "completed" && after.statusChangedAt > thesis.statusChangedAt, `${after.status} ${after.statusChangedAt?.toISOString()}`);
  const sessions = await prisma.thesisGuidance.findMany({ where: { thesisId: thesis.id, status: { in: ["requested", "accepted"] } } });
  const cancelled = await prisma.thesisGuidance.findMany({ where: { thesisId: thesis.id, status: "cancelled", cancelReason: REASON } });
  check("bimbingan terbuka dibatalkan sistem dengan alasannya", sessions.length === 0 && cancelled.length >= 1 && cancelled.every((g) => g.cancelledBy === "system"), cancelled.map((g) => g.cancelledBy));
  const cr = await prisma.thesisChangeRequest.findUnique({ where: { id: change.data?.id ?? change.json?.data?.id ?? "" } }).catch(() => null)
    ?? await prisma.thesisChangeRequest.findFirst({ where: { thesisId: thesis.id }, orderBy: { createdAt: "desc" } });
  check("perubahan yang menunggu dibatalkan dengan alasan yang sama", cr?.status === "cancelled" && cr?.decisionNotes === REASON, `${cr?.status} ${cr?.decisionNotes}`);
  const ev = await prisma.thesisGuidanceEvaluation.findUnique({ where: { id: evaluation?.id ?? "" } }).catch(() => null);
  check("evaluasi yang menunggu Ketua Departemen ditutup: Ditolak, catatan alasan sistem", ev?.status === "rejected" && ev?.kadepNotes === "Ditutup otomatis: tugas akhir selesai.", `${ev?.status} ${ev?.kadepNotes}`);
  const inbox = (await api("kadep_si", "GET", "/thesis-guidance-evaluations/inbox?pageSize=100")).json?.data ?? [];
  const row = inbox.find((r) => r.id === evaluation?.id);
  check("tabel Evaluasi Kadep: baris Ditolak membawa catatan itu untuk modal detail", row?.viewStatus === "rejected" && row?.decision?.notes === "Ditutup otomatis: tugas akhir selesai." && row?.decision?.by === null && row?.decision?.closedBySystem === true, { viewStatus: row?.viewStatus, decision: row?.decision });
  const supervisors = await prisma.thesisSupervisors.findMany({ where: { thesisId: thesis.id } });
  check("relasi pembimbing tetap aktif sebagai riwayat", supervisors.length >= 1 && supervisors.every((s) => s.status === "active"), supervisors.map((s) => s.status));
  const audit = await prisma.auditLog.findFirst({ where: { entityId: thesis.id, action: "THESIS_STATUS_CHANGED" }, orderBy: { createdAt: "desc" } });
  check("log audit perubahan status (sumber: sidang)", audit?.changes?.newValues?.status === "completed" && audit?.changes?.metadata?.defenceId === defence.id, audit?.changes);

  const nowLoad = await load();
  check("beban pembimbing turun satu", nowLoad?.activeCount === before?.activeCount - 1 && nowLoad?.breakdown?.research === before?.breakdown?.research - 1, `${before?.activeCount} → ${nowLoad?.activeCount}`);
  const overview = await defenceOverview(who);
  check("halaman sidang mahasiswa tetap menampilkan hasilnya", overview.status === 200 && overview.data?.thesisId === thesis.id && overview.data?.defence?.status === "passed", `${overview.status} ${overview.data?.defence?.status}`);
  const seminar = await api(who, "GET", "/thesis-seminars/me/overview");
  check("halaman seminar hasil mahasiswa tetap menemukan TA-nya", seminar.status === 200 && seminar.data?.thesisId === thesis.id, `${seminar.status} ${seminar.json?.message}`);
  const overviewTa = await myThesis(who);
  check("Overview: TA berstatus Selesai (badge Selesai)", overviewTa?.status === "completed", overviewTa?.status);
  const history = await api(who, "GET", "/thesisGuidance/student/completed-history");
  check("riwayat bimbingan selesai tetap terbaca", history.status === 200 && (history.json?.guidances?.length ?? 0) >= 1, `${history.status} ${history.json?.guidances?.length}`);
  for (const target of [who, HUSNIL]) {
    const notes = await notificationsOf(target);
    check(`notifikasi "Tugas akhir dinyatakan selesai." untuk ${target}`, notes.some((n) => n.message === "Tugas akhir dinyatakan selesai."), notes.slice(0, 3).map((n) => n.message));
  }
});

let revisionDefenceId = null;
let revisionItemId = null;
await run("I.2 lulus dengan revisi → Penelitian sampai revisi difinalkan (ta_lulus_seminar)", async () => {
  const who = "ta_lulus_seminar";
  const thesis = await studentThesis(who);
  const defence = await heldDefence(thesis.id, { examinerScore: 50, supervisorScore: 28, revisionNotes: "Perbaiki bab pembahasan" });
  revisionDefenceId = defence.id;
  const fin = await api(HUSNIL, "POST", `/thesis-defences/${defence.id}/finalize`, { recommendRevision: true });
  check("pembimbing menetapkan hasil: lulus dengan revisi", fin.status === 200 && fin.data?.status === "passed_with_revision", `${fin.status} ${fin.json?.message} ${fin.data?.status}`);
  check("TA tetap Penelitian selama revisi", (await myThesis(who))?.status === "research");

  const revisions = (await api(who, "GET", `/thesis-defences/${defence.id}/revisions`)).data;
  const items = Array.isArray(revisions) ? revisions : revisions?.revisions ?? revisions?.items ?? [];
  check("dua item revisi dari penguji", items.length === 2, items.length);
  for (const item of items) {
    const sub = await api(who, "PATCH", `/thesis-defences/${defence.id}/revisions/${item.id}`, { action: "submit", revisionAction: "Bab pembahasan sudah diperbaiki." });
    const appr = await api(HUSNIL, "PATCH", `/thesis-defences/${defence.id}/revisions/${item.id}`, { action: "approve" });
    check(`revisi ${item.id.slice(0, 8)}: diajukan dan disetujui`, sub.status === 200 && appr.status === 200, `${sub.status} ${sub.json?.message} / ${appr.status} ${appr.json?.message}`);
  }
  check("semua revisi disetujui, belum difinalkan: TA tetap Penelitian", (await myThesis(who))?.status === "research");
  const finalize = await api(HUSNIL, "POST", `/thesis-defences/${defence.id}/revisions/finalize`);
  check("pembimbing memfinalkan revisi", finalize.status === 200, `${finalize.status} ${finalize.json?.message}`);
  check("revisi difinalkan → TA Selesai", (await myThesis(who))?.status === "completed");
  const unapprove = await api(HUSNIL, "PATCH", `/thesis-defences/${defence.id}/revisions/${items[0]?.id}`, { action: "unapprove" });
  check("setelah final: batalkan persetujuan item ditolak dengan alasannya", unapprove.status === 400 && unapprove.json?.message === UNAPPROVE_AFTER_FINAL, `${unapprove.status} ${unapprove.json?.message}`);
  check("persetujuan item tetap, TA tetap Selesai", !!(await prisma.thesisDefenceRevision.findUnique({ where: { id: items[0]?.id ?? "" } }))?.supervisorApprovedAt && (await myThesis(who))?.status === "completed");
  revisionItemId = items[0]?.id;
  const overview = await defenceOverview(who);
  check("halaman sidang tetap menampilkan hasil dan revisi final", overview.status === 200 && overview.data?.defence?.status === "passed_with_revision", `${overview.status} ${overview.data?.defence?.status}`);
});

await run("I.3 finalisasi revisi dibatalkan → kembali Penelitian (ta_lulus_seminar)", async () => {
  const who = "ta_lulus_seminar";
  const res = await api(HUSNIL, "POST", `/thesis-defences/${revisionDefenceId}/revisions/unfinalize`);
  check("pembimbing membatalkan finalisasi revisi", res.status === 200, `${res.status} ${res.json?.message}`);
  check("TA kembali Penelitian", (await myThesis(who))?.status === "research");
  const notes = await notificationsOf(who);
  check("mahasiswa diberi tahu TA kembali Penelitian", notes.some((n) => /kembali berstatus Penelitian/.test(n.message ?? "")), notes.slice(0, 3).map((n) => n.message));
  const unapprove = await api(HUSNIL, "PATCH", `/thesis-defences/${revisionDefenceId}/revisions/${revisionItemId}`, { action: "unapprove" });
  const reapprove = await api(HUSNIL, "PATCH", `/thesis-defences/${revisionDefenceId}/revisions/${revisionItemId}`, { action: "approve" });
  check("setelah finalisasi dibatalkan: persetujuan item boleh dibatalkan, lalu disetujui lagi", unapprove.status === 200 && reapprove.status === 200, `${unapprove.status} ${unapprove.json?.message} / ${reapprove.status} ${reapprove.json?.message}`);
  const again = await api(HUSNIL, "POST", `/thesis-defences/${revisionDefenceId}/revisions/finalize`);
  check("finalisasi ulang → Selesai lagi", again.status === 200 && (await myThesis(who))?.status === "completed", `${again.status} ${again.json?.message}`);
});

await run("I.4 tidak lulus → tetap Penelitian (ta_lancar)", async () => {
  const who = "ta_lancar";
  const thesis = await studentThesis(who);
  const before = await load();
  const defence = await heldDefence(thesis.id, { examinerScore: 20, supervisorScore: 10 });
  const fin = await api(HUSNIL, "POST", `/thesis-defences/${defence.id}/finalize`, { recommendRevision: false });
  check("pembimbing menetapkan hasil: tidak lulus", fin.status === 200 && fin.data?.status === "failed", `${fin.status} ${fin.json?.message} ${fin.data?.status}`);
  check("TA tetap Penelitian (boleh mendaftar sidang lagi)", (await myThesis(who))?.status === "research");
  check("beban pembimbing tidak berubah", (await load())?.activeCount === before?.activeCount);
  const overview = await defenceOverview(who);
  check("halaman sidang menampilkan hasil tidak lulus", overview.status === 200 && overview.data?.thesisId === thesis.id, `${overview.status} ${overview.data?.defence?.status}`);
});

await run("I.5 Yudisium tetap terbuka untuk TA Selesai", async () => {
  for (const who of ["ta_eval_tunggu_kadep", "ta_mon_sid_lulus", "ta_mon_sid_revisi_final"]) {
    const res = await api(who, "GET", "/yudisiums/me/overview");
    check(`${who}: halaman Yudisium terbuka, syarat lulus sidang terpenuhi`, res.status === 200 && !!res.data?.thesis?.id && res.data?.checklist?.lulusSidang?.met === true, `${res.status} ${res.json?.message} ${res.data?.checklist?.lulusSidang?.met}`);
  }
});

await run("I seed: TA dengan sidang lulus atau revisi final berstatus Selesai", async () => {
  const expected = { ta_mon_sid_lulus: "completed", ta_mon_sid_revisi_final: "completed", ta_mon_selesai_lalu: "completed", ta_mon_sid_revisi_lama: "research", ta_mon_sid_gagal: "research", ta_mon_sid_hasil_tunda: "research" };
  for (const [who, status] of Object.entries(expected)) {
    const thesis = await studentThesis(who);
    check(`${who}: ${status}`, thesis?.status === status, thesis?.status);
  }
  const overview = await defenceOverview("ta_mon_sid_revisi_final");
  check("ta_mon_sid_revisi_final: halaman sidang menampilkan hasilnya", overview.status === 200 && overview.data?.defence?.status === "passed_with_revision", `${overview.status} ${overview.data?.defence?.status}`);
});

await run("I jalur lain: sidang lulus dibatalkan Admin → TA kembali Penelitian", async () => {
  const who = "ta_mon_sid_lulus";
  const thesis = await studentThesis(who);
  const defence = await prisma.thesisDefence.findFirst({ where: { thesisId: thesis.id, status: "passed" } });
  const res = await api(ADMIN, "POST", `/thesis-defences/${defence.id}/cancel`, { cancelledReason: "Data uji E7: hasil sidang dibatalkan." });
  check("Admin membatalkan sidang yang lulus", res.status === 200, `${res.status} ${res.json?.message}`);
  check("TA kembali Penelitian", (await prisma.thesis.findUnique({ where: { id: thesis.id } }))?.status === "research");
  const failed = await prisma.thesisDefence.findFirst({ where: { status: "failed" } });
  const failedThesis = await prisma.thesis.findUnique({ where: { id: failed.thesisId } });
  const cancelFailed = await api(ADMIN, "POST", `/thesis-defences/${failed.id}/cancel`, { cancelledReason: "Data uji E7." });
  check("membatalkan sidang tidak lulus tidak mengubah status TA", cancelFailed.status === 200 && (await prisma.thesis.findUnique({ where: { id: failed.thesisId } }))?.status === failedThesis.status, `${cancelFailed.status} ${failedThesis.status}`);
});

await prisma.$disconnect();
process.exit(summary() ? 1 : 0);
