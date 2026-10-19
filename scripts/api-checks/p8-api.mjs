// API checks: the numbers a clean seed shows, the
// proposal milestone templates managed by Sekdep only, CPMK and rubrics
// written by Sekdep only with "Salin Template" from another period and the minimum score of a
// period, Batas Bimbingan for Kadep and Sekdep only, and milestone templates in two
// phases. Mutates central; run from app/backend after a clean seed (see README):
//   node scripts/api-checks/p8-api.mjs
import { api, check, run, summary, login } from "./lib-api.mjs";

const prisma = (await import(process.cwd() + "/src/config/prisma.js")).default;

const U = (key) => `prop_${key}`;
const AINA = "penguji_si", ULLYA = "gkm_si", HUSNIL = "pembimbing_si", KADEP = "kadep_si", SEKDEP = "sekdep_si", ADMIN = "admin_si";
const myThesis = async (who) => (await api(who, "GET", "/thesisGuidance/student/my-thesis")).data?.thesis;
const byNim = (rows, nim) => (rows ?? []).find((r) => (r.student?.identityNumber ?? r.identityNumber ?? r.studentNim) === nim);

let current, previous;

await run("0 persiapan", async () => {
  for (const u of [AINA, ULLYA, HUSNIL, KADEP, SEKDEP, ADMIN]) await login(u);
  const years = await prisma.academicYear.findMany({ orderBy: { startDate: "desc" } });
  const op = (await import(process.cwd() + "/src/helpers/academicYear.helper.js")).resolveOperationalAcademicYear;
  current = await op();
  previous = years.find((y) => y.startDate < current.startDate);
  check("periode berjalan Ganjil 2026/2027 dan periode lalu Genap 2025/2026", current?.semester === "ganjil" && current?.year === "2026/2027" && previous?.semester === "genap", [current?.year, current?.semester, previous?.year, previous?.semester]);
});

await run("1 angka panduan pada hari seed (GET saja)", async () => {
  const catalog = await api(U("layak"), "GET", "/thesis-proposals/catalog");
  const load = (name) => (catalog.data ?? []).find((c) => (c.fullName ?? "").toUpperCase().includes(name));
  check("katalog: Husnil 31/10 penuh, Afriyanti 18/10 penuh, Aina 9/10 mendekati batas, Ullya 7/10 tersedia",
    load("HUSNIL")?.activeCount === 31 && load("HUSNIL")?.level === "full" && load("AFRIYANTI")?.activeCount === 18 && load("AINA")?.activeCount === 9 && load("AINA")?.level === "near_limit" && load("ULLYA")?.activeCount === 7 && load("HUSNIL")?.hardLimit === 10,
    ["HUSNIL", "AFRIYANTI", "AINA", "ULLYA"].map((n) => `${n}:${load(n)?.activeCount}/${load(n)?.hardLimit}:${load(n)?.level}`));

  const queue = (await api(KADEP, "GET", "/thesis-proposals/supervisor-requests/kadep-queue")).data;
  check("antrean Kadep: 1 lewat departemen, 1 di atas kuota (Husnil 31 → 32, lebih 22)",
    queue?.department?.length === 1 && queue?.overQuota?.length === 1 && queue.overQuota[0].lecturerLoad?.projectedCount === 32 && queue.overQuota[0].lecturerLoad?.overBy === 22,
    { dep: queue?.department?.length, oq: queue?.overQuota?.map((r) => r.lecturerLoad) });

  const assignment = (await api(KADEP, "GET", "/thesis-proposals/supervisor-assignments")).data;
  const inBatch = (assignment?.entries ?? []).filter((e) => e.inCurrentBatch).length;
  check("susunan Penetapan Ganjil 2026/2027: 8 mahasiswa, 6 di versi 1, 2 baru; perlu terbit ulang",
    assignment?.entries?.length === 8 && inBatch === 6 && assignment?.newCount === 2 && assignment?.upToDate === false && assignment?.currentBatch?.version === 1,
    { n: assignment?.entries?.length, inBatch, newCount: assignment?.newCount, v: assignment?.currentBatch?.version });

  const templates = (await api(SEKDEP, "GET", "/research-method/milestone-templates")).data ?? [];
  check("empat template milestone proposal umum, berurutan",
    templates.map((t) => t.name).join(" | ") === "Latar Belakang dan Rumusan Masalah | Tinjauan Pustaka | Metodologi Penelitian | Proposal Lengkap",
    templates.map((t) => `${t.orderIndex}:${t.name}:${t.usedCount}`));

  const cpmkNow = (await api(SEKDEP, "GET", `/research-method/cpmks?academicYearId=${current.id}`)).data ?? [];
  const cpmkPrev = (await api(SEKDEP, "GET", `/research-method/cpmks?academicYearId=${previous.id}`)).data ?? [];
  const weight = (await api(SEKDEP, "GET", `/research-method/weight-summary?academicYearId=${current.id}`)).data;
  check("CPMK semester berjalan dan semester lalu terisi; bobot pembimbing 75 + koordinator 25 = 100",
    cpmkNow.length > 0 && cpmkPrev.length > 0 && weight?.supervisorTotal === 75 && weight?.coordinatorTotal === 25 && weight?.totalScore === 100,
    { now: cpmkNow.length, prev: cpmkPrev.length, w: weight && `${weight.supervisorTotal}+${weight.coordinatorTotal}` });
  const form = (await api(SEKDEP, "GET", `/research-method/assessments/form?party=supervisor&academicYearId=${current.id}`)).data;
  check("nilai minimum lulus semester berjalan 60", form?.minimumScore === 60, form?.minimumScore);

  const attendance = (await api(HUSNIL, "GET", `/research-method/attendance-imports?academicYearId=${current.id}`)).data;
  const totals = attendance?.current?.totals;
  const kurang = byNim(attendance?.current?.records, "2211528012");
  check("presensi berlaku: kelas A, 9 baris, 8 cocok, 1 tidak dikenal; Presensi Kurang di bawah 75%",
    attendance?.current?.classCode === "A" && totals?.totalRows === 9 && totals?.matchedRows === 8 && totals?.unmatchedRows === 1 && kurang?.isEligible === false,
    { totals, kurang: kurang && `${kurang.presentCount}/${kurang.totalMeetings}` });

  const monitoring = (await api(HUSNIL, "GET", `/research-method/monitoring?academicYearId=${current.id}`)).data?.summary;
  check("Monitoring Kelas: Peserta 15, Punya Pembimbing 9, Ditetapkan 7, Proposal Final 5, Nilai Final 2, Lulus 1, Tidak Lulus 1, Naik 0",
    monitoring && [monitoring.total, monitoring.withSupervisor, monitoring.assigned, monitoring.finalProposal, monitoring.finalized, monitoring.passed, monitoring.failed, monitoring.promoted].join(",") === "15,9,7,5,2,1,1,0",
    monitoring);

  // The scheduled promotion would move exactly this one test account up.
  const preview = (await api(HUSNIL, "GET", "/research-method/promotions")).data?.rows ?? [];
  check("proses kelulusan pada hari seed: hanya Uji Proposal Siap Naik yang naik; Lulus Tunggu KRS menunggu periode berikutnya",
    preview.filter((r) => r.decision === "promote").map((r) => r.student?.identityNumber).join() === "2211528016" && byNim(preview, "2211528015")?.decision === "wait_next_period",
    preview.map((r) => `${r.student?.identityNumber}:${r.decision}`));
});

await run("2 Batas Bimbingan hanya Kadep dan Sekdep", async () => {
  const sekdep = await api(SEKDEP, "PUT", "/supervision-quotas/general", { softLimit: 8, hardLimit: 10 });
  const admin = await api(ADMIN, "PUT", "/supervision-quotas/general", { softLimit: 9, hardLimit: 11 });
  check("Sekdep menyimpan batas umum; Admin ditolak 403", sekdep.status === 200 && admin.status === 403, `${sekdep.status} ${admin.status}`);
});

await run("3 template milestone proposal: hanya Sekdep", async () => {
  const student = await api(U("ditetapkan"), "GET", "/research-method/milestone-templates");
  const kadep = await api(KADEP, "POST", "/research-method/milestone-templates", { name: "Template Kadep" });
  check("mahasiswa tidak membuka pengelolaan, Kadep tidak menambah (403)", student.status === 403 && kadep.status === 403, `${student.status} ${kadep.status}`);
  const coordAdd = await api(HUSNIL, "POST", "/research-method/milestone-templates", { name: "Template koordinator", orderIndex: 0 });
  const anyId = ((await api(SEKDEP, "GET", "/research-method/milestone-templates")).data ?? [])[0]?.id;
  const coordEdit = await api(HUSNIL, "PATCH", `/research-method/milestone-templates/${anyId}`, { isActive: false });
  const coordDel = await api(HUSNIL, "DELETE", `/research-method/milestone-templates/${anyId}`);
  check("koordinator tidak menambah, mengubah, maupun menghapus template (403)", coordAdd.status === 403 && coordEdit.status === 403 && coordDel.status === 403, `${coordAdd.status} ${coordEdit.status} ${coordDel.status}`);
  const add = await api(SEKDEP, "POST", "/research-method/milestone-templates", { name: "Ringkasan Eksekutif", description: "Ringkasan satu halaman.", orderIndex: 0, isActive: false });
  check("Sekdep menambah template dengan urutan dari form, bisa nonaktif", add.status === 201 && add.data?.orderIndex === 0 && add.data?.isActive === false && add.data?.topicId === null && add.data?.phase === "proposal", `${add.status} ${add.data?.orderIndex} ${add.json?.message ?? ""}`);
  const noOrder = await api(SEKDEP, "POST", "/research-method/milestone-templates", { name: "Lampiran Proposal" });
  check("tanpa urutan: ditaruh setelah yang terakhir", noOrder.status === 201 && noOrder.data?.orderIndex === 4, noOrder.data?.orderIndex);
  const edit = await api(SEKDEP, "PATCH", `/research-method/milestone-templates/${add.data?.id}`, { orderIndex: 5, isActive: true });
  check("Sekdep mengubah urutan dan mengaktifkan", edit.status === 200 && edit.data?.orderIndex === 5 && edit.data?.isActive === true, `${edit.status} ${edit.json?.message ?? ""}`);
  const bad = await api(SEKDEP, "PATCH", `/research-method/milestone-templates/${add.data?.id}`, { orderIndex: -1 });
  check("urutan negatif ditolak 400", bad.status === 400, bad.json?.details?.[0]?.message ?? bad.json?.message);
  const ids = ((await api(SEKDEP, "GET", "/research-method/milestone-templates")).data ?? []).map((t) => t.id);
  const reordered = [ids.at(-1), ...ids.slice(0, -1)];
  const coordOrder = await api(HUSNIL, "PATCH", "/research-method/milestone-templates/reorder", { templateIds: reordered });
  const ro = await api(SEKDEP, "PATCH", "/research-method/milestone-templates/reorder", { templateIds: reordered });
  check("Sekdep menyimpan urutan (Atur Urutan); koordinator 403", ro.status === 200 && ro.data?.[0]?.id === reordered[0] && coordOrder.status === 403, `${ro.status} ${coordOrder.status}`);
  const del1 = await api(SEKDEP, "DELETE", `/research-method/milestone-templates/${add.data?.id}`);
  const del2 = await api(SEKDEP, "DELETE", `/research-method/milestone-templates/${noOrder.data?.id}`);
  const after = (await api(SEKDEP, "GET", "/research-method/milestone-templates")).data ?? [];
  check("hapus satu per satu (Hapus terpilih memanggilnya berurutan); tinggal empat", del1.status === 200 && del2.status === 200 && after.length === 4, after.length);
  const studentTemplates = (await api(U("ditetapkan"), "GET", "/milestones/templates?phase=proposal")).data ?? [];
  check("mahasiswa tetap membaca template untuk Buat dari Template", studentTemplates.length === 4, studentTemplates.length);
});

await run("4 CPMK dan rubrik: Sekdep saja, salin dari periode lain", async () => {
  const read = await api(HUSNIL, "GET", `/research-method/cpmks?academicYearId=${current.id}`);
  const cpmk = await api(HUSNIL, "POST", "/research-method/cpmks", { academicYearId: current.id, code: "CPMK-09", description: "Percobaan koordinator menambah CPMK" });
  const firstCpmk = read.data?.[0];
  const criteria = await api(HUSNIL, "POST", "/research-method/criteria?assessor=coordinator", { researchMethodCpmkId: firstCpmk?.id, name: "Kriteria koordinator", maxScore: 1 });
  const minimum = await api(HUSNIL, "PATCH", `/research-method/academic-years/${current.id}/minimum-score`, { minimumScore: 70 });
  check("koordinator membaca CPMK, tetapi tidak menulis CPMK, kriteria, maupun nilai minimum (403)",
    read.status === 200 && cpmk.status === 403 && criteria.status === 403 && minimum.status === 403,
    `${read.status} ${cpmk.status} ${criteria.status} ${minimum.status}`);

  const empty = await prisma.academicYear.findFirst({ where: { researchMethodCpmks: { none: {} }, id: { notIn: [current.id, previous.id] } }, orderBy: { startDate: "desc" } });
  check("ada periode tanpa CPMK Metode Penelitian untuk tujuan salin", Boolean(empty), empty && `${empty.semester} ${empty.year}`);
  const same = await api(SEKDEP, "POST", "/research-method/cpmks/copy-template", { sourceAcademicYearId: current.id, targetAcademicYearId: current.id });
  const filled = await api(SEKDEP, "POST", "/research-method/cpmks/copy-template", { sourceAcademicYearId: previous.id, targetAcademicYearId: current.id });
  const coord = await api(HUSNIL, "POST", "/research-method/cpmks/copy-template", { sourceAcademicYearId: current.id, targetAcademicYearId: empty?.id });
  check("salin ditolak: periode sama (400), tujuan sudah ber-CPMK (400), koordinator (403)",
    same.status === 400 && filled.status === 400 && /sudah memiliki CPMK/.test(filled.json?.message ?? "") && coord.status === 403,
    `${same.status} ${filled.status} ${filled.json?.message ?? ""} ${coord.status}`);

  const sourceCpmks = await prisma.researchMethodCpmk.findMany({
    where: { academicYearId: current.id },
    include: { supervisorAssessmentCriterias: { include: { assessmentRubrics: true } }, coordinatorAssessmentCriterias: { include: { assessmentRubrics: true } } },
  });
  const count = (key) => sourceCpmks.reduce((n, c) => n + c[key].length, 0);
  const rubrics = (key) => sourceCpmks.reduce((n, c) => n + c[key].reduce((m, k) => m + k.assessmentRubrics.length, 0), 0);
  const copy = await api(SEKDEP, "POST", "/research-method/cpmks/copy-template", { sourceAcademicYearId: current.id, targetAcademicYearId: empty?.id });
  check("Sekdep menyalin CPMK, kriteria, dan rubrik kedua pihak ke periode kosong",
    copy.status === 201 && copy.data?.cpmk === sourceCpmks.length && copy.data?.supervisorCriteria === count("supervisorAssessmentCriterias") && copy.data?.coordinatorCriteria === count("coordinatorAssessmentCriterias")
      && copy.data?.supervisorRubrics === rubrics("supervisorAssessmentCriterias") && copy.data?.coordinatorRubrics === rubrics("coordinatorAssessmentCriterias"),
    { got: copy.data, status: copy.status });
  const targetWeight = (await api(SEKDEP, "GET", `/research-method/weight-summary?academicYearId=${empty?.id}`)).data;
  check("bobot periode tujuan sama: 75 + 25 = 100", targetWeight?.supervisorTotal === 75 && targetWeight?.coordinatorTotal === 25, targetWeight && `${targetWeight.supervisorTotal}+${targetWeight.coordinatorTotal}`);
  const again = await api(SEKDEP, "POST", "/research-method/cpmks/copy-template", { sourceAcademicYearId: current.id, targetAcademicYearId: empty?.id });
  check("salin kedua kali ke periode yang sama ditolak 400", again.status === 400, again.json?.message);

  const setMin = await api(SEKDEP, "PATCH", `/research-method/academic-years/${empty?.id}/minimum-score`, { minimumScore: 65 });
  const targetForm = (await api(SEKDEP, "GET", `/research-method/assessments/form?party=supervisor&academicYearId=${empty?.id}`)).data;
  const currentForm = (await api(SEKDEP, "GET", `/research-method/assessments/form?party=supervisor&academicYearId=${current.id}`)).data;
  check("nilai minimum diatur per periode di tab Rubrik (65); periode berjalan tetap 60", setMin.status === 200 && targetForm?.minimumScore === 65 && currentForm?.minimumScore === 60, `${setMin.status} ${targetForm?.minimumScore} ${currentForm?.minimumScore}`);
});

await run("5 template milestone di dua fase", async () => {
  const before = await myThesis(U("siap_naik"));
  check("Uji Proposal Siap Naik: fase proposal terbuka, belum ada milestone", before?.currentPhase === "proposal" && before?.proposalPhaseOpen === true, { phase: before?.currentPhase, open: before?.proposalPhaseOpen });
  const tpl = (await api(U("siap_naik"), "GET", "/milestones/templates?phase=proposal")).data ?? [];
  check("fase proposal: template umum (tanpa topik) yang ditawarkan", tpl.length === 4 && tpl.every((t) => t.phase === "proposal" && !t.topicId), tpl.length);
  const made = await api(U("siap_naik"), "POST", `/milestones/thesis/${before?.id}/from-templates`, { templateIds: tpl.map((t) => t.id) });
  check("Buat dari Template di fase proposal: 4 milestone", made.status < 300 && (made.data ?? []).length === 4, `${made.status} ${made.json?.message ?? ""}`);

  const promote = await api(KADEP, "POST", "/research-method/promotions/run");
  check("proses kelulusan menaikkan Uji Proposal Siap Naik", promote.status === 200 && promote.data?.promoted?.some((r) => r.student?.identityNumber === "2211528016"), promote.data?.promoted?.length);
  const after = await myThesis(U("siap_naik"));
  const research = await api(U("siap_naik"), "GET", `/milestones/thesis/${after?.id}`);
  check("setelah naik: fase berjalan Penelitian, daftar milestone penelitian kosong dan bisa diubah",
    after?.currentPhase === "research" && research.json?.phase === "research" && (research.data ?? []).length === 0 && research.json?.readOnlyReason === null,
    { phase: after?.currentPhase, n: (research.data ?? []).length, ro: research.json?.readOnlyReason });
  const proposal = await api(U("siap_naik"), "GET", `/milestones/thesis/${after?.id}?phase=proposal`);
  check("milestone proposal tetap tampil baca-saja (fase Proposal)", (proposal.data ?? []).length === 4 && (proposal.data ?? []).every((m) => m.phase === "proposal") && /Fase proposal sudah selesai/.test(proposal.json?.readOnlyReason ?? ""), proposal.json?.readOnlyReason);

  const thesis = await prisma.thesis.findUnique({ where: { id: after?.id }, select: { thesisTopicId: true, thesisTopic: { select: { name: true } } } });
  const topicTemplates = await prisma.thesisMilestoneTemplate.findMany({ where: { phase: "research", isActive: true, topicId: thesis?.thesisTopicId } });
  const offered = (await api(U("siap_naik"), "GET", "/milestones/templates?phase=research")).data ?? [];
  check("fase penelitian: template sesuai topik TA ditawarkan", topicTemplates.length > 0 && topicTemplates.every((t) => offered.some((o) => o.id === t.id)), `${thesis?.thesisTopic?.name}: ${topicTemplates.length}`);
  const apply = await api(U("siap_naik"), "POST", `/milestones/thesis/${after?.id}/from-templates`, { templateIds: topicTemplates.map((t) => t.id) });
  check("Buat dari Template di fase penelitian berhasil walau milestone proposal ada", apply.status < 300 && (apply.data ?? []).length === topicTemplates.length && (apply.data ?? []).every((m) => m.phase === "research"), `${apply.status} ${apply.json?.message ?? ""}`);
  const again = await api(U("siap_naik"), "POST", `/milestones/thesis/${after?.id}/from-templates`, { templateIds: [topicTemplates[0]?.id] });
  check("template penelitian tidak bisa dipasang dua kali", again.status === 400, again.json?.message);
  const editOld = await api(U("siap_naik"), "PATCH", `/milestones/${proposal.data?.[0]?.id}`, { title: "Diubah" });
  check("mengubah milestone proposal setelah naik ditolak 403", editOld.status === 403, `${editOld.status} ${editOld.json?.message ?? ""}`);
});

const failed = summary();
await prisma.$disconnect();
process.exit(failed ? 1 : 0);
