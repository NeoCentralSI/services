// Paket E4: the API side of the UI polish of the thesis flow. Mutates central; run from
// app/backend after a clean seed with the seven seeders (see README):
//   node scripts/api-checks/e4-api.mjs
import { api, check, ids, login, run, summary } from "./lib-api.mjs";

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
  const milestones = await api("ta_dua_pembimbing", "GET", `/milestones/thesis/${thesis.id}`);
  check("milestone tetap terbaca", milestones.status === 200, milestones.status);

  const name = "Uji TA Dua Pembimbing";
  const failed = rowOf(await myStudents(HUSNIL, "failed"), name);
  check("Husnil: di filter Gagal, relasi saat TA ditutup", failed?.noLongerSupervising === false, failed && `${failed.supervisorStatus} ${failed.noLongerSupervising}`);
  check("Husnil: tidak di filter Aktif", !rowOf(await myStudents(HUSNIL, "active"), name), null);
});

process.exit(summary() ? 1 : 0);
