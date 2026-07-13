/**
 * Seed Internship - All Stages
 *
 * Creates comprehensive internship data covering every lifecycle stage:
 *   Companies → Proposals → Supervisor Letters → Internships →
 *   Logbooks → Guidance Sessions → Seminars → Assessment Scores
 *
 * Prerequisites:
 *   - seed-master.js (users, roles, academic years, rooms)
 *   - seed-document-type.js (document types)
 *   - seed-internship-cpmk.js (CPMK & rubrics)
 *   - seed-guidance-question.js (guidance questions)
 *   - seed-guidance-criteria.js (lecturer criteria)
 *
 * Usage: node scripts/internship/seed-internship-all.js
 *
 * Groups:
 *   1. Nabil + Khalied   → PT Telkom    → Pembimbing: Afriyanti  → COMPLETED
 *   2. Mustafa + Nouval   → PT BNI       → Pembimbing: Ricky Akbar → ONGOING (4 weeks)
 *   3. Daffa + Ilham      → PT Semen Padang → Pembimbing: Aina Hubby → ONGOING (1 week)
 *   4. Syauqi (solo)      → CV Digital Nusantara → PENDING (no internship yet)
 */

import { PrismaClient } from "../../src/generated/prisma/index.js";
const prisma = new PrismaClient();

// ================================================================
// LOGBOOK ACTIVITY DESCRIPTIONS
// ================================================================
const ACTIVITIES = [
  "Orientasi dan pengenalan lingkungan kerja perusahaan, berkenalan dengan tim divisi",
  "Mempelajari arsitektur sistem dan teknologi yang digunakan di perusahaan",
  "Setup development environment, instalasi tools, dan konfigurasi akses repository",
  "Meeting dengan pembimbing lapangan membahas scope pekerjaan dan target KP",
  "Analisis requirement sistem dan studi dokumen bisnis proses yang ada",
  "Perancangan arsitektur sistem baru dan pembuatan diagram alir proses",
  "Implementasi modul autentikasi dan manajemen pengguna",
  "Implementasi fitur CRUD untuk manajemen data master pada sistem",
  "Membuat desain database, normalisasi tabel, dan relasi antar entitas",
  "Implementasi REST API untuk modul utama aplikasi",
  "Unit testing dan debugging fitur-fitur yang sudah diimplementasikan",
  "Code review bersama tim development dan perbaikan berdasarkan feedback",
  "Integrasi frontend dengan backend API menggunakan Axios/Fetch",
  "Implementasi fitur upload dokumen dan manajemen file di server",
  "Optimasi query database dan performance tuning pada endpoint kritikal",
  "Membuat dokumentasi teknis API dan panduan penggunaan sistem",
  "Presentasi progress mingguan kepada tim dan pembimbing lapangan",
  "Implementasi fitur dashboard monitoring dan reporting data",
  "Testing end-to-end seluruh fitur dan perbaikan bug yang ditemukan",
  "Finalisasi fitur utama dan deployment ke staging environment",
  "User Acceptance Testing (UAT) bersama stakeholder perusahaan",
  "Perbaikan dan penyesuaian berdasarkan feedback dari hasil UAT",
  "Pembuatan laporan akhir kerja praktek dan dokumentasi hasil",
  "Presentasi hasil kerja praktek di hadapan tim perusahaan",
];

// ================================================================
// HELPER FUNCTIONS
// ================================================================

/**
 * Generate weekday dates starting from a given date
 */
function getWeekdays(startStr, count) {
  const dates = [];
  const d = new Date(startStr);
  while (dates.length < count) {
    if (d.getDay() !== 0 && d.getDay() !== 6) {
      dates.push(new Date(d));
    }
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

/**
 * Create a Document record with optional type
 */
async function createDoc(userId, fileName, typeName = null) {
  let documentTypeId = null;
  if (typeName) {
    const docType = await prisma.documentType.findFirst({ where: { name: typeName } });
    documentTypeId = docType?.id || null;
  }
  return prisma.document.create({
    data: {
      userId,
      documentTypeId,
      filePath: `/uploads/internship/${fileName}`,
      fileName,
      fileHash: `sha256_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
    },
  });
}

/**
 * Find or create a Company
 */
async function findOrCreateCompany(name, address, status = "save") {
  let company = await prisma.company.findFirst({ where: { companyName: name } });
  if (!company) {
    company = await prisma.company.create({
      data: { companyName: name, companyAddress: address, status },
    });
    console.log(`  ✅ ${name}`);
  } else {
    console.log(`  ⏩ ${name} (exists)`);
  }
  return company;
}

// ================================================================
// MAIN SEED FUNCTION
// ================================================================
async function main() {
  console.log("\n" + "=".repeat(60));
  console.log("🌱 SEED INTERNSHIP - All Stages");
  console.log("=".repeat(60));
  console.log(`📅 Date: ${new Date().toISOString()}`);

  // ── Lookup existing data ──────────────────────────────────────
  const ay = await prisma.academicYear.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
  });
  if (!ay) {
    console.error("❌ No active academic year found! Run seed-master.js first.");
    return;
  }
  console.log(`📅 Academic Year: ${ay.year} ${ay.semester}`);

  const room = await prisma.room.findFirst({ where: { name: "Ruangan Seminar DSI" } });
  if (!room) console.warn("⚠️  Room 'Ruangan Seminar DSI' not found. Seminars will be skipped.");

  // Lookup users by email
  const userEmails = {
    nabil: "nabil_2211522018@fti.unand.ac.id",
    khalied: "khalied_2211523030@fti.unand.ac.id",
    mustafa: "mustafa_2211522036@fti.unand.ac.id",
    nouval: "muhammad_2211521020@fti.unand.ac.id",
    daffa: "daffa_2211523022@fti.unand.ac.id",
    ilham: "ilham_2211522028@fti.unand.ac.id",
    syauqi: "syauqi_2211523012@fti.unand.ac.id",
    afriyanti: "sekdep_si@fti.unand.ac.id",
    ricky: "kadep_si@fti.unand.ac.id",
    aina: "penguji_si@fti.unand.ac.id",
  };

  const u = {};
  for (const [key, email] of Object.entries(userEmails)) {
    u[key] = await prisma.user.findFirst({ where: { email } });
    if (!u[key]) {
      console.error(`❌ User not found: ${email}. Run seed-master.js first.`);
      return;
    }
  }
  console.log(`👥 Loaded ${Object.keys(u).length} users`);

  // Lookup roles
  const kadepRole = await prisma.userRole.findFirst({ where: { name: "Ketua Departemen" } });
  if (!kadepRole) {
    console.error("❌ Role 'Ketua Departemen' not found!");
    return;
  }

  // ── Idempotency check ─────────────────────────────────────────
  const existingProposal = await prisma.internshipProposal.findFirst({
    where: { coordinatorId: u.nabil.id },
  });
  if (existingProposal) {
    console.log("\n⚠️  Internship data already exists! (Nabil's proposal found)");
    console.log("   Delete existing internship data first if you want to re-seed.");
    console.log("   Exiting without changes.\n");
    return;
  }

  // ══════════════════════════════════════════════════════════════
  // STEP 1: COMPANIES
  // ══════════════════════════════════════════════════════════════
  console.log("\n📍 Step 1: Companies");
  const co = {
    telkom: await findOrCreateCompany("PT Telkom Indonesia", "Jl. Japati No. 1, Bandung"),
    bni: await findOrCreateCompany("PT Bank Negara Indonesia", "Jl. Jend. Sudirman Kav. 1, Jakarta"),
    semen: await findOrCreateCompany("PT Semen Padang", "Jl. Raya Indarung, Padang"),
    digital: await findOrCreateCompany("CV Digital Nusantara", "Jl. Rasuna Said No. 15, Padang", "diajukan"),
  };

  // ══════════════════════════════════════════════════════════════
  // STEP 2: PROPOSALS + DOCUMENTS
  // ══════════════════════════════════════════════════════════════
  console.log("\n📝 Step 2: Proposals");

  /**
   * Create a proposal with all associated documents
   */
  async function createFullProposal(cfg) {
    const {
      coordUser, company, status, startPlanned, endPlanned,
      startActual, endActual, docNum, year, withLetters,
    } = cfg;

    // Proposal document (always required)
    const proposalDoc = await createDoc(
      coordUser.id,
      `proposal_kp_${coordUser.identityNumber}.pdf`,
      "Proposal Internship"
    );

    const data = {
      coordinatorId: coordUser.id,
      proposalDocumentId: proposalDoc.id,
      academicYearId: ay.id,
      targetCompanyId: company.id,
      status,
      proposedStartDate: new Date(startPlanned),
      proposedEndDate: new Date(endPlanned),
    };

    if (withLetters) {
      // Surat Permohonan (Application Letter)
      const appLetterDoc = await createDoc(
        coordUser.id,
        `surat_permohonan_${coordUser.identityNumber}.pdf`
      );
      data.appLetterDocNumber = `SP-KP/${docNum}/DSI/${year}`;
      data.appLetterDateIssued = new Date(startPlanned);
      data.startDatePlanned = new Date(startPlanned);
      data.endDatePlanned = new Date(endPlanned);
      data.appLetterDocId = appLetterDoc.id;
      data.appLetterSignedById = u.ricky.id;
      data.appLetterSignedAsRoleId = kadepRole.id;

      // Surat Balasan Perusahaan (Company Response)
      const compRespDoc = await createDoc(
        coordUser.id,
        `surat_balasan_${company.companyName.replace(/\s+/g, "_").toLowerCase()}.pdf`
      );
      data.companyResponseDocId = compRespDoc.id;
      data.companyResponseNotes = "Perusahaan menyetujui permohonan kerja praktek.";

      // Surat Tugas (Assignment Letter)
      const assignDoc = await createDoc(
        coordUser.id,
        `surat_tugas_${coordUser.identityNumber}.pdf`
      );
      data.assignLetterDocNumber = `ST-KP/${docNum}/DSI/${year}`;
      data.assignLetterDateIssued = new Date(startActual || startPlanned);
      data.startDateActual = new Date(startActual || startPlanned);
      data.endDateActual = new Date(endActual || endPlanned);
      data.assignLetterDocId = assignDoc.id;
      data.assignLetterSignedById = u.ricky.id;
      data.assignLetterSignedAsRoleId = kadepRole.id;
    }

    const proposal = await prisma.internshipProposal.create({ data });
    console.log(`  ✅ ${coordUser.fullName} → ${company.companyName} [${status}]`);
    return proposal;
  }

  const proposals = {};

  // Kelompok 1: Nabil (coord) + Khalied → Telkom, COMPLETED
  proposals.p1 = await createFullProposal({
    coordUser: u.nabil, company: co.telkom,
    status: "ACCEPTED_BY_COMPANY", withLetters: true,
    startPlanned: "2025-09-01", endPlanned: "2025-12-31",
    startActual: "2025-09-01", endActual: "2025-12-31",
    docNum: "001", year: "2025",
  });

  // Kelompok 2: Mustafa (coord) + Nouval → BNI, ONGOING (4 weeks)
  proposals.p2 = await createFullProposal({
    coordUser: u.mustafa, company: co.bni,
    status: "ACCEPTED_BY_COMPANY", withLetters: true,
    startPlanned: "2025-11-03", endPlanned: "2026-02-28",
    startActual: "2025-11-03", endActual: "2026-02-28",
    docNum: "002", year: "2025",
  });

  // Kelompok 3: Daffa (coord) + Ilham → Semen Padang, ONGOING (1 week)
  proposals.p3 = await createFullProposal({
    coordUser: u.daffa, company: co.semen,
    status: "ACCEPTED_BY_COMPANY", withLetters: true,
    startPlanned: "2025-12-15", endPlanned: "2026-04-15",
    startActual: "2025-12-15", endActual: "2026-04-15",
    docNum: "003", year: "2025",
  });

  // Kelompok 4: Syauqi (solo) → CV Digital Nusantara, PENDING
  proposals.p4 = await createFullProposal({
    coordUser: u.syauqi, company: co.digital,
    status: "PENDING", withLetters: false,
    startPlanned: "2026-02-01", endPlanned: "2026-05-31",
    docNum: "004", year: "2026",
  });

  // ══════════════════════════════════════════════════════════════
  // STEP 3: SUPERVISOR LETTERS (SK Pembimbing)
  // ══════════════════════════════════════════════════════════════
  console.log("\n📜 Step 3: Supervisor Letters");

  async function createSupLetter(supervisorUser, docNum, startDate, endDate) {
    const doc = await createDoc(u.ricky.id, `sk_pembimbing_kp_${docNum}.pdf`);
    const letter = await prisma.internshipSupervisorLetter.create({
      data: {
        documentNumber: `SK-KP/${docNum}/DSI/2025`,
        dateIssued: new Date(startDate),
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        supervisorId: supervisorUser.id,
        documentId: doc.id,
        signedById: u.ricky.id,
        signedAsRoleId: kadepRole.id,
        status: "ACTIVE",
      },
    });
    console.log(`  ✅ SK-KP/${docNum}: Pembimbing ${supervisorUser.fullName}`);
    return letter;
  }

  const letters = {};
  letters.l1 = await createSupLetter(u.afriyanti, "001", "2025-09-01", "2025-12-31");
  letters.l2 = await createSupLetter(u.ricky, "002", "2025-11-03", "2026-02-28");
  letters.l3 = await createSupLetter(u.aina, "003", "2025-12-15", "2026-04-15");

  // ══════════════════════════════════════════════════════════════
  // STEP 4: INTERNSHIPS
  // ══════════════════════════════════════════════════════════════
  console.log("\n🏢 Step 4: Internships");

  const internshipConfigs = [
    // ── Group 1: COMPLETED (Nabil, Khalied) ──
    {
      student: u.nabil, proposal: proposals.p1,
      supervisor: u.afriyanti, letter: letters.l1,
      status: "COMPLETED",
      startDate: "2025-09-01", endDate: "2025-12-31",
      fieldSup: {
        name: "Budi Santoso, S.T., M.T.",
        email: "budi.santoso@telkom.co.id",
        phone: "081234567890",
        nip: "197605142000121001",
      },
      unitSection: "Divisi Digital Service",
      completed: true,
      logbookCount: 20,
      guidanceWeeks: [1, 2, 3, 4], // all APPROVED
    },
    {
      student: u.khalied, proposal: proposals.p1,
      supervisor: u.afriyanti, letter: letters.l1,
      status: "COMPLETED",
      startDate: "2025-09-01", endDate: "2025-12-31",
      fieldSup: {
        name: "Budi Santoso, S.T., M.T.",
        email: "budi.santoso@telkom.co.id",
        phone: "081234567890",
        nip: "197605142000121001",
      },
      unitSection: "Divisi Digital Service",
      completed: true,
      logbookCount: 20,
      guidanceWeeks: [1, 2, 3, 4],
    },
    // ── Group 2: ONGOING 4 weeks (Mustafa, Nouval) ──
    {
      student: u.mustafa, proposal: proposals.p2,
      supervisor: u.ricky, letter: letters.l2,
      status: "ONGOING",
      startDate: "2025-11-03", endDate: "2026-02-28",
      fieldSup: {
        name: "Andi Wijaya, S.Kom.",
        email: "andi.wijaya@bni.co.id",
        phone: "081345678901",
        nip: "198012251999031002",
      },
      unitSection: "Divisi Teknologi Informasi",
      completed: false,
      logbookCount: 16,
      guidanceWeeks: [1, 2], // week 1 APPROVED, week 2 SUBMITTED
    },
    {
      student: u.nouval, proposal: proposals.p2,
      supervisor: u.ricky, letter: letters.l2,
      status: "ONGOING",
      startDate: "2025-11-03", endDate: "2026-02-28",
      fieldSup: {
        name: "Andi Wijaya, S.Kom.",
        email: "andi.wijaya@bni.co.id",
        phone: "081345678901",
        nip: "198012251999031002",
      },
      unitSection: "Divisi Teknologi Informasi",
      completed: false,
      logbookCount: 16,
      guidanceWeeks: [1, 2],
    },
    // ── Group 3: ONGOING 1 week (Daffa, Ilham) ──
    {
      student: u.daffa, proposal: proposals.p3,
      supervisor: u.aina, letter: letters.l3,
      status: "ONGOING",
      startDate: "2025-12-15", endDate: "2026-04-15",
      fieldSup: {
        name: "Rina Permata, S.T.",
        email: "rina.permata@semenpadang.co.id",
        phone: "081456789012",
        nip: "199001152015032001",
      },
      unitSection: "Biro Sistem Informasi",
      completed: false,
      logbookCount: 4,
      guidanceWeeks: [1], // only 1 session SUBMITTED
    },
    {
      student: u.ilham, proposal: proposals.p3,
      supervisor: u.aina, letter: letters.l3,
      status: "ONGOING",
      startDate: "2025-12-15", endDate: "2026-04-15",
      fieldSup: {
        name: "Rina Permata, S.T.",
        email: "rina.permata@semenpadang.co.id",
        phone: "081456789012",
        nip: "199001152015032001",
      },
      unitSection: "Biro Sistem Informasi",
      completed: false,
      logbookCount: 4,
      guidanceWeeks: [1],
    },
  ];

  const internships = [];

  for (const cfg of internshipConfigs) {
    const data = {
      studentId: cfg.student.id,
      proposalId: cfg.proposal.id,
      supervisorId: cfg.supervisor.id,
      supLetterId: cfg.letter.id,
      fieldSupervisorName: cfg.fieldSup.name,
      fieldSupervisorEmail: cfg.fieldSup.email,
      fieldSupervisorPhone: cfg.fieldSup.phone,
      fieldSupervisorNip: cfg.fieldSup.nip,
      unitSection: cfg.unitSection,
      actualStartDate: new Date(cfg.startDate),
      actualEndDate: new Date(cfg.endDate),
      status: cfg.status,
    };

    // ── Completed internships: add all documents & grades ──
    if (cfg.completed) {
      const nim = cfg.student.identityNumber;

      const reportDoc = await createDoc(cfg.student.id, `laporan_kp_${nim}.pdf`, "Laporan Internship");
      const feedbackDoc = await createDoc(cfg.supervisor.id, `feedback_laporan_${nim}.pdf`);
      const fieldAssessDoc = await createDoc(cfg.student.id, `penilaian_lapangan_${nim}.pdf`, "Nilai Pembimbing Lapangan");
      const certDoc = await createDoc(cfg.student.id, `sertifikat_selesai_kp_${nim}.pdf`, "Sertifikat Selesai KP");
      const receiptDoc = await createDoc(cfg.student.id, `surat_penerimaan_kp_${nim}.pdf`);
      const logbookDoc = await createDoc(cfg.student.id, `logbook_kp_${nim}.pdf`, "Absensi Internship");
      const compReportDoc = await createDoc(cfg.student.id, `laporan_perusahaan_${nim}.pdf`);

      const isNabil = cfg.student.id === u.nabil.id;

      Object.assign(data, {
        // Report
        reportTitle: `Laporan Kerja Praktek di ${cfg.unitSection} - PT Telkom Indonesia`,
        reportDocumentId: reportDoc.id,
        reportStatus: "APPROVED",
        reportNotes: "Laporan sudah memenuhi standar penulisan dan konten yang baik.",
        reportUploadedAt: new Date("2026-01-10"),
        reportFeedbackDocumentId: feedbackDoc.id,

        // Assessment status
        lecturerAssessmentStatus: "COMPLETED",
        fieldAssessmentStatus: "COMPLETED",
        fieldAssessmentNotes: "Mahasiswa menunjukkan kinerja yang sangat baik selama pelaksanaan KP.",
        fieldAssessmentDocId: fieldAssessDoc.id,
        fieldAssessmentSubmittedAt: new Date("2026-01-05"),
        fieldAssessmentSignatureHash: `sig_field_${Math.random().toString(36).slice(2, 14)}`,

        // Completion certificate
        completionCertificateDocId: certDoc.id,
        completionCertificateStatus: "APPROVED",
        completionCertificateNotes: "Sertifikat selesai KP dari perusahaan telah diverifikasi.",

        // Company receipt
        companyReceiptDocId: receiptDoc.id,
        companyReceiptStatus: "APPROVED",

        // Logbook document
        logbookDocumentId: logbookDoc.id,
        logbookDocumentStatus: "APPROVED",
        isLogbookLocked: true,
        logbookLockedAt: new Date("2025-12-31"),
        logbookFieldSignatureHash: `sig_logbook_${Math.random().toString(36).slice(2, 14)}`,
        logbookFieldSignedAt: new Date("2025-12-31"),

        // Company report
        companyReportDocId: compReportDoc.id,
        companyReportStatus: "APPROVED",

        // Final grade
        finalNumericScore: isNabil ? 82.5 : 80.0,
        finalGrade: "A-",
      });
    }

    const internship = await prisma.internship.create({ data });
    internships.push({ ...cfg, internship });
    console.log(`  ✅ ${cfg.student.fullName} → ${cfg.status} (Pembimbing: ${cfg.supervisor.fullName})`);
  }

  // ══════════════════════════════════════════════════════════════
  // STEP 5: LOGBOOKS
  // ══════════════════════════════════════════════════════════════
  console.log("\n📓 Step 5: Logbooks");

  for (const item of internships) {
    const dates = getWeekdays(item.startDate, item.logbookCount);

    for (let i = 0; i < dates.length; i++) {
      await prisma.internshipLogbook.create({
        data: {
          internshipId: item.internship.id,
          activityDate: dates[i],
          activityDescription: ACTIVITIES[i % ACTIVITIES.length],
        },
      });
    }
    console.log(`  ✅ ${item.student.fullName}: ${item.logbookCount} entries`);
  }

  // ══════════════════════════════════════════════════════════════
  // STEP 6: GUIDANCE SESSIONS + ANSWERS
  // ══════════════════════════════════════════════════════════════
  console.log("\n📋 Step 6: Guidance Sessions");

  // Lookup existing questions and criteria
  const allQuestions = await prisma.internshipGuidanceQuestion.findMany({
    where: { academicYearId: ay.id },
    orderBy: [{ weekNumber: "asc" }, { orderIndex: "asc" }],
  });

  const allCriteria = await prisma.internshipGuidanceLecturerCriteria.findMany({
    where: { academicYearId: ay.id },
    orderBy: [{ weekNumber: "asc" }, { orderIndex: "asc" }],
  });

  if (allQuestions.length === 0) {
    console.log("  ⚠️  No guidance questions found. Run seed-guidance-question.js first.");
  }

  const studentAnswerTemplates = [
    "Minggu ini saya fokus mempelajari sistem yang ada di perusahaan dan memahami workflow kerja tim.",
    "Progress sudah sekitar 80% dari target minggu ini. Saya berhasil menyelesaikan modul utama yang ditugaskan.",
    "Sudah beradaptasi dengan baik di lingkungan kerja. Tim sangat supportif dan banyak membimbing.",
    "Menyelesaikan implementasi fitur baru sesuai arahan pembimbing lapangan dan melakukan testing bersama tim QA.",
  ];

  for (const item of internships) {
    let sessionCount = 0;

    for (let i = 0; i < item.guidanceWeeks.length; i++) {
      const weekNum = item.guidanceWeeks[i];

      // Determine status: for COMPLETED group, all APPROVED
      // For ONGOING group 2, week 1 = APPROVED, rest = SUBMITTED
      // For ONGOING group 3, all SUBMITTED
      let sessionStatus;
      if (item.completed) {
        sessionStatus = "APPROVED";
      } else if (item.logbookCount === 16) {
        // Group 2: first week APPROVED, rest SUBMITTED
        sessionStatus = i === 0 ? "APPROVED" : "SUBMITTED";
      } else {
        // Group 3: all SUBMITTED
        sessionStatus = "SUBMITTED";
      }

      const sessionDate = new Date(item.startDate);
      sessionDate.setDate(sessionDate.getDate() + (weekNum - 1) * 7 + 5); // Friday of each week

      const session = await prisma.internshipGuidanceSession.create({
        data: {
          internshipId: item.internship.id,
          weekNumber: weekNum,
          status: sessionStatus,
          submissionDate: sessionDate,
          approvedAt: sessionStatus === "APPROVED"
            ? new Date(sessionDate.getTime() + 2 * 24 * 60 * 60 * 1000) // 2 days later
            : null,
        },
      });

      // Create student answers for questions matching this week
      const weekQuestions = allQuestions.filter((q) => q.weekNumber === weekNum);
      for (const q of weekQuestions) {
        await prisma.internshipGuidanceStudentAnswer.create({
          data: {
            guidanceSessionId: session.id,
            questionId: q.id,
            weekNumber: weekNum,
            answerText: studentAnswerTemplates[(weekNum - 1) % studentAnswerTemplates.length],
          },
        });
      }

      // Create lecturer answers for criteria matching this week (only if APPROVED)
      if (sessionStatus === "APPROVED") {
        const weekCriteria = allCriteria.filter((c) => c.weekNumber === weekNum);
        for (const cr of weekCriteria) {
          await prisma.internshipGuidanceLecturerAnswer.create({
            data: {
              guidanceSessionId: session.id,
              criteriaId: cr.id,
              weekNumber: weekNum,
              evaluationValue: cr.inputType === "EVALUATION" ? "Sangat Aktif" : null,
              answerText: cr.inputType === "TEXT"
                ? "Mahasiswa menunjukkan progress yang baik dan aktif berkonsultasi."
                : null,
            },
          });
        }
      }

      sessionCount++;
    }

    console.log(`  ✅ ${item.student.fullName}: ${sessionCount} sessions`);
  }

  // ══════════════════════════════════════════════════════════════
  // STEP 7: SEMINARS (Group 1 only — COMPLETED)
  // ══════════════════════════════════════════════════════════════
  console.log("\n🎓 Step 7: Seminars");

  if (!room) {
    console.log("  ⚠️  Room not found, skipping seminars.");
  } else {
    const completedItems = internships.filter((i) => i.completed);
    const moderators = [u.mustafa, u.daffa];
    const audienceCandidates = [u.mustafa, u.nouval, u.daffa, u.ilham, u.syauqi];

    for (let idx = 0; idx < completedItems.length; idx++) {
      const item = completedItems[idx];

      // Seminar date: mid-January 2026 (after KP ends Dec 2025)
      const seminarDate = new Date("2026-01-15");
      seminarDate.setDate(seminarDate.getDate() + idx * 3);

      const startTime = new Date(seminarDate);
      startTime.setHours(9, 0, 0, 0);
      const endTime = new Date(seminarDate);
      endTime.setHours(11, 0, 0, 0);

      // Berita acara document
      const beritaAcaraDoc = await createDoc(
        item.supervisor.id,
        `berita_acara_seminar_${item.student.identityNumber}.pdf`
      );

      const seminar = await prisma.internshipSeminar.create({
        data: {
          internshipId: item.internship.id,
          roomId: room.id,
          seminarDate,
          startTime,
          endTime,
          linkMeeting: `https://meet.google.com/kp-seminar-${idx + 1}`,
          moderatorStudentId: moderators[idx % moderators.length].id,
          status: "COMPLETED",
          approvedBy: item.supervisor.id, // Afriyanti approves
          supervisorNotes: "Seminar berjalan lancar. Mahasiswa mempresentasikan hasil KP dengan baik dan menjawab pertanyaan dengan memuaskan.",
          beritaAcaraDocumentId: beritaAcaraDoc.id,
        },
      });

      // Add audiences (4 students from other groups, exclude the presenting student)
      const audiences = audienceCandidates
        .filter((s) => s.id !== item.student.id)
        .slice(0, 4);

      for (const aud of audiences) {
        await prisma.internshipSeminarAudience.create({
          data: {
            seminarId: seminar.id,
            studentId: aud.id,
            status: "VALIDATED",
            validatedAt: seminarDate,
          },
        });
      }

      console.log(`  ✅ Seminar: ${item.student.fullName} [COMPLETED] + ${audiences.length} audiences`);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // STEP 8: ASSESSMENT SCORES (Group 1 only — COMPLETED)
  // ══════════════════════════════════════════════════════════════
  console.log("\n📊 Step 8: Assessment Scores");

  // Lookup CPMK and rubrics
  const cpmks = await prisma.internshipCpmk.findMany({
    where: { academicYearId: ay.id },
    include: { rubrics: true },
  });

  const fieldCpmk = cpmks.find((c) => c.assessorType === "FIELD");
  const lecturerCpmk = cpmks.find((c) => c.assessorType === "LECTURER");

  if (!fieldCpmk || !lecturerCpmk) {
    console.log("  ⚠️  CPMK data not found. Run seed-internship-cpmk.js first.");
  } else {
    const completedItems = internships.filter((i) => i.completed);
    const fieldRubric = fieldCpmk.rubrics.find((r) => r.levelName === "Sangat Baik");
    const lectRubric = lecturerCpmk.rubrics.find((r) => r.levelName === "Sangat Baik");

    if (!fieldRubric || !lectRubric) {
      console.log("  ⚠️  Rubric 'Sangat Baik' not found, skipping scores.");
    } else {
      for (const item of completedItems) {
        const isNabil = item.student.id === u.nabil.id;

        // Field assessment score (CPMK-1, 50%)
        await prisma.internshipFieldScore.create({
          data: {
            internshipId: item.internship.id,
            chosenRubricId: fieldRubric.id,
            score: isNabil ? 85 : 82,
          },
        });

        // Lecturer assessment score (CPMK-2, 50%)
        await prisma.internshipLecturerScore.create({
          data: {
            internshipId: item.internship.id,
            chosenRubricId: lectRubric.id,
            score: isNabil ? 80 : 78,
          },
        });

        console.log(`  ✅ ${item.student.fullName}: Field=${isNabil ? 85 : 82}, Lecturer=${isNabil ? 80 : 78}`);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════════════════════════
  console.log("\n" + "=".repeat(60));
  console.log("✨ INTERNSHIP SEED COMPLETED SUCCESSFULLY!");
  console.log("=".repeat(60));

  console.log("\n📋 SUMMARY:");
  console.log("   🏢 Companies: 4 (Telkom, BNI, Semen Padang, Digital Nusantara)");
  console.log("   📝 Proposals: 4 (3 ACCEPTED_BY_COMPANY, 1 PENDING)");
  console.log("   📜 Supervisor Letters: 3");
  console.log("   🏢 Internships: 6 total");
  console.log("");
  console.log("   ┌────────────────────────────────────────────────────────┐");
  console.log("   │ Kelompok 1 — COMPLETED                                │");
  console.log("   │   Nabil + Khalied → PT Telkom Indonesia               │");
  console.log("   │   Pembimbing: Afriyanti (Sekdep)                      │");
  console.log("   │   📓 20 logbook | 📋 4 guidance | 🎓 Seminar ✅       │");
  console.log("   │   📊 Nilai: A-                                        │");
  console.log("   ├────────────────────────────────────────────────────────┤");
  console.log("   │ Kelompok 2 — ONGOING (4 minggu)                       │");
  console.log("   │   Mustafa + Nouval → PT Bank Negara Indonesia         │");
  console.log("   │   Pembimbing: Ricky Akbar (Kadep)                     │");
  console.log("   │   📓 16 logbook | 📋 2 guidance                       │");
  console.log("   ├────────────────────────────────────────────────────────┤");
  console.log("   │ Kelompok 3 — ONGOING (1 minggu)                       │");
  console.log("   │   Daffa + Ilham → PT Semen Padang                     │");
  console.log("   │   Pembimbing: Aina Hubby                              │");
  console.log("   │   📓 4 logbook  | 📋 1 guidance                       │");
  console.log("   ├────────────────────────────────────────────────────────┤");
  console.log("   │ Kelompok 4 — PENDING                                  │");
  console.log("   │   Syauqi → CV Digital Nusantara                       │");
  console.log("   │   Belum ada internship (proposal masih pending)       │");
  console.log("   └────────────────────────────────────────────────────────┘");
}

main()
  .catch((e) => {
    console.error("\n❌ SEED FAILED:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
