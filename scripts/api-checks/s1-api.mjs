// SIA S1 (K45), end to end: dummy-SIA's `GET /students` → Admin sync → values in the database
// (SKS, flags, GPA, status, CPL), then a changed record (Cuti, GPA, no Tugas Akhir) and a different
// period (flags skipped, other data still in). Needs a dummy-SIA at SIA_BASE_URL (the same one the
// backend under test reads) serving the file at SIA_DATA_PATH, which this script edits and restores.
// Run on a clean seed: SIA_BASE_URL=… SIA_API_TOKEN=… SIA_DATA_PATH=… node scripts/api-checks/s1-api.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { api, check, run, summary } from "./lib-api.mjs";

const SIA = (process.env.SIA_BASE_URL || "").replace(/\/$/, "");
const DATA_PATH = process.env.SIA_DATA_PATH;
if (!SIA || !DATA_PATH) {
  console.error("SIA_BASE_URL dan SIA_DATA_PATH wajib diisi (dummy-SIA yang dibaca backend uji dan berkas datanya).");
  process.exit(1);
}
const prisma = (await import(process.cwd() + "/src/config/prisma.js")).default;
const ADMIN = "admin_si";
const NIM = "2211528015"; // in dummy-SIA and in the seed (Uji Proposal Lulus)
const original = readFileSync(DATA_PATH, "utf-8");
const writeData = (mutate) => {
  const data = JSON.parse(original);
  mutate(data);
  writeFileSync(DATA_PATH, `${JSON.stringify(data, null, 2)}\n`);
};

const operational = await prisma.academicYear.findFirst({ where: { isActive: true } });
const studentOf = async (nim) =>
  prisma.user.findFirst({ where: { identityNumber: nim }, select: { student: { select: { id: true, sksCompleted: true, gpa: true, status: true, enrollmentYear: true, kknCompleted: true } } } }).then((u) => u?.student);
const flagsOf = (studentId) =>
  prisma.studentAcademicYearSnapshot.findUnique({ where: { studentId_academicYearId: { studentId, academicYearId: operational.id } } });
const sync = async () => {
  const res = await api(ADMIN, "POST", "/sia/sync");
  return { status: res.status, s: res.json?.summary ?? {}, message: res.json?.message };
};

try {
  await run("1 sinkronisasi dari dummy-SIA", async () => {
    const sia = JSON.parse(original);
    const rec = sia.students.find((r) => r.nim === NIM);
    const { status, s, message } = await sync();
    check("sinkronisasi berhasil", status === 200 && !s.error, message ?? s.error);
    check("jumlah mahasiswa dan yang tidak ditemukan dilaporkan", Number(s.fetched) === sia.students.length && Number(s.notFound) >= 0, { fetched: s.fetched, notFound: s.notFound });
    check("penanda semester ditulis (periode sama)", Number(s.periodFlagsSkipped) === 0 && Number(s.periodFlagsCreated) + Number(s.periodFlagsUpdated) > 0, s);

    const st = await studentOf(NIM);
    check("SKS, IPK, angkatan, penanda lulus sesuai SIA", st.sksCompleted === rec.sksCompleted && st.gpa === rec.gpa && st.enrollmentYear === rec.enrollmentYear && st.kknCompleted === rec.kknCompleted, { db: st, sia: { sks: rec.sksCompleted, gpa: rec.gpa } });
    const flags = await flagsOf(st.id);
    const takesThesis = rec.currentCourses.some((c) => c.code === "IF5001");
    const takesRm = rec.currentCourses.some((c) => c.code === "IF4001");
    check("penanda semester dari kode mata kuliah, bersumber sia", flags?.takingThesisCourse === takesThesis && flags?.eligibleResearchMethod === takesRm && flags?.thesisCourseSource === "sia", flags);
    check("status mahasiswa aktif", st.status === "active", st.status);

    // A CPL score: a student of dummy-SIA with CPL rows that exists in NeoCentral.
    let cplStudent = null;
    for (const r of sia.students.filter((x) => x.cplScores?.length)) {
      const s2 = await studentOf(r.nim);
      if (s2) { cplStudent = { r, s2 }; break; }
    }
    check("ada mahasiswa ber-CPL di dummy-SIA yang juga ada di seed", Boolean(cplStudent), cplStudent?.r.nim);
    if (cplStudent) {
      const rows = await prisma.studentCplScore.findMany({ where: { studentId: cplStudent.s2.id, source: "SIA" }, select: { score: true, cpl: { select: { code: true } } } });
      const want = cplStudent.r.cplScores.map((c) => `${c.cplCode}:${c.score}`).sort();
      const got = rows.map((x) => `${x.cpl.code}:${x.score}`).sort();
      check(`nilai CPL ${cplStudent.r.nim} masuk dari SIA`, JSON.stringify(got) === JSON.stringify(want) && Number(s.cplCreated) + Number(s.cplUpdated) + Number(s.cplUnchanged) > 0, { want, got, created: s.cplCreated, unchanged: s.cplUnchanged });
    }
  });

  await run("2 perubahan di SIA: Cuti, IPK, KRS tanpa Tugas Akhir", async () => {
    writeData((d) => {
      const r = d.students.find((x) => x.nim === NIM);
      r.studentStatus = "cuti";
      r.gpa = 3.21;
      r.currentCourses = r.currentCourses.filter((c) => c.code !== "IF5001");
    });
    const { s } = await sync();
    const st = await studentOf(NIM);
    check("status menjadi Cuti lewat aturan status mahasiswa", st.status === "bss" && Number(s.statusChanged) >= 1, { status: st.status, changed: s.statusChanged });
    const audit = await prisma.auditLog.findFirst({ where: { entityId: st.id, action: "STUDENT_STATUS_CHANGED" }, orderBy: { createdAt: "desc" } });
    check("perubahan status tercatat dengan sumber sia", audit?.changes?.newValues?.status === "bss" && audit?.changes?.metadata?.source === "sia", audit?.changes);
    check("IPK berubah dan dilaporkan", st.gpa === 3.21 && Number(s.gpaChanged) >= 1, { gpa: st.gpa, changed: s.gpaChanged });
    const flags = await flagsOf(st.id);
    check("tanpa Tugas Akhir di KRS: penanda menjadi tidak mengambil", flags?.takingThesisCourse === false, flags?.takingThesisCourse);
  });

  await run("3 periode SIA berbeda: penanda dilewati, data lain tetap masuk", async () => {
    writeData((d) => {
      d.period = { academicYear: "2025/2026", semester: "genap" };
      const r = d.students.find((x) => x.nim === NIM);
      r.studentStatus = "cuti"; // as in step 2, so step 4 shows the way back
      r.sksCompleted = 144;
      // Tugas Akhir in the KRS again: with another period it must not be written.
      r.currentCourses = [{ code: "IF5001", name: "Tugas Akhir", credits: 6 }];
    });
    const st0 = await studentOf(NIM);
    const before = await flagsOf(st0.id);
    const { s } = await sync();
    const st = await studentOf(NIM);
    const after = await flagsOf(st.id);
    check("penanda semester dilewati dan dilaporkan", Number(s.periodFlagsSkipped) > 0 && /2025\/2026 genap/.test(s.periodMismatch ?? ""), { skipped: s.periodFlagsSkipped, mismatch: s.periodMismatch });
    check("penanda semester tidak berubah", after?.takingThesisCourse === before?.takingThesisCourse && after?.eligibleResearchMethod === before?.eligibleResearchMethod, { before: before?.takingThesisCourse, after: after?.takingThesisCourse });
    check("SKS tetap diperbarui", st.sksCompleted === 144, st.sksCompleted);
    check("status tidak diterapkan ulang bila sama", st.status === "bss" && Number(s.statusChanged) === 0, { status: st.status, changed: s.statusChanged });
  });

  await run("4 kembali ke data asli", async () => {
    writeFileSync(DATA_PATH, original);
    const { s } = await sync();
    const st = await studentOf(NIM);
    check("status kembali Aktif", st.status === "active" && Number(s.statusChanged) >= 1, st.status);
  });
} finally {
  writeFileSync(DATA_PATH, original);
  await prisma.$disconnect();
}
process.exit(summary() ? 1 : 0);
