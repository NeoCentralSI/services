/**
 * Siapkan data uji fitur SIMPTA memakai akun REAL (@fti.unand.ac.id) saja.
 *
 * Yang dilakukan:
 *  1) Bersihkan artefak UAT/EDGE residual (dokumen dummy, batch superseded, PDF basi)
 *  2) Perbaiki inkonsistensi kuota/booking pada data real
 *  3) Inject fixture skenario klik dengan mahasiswa/dosen real
 *  4) Regenerasi Formulir TA-04 batch agar isinya = cohort real saat ini
 *
 * Tidak membuat akun @dummy.ac.id / NIM 2399* / 2388*.
 *
 * Jalankan:
 *   cd services
 *   node scripts/ensure-users.js
 *   node scripts/seed-real-feature-fixtures.js
 */

import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "../src/generated/prisma/index.js";
import servicePrisma from "../src/config/prisma.js";
import { finalizeBatchTA04 } from "../src/services/advisorRequest.service.js";
import { getLecturerQuotaSnapshot, syncLecturerQuotaCurrentCount } from "../src/services/advisorQuota.service.js";
import {
  ensureOperationalAcademicYearWindow,
  resolveOperationalAcademicYear,
} from "../src/helpers/academicYear.helper.js";
import { ROLES } from "../src/constants/roles.js";
import { THESIS_STATUS } from "../src/constants/thesisStatus.js";

const prisma = new PrismaClient();
const WITHDRAW_LOCK_HOURS = 72;

const ACTORS = {
  admin: "admin_si@fti.unand.ac.id",
  kadep: "kadep_si@fti.unand.ac.id",
  sekdep: "sekdep_si@fti.unand.ac.id",
  pembimbing: "pembimbing_si@fti.unand.ac.id",
  surya: "surya@fti.unand.ac.id",
  adi: "adi@fti.unand.ac.id",
  dimas: "dimas_2311523026@fti.unand.ac.id",
  john: "john_2411522001@fti.unand.ac.id",
  fariz: "fariz_2211523034@fti.unand.ac.id",
  nabil: "nabil_2211522018@fti.unand.ac.id",
  mustafa: "mustafa_2211522036@fti.unand.ac.id",
  syauqi: "syauqi_2211523012@fti.unand.ac.id",
  khalied: "khalied_2211523030@fti.unand.ac.id",
  nouval: "muhammad_2211521020@fti.unand.ac.id",
};

const ok = (s) => console.log(`  [OK]  ${s}`);
const warn = (s) => console.log(`  [!!]  ${s}`);

async function requireUser(email) {
  const user = await prisma.user.findFirst({
    where: { email },
    include: {
      student: true,
      lecturer: true,
      userHasRoles: { where: { status: "active" }, include: { role: true } },
    },
  });
  if (!user) throw new Error(`Akun wajib tidak ditemukan: ${email}`);
  return user;
}

async function ensureRole(name) {
  return prisma.userRole.upsert({ where: { name }, update: {}, create: { name } });
}

async function ensureThesisStatus(name) {
  const existing = await prisma.thesisStatus.findFirst({ where: { name } });
  if (existing) return existing;
  return prisma.thesisStatus.create({ data: { name } });
}

async function ensureStudentEligible(user, eligible) {
  if (!user.student) {
    await prisma.student.create({
      data: {
        id: user.id,
        eligibleMetopen: eligible,
        metopenEligibilitySource: "sia",
        status: "active",
        enrollmentYear: 2022,
        sksCompleted: eligible ? 120 : 90,
        mandatoryCoursesCompleted: eligible,
        mkwuCompleted: eligible,
      },
    });
  } else {
    await prisma.student.update({
      where: { id: user.id },
      data: {
        eligibleMetopen: eligible,
        metopenEligibilitySource: "sia",
        status: "active",
        sksCompleted: eligible ? Math.max(user.student.sksCompleted ?? 0, 120) : user.student.sksCompleted,
        mandatoryCoursesCompleted: eligible ? true : user.student.mandatoryCoursesCompleted,
        mkwuCompleted: eligible ? true : user.student.mkwuCompleted,
      },
    });
  }
}

async function unlinkAndDeleteDocuments(docs) {
  if (!docs.length) return 0;
  const ids = docs.map((d) => d.id);
  await prisma.thesis.updateMany({
    where: { titleApprovalDocumentId: { in: ids } },
    data: { titleApprovalDocumentId: null },
  });
  // documentId pada import presensi boleh null; Ta04Batch.documentId TIDAK boleh null.
  await prisma.metopenAttendanceImport.updateMany({
    where: { documentId: { in: ids } },
    data: { documentId: null },
  });
  await prisma.document.deleteMany({ where: { id: { in: ids } } });
  for (const d of docs) {
    if (!d.filePath) continue;
    const abs = path.resolve(process.cwd(), d.filePath);
    if (fs.existsSync(abs)) {
      try { fs.unlinkSync(abs); } catch { /* ignore */ }
    }
  }
  return docs.length;
}

async function cleanupStaleUatArtifacts() {
  console.log("\n── 1. Bersihkan artefak UAT/EDGE residual ──");

  // 1a. Hapus batch superseded dulu (FK document wajib; hapus batch → baru hapus PDF).
  const superseded = await prisma.ta04Batch.findMany({
    where: { status: "superseded" },
    select: { id: true, documentId: true, version: true },
  });
  if (superseded.length) {
    const batchIds = superseded.map((b) => b.id);
    const docIds = superseded.map((b) => b.documentId).filter(Boolean);
    await prisma.ta04BatchMember.deleteMany({ where: { batchId: { in: batchIds } } });
    await prisma.ta04Batch.deleteMany({ where: { id: { in: batchIds } } });
    const docs = await prisma.document.findMany({
      where: { id: { in: docIds } },
      select: { id: true, filePath: true },
    });
    await unlinkAndDeleteDocuments(docs);
  }
  ok(`Batch superseded dihapus: ${superseded.length}`);

  // 1b. Dokumen dummy/EDGE yang TIDAK dipakai batch current mana pun.
  const protectedDocIds = new Set(
    (
      await prisma.ta04Batch.findMany({
        where: { status: "current" },
        select: { documentId: true },
      })
    )
      .map((b) => b.documentId)
      .filter(Boolean),
  );

  const dummyDocs = await prisma.document.findMany({
    where: {
      OR: [
        { filePath: { startsWith: "uploads/dummy/" } },
        { fileName: { startsWith: "TA-04-edge" } },
        { fileName: { startsWith: "presensi-metopel-edge" } },
        { fileName: { contains: "UAT-PREP" } },
      ],
    },
    select: { id: true, fileName: true, filePath: true },
  });

  // Batch non-current yang masih menunjuk dokumen dummy → hapus batch dulu.
  const dummyIds = dummyDocs.map((d) => d.id);
  if (dummyIds.length) {
    const lingering = await prisma.ta04Batch.findMany({
      where: {
        documentId: { in: dummyIds },
        status: { not: "current" },
      },
      select: { id: true, documentId: true },
    });
    if (lingering.length) {
      const batchIds = lingering.map((b) => b.id);
      await prisma.ta04BatchMember.deleteMany({ where: { batchId: { in: batchIds } } });
      await prisma.ta04Batch.deleteMany({ where: { id: { in: batchIds } } });
    }
  }

  const deletable = dummyDocs.filter((d) => !protectedDocIds.has(d.id));
  const deletedDummy = await unlinkAndDeleteDocuments(deletable);
  ok(`Dokumen dummy/EDGE dihapus: ${deletedDummy}`);

  // 1c. PDF batch orphan (tidak terhubung batch mana pun).
  const linkedDocIds = new Set(
    (await prisma.ta04Batch.findMany({ select: { documentId: true } }))
      .map((b) => b.documentId)
      .filter(Boolean),
  );
  const orphanBatchPdfs = await prisma.document.findMany({
    where: {
      OR: [
        { fileName: { startsWith: "TA04_BATCH_" } },
        { fileName: { startsWith: "TA-04-edge" } },
      ],
      id: { notIn: linkedDocIds.size ? [...linkedDocIds] : ["__none__"] },
    },
    select: { id: true, filePath: true },
  });
  const deletedOrphan = await unlinkAndDeleteDocuments(orphanBatchPdfs);
  ok(`PDF batch orphan dihapus: ${deletedOrphan}`);
}

async function fixDimasConsistency(dimas, surya, academicYearId) {
  console.log("\n── 2. Perbaiki inkonsistensi Dimas (request vs supervisor) ──");
  const thesis = await prisma.thesis.findFirst({
    where: { studentId: dimas.id },
    include: {
      thesisSupervisors: {
        where: { status: "active" },
        include: { role: true, lecturer: { select: { user: { select: { email: true } } } } },
      },
      advisorRequests: { where: { status: "booking_approved" } },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!thesis) {
    warn("Dimas belum punya thesis — skip");
    return null;
  }

  const p1 = thesis.thesisSupervisors.find((s) => s.role?.name === ROLES.PEMBIMBING_1);
  const p1LecturerId = p1?.lecturerId ?? surya.id;

  // Pastikan P1 = Surya (data real yang sudah ada) + activeRoleKey
  const roleP1 = await ensureRole(ROLES.PEMBIMBING_1);
  if (!p1) {
    await prisma.thesisSupervisors.create({
      data: {
        thesisId: thesis.id,
        lecturerId: surya.id,
        roleId: roleP1.id,
        status: "active",
        activeRoleKey: `${thesis.id}:${roleP1.id}`,
      },
    });
  } else {
    await prisma.thesisSupervisors.update({
      where: { id: p1.id },
      data: {
        lecturerId: p1LecturerId === surya.id ? p1LecturerId : surya.id,
        activeRoleKey: `${thesis.id}:${roleP1.id}`,
      },
    });
  }

  const req = thesis.advisorRequests[0];
  if (req) {
    await prisma.thesisAdvisorRequest.update({
      where: { id: req.id },
      data: {
        lecturerId: surya.id,
        academicYearId,
        thesisId: thesis.id,
        routeType: "normal",
        acceptedOverNormal: false,
        studentJustification: null,
        lecturerOverquotaReason: null,
        forwardedToKadepAt: null,
        forwardedByLecturerId: null,
        proposedTitle: thesis.title ?? req.proposedTitle,
      },
    });
    ok("Dimas: request diselaraskan ke P1 Surya (normal, bukan overquota palsu)");
  } else {
    await prisma.thesisAdvisorRequest.create({
      data: {
        studentId: dimas.id,
        lecturerId: surya.id,
        academicYearId,
        thesisId: thesis.id,
        proposedTitle: thesis.title ?? "Sistem Informasi Tugas akhir modul proposal",
        status: "booking_approved",
        routeType: "normal",
        requestType: "ta_01",
        acceptedOverNormal: false,
      },
    });
    ok("Dimas: request booking_approved normal dibuat untuk Surya");
  }

  await prisma.thesis.update({
    where: { id: thesis.id },
    data: {
      academicYearId,
      isProposal: true,
      ta04AssignmentSupervisorNames: surya.fullName,
      ta04AssignmentTitle: thesis.title,
      ta04AssignmentAcademicYearId: academicYearId,
    },
  });

  return thesis;
}

async function resetStudentSimptaScratch(studentId) {
  // Bersihkan request interaktif lama + thesis proposal kosong (belum TA-04 / belum accepted).
  await prisma.thesisAdvisorRequest.deleteMany({
    where: {
      studentId,
      status: { in: ["pending", "under_review", "pending_kadep"] },
    },
  });

  const theses = await prisma.thesis.findMany({
    where: {
      studentId,
      isProposal: true,
      proposalStatus: null,
      ta04AssignmentIssuedAt: null,
    },
    select: { id: true },
  });
  const ids = theses.map((t) => t.id);
  if (!ids.length) return;

  await prisma.researchMethodScoreDetail.deleteMany({
    where: { researchMethodScore: { thesisId: { in: ids } } },
  }).catch(() => null);
  await prisma.researchMethodScore.deleteMany({ where: { thesisId: { in: ids } } }).catch(() => null);
  await prisma.ta04BatchMember.deleteMany({ where: { thesisId: { in: ids } } });
  await prisma.thesisSupervisors.deleteMany({ where: { thesisId: { in: ids } } });
  await prisma.thesisProposalVersion.deleteMany({ where: { thesisId: { in: ids } } });
  await prisma.thesisAdvisorRequest.deleteMany({ where: { thesisId: { in: ids } } });
  await prisma.thesis.deleteMany({ where: { id: { in: ids } } });
}

async function ensureTopic() {
  const topic = await prisma.thesisTopic.findFirst({ where: { scienceGroupId: { not: null } } });
  if (!topic) throw new Error("Tidak ada thesis topic berkBK — jalankan seed master dulu");
  return topic;
}

async function createPendingRequest({
  studentId,
  lecturerId,
  academicYearId,
  topicId,
  status,
  routeType = "normal",
  requestType = "ta_01",
  title,
  studentJustification = null,
  lecturerOverquotaReason = null,
  forwardedByLecturerId = null,
  forwardedToKadepAt = null,
  createdAt = null,
}) {
  const forwardedAt = forwardedToKadepAt
    ?? (status === "pending_kadep" && lecturerOverquotaReason ? new Date() : null);
  const data = {
    studentId,
    lecturerId,
    academicYearId,
    topicId,
    proposedTitle: title,
    backgroundSummary: "Latar belakang fixture uji real untuk skenario modul pengelolaan proposal.",
    problemStatement: "Rumusan masalah fixture uji yang cukup untuk form pengajuan.",
    proposedSolution: "Rencana solusi fixture uji berbasis pendekatan sistem informasi.",
    researchObject: "Departemen Sistem Informasi",
    researchPermitStatus: "not_approved",
    status,
    routeType,
    requestType,
    studentJustification,
    justificationText: studentJustification,
    lecturerOverquotaReason,
    lecturerApprovalNote: lecturerOverquotaReason,
    lecturerRespondedAt: forwardedAt,
    forwardedToKadepAt: forwardedAt,
    forwardedByLecturerId: forwardedByLecturerId ?? (forwardedAt ? lecturerId : null),
  };
  const created = await prisma.thesisAdvisorRequest.create({ data });
  if (createdAt) {
    await prisma.thesisAdvisorRequest.update({
      where: { id: created.id },
      data: { createdAt },
    });
  }
  return created;
}

async function ensureFarizFillsSekdepQuota(fariz, sekdep, academicYearId, topicId) {
  console.log("\n── 3. Fariz mengisi kuota normal Sekdep (Max=1) ──");

  // Hapus request/booking Fariz lama yang tidak konsisten
  await prisma.thesisAdvisorRequest.deleteMany({ where: { studentId: fariz.id } });

  let thesis = await prisma.thesis.findFirst({
    where: { studentId: fariz.id },
    orderBy: { createdAt: "desc" },
  });
  const status = await ensureThesisStatus(THESIS_STATUS.BIMBINGAN);
  const roleP1 = await ensureRole(ROLES.PEMBIMBING_1);

  if (!thesis) {
    thesis = await prisma.thesis.create({
      data: {
        studentId: fariz.id,
        academicYearId,
        thesisTopicId: topicId,
        thesisStatusId: status.id,
        title: "Sistem e-Parkir Berbasis Web",
        isProposal: true,
      },
    });
  } else {
    await prisma.thesis.update({
      where: { id: thesis.id },
      data: {
        academicYearId,
        thesisTopicId: topicId,
        thesisStatusId: status.id,
        title: thesis.title || "Sistem e-Parkir Berbasis Web",
        isProposal: true,
        proposalStatus: null,
        ta04AssignmentIssuedAt: null,
        ta04AssignmentTitle: null,
        ta04AssignmentSupervisorNames: null,
        ta04AssignmentAcademicYearId: null,
        ta04AssignmentIssuedByUserId: null,
      },
    });
    await prisma.thesisSupervisors.deleteMany({ where: { thesisId: thesis.id } });
    await prisma.ta04BatchMember.deleteMany({ where: { thesisId: thesis.id } });
  }

  await prisma.thesisSupervisors.create({
    data: {
      thesisId: thesis.id,
      lecturerId: sekdep.id,
      roleId: roleP1.id,
      status: "active",
      activeRoleKey: `${thesis.id}:${roleP1.id}`,
    },
  });

  await prisma.thesisAdvisorRequest.create({
    data: {
      studentId: fariz.id,
      lecturerId: sekdep.id,
      academicYearId,
      topicId,
      thesisId: thesis.id,
      proposedTitle: thesis.title || "Sistem e-Parkir Berbasis Web",
      status: "booking_approved",
      routeType: "normal",
      requestType: "ta_01",
      acceptedOverNormal: false,
    },
  });

  // Pastikan Max Sekdep = 1 untuk demo overquota yang valid
  await prisma.lecturerSupervisionQuota.upsert({
    where: {
      lecturerId_academicYearId: { lecturerId: sekdep.id, academicYearId },
    },
    update: { quotaMax: 1, quotaSoftLimit: 1 },
    create: {
      lecturerId: sekdep.id,
      academicYearId,
      quotaMax: 1,
      quotaSoftLimit: 1,
      currentCount: 1,
    },
  });
  await syncLecturerQuotaCurrentCount(sekdep.id, academicYearId);
  const snap = await getLecturerQuotaSnapshot(sekdep.id, academicYearId);
  if (!(snap?.isFull && snap.bookingCount === 1 && snap.activeCount === 0 && snap.overquotaSahCount === 0)) {
    throw new Error(
      `Kuota Sekdep tidak valid untuk overquota demo: ${JSON.stringify({
        max: snap?.quotaMax,
        booking: snap?.bookingCount,
        aktif: snap?.activeCount,
        over: snap?.overquotaSahCount,
        full: snap?.isFull,
      })}`,
    );
  }
  ok(`Sekdep penuh sah: Booking=1/Max=1 (Fariz), Overquota Sah=0, traffic=${snap.trafficLight}`);
  return thesis;
}

async function injectInteractiveFixtures({
  academicYearId,
  topicId,
  pembimbing,
  sekdep,
  nabil,
  mustafa,
  syauqi,
  khalied,
  nouval,
}) {
  console.log("\n── 4. Inject fixture skenario (akun real) ──");

  for (const student of [nabil, mustafa, syauqi, khalied, nouval]) {
    await ensureStudentEligible(student, true);
    await resetStudentSimptaScratch(student.id);
  }

  // Hapus pending lama ke pembimbing/sekdep dari fixture students agar inbox bersih
  const fixtureStudentIds = [nabil.id, mustafa.id, syauqi.id, khalied.id, nouval.id];
  await prisma.thesisAdvisorRequest.deleteMany({
    where: {
      studentId: { in: fixtureStudentIds },
    },
  });

  // UAT-17: Terima — pending normal ke Husnil
  await createPendingRequest({
    studentId: mustafa.id,
    lecturerId: pembimbing.id,
    academicYearId,
    topicId,
    status: "pending",
    title: "[UJI] TA-01 siap diterima dosen (Mustafa → Husnil)",
  });
  ok("Inbox Terima: Mustafa → pembimbing_si (pending normal)");

  // UAT-18: Tolak — pending normal ke Husnil
  await createPendingRequest({
    studentId: syauqi.id,
    lecturerId: pembimbing.id,
    academicYearId,
    topicId,
    status: "pending",
    title: "[UJI] TA-01 siap ditolak dosen (Syauqi → Husnil)",
  });
  ok("Inbox Tolak: Syauqi → pembimbing_si (pending normal)");

  // Path C sudah di-forward dosen → antrean KaDep Tab TA-01 Overquota.
  // (Sekdep penuh karena Fariz; dual-justification BR-26 sudah terisi.)
  await createPendingRequest({
    studentId: nabil.id,
    lecturerId: sekdep.id,
    academicYearId,
    topicId,
    status: "pending_kadep",
    routeType: "escalated",
    title: "[UJI] Path C overquota menunggu KaDep (Nabil → Afriyanti/Sekdep)",
    studentJustification:
      "Topik penelitian sangat spesifik pada domain keahlian dosen tujuan dan tidak ada dosen lain yang relevan pada KBK yang sama.",
    lecturerOverquotaReason:
      "Mahasiswa memiliki kecocokan topik yang kuat; saya setuju menerima di atas kuota normal semester ini.",
    forwardedByLecturerId: sekdep.id,
  });
  ok("Path C KaDep: Nabil → pending_kadep (escalated, dual-justifikasi siap di Validasi Kuota)");

  // TA-02 pending KaDep
  await createPendingRequest({
    studentId: khalied.id,
    lecturerId: null,
    academicYearId,
    topicId,
    status: "pending_kadep",
    routeType: "dept",
    requestType: "ta_02",
    title: "[UJI] TA-02 jalur departemen menunggu KaDep (Khalied)",
  });
  ok("TA-02: Khalied → pending_kadep");

  // Withdraw >72 jam under_review
  await createPendingRequest({
    studentId: nouval.id,
    lecturerId: pembimbing.id,
    academicYearId,
    topicId,
    status: "under_review",
    title: "[UJI] Under review >72 jam siap ditarik (Nouval → Husnil)",
    createdAt: new Date(Date.now() - (WITHDRAW_LOCK_HOURS + 8) * 60 * 60 * 1000),
  });
  ok("Withdraw: Nouval under_review di-backdate >72 jam");
}

async function regenerateCleanTa04Batch(academicYearId, kadepUserId) {
  console.log("\n── 5. Regenerasi Formulir TA-04 batch (cohort real saja) ──");

  // Paksa regenerasi: ubah cohortHash batch current agar tidak dianggap sudah sinkron
  await prisma.ta04Batch.updateMany({
    where: { academicYearId, status: "current" },
    data: { cohortHash: "force-regen-real-cohort" },
  });

  const result = await finalizeBatchTA04(academicYearId, kadepUserId);
  ok(
    `Batch TA-04: ${result.fileName} | anggota=${result.members?.length ?? result.thesisCount} | alreadyFinalized=${Boolean(result.alreadyFinalized)}`,
  );

  // Verifikasi PDF tidak mengandung token UAT/EDGE
  if (result.filePath && fs.existsSync(path.resolve(process.cwd(), result.filePath))) {
    try {
      const { PDFParse } = await import("pdf-parse");
      // fallback simple: read via pypdf through python
    } catch {
      /* optional */
    }
  }

  return result;
}

async function verifyPdfClean(filePath) {
  const abs = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(abs)) {
    warn(`PDF tidak ditemukan untuk verifikasi: ${filePath}`);
    return false;
  }
  const { spawnSync } = await import("node:child_process");
  const py = `
import pathlib
p=pathlib.Path(r'''${abs.replace(/\\/g, "/")}''')
text=''
try:
  import pypdf
  r=pypdf.PdfReader(str(p))
  text='\\n'.join((page.extract_text() or '') for page in r.pages)
except Exception as e:
  print('EXTRACT_FAIL', e)
  raise SystemExit(2)
bad=[]
for kw in ['UAT','EDGE','23990000','23880000','@dummy','Garcia','UATTA','EDGE0']:
  if kw.lower() in text.lower():
    bad.append(kw)
print('TEXT_LEN', len(text))
print('BAD', ','.join(bad) if bad else 'NONE')
print('HAS_DIMAS', 'Dimas' in text)
`;
  const out = spawnSync("python", ["-c", py], { encoding: "utf8" });
  const stdout = out.stdout || "";
  console.log(stdout.trim());
  if (out.status !== 0) {
    warn("Gagal ekstrak PDF untuk verifikasi");
    return false;
  }
  const badLine = stdout.split("\n").find((l) => l.startsWith("BAD "));
  const bad = badLine?.slice(4).trim();
  if (bad && bad !== "NONE") {
    throw new Error(`PDF batch masih mengandung token UAT/EDGE: ${bad}`);
  }
  ok("PDF batch bersih dari nama/token UAT/EDGE");
  return true;
}

async function printManualMatrix(actors) {
  console.log("\n" + "=".repeat(60));
  console.log("  MATRIKS UJI (akun real, password: Password@2025)");
  console.log("=".repeat(60));
  console.log(`
  Login aktor:
    Admin        : ${actors.admin}
    KaDep        : ${actors.kadep}
    Sekdep/Koord : ${actors.sekdep}  (multi-jabatan real — untuk aksi Koordinator OK)
    Dosen        : ${actors.pembimbing}
    Mhs eligible : ${actors.dimas}
    Mhs blocked  : ${actors.john}

  Skenario siap klik:
    1) Inbox Terima     : login ${actors.pembimbing} → terima pengajuan Mustafa
    2) Inbox Tolak      : login ${actors.pembimbing} → tolak pengajuan Syauqi
    3) TA-01 Overquota  : login ${actors.kadep} → tab TA-01 Overquota → Nabil
         (dosen sudah forward; justifikasi mahasiswa + alasan dosen side-by-side)
         → approve override / redirect
    4) TA-02 penetapan  : login ${actors.kadep} → tab TA-02 Penetapan → Khalied
    5) (opsional) Inbox : login ${actors.pembimbing} → Mustafa/Syauqi terima/tolak
    6) Withdraw >72 jam : login ${actors.nouval} → Status & Riwayat → tarik
    7) TA-04 batch      : login ${actors.kadep} → Batch TA-04 Awal (hanya nama real)
    8) Status TA-04 mhs : login ${actors.dimas} → /metopel (status sistem, tanpa PDF)
    9) Eligible/block   : ${actors.dimas} vs ${actors.john}
`);
}

async function main() {
  console.log("\n" + "=".repeat(60));
  console.log("  Seed fixture REAL (tanpa akun UAT/dummy)");
  console.log("=".repeat(60));

  await ensureOperationalAcademicYearWindow();
  const academicYear = await resolveOperationalAcademicYear();
  if (!academicYear) throw new Error("Tidak ada tahun akademik operasional");
  ok(`Tahun operasional: ${academicYear.year} ${academicYear.semester}`);

  const topic = await ensureTopic();
  const kadep = await requireUser(ACTORS.kadep);
  const sekdep = await requireUser(ACTORS.sekdep);
  const pembimbing = await requireUser(ACTORS.pembimbing);
  const surya = await requireUser(ACTORS.surya);
  const dimas = await requireUser(ACTORS.dimas);
  const john = await requireUser(ACTORS.john);
  const fariz = await requireUser(ACTORS.fariz);
  const nabil = await requireUser(ACTORS.nabil);
  const mustafa = await requireUser(ACTORS.mustafa);
  const syauqi = await requireUser(ACTORS.syauqi);
  const khalied = await requireUser(ACTORS.khalied);
  const nouval = await requireUser(ACTORS.nouval);

  await ensureStudentEligible(dimas, true);
  await ensureStudentEligible(john, false);
  await ensureStudentEligible(fariz, true);
  ok("Eligibility: Dimas/Fariz=true, John=false");

  await cleanupStaleUatArtifacts();
  await fixDimasConsistency(dimas, surya, academicYear.id);
  await ensureFarizFillsSekdepQuota(fariz, sekdep, academicYear.id, topic.id);
  await injectInteractiveFixtures({
    academicYearId: academicYear.id,
    topicId: topic.id,
    pembimbing,
    sekdep,
    nabil,
    mustafa,
    syauqi,
    khalied,
    nouval,
  });

  // Sync kuota dosen terkait
  for (const lecturerId of [sekdep.id, pembimbing.id, surya.id]) {
    await syncLecturerQuotaCurrentCount(lecturerId, academicYear.id);
  }

  const batch = await regenerateCleanTa04Batch(academicYear.id, kadep.id);
  if (batch?.filePath) await verifyPdfClean(batch.filePath);

  // Sanity kuota akhir
  console.log("\n── 6. Sanity kuota ──");
  const sekdepSnap = await getLecturerQuotaSnapshot(sekdep.id, academicYear.id);
  const husnilSnap = await getLecturerQuotaSnapshot(pembimbing.id, academicYear.id);
  const suryaSnap = await getLecturerQuotaSnapshot(surya.id, academicYear.id);
  console.log("  sekdep ", {
    max: sekdepSnap.quotaMax,
    booking: sekdepSnap.bookingCount,
    aktif: sekdepSnap.activeCount,
    overSah: sekdepSnap.overquotaSahCount,
    traffic: sekdepSnap.trafficLight,
  });
  console.log("  husnil ", {
    max: husnilSnap.quotaMax,
    booking: husnilSnap.bookingCount,
    pending: husnilSnap.bookingCount,
    inboxPending: husnilSnap.pendingKadepCount,
    traffic: husnilSnap.trafficLight,
  });
  console.log("  surya  ", {
    max: suryaSnap.quotaMax,
    booking: suryaSnap.bookingCount,
    aktif: suryaSnap.activeCount,
    traffic: suryaSnap.trafficLight,
  });

  if (sekdepSnap.overquotaSahCount > 0 && sekdepSnap.bookingCount + sekdepSnap.activeCount <= sekdepSnap.quotaMax) {
    throw new Error("Cacat logika: Overquota Sah > 0 padahal Aktif+Booking belum melebihi Max");
  }
  if (!sekdepSnap.isFull) {
    throw new Error("Sekdep harus penuh (Fariz) sebelum Path C Nabil diuji");
  }

  await printManualMatrix(ACTORS);
}

let exitCode = 0;
try {
  await main();
} catch (e) {
  console.error("\nFATAL:", e);
  exitCode = 1;
} finally {
  await Promise.allSettled([prisma.$disconnect(), servicePrisma.$disconnect()]);
}
process.exit(exitCode);
