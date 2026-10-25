// Logic of Seminar Hasil, Sidang and Yudisium: a student who does not take the Tugas Akhir course
// this semester is blocked from the TA actions (reading, revisions and yudisium stay open), the
// graduation predicate is computed, archives are ordered by the held date, Pembimbing 1 comes
// first, and "Tim Pengelola CPL" is gone. Run on a clean seed (nine seeders); it writes data.
import crypto from "crypto";
import { api, check, run, summary } from "./lib-api.mjs";

const prisma = (await import(process.cwd() + "/src/config/prisma.js")).default;
const ADMIN = "admin_si";
const BLOCKED = "ta_demo_tidak_ambil_ta";
const REASON = "Anda tidak tercatat mengambil mata kuliah Tugas Akhir semester ini";
const userOf = (email) => prisma.user.findFirst({ where: { email: `${email}@fti.unand.ac.id` }, select: { id: true } });

await run("1 tidak mengambil Tugas Akhir semester ini", async () => {
  const student = await userOf(BLOCKED);
  const thesis = await prisma.thesis.findFirst({ where: { studentId: student.id }, include: { thesisSupervisors: true } });
  const detail = await api(BLOCKED, "GET", "/thesisGuidance/student/my-thesis");
  check("detail TA menyebut alasan blokir", detail.data?.thesis?.actionBlock?.code === "not_taking_thesis" || detail.json?.thesis?.actionBlock?.code === "not_taking_thesis", detail.data?.thesis?.actionBlock ?? detail.json?.thesis?.actionBlock);
  const guidance = await api(BLOCKED, "POST", "/thesisGuidance/student/guidance/request", { supervisorId: thesis.thesisSupervisors[0].lecturerId, guidanceDate: new Date(Date.now() + 3 * 86400000).toISOString(), studentNotes: "uji", duration: 60, milestoneIds: [crypto.randomUUID()] });
  check("ajukan bimbingan ditolak", guidance.status === 403 && (guidance.json?.message ?? "").includes(REASON), guidance.json?.message);
  const milestone = await api(BLOCKED, "POST", `/milestones/thesis/${thesis.id}`, { title: "BAB I - Pendahuluan" });
  check("tambah milestone ditolak", milestone.status === 403 && (milestone.json?.message ?? "").includes(REASON), milestone.json?.message);
  const form = new FormData();
  form.append("file", new Blob([Buffer.from("%PDF-1.4 uji")], { type: "application/pdf" }), "syarat.pdf");
  form.append("requirementId", "x");
  const seminar = await api(BLOCKED, "POST", "/thesis-seminars/active/documents", undefined, { form });
  check("daftar seminar (unggah dokumen) ditolak", seminar.status === 403 && (seminar.json?.message ?? "").includes(REASON), seminar.json?.message);
  const change = await api(BLOCKED, "POST", "/thesis-change-requests", { requestType: "title", newTitle: "Judul baru untuk uji tameng mata kuliah", reason: "Uji tameng mata kuliah Tugas Akhir" });
  check("ajukan perubahan TA ditolak", change.status === 403 && (change.json?.message ?? "").includes(REASON), change.json?.message);
  const overview = await api(BLOCKED, "GET", "/thesis-seminars/me/overview");
  check("syarat seminar: baris mata kuliah TA dengan alasannya", overview.data?.checklist?.mataKuliahTa?.met === false && overview.data.checklist.mataKuliahTa.reason?.includes(REASON) && overview.data.canUpload === false, overview.data?.checklist?.mataKuliahTa);
  const defence = await api(BLOCKED, "GET", "/thesis-defences/me/overview");
  check("syarat sidang: baris mata kuliah TA", defence.data?.checklist?.mataKuliahTa?.met === false, defence.data?.checklist?.mataKuliahTa);
  const reading = await api(BLOCKED, "GET", `/milestones/thesis/${thesis.id}`);
  check("tampilan baca tetap terbuka", reading.status === 200, reading.status);

  const taking = await api("ta_demo_siap_seminar", "GET", "/thesis-seminars/me/overview");
  check("akun demo tercatat mengambil TA", taking.data?.checklist?.mataKuliahTa?.met === true && taking.data.allChecklistMet === true, taking.data?.checklist?.mataKuliahTa);
  const revision = await api("ta_demo_seminar_revisi", "GET", "/thesis-seminars/me/overview");
  const revisionList = await api("ta_demo_seminar_revisi", "GET", `/thesis-seminars/${revision.data?.seminar?.id}/revisions`);
  check("revisi seminar tetap bisa diakses", revisionList.status === 200, revisionList.status);
  const yudisium = await api("ta_demo_yudisium_cpl_kurang", "GET", "/yudisiums/me/overview");
  check("yudisium tidak terpengaruh (TA Selesai)", yudisium.status === 200 && yudisium.data?.participantStatus === "registered", yudisium.data?.participantStatus);

  // "Not known yet" blocks like the proposal shield.
  const year = await prisma.academicYear.findFirst({ where: { isActive: true } });
  await prisma.studentAcademicYearSnapshot.update({ where: { studentId_academicYearId: { studentId: student.id, academicYearId: year.id } }, data: { takingThesisCourse: null } });
  const unknown = await api(BLOCKED, "POST", `/milestones/thesis/${thesis.id}`, { title: "BAB I - Pendahuluan" });
  check("belum diketahui juga ditolak, seperti tameng proposal", unknown.status === 403 && (unknown.json?.message ?? "").includes("Data perkuliahan Anda semester ini belum tersedia"), unknown.json?.message);
  await prisma.studentAcademicYearSnapshot.update({ where: { studentId_academicYearId: { studentId: student.id, academicYearId: year.id } }, data: { takingThesisCourse: true } });
  const allowed = await api(BLOCKED, "POST", `/milestones/thesis/${thesis.id}`, { title: "BAB VI - Lampiran" });
  check("setelah ditandai mengambil TA: milestone bisa ditambah", allowed.status < 300, allowed.status);
  await prisma.studentAcademicYearSnapshot.update({ where: { studentId_academicYearId: { studentId: student.id, academicYearId: year.id } }, data: { takingThesisCourse: false } });
});

await run("2 predikat otomatis", async () => {
  const student = await userOf("ta_demo_siap_yudisium");
  const cases = [[3.8, "Sangat Memuaskan"], [3.2, "Sangat Memuaskan"], [2.9, "Memuaskan"], [2.5, null]];
  for (const [gpa, expected] of cases) {
    await api(ADMIN, "PATCH", `/adminfeatures/students/${student.id}`, { gpa, graduationPredicate: "Dengan Pujian" });
    const detail = await api(ADMIN, "GET", `/adminfeatures/students/${student.id}`);
    const predicate = detail.data?.student?.graduationPredicate ?? detail.json?.data?.student?.graduationPredicate ?? null;
    check(`IPK ${gpa}, angkatan 2022, semester aktif ke-9 → ${expected ?? "tanpa predikat"} (isian Admin diabaikan)`, predicate === expected, predicate);
  }
  await prisma.student.update({ where: { id: student.id }, data: { enrollmentYear: 2023 } });
  await api(ADMIN, "PATCH", `/adminfeatures/students/${student.id}`, { gpa: 3.8 });
  const fast = await api(ADMIN, "GET", `/adminfeatures/students/${student.id}`);
  const fastPredicate = fast.data?.student?.graduationPredicate ?? fast.json?.data?.student?.graduationPredicate;
  check("IPK 3,80 dengan masa studi 7 semester → Dengan Pujian", fastPredicate === "Dengan Pujian", fastPredicate);
  const list = await api(ADMIN, "GET", "/adminfeatures/students?page=1&pageSize=5&search=Uji Demo Siap Yudisium");
  check("daftar mahasiswa memakai predikat yang sama", list.json?.students?.[0]?.student?.graduationPredicate === "Dengan Pujian", list.json?.students?.[0]?.student?.graduationPredicate);
});

await run("3 urutan arsip", async () => {
  for (const kind of ["thesis-seminars", "thesis-defences"]) {
    const res = await api(ADMIN, "GET", `/${kind}?view=archive&page=1&pageSize=50`);
    const rows = res.data?.seminars ?? res.data?.defences ?? res.json?.data?.seminars ?? res.json?.data?.defences ?? [];
    const dates = rows.map((r) => (r.date ? new Date(r.date).getTime() : -Infinity));
    const sorted = dates.every((d, i) => i === 0 || dates[i - 1] >= d);
    check(`${kind}: tanggal pelaksanaan terbaru di atas`, rows.length > 1 && sorted, rows.slice(0, 4).map((r) => r.date));
  }
});

await run("4 Pembimbing 1 lebih dulu", async () => {
  const thesis = await prisma.thesis.findFirst({
    where: { thesisSupervisors: { some: { role: { name: "Pembimbing 2" } } }, thesisSeminars: { some: {} } },
    select: { thesisSeminars: { select: { id: true }, take: 1 } },
  });
  const detail = await api(ADMIN, "GET", `/thesis-seminars/${thesis.thesisSeminars[0].id}`);
  const supervisors = detail.data?.supervisors ?? detail.data?.thesis?.supervisors ?? detail.json?.data?.supervisors ?? [];
  const roles = supervisors.map((s) => s.role ?? s.roleName ?? s.role?.name);
  check("detail seminar: Pembimbing 1 sebelum Pembimbing 2", roles.length >= 2 && String(roles[0]).includes("1"), roles);
});

await run("5 peran Tim Pengelola CPL dihapus", async () => {
  const role = await prisma.userRole.findFirst({ where: { name: "Tim Pengelola CPL" } });
  const gkm = await prisma.user.findFirst({ where: { email: "gkm_si@fti.unand.ac.id" }, include: { userHasRoles: { include: { role: true } } } });
  check("tidak ada peran Tim Pengelola CPL; GKM tetap", !role && gkm.userHasRoles.some((r) => r.role.name === "GKM"), gkm.userHasRoles.map((r) => r.role.name));
});

await prisma.$disconnect();
process.exit(summary() ? 1 : 0);
