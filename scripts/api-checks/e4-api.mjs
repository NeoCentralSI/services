// Paket E4: the API side of the UI polish of the thesis flow. Mutates central; run from
// app/backend after a clean seed with the seven seeders (see README):
//   node scripts/api-checks/e4-api.mjs
import { api, check, ids, login, run, summary } from "./lib-api.mjs";

const prisma = (await import(process.cwd() + "/src/config/prisma.js")).default;

const HUSNIL = "pembimbing_si", AFRI = "sekdep_si", AINA = "penguji_si", ULLYA = "gkm_si", KADEP = "kadep_si";
const R = "Data uji E4: alasan pengajuan yang cukup panjang.";
const myThesis = async (who) => (await api(who, "GET", "/thesisGuidance/student/my-thesis")).json?.thesis;
const myStudents = async (who, status) => (await api(who, "GET", `/thesisGuidance/lecturer/my-students?status=${status}`)).json?.students ?? [];
const rowOf = (rows, name) => rows.find((row) => row.fullName === name);

await run("1.1 pembimbing yang diganti", async () => {
  // Uji TA Ubah Judul: P1 Husnil, P2 Afriyanti. Pembimbing 2 diganti Aina lewat Pengajuan Perubahan.
  const thesis = await myThesis("ta_ubah_judul");
  await login(AINA);
  const submit = await api("ta_ubah_judul", "POST", "/thesis-change-requests", {
    requestType: "supervisor", supervisorRole: "pembimbing_2", newSupervisorId: ids[AINA], reason: R,
  });
  check("mahasiswa mengajukan ganti Pembimbing 2", submit.status < 300, `${submit.status} ${submit.json?.message ?? ""}`);
  const decided = await api(KADEP, "POST", `/thesis-change-requests/${submit.data?.id}/decision`, { approve: true, notes: "Data uji E4: diputuskan langsung." });
  check("Ketua Departemen memutuskan langsung", decided.status < 300, `${decided.status} ${decided.json?.message ?? ""}`);

  const name = "Uji TA Ubah Judul";
  check("Afriyanti: tidak lagi di filter Aktif", !rowOf(await myStudents(AFRI, "active"), name), null);
  const all = rowOf(await myStudents(AFRI, "all"), name);
  check("Afriyanti: tampil di Semua dengan tanda Tidak lagi membimbing", all?.noLongerSupervising === true && all?.supervisorStatus === "released", all && `${all.supervisorStatus} ${all.noLongerSupervising}`);
  const detail = await api(AFRI, "GET", `/thesisGuidance/lecturer/my-students/${thesis.id}`);
  check("detail dapat dibaca, baca-saja", detail.status === 200 && detail.data?.noLongerSupervising === true, `${detail.status} ${detail.data?.noLongerSupervising}`);
  const warn = await api(AFRI, "POST", `/thesisGuidance/lecturer/my-students/${thesis.id}/send-warning`, {});
  check("Afriyanti tidak dapat memperingatkan (403)", warn.status === 403, `${warn.status} ${warn.json?.message ?? ""}`);
  check("Aina: tampil di Aktif", !!rowOf(await myStudents(AINA, "active"), name), null);
  check("Husnil (Pembimbing 1) tetap di Aktif", rowOf(await myStudents(HUSNIL, "active"), name)?.noLongerSupervising === false, null);
});

await run("3.2/3.3 kesiapan setelah lulus", async () => {
  const passed = await myThesis("ta_lulus_seminar");
  const base = `/milestones/thesis/${passed.id}/seminar-readiness`;
  const status = await api(HUSNIL, "GET", base);
  const sups = status.data?.supervisors ?? [];
  check("kartu seminar: lulus, tanggal lulus, persetujuan dengan tanggal", status.data?.isPassed === true && !!status.data?.passedAt && sups.length === 2 && sups.every((s) => "approvedAt" in s), `${status.data?.isPassed} ${status.data?.passedAt} ${JSON.stringify(sups.map((s) => s.approvedAt))}`);
  check("tidak dapat mendaftar seminar lagi", status.data?.canRegisterSeminar === false, status.data?.canRegisterSeminar);
  const revoke = await api(HUSNIL, "POST", `${base}/revoke`, {});
  check("Batalkan Persetujuan ditolak setelah lulus", revoke.status === 400 && /Seminar hasil sudah lulus/.test(revoke.json?.message ?? ""), `${revoke.status} ${revoke.json?.message}`);
  const approve = await api(AFRI, "POST", `${base}/approve`, {});
  check("Setujui ditolak setelah lulus", approve.status === 400 && /Seminar hasil sudah lulus/.test(approve.json?.message ?? ""), `${approve.status} ${approve.json?.message}`);
  const defence = await api(HUSNIL, "GET", `/milestones/thesis/${passed.id}/defence-readiness`);
  check("kartu sidang: seminar sudah lulus, sidang belum", defence.data?.seminarPassed === true && defence.data?.isPassed === false, `${defence.data?.seminarPassed} ${defence.data?.isPassed}`);

  const ready = await myThesis("ta_siap_seminar");
  const before = await api(HUSNIL, "GET", `/milestones/thesis/${ready.id}/defence-readiness`);
  check("sebelum seminar lulus: kartu sidang menunggu seminar", before.data?.seminarPassed === false && before.data?.requirementsMet === false, `${before.data?.seminarPassed} ${before.data?.requirementsMet}`);
});

await run("4.3 halaman Evaluasi", async () => {
  const p1 = await api(HUSNIL, "GET", "/thesis-guidance-evaluations/lecturer");
  const lambat = (p1.data?.due ?? []).find((item) => item.thesis?.student?.name === "Uji TA Lambat");
  check("Husnil: Uji TA Lambat jatuh tempo 6 bulan, dapat diisi", p1.status === 200 && lambat?.stage === "six_month" && lambat?.canSubmit === true && lambat?.viewerRole === "pembimbing_1", lambat && `${lambat.stage} ${lambat.canSubmit} ${lambat.viewerRole}`);
  check("daftar evaluasi yang diikuti terbaca", Array.isArray(p1.data?.evaluations), p1.data?.evaluations?.length);
  const p2 = await api(AFRI, "GET", "/thesis-guidance-evaluations/lecturer");
  // Uji TA Evaluasi Lanjut: P1 Husnil, P2 Afriyanti, evaluasi 6 bulan jatuh tempo.
  const asP2 = (p2.data?.due ?? []).find((item) => item.thesis?.student?.name === "Uji TA Evaluasi Lanjut");
  check("Afriyanti (Pembimbing 2): melihat, tidak dapat mengisi, dengan alasan", asP2?.viewerRole === "pembimbing_2" && asP2?.canSubmit === false && !!asP2?.blockReason, asP2 && `${asP2.viewerRole} ${asP2.blockReason}`);
  const student = await api("ta_lambat", "GET", "/thesis-guidance-evaluations/lecturer");
  check("mahasiswa ditolak (403)", student.status === 403, student.status);
});

await run("8 Peringatkan untuk Sekdep dan GKM", async () => {
  const lambat = await myThesis("ta_lambat");
  for (const who of [AFRI, ULLYA, KADEP]) {
    const res = await api(who, "POST", `/thesisGuidance/monitoring/theses/${lambat.id}/send-warning`, {});
    check(`${who} dapat memperingatkan dari Monitoring`, res.status === 200, `${res.status} ${res.json?.message ?? ""}`);
    if (who === KADEP) {
      // Lanjutan Paket E4 (6): the student's name as stored, not re-cased.
      check("pesan memakai nama mahasiswa apa adanya", res.json?.message === "Peringatan telah dikirim ke Uji TA Lambat", res.json?.message);
    }
  }
  const batch = await api(ULLYA, "POST", "/thesisGuidance/monitoring/batch-warning", { thesisIds: [lambat.id] });
  check("GKM dapat memperingatkan sekaligus", batch.status === 200 && (batch.data?.sentCount ?? batch.json?.sentCount) >= 1, `${batch.status} ${batch.json?.message ?? ""}`);
  const student = await api("ta_lambat", "POST", `/thesisGuidance/monitoring/theses/${lambat.id}/send-warning`, {});
  check("mahasiswa ditolak (403)", student.status === 403, student.status);
});

await run("7 bimbingan TA yang dihentikan", async () => {
  // Uji TA Dua Pembimbing punya satu sesi terbuka; dihentikan lewat Data Master TA.
  const thesis = await myThesis("ta_dua_pembimbing");
  const stop = await api(AFRI, "PATCH", `/master-data-ta/${thesis.id}`, { status: "failed", terminationReason: "withdrawn", terminationNote: "Data uji E4: mengundurkan diri." });
  check("Sekdep menghentikan TA", stop.status < 300, `${stop.status} ${stop.json?.message ?? ""}`);
  const after = await myThesis("ta_dua_pembimbing");
  check("my-thesis: status Gagal dengan tanggal penghentian", after?.status === "failed" && !!after?.terminatedAt, `${after?.status} ${after?.terminatedAt}`);
  const list = await api("ta_dua_pembimbing", "GET", "/thesisGuidance/student/guidance");
  const items = list.data?.items ?? list.json?.items ?? [];
  const cancelled = items.find((item) => item.status === "cancelled" && item.cancelledBy === "system");
  check("daftar sesi tetap terbaca", list.status === 200 && items.length > 0, `${list.status} ${items.length}`);
  check("sesi yang dibatalkan sistem tampil dengan alasannya", !!cancelled?.cancelReason, cancelled?.cancelReason);
  const request = await api("ta_dua_pembimbing", "POST", "/thesisGuidance/student/guidance/request", {
    supervisorId: ids[HUSNIL] ?? (await login(HUSNIL), ids[HUSNIL]),
    guidanceDate: new Date(Date.now() + 3 * 86400000).toISOString(), studentNotes: "uji", duration: 60, milestoneIds: [crypto.randomUUID()],
  });
  // The request is valid in form; the stopped thesis is what refuses it (not the validator).
  check("mengajukan bimbingan tetap ditolak", request.status >= 400 && !/Data tidak valid/.test(request.json?.message ?? ""), `${request.status} ${request.json?.message ?? ""}`);
  // Lanjutan Paket E4 (6): 404 messages of the thesis services are Indonesian.
  check("pesan 404 berbahasa Indonesia", request.status === 404 && request.json?.message === "Tugas akhir aktif tidak ditemukan", `${request.status} ${request.json?.message ?? ""}`);
  const milestones = await api("ta_dua_pembimbing", "GET", `/milestones/thesis/${thesis.id}`);
  check("milestone tetap terbaca", milestones.status === 200, milestones.status);

  const name = "Uji TA Dua Pembimbing";
  const failed = rowOf(await myStudents(HUSNIL, "failed"), name);
  check("Husnil: di filter Gagal, relasi saat TA ditutup", failed?.noLongerSupervising === false, failed && `${failed.supervisorStatus} ${failed.noLongerSupervising}`);
  check("Husnil: tidak di filter Aktif", !rowOf(await myStudents(HUSNIL, "active"), name), null);
});

// ── Lanjutan Paket E4 ────────────────────────────────────────────────────────────────

const MARKER = "Data uji E4 lanjutan: baris paging.";
const DAY = 24 * 60 * 60 * 1000;

await run("L1 Perubahan dan Evaluasi lebih dari 100 baris", async () => {
  // 120 closed requests and 120 decided evaluations on Uji TA Lancar (P1 Husnil), inserted
  // directly and removed again at the end: the pages must reach rows past the first hundred.
  const thesis = await myThesis("ta_lancar");
  const studentUserId = (await login("ta_lancar"), ids.ta_lancar);
  await login(HUSNIL);
  const nim = thesis.student?.nim;
  const relation = await prisma.thesisSupervisors.findFirst({ where: { thesisId: thesis.id, lecturerId: ids[HUSNIL], status: "active" } });
  const base = Date.now() - 400 * DAY;
  for (let i = 0; i < 120; i += 1) {
    await prisma.thesisChangeRequest.create({
      data: {
        thesisId: thesis.id, requestType: "title", reason: MARKER, status: "cancelled", requestedByUserId: studentUserId,
        previousTitle: thesis.title, newTitle: `Judul uji paging ${i + 1}`, decidedByUserId: studentUserId,
        decidedAt: new Date(base + i * DAY), createdAt: new Date(base + i * DAY - 3600_000),
        approvals: { create: [{ lecturerId: ids[HUSNIL], role: "main_supervisor", stepOrder: 1, status: "pending" }] },
      },
    });
  }
  await prisma.thesisGuidanceEvaluation.createMany({
    data: Array.from({ length: 120 }, (_, i) => ({
      thesisId: thesis.id, thesisSupervisorId: relation.id, evaluationType: "six_month", recommendation: "extend_1_month",
      status: "rejected", notes: MARKER, kadepNotes: MARKER, kadepApprovedAt: new Date(base + i * DAY), createdAt: new Date(base + i * DAY - 3600_000),
    })),
  });

  // Paket E5: the filters are the row statuses; Perubahan and Evaluasi are the Ketua
  // Departemen's, and a lecturer's own steps are rows of Permohonan.
  const page3 = await api(KADEP, "GET", `/thesis-change-requests/inbox?status=cancelled&search=${nim}&page=3&pageSize=50`);
  check("Perubahan (Kadep): Dibatalkan 120 baris, halaman 3 berisi baris 101-120", page3.status === 200 && page3.json?.meta?.total === 120 && page3.json?.meta?.totalPages === 3 && page3.json?.data?.length === 20, `${page3.status} ${JSON.stringify(page3.json?.meta)} ${page3.json?.data?.length}`);
  const lecturerPage3 = await api(HUSNIL, "GET", `/thesis-proposals/lecturer-inbox?kind=change_request&status=cancelled&search=${nim}&page=3&pageSize=50`);
  check("Permohonan (Husnil): Perubahan TA Dibatalkan 120 baris, halaman 3 berisi baris 101-120", lecturerPage3.status === 200 && lecturerPage3.json?.meta?.total === 120 && lecturerPage3.json?.data?.length === 20 && lecturerPage3.json?.data?.every((row) => row.kind === "change_request"), `${lecturerPage3.status} ${JSON.stringify(lecturerPage3.json?.meta)} ${lecturerPage3.json?.data?.length}`);
  const evalPage3 = await api(KADEP, "GET", `/thesis-guidance-evaluations/inbox?status=rejected&search=${nim}&page=3&pageSize=50`);
  check("Evaluasi (Kadep): Ditolak 120 baris, halaman 3 berisi baris 101-120", evalPage3.status === 200 && evalPage3.json?.meta?.total === 120 && evalPage3.json?.data?.length === 20 && evalPage3.json?.data?.every((row) => row.viewStatus === "rejected"), `${evalPage3.status} ${JSON.stringify(evalPage3.json?.meta)} ${evalPage3.json?.data?.length}`);
  const all = await api(KADEP, "GET", "/thesis-change-requests/inbox?page=1&pageSize=500");
  check("satu halaman paling banyak 100 baris, daftarnya tidak terpotong", all.json?.meta?.pageSize === 100 && all.json?.data?.length === 100 && all.json?.meta?.total > 120, JSON.stringify(all.json?.meta));
  const counts = await api(KADEP, "GET", "/thesis-change-requests/inbox?status=awaiting_decision");
  check("Kadep: Menunggu Keputusan Anda memuat langkah Ketua Departemen (Uji TA Tunggu Kadep)", counts.json?.counts?.awaitingDecision >= 1 && (counts.json?.data ?? []).some((row) => row.student?.name === "Uji TA Tunggu Kadep"), JSON.stringify(counts.json?.counts));
  const lecturerEval = await api(HUSNIL, "GET", "/thesis-guidance-evaluations/inbox");
  check("Evaluasi: pembimbing tidak punya tabel Evaluasi (403)", lecturerEval.status === 403, lecturerEval.status);
  const student = await api("ta_lancar", "GET", "/thesis-change-requests/inbox");
  check("mahasiswa ditolak (403)", student.status === 403, student.status);

  await prisma.thesisChangeRequest.deleteMany({ where: { reason: MARKER } });
  await prisma.thesisGuidanceEvaluation.deleteMany({ where: { notes: MARKER } });
});

await run("L2 tanggal persetujuan kesiapan dari seed", async () => {
  const passed = await myThesis("ta_lulus_seminar");
  const seminar = await api(HUSNIL, "GET", `/milestones/thesis/${passed.id}/seminar-readiness`);
  const dates = (seminar.data?.supervisors ?? []).map((s) => s.approvedAt);
  check("kartu seminar Uji TA Lulus Seminar: kedua persetujuan bertanggal", dates.length === 2 && dates.every(Boolean), JSON.stringify(dates));
  const ready = await prisma.user.findFirst({ where: { email: "ta_mon_siap_sidang@fti.unand.ac.id" }, select: { student: { select: { thesis: { select: { id: true } } } } } });
  const thesisId = ready?.student?.thesis?.[0]?.id;
  // Read as the student: the readiness status is for the student and the thesis supervisors.
  const defence = await api("ta_mon_siap_sidang", "GET", `/milestones/thesis/${thesisId}/defence-readiness`);
  const defenceDates = (defence.data?.supervisors ?? []).map((s) => s.approvedAt);
  check("kartu sidang Uji Mon Siap Daftar Sidang: kedua persetujuan bertanggal", defenceDates.length === 2 && defenceDates.every(Boolean), `${defence.status} ${JSON.stringify(defenceDates)}`);
});

await run("L3 bimbingan TA Selesai", async () => {
  const finished = await myThesis("test_selesai");
  check("my-thesis: status Selesai dengan tanggal selesai", finished?.status === "completed" && !!finished?.completedAt, `${finished?.status} ${finished?.completedAt}`);
  const list = await api("test_selesai", "GET", "/thesisGuidance/student/guidance");
  check("daftar sesi TA Selesai terbaca", list.status === 200 && Array.isArray(list.data?.items ?? list.json?.items), list.status);
});

await run("L6 pesan 404 berbahasa Indonesia", async () => {
  const missing = await api(HUSNIL, "GET", `/thesisGuidance/lecturer/my-students/${crypto.randomUUID()}`);
  check("detail mahasiswa yang tidak ada: 404 berbahasa Indonesia", missing.status === 404 && /tidak/i.test(missing.json?.message ?? "") && !/not found/i.test(missing.json?.message ?? ""), `${missing.status} ${missing.json?.message}`);
});

process.exit(summary() ? 1 : 0);
