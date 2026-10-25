// Documents of Seminar Hasil, Sidang and Yudisium: the TA-07 attendance form (verified attendance
// only, signed by Pembimbing I with the QR, checkable on Cek Dokumen), the QR inside the signature
// block, and a new version when the content changes. Run on a clean seed (nine seeders).
import { api, check, run, summary } from "./lib-api.mjs";

const prisma = (await import(process.cwd() + "/src/config/prisma.js")).default;
const STUDENT = "ta_demo_siap_seminar";
const KIND = "seminar_attendance_certificate";

await run("1 formulir TA-07", async () => {
  const user = await prisma.user.findFirst({ where: { email: `${STUDENT}@fti.unand.ac.id` }, select: { id: true } });
  const verified = await prisma.thesisSeminarAudience.findMany({ where: { studentId: user.id, approvedAt: { not: null } }, select: { thesisSeminarId: true } });
  const ids = verified.map((row) => row.thesisSeminarId);
  check("akun demo punya kehadiran terverifikasi", ids.length > 0, ids.length);

  const pdf = await api(STUDENT, "POST", "/thesis-seminars/me/attendance/generate-log", { seminarIds: ids });
  check("unduh TA-07: PDF", pdf.status === 200 && pdf.ct.includes("pdf") && pdf.bytes > 1000, { status: pdf.status, ct: pdf.ct });
  check("nama berkas TA-07", (pdf.headers.get("content-disposition") ?? "").includes("TA-07_Bukti_Kehadiran_Seminar"), pdf.headers.get("content-disposition"));

  const doc = await prisma.officialGeneratedDocument.findFirst({ where: { documentKind: KIND, sourceId: user.id, status: "current" }, orderBy: { version: "desc" } });
  check("tercatat sebagai dokumen resmi", !!doc && doc.title === "Bukti Kehadiran Seminar (TA-07)", doc?.title);
  const verify = await fetch(`${process.env.BASE || "http://localhost:3000"}/official-documents/${doc?.verificationToken}`);
  const body = await verify.json().catch(() => null);
  check("Cek Dokumen mengenali jenisnya", verify.status === 200 && JSON.stringify(body).includes(KIND), body?.data?.documentKind ?? verify.status);

  const again = await api(STUDENT, "POST", "/thesis-seminars/me/attendance/generate-log", { seminarIds: ids });
  const sameVersion = await prisma.officialGeneratedDocument.count({ where: { documentKind: KIND, sourceId: user.id } });
  check("isi sama: tidak terbit versi baru", again.status === 200 && sameVersion === 1, sameVersion);

  const fewer = await api(STUDENT, "POST", "/thesis-seminars/me/attendance/generate-log", { seminarIds: ids.slice(0, 1) });
  const versions = await prisma.officialGeneratedDocument.findMany({ where: { documentKind: KIND, sourceId: user.id }, orderBy: { version: "asc" }, select: { version: true, status: true } });
  check("isi berubah: versi baru, versi lama diganti", fewer.status === 200 && versions.length === 2 && versions[0].status === "superseded" && versions[1].status === "current", versions);

  // A seminar this student has no verified attendance at, mixed with a verified one.
  const other = await prisma.thesisSeminar.findFirst({ where: { id: { notIn: ids } }, select: { id: true } });
  const refused = await api(STUDENT, "POST", "/thesis-seminars/me/attendance/generate-log", { seminarIds: [ids[0], other.id] });
  check("kehadiran yang belum diverifikasi atau milik orang lain ditolak", refused.status === 400, refused.status);
});

await prisma.$disconnect();
process.exit(summary() ? 1 : 0);
