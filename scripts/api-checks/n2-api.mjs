// Student and lecturer list filters in Data Master, the activity log of the Seminar Hasil
// assessment master data, and Penetapan Pembimbing as an official document with a verification
// QR (versions superseded, same file on every download, preview not recorded).
// Run on a clean seed (eight seeders); it writes data.
import { createHash } from "crypto";
import { api, BASE, check, login, run, summary } from "./lib-api.mjs";

const prisma = (await import(process.cwd() + "/src/config/prisma.js")).default;
const ADMIN = "admin_si", KADEP = "kadep_si", SEKDEP = "sekdep_si";
const sha = (buffer) => createHash("sha256").update(buffer).digest("hex");

async function download(who, path) {
  const token = await login(who);
  const res = await fetch(BASE + path, { headers: { Authorization: `Bearer ${token}` } });
  return { status: res.status, buffer: Buffer.from(await res.arrayBuffer()), type: res.headers.get("content-type") };
}
const students = async (query) => (await api(ADMIN, "GET", `/adminfeatures/students?page=1&pageSize=100&${query}`)).json;

await run("1 filter Data Mahasiswa dan Data Dosen", async () => {
  const all = await students("");
  const cuti = await students("statusFilter=bss");
  check("Status Cuti: hanya mahasiswa cuti, hitungan mengikuti filter", cuti?.meta?.total === 1 && cuti.students.every((s) => s.student?.status === "bss") && cuti.meta.total < all.meta.total, `${cuti?.meta?.total} dari ${all?.meta?.total}`);
  const dropout = await students("statusFilter=dropout");
  check("Status Drop Out: akun uji Drop Out", dropout?.students?.some((s) => s.fullName === "Uji TA Drop Out") && dropout.students.every((s) => s.student?.status === "dropout"));
  // In the seed nobody takes both this semester (Uji Proposal Masuk Penelitian took Metode
  // Penelitian last semester and Tugas Akhir now); the Admin marks one student taking both.
  const noneYet = await students("programFilter=both");
  check("seed: tidak ada yang mengambil keduanya semester ini; Uji Proposal Masuk Penelitian di Tugas Akhir saja", noneYet?.meta?.total === 0 && (await students("programFilter=thesis"))?.students?.some((s) => s.fullName === "Uji Proposal Masuk Penelitian"), noneYet?.meta?.total);
  const naik = (await students("search=Uji Proposal Masuk Penelitian"))?.students?.[0];
  const ayId = all?.academicYearContext?.id;
  const set = await api(ADMIN, "PATCH", `/adminfeatures/students/${naik?.id}/period-flags/${ayId}`, { eligibleResearchMethod: true, takingThesisCourse: true });
  check("Admin menandai mengambil keduanya", set.status < 300, `${set.status} ${set.json?.message ?? ""}`);
  const both = await students("programFilter=both");
  check("Program Metode Penelitian + Tugas Akhir: Uji Proposal Masuk Penelitian ada", both?.students?.some((s) => s.fullName === "Uji Proposal Masuk Penelitian") && both.students.every((s) => s.student?.semesterFlags?.takingResearchMethod && s.student?.semesterFlags?.takingThesisCourse), both?.students?.map((s) => s.fullName));
  const combo = await students("programFilter=both&statusFilter=active&search=Uji&sortBy=fullName&sortOrder=asc");
  check("kombinasi Program + Status + cari + urutan", combo?.meta?.total >= 1 && combo.students.every((s) => s.student?.status === "active" && /Uji/i.test(s.fullName)), combo?.meta?.total);
  const comboCuti = await students("programFilter=both&statusFilter=bss");
  check("kombinasi yang tidak cocok: kosong, hitungan 0", comboCuti?.meta?.total === 0 && comboCuti.students.length === 0, comboCuti?.meta?.total);
  const page2 = await api(ADMIN, "GET", "/adminfeatures/students?page=2&pageSize=5&statusFilter=active");
  check("filter sebelum pagination: halaman 2 tetap mahasiswa Aktif", page2.json?.students?.every((s) => s.student?.status === "active") && page2.json?.meta?.total > 5, page2.json?.meta);

  const groups = (await api(ADMIN, "GET", "/science-groups")).json?.data ?? [];
  const group = groups[0];
  const lecturers = (await api(ADMIN, "GET", `/adminfeatures/lecturers?page=1&pageSize=100&scienceGroupId=${group?.id}`)).json;
  const allLecturers = (await api(ADMIN, "GET", "/adminfeatures/lecturers?page=1&pageSize=100")).json;
  check("Data Dosen: filter kelompok keilmuan diterapkan", lecturers?.meta?.total < allLecturers?.meta?.total && (lecturers?.lecturers ?? lecturers?.data ?? []).every((l) => l.lecturer?.scienceGroup === group?.name), `${lecturers?.meta?.total} dari ${allLecturers?.meta?.total}`);
});

await run("2 log rubrik Seminar Hasil", async () => {
  const cpmks = (await api(SEKDEP, "GET", "/seminar-rubrics/cpmks")).json?.data ?? [];
  const criteria = cpmks.flatMap((c) => c.criteria ?? c.assessmentCriterias ?? []).find((c) => c?.id);
  if (!criteria) {
    check("ada kriteria Seminar Hasil di seed", false, cpmks.length);
    return;
  }
  const res = await api(SEKDEP, "PATCH", `/seminar-rubrics/criteria/${criteria.id}`, { name: criteria.name });
  check("ubah kriteria Seminar Hasil berhasil", res.status < 300, `${res.status} ${res.json?.message ?? ""}`);
  await new Promise((r) => setTimeout(r, 300));
  const logs = (await api(KADEP, "GET", "/adminfeatures/audit-logs?action=ASSESSMENT_MASTER_CHANGED")).json?.logs ?? [];
  const row = logs.find((l) => l.entityId === criteria.id);
  check("tercatat di Log Aktivitas: kriteria, lingkup Seminar Hasil", row?.entity === "ASSESSMENT_CRITERIA" && row?.changes?.metadata?.scope === "seminar" && row?.changes?.metadata?.operation === "update", row?.changes?.metadata);
});

await run("3 QR Penetapan Pembimbing", async () => {
  const overview = (await api(KADEP, "GET", "/thesis-proposals/supervisor-assignments")).data;
  const v1 = overview?.currentBatch;
  const before = await prisma.officialGeneratedDocument.count({ where: { documentKind: "supervisor_assignment" } });
  const record = v1 && (await prisma.officialGeneratedDocument.findFirst({ where: { documentKind: "supervisor_assignment", sourceId: overview.academicYear.id, status: "current" } }));
  check("versi terbit dari seed punya dokumen resmi dengan token", !!record?.verificationToken && record.version === v1?.version, record?.verificationToken?.slice(0, 8));

  const a = await download(KADEP, v1.fileUrl);
  const b = await download(KADEP, v1.fileUrl);
  check("unduhan versi terbit: berkas resmi yang sama, hash sesuai catatan", a.status === 200 && a.buffer.equals(b.buffer) && sha(a.buffer) === record?.fileHash, `${a.status} ${a.type}`);
  const verify = await fetch(`${BASE}/official-documents/${record?.verificationToken}`).then((r) => r.json());
  const data = verify?.data ?? verify;
  check("verifikasi publik: data Penetapan, berlaku", data?.title === "Penetapan Pembimbing Tugas Akhir" && data?.isCurrent === true && /^Semester /.test(data?.subjectName ?? ""), data);

  // Cek Dokumen by upload: the downloaded PDF is found by its hash; a changed copy is not.
  const byFile = async (buffer, name = "penetapan.pdf", type = "application/pdf") => {
    const form = new FormData();
    form.append("file", new Blob([buffer], { type }), name);
    const res = await fetch(`${BASE}/official-documents/find-by-file`, { method: "POST", body: form });
    return { status: res.status, json: await res.json().catch(() => null) };
  };
  const match = await byFile(a.buffer);
  check("unggah PDF asli: ditemukan lewat hash, tanpa login", match.status === 200 && match.json?.data?.token === record?.verificationToken, match.status);
  const changed = await byFile(Buffer.concat([a.buffer, Buffer.from("\n% disimpan ulang")]));
  check("unggah PDF yang diubah: tidak cocok", changed.status === 404 && /tidak cocok dengan dokumen resmi/.test(changed.json?.message ?? ""), changed.json?.message);
  const notPdf = await byFile(Buffer.from("bukan pdf"), "catatan.txt", "text/plain");
  check("unggah bukan PDF: ditolak", notPdf.status === 400, notPdf.json?.message);

  const preview = await download(KADEP, `/thesis-proposals/supervisor-assignments/preview?academicYearId=${overview.academicYear.id}`);
  const afterPreview = await prisma.officialGeneratedDocument.count({ where: { documentKind: "supervisor_assignment" } });
  check("pratinjau tidak tercatat sebagai dokumen resmi", preview.status === 200 && afterPreview === before, `${preview.status} ${before} -> ${afterPreview}`);

  if (!overview?.needsIssue) {
    check("seed punya perubahan yang perlu diterbitkan", false, overview?.newCount);
    return;
  }
  const issued = await api(KADEP, "POST", "/thesis-proposals/supervisor-assignments", { academicYearId: overview.academicYear.id });
  const v2 = (await api(KADEP, "GET", "/thesis-proposals/supervisor-assignments")).data?.currentBatch;
  const records = await prisma.officialGeneratedDocument.findMany({ where: { documentKind: "supervisor_assignment", sourceId: overview.academicYear.id }, orderBy: { version: "asc" } });
  check("penerbitan ulang: versi baru berlaku, versi lama diganti", issued.status === 200 && v2?.version === v1.version + 1 && records.map((r) => `${r.version}:${r.status}`).join() === `${v1.version}:superseded,${v2.version}:current`, records.map((r) => `${r.version}:${r.status}`));
  const old = await fetch(`${BASE}/official-documents/${record?.verificationToken}`).then((r) => r.json());
  check("token versi lama: dokumen resmi, tetapi diganti", (old?.data ?? old)?.status === "superseded" && (old?.data ?? old)?.isCurrent === false, old?.data ?? old);
  const oldFile = await download(KADEP, v1.fileUrl);
  check("versi lama tetap diunduh sebagai berkasnya sendiri", oldFile.status === 200 && oldFile.buffer.equals(a.buffer));
});

await prisma.$disconnect();
process.exit(summary() ? 1 : 0);
