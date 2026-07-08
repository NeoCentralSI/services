/**
 * Seed dummy data untuk Monitoring Koordinator Metopen — edge case lengkap.
 *
 * Idempotent: rerun aman (upsert by NIM/email).
 *
 * Usage:
 *   cd services
 *   node prisma/seed-metopen-monitoring.mjs
 *
 * Yang di-seed:
 *  - 4 dosen pembimbing (P1/P2 capable)
 *  - 1 academic year aktif (re-use jika ada)
 *  - 1 thesis topic + scienceGroup
 *  - 1 metopen attendance import dengan 20 records
 *  - 19 mahasiswa eligible Metopen (DB) dengan kondisi berbeda
 *  - 1 unmatched row di import (NIM tidak match student DB)
 *  - AssessmentCriteria minimal untuk 4 bucket (TA-03A presentasi/konten/respons + TA-03B struktur)
 *
 * Edge case mapping (lihat docs/METOPEN_MONITORING_EDGE_CASES.md):
 *   EC01..EC11 → status pencarian pembimbing berbeda
 *   EC12..EC15 → status nilai berbeda (TA-03A only, TA-03B only, complete pending, published)
 *   EC16..EC18 → attendance borderline + auto-zero
 *   EC19       → eligible SIA tapi missing dari import
 *   EC20       → unmatched row di import (NIM tidak match DB)
 *
 * Canon ref: §5.2 advisor lifecycle, §5.7 75:25, §5.7.3 BR-28 attendance gate.
 */

import { randomUUID } from "node:crypto";
import { PrismaClient } from "../src/generated/prisma/index.js";

const prisma = new PrismaClient();

const ROLES = {
  KOORDINATOR_METOPEN: "Koordinator Matkul Metopen",
  PEMBIMBING_1: "Pembimbing 1",
  PEMBIMBING_2: "Pembimbing 2",
  MAHASISWA: "Mahasiswa",
  KETUA_DEPARTEMEN: "Ketua Departemen",
};

async function ensureRole(name) {
  return prisma.userRole.upsert({
    where: { name },
    update: {},
    create: { id: randomUUID(), name },
  });
}

async function ensureAcademicYear() {
  const existing = await prisma.academicYear.findFirst({ where: { isActive: true } });
  if (existing) return existing;
  return prisma.academicYear.create({
    data: { semester: "genap", year: "2025/2026", isActive: true },
  });
}

async function ensureScienceGroup(name) {
  const found = await prisma.scienceGroup.findFirst({ where: { name } });
  if (found) return found;
  return prisma.scienceGroup.create({ data: { name } });
}

async function ensureTopic({ name, scienceGroupId }) {
  const found = await prisma.thesisTopic.findFirst({ where: { name } });
  if (found && found.scienceGroupId === scienceGroupId) return found;
  if (found) {
    return prisma.thesisTopic.update({
      where: { id: found.id },
      data: { scienceGroupId },
    });
  }
  return prisma.thesisTopic.create({
    data: { name, scienceGroupId },
  });
}

async function ensureThesisStatus(name) {
  const found = await prisma.thesisStatus.findFirst({ where: { name } });
  if (found) return found;
  return prisma.thesisStatus.create({ data: { name } });
}

async function ensureLecturer({ fullName, nip, email, scienceGroupId }) {
  const user = await prisma.user.upsert({
    where: { identityNumber: nip },
    update: { fullName, email, isVerified: true },
    create: {
      fullName,
      identityNumber: nip,
      identityType: "NIP",
      email,
      isVerified: true,
    },
  });
  const lecturer = await prisma.lecturer.upsert({
    where: { id: user.id },
    update: { acceptingRequests: true, scienceGroupId },
    create: { id: user.id, acceptingRequests: true, scienceGroupId },
  });
  // Assign role Pembimbing 1 + Pembimbing 2 supaya semua dosen siap dipakai
  // di skenario advisor request.
  for (const roleName of [ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2]) {
    const role = await ensureRole(roleName);
    await prisma.userHasRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: { status: "active" },
      create: { userId: user.id, roleId: role.id, status: "active" },
    });
  }
  return lecturer;
}

async function ensureStudent({
  nim,
  fullName,
  email,
  eligibleMetopen = true,
  enrollmentYear = 2023,
  takingThesisCourse = false,
  status = "active",
}) {
  const user = await prisma.user.upsert({
    where: { identityNumber: nim },
    update: { fullName, email, isVerified: true },
    create: {
      fullName,
      identityNumber: nim,
      identityType: "NIM",
      email,
      isVerified: true,
    },
  });
  const studentRole = await ensureRole(ROLES.MAHASISWA);
  await prisma.userHasRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: studentRole.id } },
    update: { status: "active" },
    create: { userId: user.id, roleId: studentRole.id, status: "active" },
  });

  const student = await prisma.student.upsert({
    where: { id: user.id },
    update: {
      eligibleMetopen,
      metopenEligibilitySource: "sia",
      metopenEligibilityUpdatedAt: new Date(),
      enrollmentYear,
      takingThesisCourse,
      status,
      sksCompleted: 110,
      mandatoryCoursesCompleted: true,
      mkwuCompleted: true,
    },
    create: {
      id: user.id,
      status,
      enrollmentYear,
      eligibleMetopen,
      metopenEligibilitySource: "sia",
      metopenEligibilityUpdatedAt: new Date(),
      takingThesisCourse,
      sksCompleted: 110,
      mandatoryCoursesCompleted: true,
      mkwuCompleted: true,
    },
  });
  return { user, student };
}

async function ensureCpmk(code, description, academicYearId) {
  const found = await prisma.metopenCpmk.findFirst({ where: { code, academicYearId } });
  if (found) {
    return prisma.metopenCpmk.update({
      where: { id: found.id },
      data: { description },
    });
  }
  return prisma.metopenCpmk.create({
    data: { code, description, academicYearId },
  });
}

async function ensureAssessmentCriteria({ name, cpmkId, role, maxScore }) {
  const found = await prisma.metopenAssessmentCriteria.findFirst({
    where: { name, metopenCpmkId: cpmkId, role },
  });
  if (found) {
    return prisma.metopenAssessmentCriteria.update({
      where: { id: found.id },
      data: { maxScore },
    });
  }
  return prisma.metopenAssessmentCriteria.create({
    data: {
      name,
      metopenCpmkId: cpmkId,
      role,
      maxScore,
    },
  });
}

/**
 * Seed 5 rubric levels untuk kriteria target. Identitas semantik:
 * (assessmentCriteriaId, minScore, maxScore). Idempotent rerun-aman.
 *
 * Catatan: Konten 40 (CPMK-02 supervisor) SENGAJA tidak di-seed rubric supaya
 * UI Pembimbing memakai sub-breakdown 4 × 0-10 (Pendahuluan, Kajian, Metodologi,
 * Kelayakan); submission backend valid karena `assessmentRubrics.length === 0`
 * memperbolehkan rubricId=null.
 */
async function ensureRubricLevels(criteriaId, levels) {
  for (const [idx, level] of levels.entries()) {
    const existing = await prisma.metopenAssessmentRubric.findFirst({
      where: {
        metopenAssessmentCriteriaId: criteriaId,
        minScore: level.minScore,
        maxScore: level.maxScore,
      },
    });
    if (existing) {
      await prisma.metopenAssessmentRubric.update({
        where: { id: existing.id },
        data: {
          description: level.description,
          displayOrder: idx,
        },
      });
    } else {
      await prisma.metopenAssessmentRubric.create({
        data: {
          metopenAssessmentCriteriaId: criteriaId,
          minScore: level.minScore,
          maxScore: level.maxScore,
          description: level.description,
          displayOrder: idx,
        },
      });
    }
  }
}

const RUBRIC_LEVELS_PRESENTASI = [
  {
    minScore: 0,
    maxScore: 4,
    description:
      "Sangat kurang — Menyampaikan secara tidak lengkap, alur tidak jelas, tidak menggunakan bahasa akademik, dan tidak memahami isi proposal.",
  },
  {
    minScore: 5,
    maxScore: 8,
    description:
      "Kurang — Menyampaikan dengan banyak kekurangan, alur tidak runtut, bahasa kurang akademik, dan pemahaman rendah.",
  },
  {
    minScore: 9,
    maxScore: 12,
    description:
      "Cukup — Menyampaikan komponen utama secara cukup jelas, struktur cukup logis, penggunaan istilah umum, pemahaman cukup.",
  },
  {
    minScore: 13,
    maxScore: 16,
    description:
      "Baik — Menyampaikan semua isi dengan baik, struktur presentasi logis, bahasa formal, dan menunjukkan penguasaan.",
  },
  {
    minScore: 17,
    maxScore: 20,
    description:
      "Sangat baik — Menyampaikan seluruh isi proposal secara lengkap, runtut, akademik, menggunakan istilah teknis yang tepat, dan menunjukkan pemahaman mendalam.",
  },
];

const RUBRIC_LEVELS_STRUKTUR = [
  {
    minScore: 0,
    maxScore: 5,
    description:
      "Sangat kurang — Proposal tidak mengandung sebagian besar aspek penting. Abstrak dan referensi tidak sistematis. Pendahuluan tidak memuat latar belakang. Tinjauan pustaka tidak relevan. Metode tidak mendukung tujuan. Referensi tidak kredibel. Bahasa tidak sesuai SPOK.",
  },
  {
    minScore: 6,
    maxScore: 10,
    description:
      "Kurang — Penulisan kurang sistematis. Latar belakang kurang jelas. Tinjauan pustaka dan metode tidak relevan. Referensi sebagian besar tidak kredibel. Bahasa kurang konsisten dan tidak tepat.",
  },
  {
    minScore: 11,
    maxScore: 15,
    description:
      "Cukup — Penulisan cukup sistematis. Latar belakang dan kajian pustaka cukup sesuai. Metode cukup mendukung tujuan. Referensi cukup kredibel. Bahasa cukup formal dan dapat dipahami.",
  },
  {
    minScore: 16,
    maxScore: 20,
    description:
      "Baik — Penulisan sesuai pedoman. Isi lengkap dan saling terkait. Metode mendukung tujuan. Referensi kredibel. Bahasa sesuai SPOK dan konsisten.",
  },
  {
    minScore: 21,
    maxScore: 25,
    description:
      "Sangat baik — Penulisan sangat sistematis dan konsisten. Semua aspek lengkap, logis, dan mendalam. Referensi sangat relevan dan kredibel. Bahasa akademik sangat baik dan konsisten.",
  },
];

const RUBRIC_LEVELS_RESPON = [
  {
    minScore: 0,
    maxScore: 3,
    description:
      "Sangat kurang — Tidak menindaklanjuti saran, tidak aktif berkomunikasi, dan tidak melakukan revisi.",
  },
  {
    minScore: 4,
    maxScore: 6,
    description:
      "Kurang — Menindaklanjuti sebagian saran, komunikasi pasif, revisi kurang tepat.",
  },
  {
    minScore: 7,
    maxScore: 9,
    description:
      "Cukup — Menindaklanjuti sebagian besar saran, komunikasi cukup terbuka, revisi cukup sesuai.",
  },
  {
    minScore: 10,
    maxScore: 12,
    description:
      "Baik — Menindaklanjuti hampir seluruh saran, komunikasi baik, revisi sesuai dan lengkap.",
  },
  {
    minScore: 13,
    maxScore: 15,
    description:
      "Sangat baik — Menindaklanjuti semua saran secara tepat, komunikasi aktif dan reflektif, serta revisi sangat komprehensif.",
  },
];

async function cleanupEdgeCaseData() {
  // Hapus semua state dummy yang akan di-recreate, supaya rerun bersih.
  // Konvensi: NIM dummy berformat "2399" prefix.
  const dummyUsers = await prisma.user.findMany({
    where: { identityNumber: { startsWith: "2399" } },
    select: { id: true },
  });
  const dummyUserIds = dummyUsers.map((u) => u.id);
  if (dummyUserIds.length > 0) {
    // Delete dependencies in correct order (FK constraints)
    await prisma.researchMethodScoreDetail.deleteMany({
      where: { researchMethodScore: { thesis: { studentId: { in: dummyUserIds } } } },
    });
    await prisma.researchMethodScore.deleteMany({
      where: { thesis: { studentId: { in: dummyUserIds } } },
    });
    await prisma.thesisSupervisors.deleteMany({
      where: { thesis: { studentId: { in: dummyUserIds } } },
    });
    await prisma.thesisAdvisorRequest.deleteMany({
      where: { studentId: { in: dummyUserIds } },
    });
    await prisma.thesisAdvisorRequestDraft.deleteMany({
      where: { studentId: { in: dummyUserIds } },
    });
    await prisma.thesis.deleteMany({ where: { studentId: { in: dummyUserIds } } });
  }
  // Hapus attendance import dummy untuk re-create
  await prisma.metopenAttendanceRecord.deleteMany({
    where: { import: { classCode: { startsWith: "EDGE-CASE/" } } },
  });
  await prisma.metopenAttendanceImport.deleteMany({
    where: { classCode: { startsWith: "EDGE-CASE/" } },
  });
}

async function main() {
  console.log("🌱 Seeding Metopen Monitoring edge cases...\n");

  // ============================================
  // 0. Cleanup state dummy sebelumnya
  // ============================================
  console.log("[0/6] Cleanup state dummy (idempotency)...");
  await cleanupEdgeCaseData();

  // ============================================
  // 1. Master data
  // ============================================
  console.log("[1/6] Master data: academic year + roles + science group + topic...");
  const academicYear = await ensureAcademicYear();
  await ensureRole(ROLES.KOORDINATOR_METOPEN);
  await ensureRole(ROLES.KETUA_DEPARTEMEN);
  const scienceGroup = await ensureScienceGroup("KBK Sistem Informasi");
  const topic = await ensureTopic({
    name: "Sistem Informasi Manajemen",
    scienceGroupId: scienceGroup.id,
  });

  // ============================================
  // 2. Dosen pembimbing (4 dosen P1/P2 capable)
  // ============================================
  console.log("[2/6] Dosen pembimbing...");
  const drDoe = await ensureLecturer({
    fullName: "Dr. Doe Anderson, M.Kom.",
    nip: "198501012010011001",
    email: "doe.anderson@dummy.ac.id",
    scienceGroupId: scienceGroup.id,
  });
  const drSmith = await ensureLecturer({
    fullName: "Dr. Smith Johansson, M.T.",
    nip: "198601012010011002",
    email: "smith.johansson@dummy.ac.id",
    scienceGroupId: scienceGroup.id,
  });
  const drWang = await ensureLecturer({
    fullName: "Dr. Wang Liu, M.Sc.",
    nip: "198701012010011003",
    email: "wang.liu@dummy.ac.id",
    scienceGroupId: scienceGroup.id,
  });
  const drGarcia = await ensureLecturer({
    fullName: "Dr. Garcia Hernandez, M.T.",
    nip: "198801012010011004",
    email: "garcia.hernandez@dummy.ac.id",
    scienceGroupId: scienceGroup.id,
  });

  // Quota default untuk semua dosen agar Path B/C bisa di-skenario
  for (const lec of [drDoe, drSmith, drWang, drGarcia]) {
    await prisma.lecturerSupervisionQuota.upsert({
      where: {
        lecturerId_academicYearId: { lecturerId: lec.id, academicYearId: academicYear.id },
      },
      update: { quotaMax: 8, quotaSoftLimit: 6 },
      create: {
        lecturerId: lec.id,
        academicYearId: academicYear.id,
        quotaMax: 8,
        quotaSoftLimit: 6,
        currentCount: 0,
      },
    });
  }

  // ============================================
  // 3. Assessment Criteria 4 bucket
  // ============================================
  console.log("[3/6] Assessment Criteria (4 bucket SIA)...");
  const cpmk1 = await ensureCpmk("CPMK-01", "Presentasi proposal", academicYear.id);
  const cpmk2 = await ensureCpmk("CPMK-02", "Konten + struktur proposal", academicYear.id);
  const cpmk3 = await ensureCpmk("CPMK-03", "Kemampuan merespon pertanyaan", academicYear.id);

  const criteriaPresentasi = await ensureAssessmentCriteria({
    name: "Presentasi",
    cpmkId: cpmk1.id,
    role: "supervisor",
    maxScore: 20,
  });
  const criteriaKonten = await ensureAssessmentCriteria({
    name: "Proposal (konten)",
    cpmkId: cpmk2.id,
    role: "supervisor",
    maxScore: 40,
  });
  const criteriaStruktur = await ensureAssessmentCriteria({
    name: "Proposal (struktur)",
    cpmkId: cpmk2.id,
    role: "default",
    maxScore: 25,
  });
  const criteriaRespon = await ensureAssessmentCriteria({
    name: "Kemampuan merespon",
    cpmkId: cpmk3.id,
    role: "supervisor",
    maxScore: 15,
  });

  // Rubric levels untuk 3 kriteria scalar (Konten 40 sengaja tanpa rubric).
  await ensureRubricLevels(criteriaPresentasi.id, RUBRIC_LEVELS_PRESENTASI);
  await ensureRubricLevels(criteriaStruktur.id, RUBRIC_LEVELS_STRUKTUR);
  await ensureRubricLevels(criteriaRespon.id, RUBRIC_LEVELS_RESPON);
  console.log("       + 15 AssessmentRubric levels (Presentasi 5, Struktur 5, Respon 5)");

  // ============================================
  // 4. Thesis status canonical (name BUKAN unique, pakai findFirst pattern)
  // ============================================
  console.log("[4/6] Thesis status...");
  const thesisStatusNames = ["Metopel", "Bimbingan", "Dibatalkan", "Gagal", "Selesai", "Lulus", "Drop Out"];
  let statusBimbingan = null;
  for (const name of thesisStatusNames) {
    const status = await ensureThesisStatus(name);
    if (name === "Bimbingan") statusBimbingan = status;
  }

  // ============================================
  // 5. 19 mahasiswa edge case
  // ============================================
  console.log("[5/6] 19 mahasiswa edge case...");

  // Helper: create thesis + supervisor + score
  async function createThesisFor({
    student,
    p1Id,
    p2Id = null,
    title = `Rancang Bangun ${student.user.fullName}`,
    proposalStatus = null,
    isProposal = true,
  }) {
    const thesis = await prisma.thesis.create({
      data: {
        studentId: student.student.id,
        academicYearId: academicYear.id,
        thesisTopicId: topic.id,
        thesisStatusId: statusBimbingan.id,
        title,
        proposalStatus,
        isProposal,
      },
    });
    const roleP1 = await ensureRole(ROLES.PEMBIMBING_1);
    await prisma.thesisSupervisors.create({
      data: {
        thesisId: thesis.id,
        lecturerId: p1Id,
        roleId: roleP1.id,
        status: "active",
      },
    });
    if (p2Id) {
      const roleP2 = await ensureRole(ROLES.PEMBIMBING_2);
      await prisma.thesisSupervisors.create({
        data: {
          thesisId: thesis.id,
          lecturerId: p2Id,
          roleId: roleP2.id,
          status: "active",
        },
      });
    }
    return thesis;
  }

  async function createAdvisorRequest({
    student,
    lecturerId,
    status,
    routeType,
    requestType = "ta_01",
    extra = {},
  }) {
    return prisma.thesisAdvisorRequest.create({
      data: {
        studentId: student.student.id,
        lecturerId,
        academicYearId: academicYear.id,
        topicId: topic.id,
        proposedTitle: `Proposal ${student.user.fullName}`,
        backgroundSummary: "Latar belakang yang cukup panjang untuk pengujian SIMPTA.",
        problemStatement: "Permasalahan utama penelitian yang akan dibahas.",
        proposedSolution: "Rencana solusi yang akan ditawarkan dalam penelitian.",
        researchObject: "Objek penelitian yang konkret",
        researchPermitStatus: "approved",
        requestType,
        status,
        routeType,
        ...extra,
      },
    });
  }

  // EC01: BELUM mencari pembimbing
  const ec01 = await ensureStudent({
    nim: "2399000001",
    fullName: "EDGE01 Belum Cari Pembimbing",
    email: "edge01@dummy.ac.id",
  });

  // EC02: Status pending (request baru, dosen belum respon)
  const ec02 = await ensureStudent({
    nim: "2399000002",
    fullName: "EDGE02 Pending Dosen",
    email: "edge02@dummy.ac.id",
  });
  await createAdvisorRequest({
    student: ec02,
    lecturerId: drDoe.id,
    status: "pending",
    routeType: "normal",
  });

  // EC03: under_review (dosen mark review)
  const ec03 = await ensureStudent({
    nim: "2399000003",
    fullName: "EDGE03 Under Review",
    email: "edge03@dummy.ac.id",
  });
  await createAdvisorRequest({
    student: ec03,
    lecturerId: drSmith.id,
    status: "under_review",
    routeType: "normal",
  });

  // EC04: Path C escalated → pending_kadep dengan dual-justification + audit forward
  const ec04 = await ensureStudent({
    nim: "2399000004",
    fullName: "EDGE04 Path C Pending KaDep",
    email: "edge04@dummy.ac.id",
  });
  await createAdvisorRequest({
    student: ec04,
    lecturerId: drDoe.id,
    status: "pending_kadep",
    routeType: "escalated",
    extra: {
      studentJustification:
        "Justifikasi akademik mahasiswa untuk Path C overquota minimal 20 karakter. Topik penelitian sangat spesifik dan hanya cocok dengan Dr. Doe.",
      lecturerOverquotaReason:
        "Proyeksi lulus 6 bulan, mahasiswa kompeten. Dosen siap terima overquota.",
      forwardedToKadepAt: new Date(),
      forwardedByLecturerId: drDoe.id,
    },
  });

  // EC05: TA-02 (Path A dept) → pending_kadep tanpa lecturerId
  const ec05 = await ensureStudent({
    nim: "2399000005",
    fullName: "EDGE05 TA-02 Dept",
    email: "edge05@dummy.ac.id",
  });
  await createAdvisorRequest({
    student: ec05,
    lecturerId: null,
    status: "pending_kadep",
    routeType: "dept",
    requestType: "ta_02",
  });

  // EC06: Path B normal → booking_approved + thesis + P1
  const ec06 = await ensureStudent({
    nim: "2399000006",
    fullName: "EDGE06 Booking Normal",
    email: "edge06@dummy.ac.id",
  });
  await createAdvisorRequest({
    student: ec06,
    lecturerId: drDoe.id,
    status: "booking_approved",
    routeType: "normal",
  });
  await createThesisFor({ student: ec06, p1Id: drDoe.id, proposalStatus: "submitted" });

  // EC07: Path C overquota approved → booking_approved + acceptedOverNormal=true
  const ec07 = await ensureStudent({
    nim: "2399000007",
    fullName: "EDGE07 Overquota Sah",
    email: "edge07@dummy.ac.id",
  });
  await createAdvisorRequest({
    student: ec07,
    lecturerId: drSmith.id,
    status: "booking_approved",
    routeType: "escalated",
    extra: {
      acceptedOverNormal: true,
      studentJustification: "Justifikasi mahasiswa Path C overquota.",
      lecturerOverquotaReason: "Proyeksi lulus mahasiswa.",
      forwardedToKadepAt: new Date(Date.now() - 86400000),
      forwardedByLecturerId: drSmith.id,
    },
  });
  await createThesisFor({ student: ec07, p1Id: drSmith.id, proposalStatus: "submitted" });

  // EC08: Active official + dual supervisor + TA-03A partial (presentasi+konten, belum cosign)
  const ec08 = await ensureStudent({
    nim: "2399000008",
    fullName: "EDGE08 Dual Supervisor TA-03A Parsial",
    email: "edge08@dummy.ac.id",
  });
  await createAdvisorRequest({
    student: ec08,
    lecturerId: drDoe.id,
    status: "active_official",
    routeType: "normal",
  });
  const thesis08 = await createThesisFor({
    student: ec08,
    p1Id: drDoe.id,
    p2Id: drWang.id,
    proposalStatus: "submitted",
    isProposal: false,
  });
  const score08 = await prisma.researchMethodScore.create({
    data: {
      thesisId: thesis08.id,
      supervisorId: drDoe.id,
      supervisorScore: 50, // partial: hanya presentasi 18 + konten 32 = 50, respons belum diisi
      lecturerScore: null,
      finalScore: null,
      isFinalized: false,
    },
  });
  // Detail breakdown supaya 4 bucket aggregation jalan
  await prisma.researchMethodScoreDetail.createMany({
    data: [
      {
        researchMethodScoreId: score08.id,
        assessmentCriteriaId: criteriaPresentasi.id,
        score: 18,
      },
      {
        researchMethodScoreId: score08.id,
        assessmentCriteriaId: criteriaKonten.id,
        score: 32,
      },
    ],
  });

  // EC09: Rejected by dosen
  const ec09 = await ensureStudent({
    nim: "2399000009",
    fullName: "EDGE09 Rejected by Dosen",
    email: "edge09@dummy.ac.id",
  });
  await createAdvisorRequest({
    student: ec09,
    lecturerId: drGarcia.id,
    status: "rejected_by_dosen",
    routeType: "normal",
    extra: {
      rejectionReason: "Topik di luar bidang keahlian. Silakan ajukan ke KBK lain.",
      lecturerRespondedAt: new Date(),
    },
  });

  // EC10: Rejected by KaDep
  const ec10 = await ensureStudent({
    nim: "2399000010",
    fullName: "EDGE10 Rejected by KaDep",
    email: "edge10@dummy.ac.id",
  });
  await createAdvisorRequest({
    student: ec10,
    lecturerId: drDoe.id,
    status: "rejected_by_kadep",
    routeType: "escalated",
    extra: {
      kadepNotes: "Justifikasi belum cukup kuat. Tarik dulu lalu submit ulang.",
      reviewedAt: new Date(),
    },
  });

  // EC11: Withdrawn (mahasiswa cabut diri)
  const ec11 = await ensureStudent({
    nim: "2399000011",
    fullName: "EDGE11 Ditarik Mahasiswa",
    email: "edge11@dummy.ac.id",
  });
  await createAdvisorRequest({
    student: ec11,
    lecturerId: drWang.id,
    status: "canceled",
    routeType: "normal",
    extra: {
      withdrawnAt: new Date(),
      withdrawCount: 1,
    },
  });

  // EC12: TA-03A complete tapi TA-03B belum (Pembimbing 1 sudah submit, Koordinator belum)
  const ec12 = await ensureStudent({
    nim: "2399000012",
    fullName: "EDGE12 TA-03A Only",
    email: "edge12@dummy.ac.id",
  });
  await createAdvisorRequest({
    student: ec12,
    lecturerId: drDoe.id,
    status: "booking_approved",
    routeType: "normal",
  });
  const thesis12 = await createThesisFor({ student: ec12, p1Id: drDoe.id });
  const score12 = await prisma.researchMethodScore.create({
    data: {
      thesisId: thesis12.id,
      supervisorId: drDoe.id,
      supervisorScore: 65, // 18 + 35 + 12 = 65
      lecturerScore: null,
      finalScore: null,
      isFinalized: false,
    },
  });
  await prisma.researchMethodScoreDetail.createMany({
    data: [
      { researchMethodScoreId: score12.id, assessmentCriteriaId: criteriaPresentasi.id, score: 18 },
      { researchMethodScoreId: score12.id, assessmentCriteriaId: criteriaKonten.id, score: 35 },
      { researchMethodScoreId: score12.id, assessmentCriteriaId: criteriaRespon.id, score: 12 },
    ],
  });

  // EC13: TA-03B only (Pembimbing belum submit, Koordinator sudah submit dulu)
  const ec13 = await ensureStudent({
    nim: "2399000013",
    fullName: "EDGE13 TA-03B Only",
    email: "edge13@dummy.ac.id",
  });
  await createAdvisorRequest({
    student: ec13,
    lecturerId: drSmith.id,
    status: "booking_approved",
    routeType: "normal",
  });
  const thesis13 = await createThesisFor({ student: ec13, p1Id: drSmith.id });
  const score13 = await prisma.researchMethodScore.create({
    data: {
      thesisId: thesis13.id,
      supervisorId: null,
      supervisorScore: null,
      lecturerId: drSmith.id,
      lecturerScore: 20,
      finalScore: null,
      isFinalized: false,
    },
  });
  await prisma.researchMethodScoreDetail.create({
    data: { researchMethodScoreId: score13.id, assessmentCriteriaId: criteriaStruktur.id, score: 20 },
  });

  // EC14: Complete pending (TA-03A + TA-03B + cosign done, belum publish final)
  const ec14 = await ensureStudent({
    nim: "2399000014",
    fullName: "EDGE14 Complete Pending Publish",
    email: "edge14@dummy.ac.id",
  });
  await createAdvisorRequest({
    student: ec14,
    lecturerId: drDoe.id,
    status: "active_official",
    routeType: "normal",
  });
  const thesis14 = await createThesisFor({
    student: ec14,
    p1Id: drDoe.id,
    p2Id: drGarcia.id,
    proposalStatus: "submitted",
    isProposal: false,
  });
  const score14 = await prisma.researchMethodScore.create({
    data: {
      thesisId: thesis14.id,
      supervisorId: drDoe.id,
      supervisorScore: 70, // 19 + 38 + 13
      lecturerId: drSmith.id,
      lecturerScore: 22,
      finalScore: null, // belum di-publish
      isFinalized: false,
      coSignedByLecturerId: drGarcia.id,
      coSignedAt: new Date(),
    },
  });
  await prisma.researchMethodScoreDetail.createMany({
    data: [
      { researchMethodScoreId: score14.id, assessmentCriteriaId: criteriaPresentasi.id, score: 19 },
      { researchMethodScoreId: score14.id, assessmentCriteriaId: criteriaKonten.id, score: 38 },
      { researchMethodScoreId: score14.id, assessmentCriteriaId: criteriaRespon.id, score: 13 },
      { researchMethodScoreId: score14.id, assessmentCriteriaId: criteriaStruktur.id, score: 22 },
    ],
  });

  // EC15: Published Final + Pengesahan TA-04
  const ec15 = await ensureStudent({
    nim: "2399000015",
    fullName: "EDGE15 Published TA-04",
    email: "edge15@dummy.ac.id",
  });
  await createAdvisorRequest({
    student: ec15,
    lecturerId: drDoe.id,
    status: "active_official",
    routeType: "normal",
  });
  let thesis15Document = await prisma.documentType.findFirst({
    where: { name: "TA-04 Penetapan Pembimbing" },
  });
  if (!thesis15Document) {
    thesis15Document = await prisma.documentType.create({
      data: { name: "TA-04 Penetapan Pembimbing" },
    });
  }
  const ta04Document = await prisma.document.create({
    data: {
      userId: ec15.user.id,
      documentTypeId: thesis15Document.id,
      fileName: "TA-04-edge15.pdf",
      filePath: "uploads/dummy/TA-04-edge15.pdf",
      fileSize: 1024,
      mimeType: "application/pdf",
    },
  });
  const thesis15 = await prisma.thesis.create({
    data: {
      studentId: ec15.student.id,
      academicYearId: academicYear.id,
      thesisTopicId: topic.id,
      thesisStatusId: statusBimbingan.id,
      title: "Rancang Bangun Sistem Final TA-04",
      proposalStatus: "accepted",
      isProposal: false,
      titleApprovalDocumentId: ta04Document.id,
      proposalReviewedAt: new Date(),
    },
  });
  const roleP1Ec15 = await ensureRole(ROLES.PEMBIMBING_1);
  const roleP2Ec15 = await ensureRole(ROLES.PEMBIMBING_2);
  await prisma.thesisSupervisors.create({
    data: { thesisId: thesis15.id, lecturerId: drDoe.id, roleId: roleP1Ec15.id, status: "active" },
  });
  await prisma.thesisSupervisors.create({
    data: { thesisId: thesis15.id, lecturerId: drWang.id, roleId: roleP2Ec15.id, status: "active" },
  });
  const score15 = await prisma.researchMethodScore.create({
    data: {
      thesisId: thesis15.id,
      supervisorId: drDoe.id,
      supervisorScore: 70,
      lecturerId: drSmith.id,
      lecturerScore: 22,
      finalScore: 92,
      isFinalized: true,
      finalizedAt: new Date(),
      coSignedByLecturerId: drWang.id,
      coSignedAt: new Date(),
    },
  });
  await prisma.researchMethodScoreDetail.createMany({
    data: [
      { researchMethodScoreId: score15.id, assessmentCriteriaId: criteriaPresentasi.id, score: 19 },
      { researchMethodScoreId: score15.id, assessmentCriteriaId: criteriaKonten.id, score: 38 },
      { researchMethodScoreId: score15.id, assessmentCriteriaId: criteriaRespon.id, score: 13 },
      { researchMethodScoreId: score15.id, assessmentCriteriaId: criteriaStruktur.id, score: 22 },
    ],
  });

  // EC16: Auto-zero (presensi <75%)
  const ec16 = await ensureStudent({
    nim: "2399000016",
    fullName: "EDGE16 Auto-Zero Presensi",
    email: "edge16@dummy.ac.id",
  });
  await createAdvisorRequest({
    student: ec16,
    lecturerId: drDoe.id,
    status: "booking_approved",
    routeType: "normal",
  });
  const thesis16 = await createThesisFor({ student: ec16, p1Id: drDoe.id });
  // score auto-zero akan dibuat setelah attendance record, perlu attendanceRecordId

  // EC17: Borderline eligible 75%
  const ec17 = await ensureStudent({
    nim: "2399000017",
    fullName: "EDGE17 Borderline 75",
    email: "edge17@dummy.ac.id",
  });
  await createAdvisorRequest({
    student: ec17,
    lecturerId: drGarcia.id,
    status: "booking_approved",
    routeType: "normal",
  });
  await createThesisFor({ student: ec17, p1Id: drGarcia.id });

  // EC18: Borderline ineligible 74.99% → akan auto-zero
  const ec18 = await ensureStudent({
    nim: "2399000018",
    fullName: "EDGE18 Borderline 74.99",
    email: "edge18@dummy.ac.id",
  });
  await createAdvisorRequest({
    student: ec18,
    lecturerId: drWang.id,
    status: "booking_approved",
    routeType: "normal",
  });
  const thesis18 = await createThesisFor({ student: ec18, p1Id: drWang.id });

  // EC19: Eligible SIA tapi TIDAK ada di import presensi
  const ec19 = await ensureStudent({
    nim: "2399000019",
    fullName: "EDGE19 Missing dari Import",
    email: "edge19@dummy.ac.id",
  });
  await createAdvisorRequest({
    student: ec19,
    lecturerId: drDoe.id,
    status: "pending",
    routeType: "normal",
  });

  // ============================================
  // 6. Metopen Attendance Import + Records
  // ============================================
  console.log("[6/6] Metopen attendance import + 20 records (19 matched + 1 unmatched)...");

  const koordRoleObj = await ensureRole(ROLES.KOORDINATOR_METOPEN);
  const koordAssignment = await prisma.userHasRole.findFirst({
    where: { roleId: koordRoleObj.id, status: "active" },
    select: { userId: true },
  });
  const uploaderUserId = koordAssignment?.userId ?? ec01.user.id; // fallback

  let importDoc = await prisma.documentType.findFirst({
    where: { name: "Presensi Metode Penelitian" },
  });
  if (!importDoc) {
    importDoc = await prisma.documentType.create({
      data: { name: "Presensi Metode Penelitian" },
    });
  }
  const importFileDoc = await prisma.document.create({
    data: {
      userId: uploaderUserId,
      documentTypeId: importDoc.id,
      fileName: "presensi-metopel-edge-cases.xlsx",
      filePath: "uploads/dummy/presensi-metopel-edge-cases.xlsx",
      fileSize: 5885,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  });

  const attendanceImport = await prisma.metopenAttendanceImport.create({
    data: {
      academicYearId: academicYear.id,
      documentId: importFileDoc.id,
      uploadedByUserId: uploaderUserId,
      classCode: "EDGE-CASE/SI/Kuliah/A",
      courseName: "Metode Penelitian",
      semesterLabel: "Genap 2025/2026",
      filterLabel: "Teori (Senin)",
      lecturerNames: ["Dr. Doe", "Dr. Smith"],
      thresholdPercent: 0.75,
      totalRows: 0, // di-update setelah create records
      matchedRows: 0,
      eligibleRows: 0,
      ineligibleRows: 0,
    },
  });

  // 9 dari 9 meetings = 100%, 6/9 = 66.67%, etc.
  // Mapping spesifik:
  //   EC16 → 4/9 = 44.4% ineligible (→ akan di-auto-zero)
  //   EC17 → 6/8 = 75% eligible (borderline)
  //   EC18 → 7/9 = 77.78% nope, butuh 74.99% — pakai presensi non-integer? Schema integer.
  //          Alternatif: pakai 7/10 = 70% lalu set attendancePercentage manual = 0.7499.
  //          Schema attendancePercentage = Float, jadi bebas. presentCount integer.
  //   Others → 9/9 eligible.
  const recordsConfig = [
    { studentRef: ec01, present: 9, total: 9, percentage: 1.0, isEligible: true },
    { studentRef: ec02, present: 9, total: 9, percentage: 1.0, isEligible: true },
    { studentRef: ec03, present: 9, total: 9, percentage: 1.0, isEligible: true },
    { studentRef: ec04, present: 8, total: 9, percentage: 0.8889, isEligible: true },
    { studentRef: ec05, present: 8, total: 9, percentage: 0.8889, isEligible: true },
    { studentRef: ec06, present: 9, total: 9, percentage: 1.0, isEligible: true },
    { studentRef: ec07, present: 9, total: 9, percentage: 1.0, isEligible: true },
    { studentRef: ec08, present: 9, total: 9, percentage: 1.0, isEligible: true },
    { studentRef: ec09, present: 7, total: 9, percentage: 0.7778, isEligible: true },
    { studentRef: ec10, present: 8, total: 9, percentage: 0.8889, isEligible: true },
    { studentRef: ec11, present: 8, total: 9, percentage: 0.8889, isEligible: true },
    { studentRef: ec12, present: 9, total: 9, percentage: 1.0, isEligible: true },
    { studentRef: ec13, present: 9, total: 9, percentage: 1.0, isEligible: true },
    { studentRef: ec14, present: 9, total: 9, percentage: 1.0, isEligible: true },
    { studentRef: ec15, present: 9, total: 9, percentage: 1.0, isEligible: true },
    { studentRef: ec16, present: 4, total: 9, percentage: 0.4444, isEligible: false }, // auto-zero
    { studentRef: ec17, present: 6, total: 8, percentage: 0.75, isEligible: true }, // borderline eligible
    { studentRef: ec18, present: 7, total: 10, percentage: 0.7499, isEligible: false }, // borderline ineligible
    // EC19 sengaja TIDAK ada di import (missing dari import)
  ];

  for (const cfg of recordsConfig) {
    await prisma.metopenAttendanceRecord.create({
      data: {
        importId: attendanceImport.id,
        studentId: cfg.studentRef.student.id,
        identityNumber: cfg.studentRef.user.identityNumber,
        studentName: cfg.studentRef.user.fullName,
        presentCount: cfg.present,
        absentCount: cfg.total - cfg.present,
        sickCount: 0,
        permitCount: 0,
        totalMeetings: cfg.total,
        attendancePercentage: cfg.percentage,
        isEligible: cfg.isEligible,
      },
    });
  }

  // EC20: Unmatched row — identity number tidak match student manapun di DB
  await prisma.metopenAttendanceRecord.create({
    data: {
      importId: attendanceImport.id,
      studentId: null,
      identityNumber: "9999900099",
      studentName: "EDGE20 Unmatched dari Import",
      presentCount: 9,
      absentCount: 0,
      sickCount: 0,
      permitCount: 0,
      totalMeetings: 9,
      attendancePercentage: 1.0,
      isEligible: true,
    },
  });

  // Auto-zero score untuk EC16 dan EC18 (post-hoc karena butuh attendanceRecordId)
  const ec16Record = await prisma.metopenAttendanceRecord.findFirst({
    where: { importId: attendanceImport.id, studentId: ec16.student.id },
  });
  const ec18Record = await prisma.metopenAttendanceRecord.findFirst({
    where: { importId: attendanceImport.id, studentId: ec18.student.id },
  });

  await prisma.researchMethodScore.create({
    data: {
      thesisId: thesis16.id,
      supervisorScore: 0,
      lecturerScore: 0,
      finalScore: 0,
      isFinalized: true,
      finalizedAt: new Date(),
      attendanceRecordId: ec16Record?.id ?? null,
      attendanceAutoZeroedAt: new Date(),
      attendanceAutoZeroReason:
        "Presensi Metopel kurang dari 75%; nilai TA-03A dan TA-03B otomatis 0 tanpa review proposal.",
    },
  });

  await prisma.researchMethodScore.create({
    data: {
      thesisId: thesis18.id,
      supervisorScore: 0,
      lecturerScore: 0,
      finalScore: 0,
      isFinalized: true,
      finalizedAt: new Date(),
      attendanceRecordId: ec18Record?.id ?? null,
      attendanceAutoZeroedAt: new Date(),
      attendanceAutoZeroReason:
        "Presensi Metopel kurang dari 75%; nilai TA-03A dan TA-03B otomatis 0 tanpa review proposal.",
    },
  });

  // Update counts di metopenAttendanceImport supaya UI summary akurat
  const allRecords = await prisma.metopenAttendanceRecord.findMany({
    where: { importId: attendanceImport.id },
    select: { isEligible: true, studentId: true },
  });
  const total = allRecords.length;
  const matched = allRecords.filter((r) => r.studentId != null).length;
  const eligible = allRecords.filter((r) => r.isEligible).length;
  const ineligible = total - eligible;
  await prisma.metopenAttendanceImport.update({
    where: { id: attendanceImport.id },
    data: {
      totalRows: total,
      matchedRows: matched,
      eligibleRows: eligible,
      ineligibleRows: ineligible,
      autoZeroedCount: 2, // EC16 + EC18
    },
  });

  console.log("\n✅ SELESAI seed Metopen Monitoring edge cases:");
  console.log(`   - 4 dosen pembimbing (Dr. Doe, Dr. Smith, Dr. Wang, Dr. Garcia)`);
  console.log(`   - 19 mahasiswa edge case (NIM 2399000001-2399000019)`);
  console.log(`   - 1 import presensi: ${total} records (${matched} matched, ${total - matched} unmatched)`);
  console.log(`   - ${eligible} eligible, ${ineligible} ineligible (2 auto-zeroed)`);
  console.log("\n   Login Koordinator Metopen → buka /kelola/metopen/monitoring untuk lihat semua state.");
}

main()
  .catch((e) => {
    console.error("FATAL:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
