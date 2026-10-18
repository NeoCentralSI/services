// P9 API checks (Paket P9): the merged Penetapan panel of a semester (5), the Pembimbing 2 request
// to a full lecturer (3) as a row of Permohonan (4) and of the Penetapan panel, the semester
// flags set by the Admin and kept by the SIA sync until "Ikuti Data SIA" (8, K36), the student
// texts without technical terms (1.4), the lecturer catalog with offered topics (2), and the
// score parts of a final attempt. Mutates central; run from app/backend after a clean seed:
//   node scripts/api-checks/p9-api.mjs
import { api, check, run, summary, login, profileOf } from "./lib-api.mjs";

const prisma = (await import(process.cwd() + "/src/config/prisma.js")).default;
const { applySiaEnrollments } = await import(process.cwd() + "/src/services/research-method/eligibility.service.js");

const U = (key) => `prop_${key}`;
const AINA = "penguji_si", ULLYA = "gkm_si", HUSNIL = "pembimbing_si", KADEP = "kadep_si", SEKDEP = "sekdep_si", ADMIN = "admin_si";
const NOT_ELIGIBLE = "Anda belum terdaftar mengambil mata kuliah Metode Penelitian semester ini. Hubungi Admin Departemen bila ini keliru.";
const NO_DATA = "Data perkuliahan Anda semester ini belum tersedia. Hubungi Admin Departemen.";
const byNim = (rows, nim) => (rows ?? []).find((r) => (r.student?.identityNumber ?? r.identityNumber ?? r.studentNim) === nim);

let current, previous;
const NIM = { layak: "2211528001", departemen: "2211528007", atasKuota: "2211528006", ditetapkan: "2211528010", siapDinilai: "2211528013", lulus: "2211528015" };

await run("0 persiapan", async () => {
  for (const u of [AINA, ULLYA, HUSNIL, KADEP, SEKDEP, ADMIN]) await login(u);
  const op = (await import(process.cwd() + "/src/helpers/academicYear.helper.js")).resolveOperationalAcademicYear;
  current = await op();
  const years = await prisma.academicYear.findMany({ orderBy: { startDate: "desc" } });
  previous = years.find((y) => y.startDate < current.startDate);
  check("periode berjalan Ganjil 2026/2027", current?.semester === "ganjil" && current?.year === "2026/2027", [current?.year, current?.semester]);
});

await run("1 Penetapan: satu tabel per semester (butir 5)", async () => {
  const board = await api(KADEP, "GET", "/thesis-proposals/supervisor-assignments/board");
  const rows = board.data?.rows ?? [];
  const ids = new Set(rows.map((r) => r.studentId));
  check("satu baris per mahasiswa; semester berjalan", board.status === 200 && ids.size === rows.length && board.data?.academicYear?.isOperational === true, { n: rows.length, unique: ids.size });
  check("yang menunggu keputusan di atas: lewat departemen, lalu di atas kuota",
    rows[0]?.submission === "department_waiting" && rows[1]?.submission === "over_quota_waiting" && board.data?.counts?.waiting === 2,
    rows.slice(0, 3).map((r) => `${r.student?.identityNumber}:${r.submission}`));
  const oq = byNim(rows, NIM.atasKuota);
  check("di atas kuota: calon Pembimbing 1 Husnil 31/10, bila disetujui 32 (lebih 22)",
    oq?.candidate?.role === "Pembimbing 1" && oq?.candidate?.load?.activeCount === 31 && oq?.request?.lecturerLoad?.projectedCount === 32 && oq?.request?.lecturerLoad?.overBy === 22,
    { cand: oq?.candidate, load: oq?.request?.lecturerLoad });
  check("kohort 8 mahasiswa, 2 baru (Terbitkan Penetapan (2 baru)); kolom Penetapan Ditetapkan (versi 1) / Belum Ditetapkan",
    board.data?.counts?.cohort === 8 && board.data?.newCount === 2 && rows.filter((r) => r.assignment?.assigned).every((r) => r.assignment.version === 1) && rows.filter((r) => r.assignment?.inCohort && !r.assignment.assigned).length === 2,
    { cohort: board.data?.counts?.cohort, newCount: board.data?.newCount, versions: [...new Set(rows.map((r) => r.assignment?.version))] });
  const dinilai = byNim(rows, NIM.siapDinilai);
  check("baris berisi pembimbing (P1 dan P2), beban, dan proposal final", dinilai?.supervisors?.length === 2 && dinilai.supervisors.every((s) => s.load) && Boolean(dinilai?.proposal?.url), dinilai && { sup: dinilai.supervisors.map((s) => s.role), proposal: dinilai.proposal?.fileName });

  const sekdep = await api(SEKDEP, "GET", "/thesis-proposals/supervisor-assignments/board");
  const admin = await api(ADMIN, "GET", "/thesis-proposals/supervisor-assignments/board");
  const lecturer = await api(AINA, "GET", "/thesis-proposals/supervisor-assignments/board");
  check("Sekdep dan Admin membaca; dosen ditolak (403)", sekdep.status === 200 && admin.status === 200 && lecturer.status === 403, [sekdep.status, admin.status, lecturer.status]);
  const past = await api(KADEP, "GET", `/thesis-proposals/supervisor-assignments/board?academicYearId=${previous.id}`);
  check("semester lampau dapat dipilih (baca saja: isOperational false)", past.status === 200 && past.data?.academicYear?.isOperational === false, { status: past.status, rows: past.data?.rows?.length });
});

await run("2 Pembimbing 2 ke dosen penuh: Permohonan dan Penetapan (butir 3, 4)", async () => {
  const student = U("ditetapkan");
  const available = (await api(student, "GET", "/thesisGuidance/student/available-supervisors-2")).data ?? [];
  const husnilId = profileOf(HUSNIL);
  const husnil = available.find((l) => l.id === husnilId);
  check("dosen penuh (Husnil) tetap ada di daftar, lampu merah", husnil?.trafficLight === "red" && husnil?.acceptingRequests !== false, husnil && { tl: husnil.trafficLight, accepting: husnil.acceptingRequests });
  const sent = await api(student, "POST", "/thesisGuidance/student/request-supervisor-2", { lecturerId: husnilId });
  check("permintaan ke dosen penuh terkirim", sent.status === 200 || sent.status === 201, `${sent.status} ${sent.json?.message}`);

  const inbox = await api(HUSNIL, "GET", "/thesis-proposals/lecturer-inbox?page=1&pageSize=10");
  const row = (inbox.data ?? []).find((r) => r.kind === "supervisor2_request");
  check("Permohonan Husnil: Jenis Pembimbing 2 di baris pertama, Menunggu Persetujuan Anda, ikut hitungan menunggu",
    inbox.data?.[0]?.kind === "supervisor2_request" && row?.viewStatus === "awaiting_me" && row?.supervisor2Request?.studentNim === NIM.ditetapkan && inbox.json?.counts?.waitingSupervisor2 === 1,
    { first: inbox.data?.[0]?.kind, counts: inbox.json?.counts });
  const onlyP2 = await api(HUSNIL, "GET", "/thesis-proposals/lecturer-inbox?kind=supervisor2");
  const onlyRequests = await api(HUSNIL, "GET", "/thesis-proposals/lecturer-inbox?kind=supervisor_request");
  check("filter Jenis: Pembimbing 2 saja / Pengajuan Pembimbing tanpa Pembimbing 2",
    (onlyP2.data ?? []).length === 1 && (onlyRequests.data ?? []).every((r) => r.kind === "supervisor_request"),
    [(onlyP2.data ?? []).length, (onlyRequests.data ?? []).map((r) => r.kind).join()]);

  const approve = await api(HUSNIL, "PATCH", `/thesisGuidance/lecturer/supervisor2-requests/${row?.id}/approve`);
  check("Husnil bersedia: diteruskan ke Ketua Departemen", approve.status === 200, `${approve.status} ${approve.json?.message}`);
  const after = await api(HUSNIL, "GET", "/thesis-proposals/lecturer-inbox?kind=supervisor2");
  check("baris Pembimbing 2 hilang dari Permohonan Husnil", (after.data ?? []).length === 0, (after.data ?? []).length);

  const board = (await api(KADEP, "GET", "/thesis-proposals/supervisor-assignments/board")).data;
  const p2row = byNim(board?.rows, NIM.ditetapkan);
  check("Penetapan: baris mahasiswa itu Pembimbing 2 · Menunggu Keputusan, calon Husnil penuh, setelah dua baris lain yang menunggu",
    p2row?.submission === "supervisor2_waiting" && p2row?.candidate?.role === "Pembimbing 2" && p2row?.candidate?.load?.level === "full" && board?.rows?.[2]?.studentId === p2row?.studentId && board?.counts?.waiting === 3,
    p2row && { sub: p2row.submission, cand: p2row.candidate, third: board?.rows?.[2]?.student?.identityNumber });
  const decided = await api(KADEP, "POST", `/thesisGuidance/kadep/supervisor2-requests/${p2row?.supervisor2Request?.requestId}/approve`);
  check("Kadep menyetujui Pembimbing 2", decided.status === 200, `${decided.status} ${decided.json?.message}`);
  const board2 = (await api(KADEP, "GET", "/thesis-proposals/supervisor-assignments/board")).data;
  const done = byNim(board2?.rows, NIM.ditetapkan);
  check("baris kembali Disetujui dengan P1 dan P2; penetapan perlu terbit ulang",
    done?.submission === "approved" && done?.supervisors?.map((s) => s.role).join() === "Pembimbing 1,Pembimbing 2" && board2?.needsIssue === true,
    done && { sub: done.submission, sup: done.supervisors.map((s) => s.role), needsIssue: board2?.needsIssue });
});

await run("3 penanda per semester oleh Admin (butir 8, K36)", async () => {
  const user = await prisma.user.findFirst({ where: { identityNumber: NIM.layak }, select: { id: true } });
  const detail = await api(ADMIN, "GET", `/adminfeatures/students/${user.id}`);
  const years = await prisma.academicYear.count();
  const flagsNow = (detail.data?.student?.semesterFlags ?? []).find((f) => f.academicYearId === current.id);
  check("detail mahasiswa: setiap semester ada; penanda semester berjalan dari SIA",
    detail.data?.student?.semesterFlags?.length === years && flagsNow?.takingResearchMethod === true && flagsNow?.researchMethodSource === "sia",
    { n: detail.data?.student?.semesterFlags?.length, years, now: flagsNow });

  const forbidden = await Promise.all([SEKDEP, KADEP].map((u) => api(u, "PATCH", `/adminfeatures/students/${user.id}/period-flags/${current.id}`, { eligibleResearchMethod: false })));
  check("hanya Admin yang mengubah (Sekdep, Kadep 403)", forbidden.every((r) => r.status === 403), forbidden.map((r) => r.status));
  const bad = await api(ADMIN, "PATCH", `/adminfeatures/students/${user.id}/period-flags/${current.id}`, { eligibleResearchMethod: "ya" });
  check("nilai selain Ya/Tidak/kosong ditolak (400)", bad.status === 400, `${bad.status} ${bad.json?.message}`);

  const set = await api(ADMIN, "PATCH", `/adminfeatures/students/${user.id}/period-flags/${current.id}`, { eligibleResearchMethod: false });
  check("Admin: Mengambil Metode Penelitian = Tidak, sumber admin", set.status === 200 && set.data?.eligibleResearchMethod === false && set.data?.eligibilitySource === "admin", `${set.status} ${set.json?.message}`);
  const mine = (await api(U("layak"), "GET", "/thesis-proposals/me/supervisor-requests")).data?.submission;
  check("mahasiswa membaca pesan tanpa istilah teknis", mine?.canSubmit === false && mine?.blockedReason === NOT_ELIGIBLE, mine?.blockedReason);

  const sync = await applySiaEnrollments(current.id, [{ nim: NIM.layak, takesResearchMethod: true, takesThesis: false }]);
  const kept = await prisma.studentAcademicYearSnapshot.findUnique({ where: { studentId_academicYearId: { studentId: user.id, academicYearId: current.id } } });
  check("sinkronisasi SIA tidak menimpa isian Admin (dipertahankan 1); penanda lain tetap ditulis",
    sync.keptAdmin === 1 && kept?.eligibleResearchMethod === false && kept?.eligibilitySource === "admin" && kept?.takingThesisCourse === false && kept?.thesisCourseSource === "sia",
    { sync, kept: kept && [kept.eligibleResearchMethod, kept.eligibilitySource, kept.takingThesisCourse, kept.thesisCourseSource] });

  const follow = await api(ADMIN, "POST", `/adminfeatures/students/${user.id}/period-flags/${current.id}/follow-sia`);
  const back = await prisma.studentAcademicYearSnapshot.findUnique({ where: { studentId_academicYearId: { studentId: user.id, academicYearId: current.id } } });
  check("Ikuti Data SIA: sumber kembali sia (nilai dari SIA bila SIA terjangkau)", follow.status === 200 && back?.eligibilitySource === "sia", { status: follow.status, fromSia: follow.data?.fromSia, message: follow.json?.message, value: back?.eligibleResearchMethod });
  await applySiaEnrollments(current.id, [{ nim: NIM.layak, takesResearchMethod: true, takesThesis: false }]);
  const synced = await prisma.studentAcademicYearSnapshot.findUnique({ where: { studentId_academicYearId: { studentId: user.id, academicYearId: current.id } } });
  const again = (await api(U("layak"), "GET", "/thesis-proposals/me/supervisor-requests")).data?.submission;
  check("sinkronisasi berikutnya kembali menulis nilai SIA; mahasiswa boleh mengajukan lagi", synced?.eligibleResearchMethod === true && again?.canSubmit === true, { value: synced?.eligibleResearchMethod, canSubmit: again?.canSubmit });

  const cleared = await api(ADMIN, "PATCH", `/adminfeatures/students/${user.id}/period-flags/${current.id}`, { eligibleResearchMethod: null });
  const empty = (await api(U("layak"), "GET", "/thesis-proposals/me/supervisor-requests")).data?.submission;
  check("Admin mengosongkan penanda: pesan Data perkuliahan belum tersedia", cleared.status === 200 && empty?.blockedReason === NO_DATA, empty?.blockedReason);
  await api(ADMIN, "PATCH", `/adminfeatures/students/${user.id}/period-flags/${current.id}`, { eligibleResearchMethod: true });

  const audit = await prisma.auditLog.count({ where: { action: { in: ["STUDENT_PERIOD_FLAGS_SET", "STUDENT_PERIOD_FLAGS_FOLLOW_SIA"] }, entityId: user.id } });
  check("perubahan Admin dan Ikuti Data SIA tercatat di log audit", audit >= 4, audit);
});

await run("4 katalog dosen dan nilai mahasiswa (butir 2)", async () => {
  const catalog = (await api(U("layak"), "GET", "/thesis-proposals/catalog")).data ?? [];
  // The seed's topics are department topics (no lecturer), so the catalog shows the topics of the
  // theses a lecturer supervises until the lecturer offers topics of their own.
  check("katalog: setiap dosen membawa kelompok keilmuan, topik yang ditawarkan (daftar), dan topik bimbingannya",
    catalog.length > 0 && catalog.every((c) => Array.isArray(c.offeredTopics) && Array.isArray(c.supervisedTopics)) && catalog.some((c) => c.supervisedTopics.length > 0 && c.scienceGroup?.name),
    catalog.slice(0, 3).map((c) => `${c.fullName}:${c.scienceGroup?.name}:${c.offeredTopics?.length}/${c.supervisedTopics?.length}`));
  const lulus = (await api(U("lulus_tunggu_krs"), "GET", "/thesis-proposals/me")).data?.finalProposal;
  const attempt = [lulus?.current, ...(lulus?.history ?? [])].find((a) => a?.isFinalized);
  check("percobaan final: nilai pembimbing + koordinator = nilai akhir",
    attempt && attempt.supervisorScore != null && attempt.coordinatorScore != null && attempt.supervisorScore + attempt.coordinatorScore === attempt.finalScore,
    attempt && `${attempt.supervisorScore} + ${attempt.coordinatorScore} = ${attempt.finalScore}`);
  const pending = (await api(U("siap_dinilai"), "GET", "/thesis-proposals/me")).data?.finalProposal?.current;
  check("percobaan belum final: nilai bagian tidak dikirim", pending && pending.supervisorScore === null && pending.coordinatorScore === null, pending && [pending.supervisorScore, pending.coordinatorScore]);
});

await run("5 batas semester di Penetapan → Beban Dosen (K30)", async () => {
  const set = await api(SEKDEP, "PUT", `/supervision-quotas/periods/${current.id}`, { softLimit: 6, hardLimit: 12 });
  const overview = (await api(KADEP, "GET", `/supervision-quotas?academicYearId=${current.id}`)).data;
  check("Sekdep mengatur batas semester ini; tampil sebagai batas yang berlaku", set.status === 200 && overview?.period?.hardLimit === 12 && overview?.applicable?.source === "period", { status: set.status, applicable: overview?.applicable });
  const clear = await api(KADEP, "DELETE", `/supervision-quotas/periods/${current.id}`);
  const back = (await api(KADEP, "GET", `/supervision-quotas?academicYearId=${current.id}`)).data;
  check("Kembalikan ke Batas Umum: batas umum 8/10 berlaku lagi", clear.status === 200 && back?.period === null && back?.applicable?.hardLimit === 10 && back?.applicable?.source === "general", back?.applicable);
});

const failed = summary();
await prisma.$disconnect();
process.exit(failed ? 1 : 0);
