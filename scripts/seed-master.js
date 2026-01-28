/**
 * Master Seed Script - Orchestrates all seed scripts
 * 
 * Usage: node scripts/seed-master.js
 * 
 * This script runs all seeds in the correct order to avoid conflicts.
 */

import { PrismaClient } from "../src/generated/prisma/index.js";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

// ============================================================
// CONSTANTS - Role names sesuai dengan constants/roles.js
// ============================================================
const ROLES = {
  KETUA_DEPARTEMEN: "Ketua Departemen",
  SEKRETARIS_DEPARTEMEN: "Sekretaris Departemen",
  PEMBIMBING_1: "Pembimbing 1",
  PEMBIMBING_2: "Pembimbing 2",
  ADMIN: "Admin",
  PENGUJI: "Penguji",
  MAHASISWA: "Mahasiswa",
  GKM: "GKM",
};

const DEFAULT_PASSWORD = "password123";

// ============================================================
// UTILITY FUNCTIONS
// ============================================================
function generateNIP() {
  let nip = "";
  for (let i = 0; i < 18; i++) {
    nip += Math.floor(Math.random() * 10).toString();
  }
  return nip;
}

function norm(s) {
  return String(s || "").trim().toLowerCase();
}

// ============================================================
// 1. SEED ROLES
// ============================================================
async function seedRoles() {
  console.log("\n" + "=".repeat(60));
  console.log("📋 STEP 1: Seeding Roles...");
  console.log("=".repeat(60));

  const roleNames = Object.values(ROLES);
  const roleMap = new Map();

  for (const roleName of roleNames) {
    let role = await prisma.userRole.findFirst({
      where: { name: roleName },
    });
    if (!role) {
      role = await prisma.userRole.create({
        data: { name: roleName },
      });
      console.log(`  ✅ Created role: ${roleName}`);
    } else {
      console.log(`  ⏭️  Role exists: ${roleName}`);
    }
    roleMap.set(roleName, role);
  }

  return roleMap;
}

// ============================================================
// 2. SEED STUDENT STATUS
// ============================================================
async function seedStudentStatus() {
  console.log("\n" + "=".repeat(60));
  console.log("📚 STEP 2: Seeding Student Status...");
  console.log("=".repeat(60));

  const statuses = ["Aktif", "Cuti", "Lulus", "Drop Out", "Mengundurkan Diri"];
  const statusMap = new Map();

  for (const name of statuses) {
    let status = await prisma.studentStatus.findFirst({
      where: { name },
    });
    if (!status) {
      status = await prisma.studentStatus.create({ data: { name } });
      console.log(`  ✅ Created status: ${name}`);
    } else {
      console.log(`  ⏭️  Status exists: ${name}`);
    }
    statusMap.set(name, status);
  }

  return statusMap;
}

// ============================================================
// 3. SEED THESIS STATUS
// ============================================================
async function seedThesisStatus() {
  console.log("\n" + "=".repeat(60));
  console.log("📝 STEP 3: Seeding Thesis Status...");
  console.log("=".repeat(60));

  const statuses = [
    "Pengajuan Judul",
    "Bimbingan",
    "Acc Seminar",      // Milestone 100% + kedua pembimbing approve
    "Seminar Proposal",
    "Revisi Seminar",
    "Sidang",
    "Revisi Sidang",
    "Selesai",
    "Gagal",
  ];
  const statusMap = new Map();

  for (const name of statuses) {
    let status = await prisma.thesisStatus.findFirst({
      where: { name },
    });
    if (!status) {
      status = await prisma.thesisStatus.create({ data: { name } });
      console.log(`  ✅ Created thesis status: ${name}`);
    } else {
      console.log(`  ⏭️  Thesis status exists: ${name}`);
    }
    statusMap.set(name, status);
  }

  return statusMap;
}

// ============================================================
// 4. SEED ACADEMIC YEARS
// ============================================================
async function seedAcademicYears() {
  console.log("\n" + "=".repeat(60));
  console.log("📅 STEP 4: Seeding Academic Years...");
  console.log("=".repeat(60));

  const academicYears = [
    {
      semester: "ganjil",
      year: 2024,
      startDate: new Date("2024-08-01"),
      endDate: new Date("2025-01-31"),
      isActive: false,
    },
    {
      semester: "genap",
      year: 2024,
      startDate: new Date("2025-02-01"),
      endDate: new Date("2025-07-31"),
      isActive: false,
    },
    {
      semester: "ganjil",
      year: 2025,
      startDate: new Date("2025-08-01"),
      endDate: new Date("2026-01-31"),
      isActive: true, // Current active academic year (Start August 2025)
    },
  ];

  const yearMap = new Map();

  for (const ay of academicYears) {
    const key = `${ay.semester}-${ay.year}`;
    let existing = await prisma.academicYear.findFirst({
      where: { semester: ay.semester, year: ay.year },
    });
    if (!existing) {
      existing = await prisma.academicYear.create({ data: ay });
      console.log(`  ✅ Created academic year: ${key}${ay.isActive ? ' (ACTIVE)' : ''}`);
    } else {
      // Update isActive if needed
      if (existing.isActive !== ay.isActive) {
        existing = await prisma.academicYear.update({
          where: { id: existing.id },
          data: { isActive: ay.isActive },
        });
        console.log(`  🔄 Updated academic year: ${key}${ay.isActive ? ' (ACTIVE)' : ''}`);
      } else {
        console.log(`  ⏭️  Academic year exists: ${key}${existing.isActive ? ' (ACTIVE)' : ''}`);
      }
    }
    yearMap.set(key, existing);
  }

  return yearMap;
}

// ============================================================
// 5. SEED THESIS MILESTONE TEMPLATES
// ============================================================
async function seedMilestoneTemplates() {
  console.log("\n" + "=".repeat(60));
  console.log("📊 STEP 5: Seeding Thesis Milestone Templates...");
  console.log("=".repeat(60));

  const templates = [
    { name: "Pengajuan Judul", description: "Judul tugas akhir telah disetujui", category: "persiapan", orderIndex: 1 },
    { name: "BAB I - Pendahuluan", description: "Bab 1 telah disetujui pembimbing", category: "penulisan", orderIndex: 2 },
    { name: "BAB II - Tinjauan Pustaka", description: "Bab 2 telah disetujui pembimbing", category: "penulisan", orderIndex: 3 },
    { name: "BAB III - Metodologi", description: "Bab 3 telah disetujui pembimbing", category: "penulisan", orderIndex: 4 },
    { name: "Seminar Proposal", description: "Telah melaksanakan seminar proposal", category: "seminar", orderIndex: 5 },
    { name: "BAB IV - Implementasi", description: "Bab 4 telah disetujui pembimbing", category: "implementasi", orderIndex: 6 },
    { name: "BAB V - Pengujian", description: "Bab 5 telah disetujui pembimbing", category: "implementasi", orderIndex: 7 },
    { name: "BAB VI - Kesimpulan", description: "Bab 6 telah disetujui pembimbing", category: "penulisan", orderIndex: 8 },
    { name: "Sidang Tugas Akhir", description: "Telah melaksanakan sidang tugas akhir", category: "sidang", orderIndex: 9 },
    { name: "Revisi Final", description: "Revisi final telah disetujui", category: "revisi", orderIndex: 10 },
  ];

  const templateMap = new Map();

  for (const template of templates) {
    let existing = await prisma.thesisMilestoneTemplate.findFirst({
      where: { name: template.name },
    });
    if (!existing) {
      existing = await prisma.thesisMilestoneTemplate.create({ data: template });
      console.log(`  ✅ Created template: ${template.name}`);
    } else {
      console.log(`  ⏭️  Template exists: ${template.name}`);
    }
    templateMap.set(template.name, existing);
  }

  return templateMap;
}

// ============================================================
// 6. SEED USERS (Lecturers & Students)
// ============================================================
async function seedUsers(roleMap, studentStatusMap) {
  console.log("\n" + "=".repeat(60));
  console.log("👥 STEP 6: Seeding Users...");
  console.log("=".repeat(60));

  const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  const activeStatus = studentStatusMap.get("Aktif");

  // User data with fixed NIP for reproducibility
  const usersData = [
    {
      email: "kadep_si@fti.unand.ac.id",
      fullName: "Dr. Ahmad Kadep, M.Kom",
      identityType: "NIP",
      identityNumber: "198501012010011001",
      roles: [ROLES.KETUA_DEPARTEMEN, ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2, ROLES.PENGUJI],
      isLecturer: true,
    },
    {
      email: "sekdep_si@fti.unand.ac.id",
      fullName: "Dr. Budi Sekdep, M.T",
      identityType: "NIP",
      identityNumber: "198602022011012002",
      roles: [ROLES.SEKRETARIS_DEPARTEMEN, ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2, ROLES.PENGUJI],
      isLecturer: true,
    },
    {
      email: "pembimbing_si@fti.unand.ac.id",
      fullName: "Dr. Candra Pembimbing, M.Cs",
      identityType: "NIP",
      identityNumber: "198703032012013003",
      roles: [ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2, ROLES.PENGUJI],
      isLecturer: true,
    },
    {
      email: "penguji_si@fti.unand.ac.id",
      fullName: "Dr. Diana Penguji, M.Sc",
      identityType: "NIP",
      identityNumber: "198804042013014004",
      roles: [ROLES.PENGUJI, ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2],
      isLecturer: true,
    },
    {
      email: "gkm_si@fti.unand.ac.id",
      fullName: "Dr. Erik GKM, M.Eng",
      identityType: "NIP",
      identityNumber: "198905052014015005",
      roles: [ROLES.GKM, ROLES.PENGUJI, ROLES.PEMBIMBING_2],
      isLecturer: true,
    },
    {
      email: "admin_si@fti.unand.ac.id",
      fullName: "Admin Sistem FTI",
      identityType: "OTHER",
      identityNumber: "ADMIN001",
      roles: [ROLES.ADMIN],
      isLecturer: false,
    },
    {
      email: "fariz_2211523034@fti.unand.ac.id",
      fullName: "Muhammad Fariz",
      identityType: "NIM",
      identityNumber: "2211523034",
      roles: [ROLES.MAHASISWA],
      isStudent: true,
      enrollmentYear: 2022,
      sksCompleted: 122,
    },
    {
      email: "nabil_2211522018@fti.unand.ac.id",
      fullName: "Nabil Rizki Navisa",
      identityType: "NIM",
      identityNumber: "2211522018",
      roles: [ROLES.MAHASISWA],
      isStudent: true,
      enrollmentYear: 2022,
      sksCompleted: 118,
    },
    {
      email: "alya_202101001@fti.unand.ac.id",
      fullName: "Alya Prameswari",
      identityType: "NIM",
      identityNumber: "202101001",
      roles: [ROLES.MAHASISWA],
      isStudent: true,
      enrollmentYear: 2021,
      sksCompleted: 112,
    },
    {
      email: "bagas_202101014@fti.unand.ac.id",
      fullName: "Bagas Wiratama",
      identityType: "NIM",
      identityNumber: "202101014",
      roles: [ROLES.MAHASISWA],
      isStudent: true,
      enrollmentYear: 2021,
      sksCompleted: 98,
    },
    {
      email: "chandra_202001111@fti.unand.ac.id",
      fullName: "Chandra Mahardika",
      identityType: "NIM",
      identityNumber: "202001111",
      roles: [ROLES.MAHASISWA],
      isStudent: true,
      enrollmentYear: 2020,
      sksCompleted: 126,
    },
    {
      email: "siti_2211523001@fti.unand.ac.id",
      fullName: "Siti Rahmawati",
      identityType: "NIM",
      identityNumber: "2211523001",
      roles: [ROLES.MAHASISWA],
      isStudent: true,
      enrollmentYear: 2022,
    },
    {
      email: "andi_2211523002@fti.unand.ac.id",
      fullName: "Andi Pratama",
      identityType: "NIM",
      identityNumber: "2211523002",
      roles: [ROLES.MAHASISWA],
      isStudent: true,
      enrollmentYear: 2023,
    },
    {
      email: "laila_2211523003@fti.unand.ac.id",
      fullName: "Laila Khairunnisa",
      identityType: "NIM",
      identityNumber: "2211523003",
      roles: [ROLES.MAHASISWA],
      isStudent: true,
      enrollmentYear: 2023,
    },
    {
      email: "rafi_2211523004@fti.unand.ac.id",
      fullName: "Rafi Nugraha",
      identityType: "NIM",
      identityNumber: "2211523004",
      roles: [ROLES.MAHASISWA],
      isStudent: true,
      enrollmentYear: 2024,
    },
    {
      email: "maria_2211523005@fti.unand.ac.id",
      fullName: "Maria Gabriella",
      identityType: "NIM",
      identityNumber: "2211523005",
      roles: [ROLES.MAHASISWA],
      isStudent: true,
      enrollmentYear: 2024,
    },
  ];

  const userMap = new Map();

  for (const userData of usersData) {
    // Check if user exists by email or identity number
    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: userData.email },
          { identityNumber: userData.identityNumber },
        ],
      },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: userData.email,
          fullName: userData.fullName,
          identityType: userData.identityType,
          identityNumber: userData.identityNumber,
          password: hashedPassword,
          isVerified: true,
        },
      });
      console.log(`  ✅ Created user: ${userData.email}`);
    } else {
      console.log(`  ⏭️  User exists: ${userData.email}`);
    }

    userMap.set(userData.email, user);

    // Assign roles
    for (const roleName of userData.roles) {
      const role = roleMap.get(roleName);
      if (!role) continue;

      const existingAssignment = await prisma.userHasRole.findUnique({
        where: {
          userId_roleId: { userId: user.id, roleId: role.id },
        },
      });

      if (!existingAssignment) {
        await prisma.userHasRole.create({
          data: { userId: user.id, roleId: role.id, status: "active" },
        });
        console.log(`    📌 Assigned role: ${roleName}`);
      }
    }

    // Create Student record if needed
    if (userData.isStudent) {
      const existingStudent = await prisma.student.findUnique({
        where: { id: user.id },
      });
      if (!existingStudent) {
        await prisma.student.create({
          data: {
            id: user.id,
            studentStatusId: activeStatus.id,
            enrollmentYear: userData.enrollmentYear || 2022,
            skscompleted: userData.sksCompleted || 120,
          },
        });
        console.log(`    🎓 Created Student record`);
      }
    }

    // Create Lecturer record if needed
    if (userData.isLecturer) {
      const existingLecturer = await prisma.lecturer.findUnique({
        where: { id: user.id },
      });
      if (!existingLecturer) {
        await prisma.lecturer.create({
          data: { id: user.id },
        });
        console.log(`    👨‍🏫 Created Lecturer record`);
      }
    }
  }

  return userMap;
}

// ============================================================
// 7. SEED THESIS WITH PARTICIPANTS & EXAMINERS
// ============================================================
async function seedThesis(userMap, roleMap, thesisStatusMap, academicYearMap) {
  console.log("\n" + "=".repeat(60));
  console.log("📖 STEP 7: Seeding Thesis with Participants...");
  console.log("=".repeat(60));

  const bimbinganStatus = thesisStatusMap.get("Bimbingan");
  const currentAcademicYear = academicYearMap.get("ganjil-2025");

  const pembimbing1Role = roleMap.get(ROLES.PEMBIMBING_1);
  const pembimbing2Role = roleMap.get(ROLES.PEMBIMBING_2);

  // Get users
  const fariz = userMap.get("fariz_2211523034@fti.unand.ac.id");
  const nabil = userMap.get("nabil_2211522018@fti.unand.ac.id");
  const kadep = userMap.get("kadep_si@fti.unand.ac.id");
  const pembimbing = userMap.get("pembimbing_si@fti.unand.ac.id");
  const penguji = userMap.get("penguji_si@fti.unand.ac.id");
  const sekdep = userMap.get("sekdep_si@fti.unand.ac.id");

  const thesisMap = new Map();

  // Thesis for Fariz
  if (fariz && kadep && pembimbing && penguji) {
    let thesis = await prisma.thesis.findFirst({
      where: { studentId: fariz.id },
    });

    if (!thesis) {
      const startDate = new Date("2025-08-01");
      const deadlineDate = new Date(startDate);
      deadlineDate.setFullYear(deadlineDate.getFullYear() + 1);

      thesis = await prisma.thesis.create({
        data: {
          studentId: fariz.id,
          title: "Implementasi Sistem Informasi Manajemen Tugas Akhir Berbasis Web",
          startDate: startDate,
          deadlineDate: deadlineDate,
          thesisStatusId: bimbinganStatus?.id,
          academicYearId: currentAcademicYear?.id,
        },
      });
      console.log(`  ✅ Created thesis for Fariz (Start: ${startDate.toISOString().split('T')[0]}, Deadline: ${deadlineDate.toISOString().split('T')[0]})`);

      // Add Pembimbing 1
      await prisma.thesisParticipant.create({
        data: {
          thesisId: thesis.id,
          lecturerId: kadep.id,
          roleId: pembimbing1Role.id,
        },
      });
      console.log(`    📌 Pembimbing 1: Dr. Ahmad Kadep`);

      // Add Pembimbing 2
      await prisma.thesisParticipant.create({
        data: {
          thesisId: thesis.id,
          lecturerId: pembimbing.id,
          roleId: pembimbing2Role.id,
        },
      });
      console.log(`    📌 Pembimbing 2: Dr. Candra Pembimbing`);

      // Add Penguji for seminar
      await prisma.thesisExaminer.create({
        data: {
          thesisId: thesis.id,
          lecturerId: penguji.id,
          eventType: "seminar",
          isChair: true,
        },
      });
      console.log(`    🔍 Penguji Seminar (Chair): Dr. Diana Penguji`);

      await prisma.thesisExaminer.create({
        data: {
          thesisId: thesis.id,
          lecturerId: sekdep.id,
          eventType: "seminar",
          isChair: false,
        },
      });
      console.log(`    🔍 Penguji Seminar: Dr. Budi Sekdep`);
    } else {
      console.log(`  ⏭️  Thesis exists for Fariz - Updating Dates`);
      const startDate = new Date("2025-08-01");
      const deadlineDate = new Date(startDate);
      deadlineDate.setFullYear(deadlineDate.getFullYear() + 1);
      
      thesis = await prisma.thesis.update({
        where: { id: thesis.id },
        data: { 
            startDate: startDate,
            deadlineDate: deadlineDate 
        }
      });
    }
    thesisMap.set(fariz.id, thesis);
  }

  // Thesis for Nabil
  if (nabil && pembimbing && penguji && sekdep) {
    let thesis = await prisma.thesis.findFirst({
      where: { studentId: nabil.id },
    });

    if (!thesis) {
      const startDate = new Date("2025-08-01");
      const deadlineDate = new Date(startDate);
      deadlineDate.setFullYear(deadlineDate.getFullYear() + 1);

      thesis = await prisma.thesis.create({
        data: {
          studentId: nabil.id,
          title: "Pengembangan Aplikasi Mobile untuk Monitoring Bimbingan Tugas Akhir",
          startDate: startDate,
          deadlineDate: deadlineDate,
          thesisStatusId: bimbinganStatus?.id,
          academicYearId: currentAcademicYear?.id,
        },
      });
      console.log(`  ✅ Created thesis for Nabil (Start: ${startDate.toISOString().split('T')[0]}, Deadline: ${deadlineDate.toISOString().split('T')[0]})`);

      // Add Pembimbing 1
      await prisma.thesisParticipant.create({
        data: {
          thesisId: thesis.id,
          lecturerId: pembimbing.id,
          roleId: pembimbing1Role.id,
        },
      });
      console.log(`    📌 Pembimbing 1: Dr. Candra Pembimbing`);

      // Add Pembimbing 2
      await prisma.thesisParticipant.create({
        data: {
          thesisId: thesis.id,
          lecturerId: penguji.id,
          roleId: pembimbing2Role.id,
        },
      });
      console.log(`    📌 Pembimbing 2: Dr. Diana Penguji`);

      // Add Penguji for seminar
      await prisma.thesisExaminer.create({
        data: {
          thesisId: thesis.id,
          lecturerId: kadep.id,
          eventType: "seminar",
          isChair: true,
        },
      });
      console.log(`    🔍 Penguji Seminar (Chair): Dr. Ahmad Kadep`);
    } else {
      console.log(`  ⏭️  Thesis exists for Nabil - Updating Dates`);
      const startDate = new Date("2025-08-01");
      const deadlineDate = new Date(startDate);
      deadlineDate.setFullYear(deadlineDate.getFullYear() + 1);
      
      thesis = await prisma.thesis.update({
        where: { id: thesis.id },
        data: { 
            startDate: startDate,
            deadlineDate: deadlineDate 
        }
      });
    }
    thesisMap.set(nabil.id, thesis);
  }

  return thesisMap;
}

// ============================================================
// 8. SEED THESIS MILESTONES (Custom per Thesis)
// ============================================================
async function seedThesisMilestones(thesisMap, userMap) {
  console.log("\n" + "=".repeat(60));
  console.log("✅ STEP 8: Seeding Thesis Milestones...");
  console.log("=".repeat(60));

  const kadep = userMap.get("kadep_si@fti.unand.ac.id");

  // For each thesis, create custom milestones
  for (const [studentId, thesis] of thesisMap) {
    if (!thesis) continue;

    // Check if already has milestones
    const existingCount = await prisma.thesisMilestone.count({
      where: { thesisId: thesis.id },
    });

    if (existingCount > 0) {
      console.log(`  ⏭️  Milestones exist for thesis: ${thesis.title?.slice(0, 30)}...`);
      continue;
    }

    // Create milestones for this thesis
    const milestones = [
      { 
        title: "Pengajuan Judul", 
        description: "Judul tugas akhir telah disetujui",
        orderIndex: 1,
        targetDate: new Date("2025-08-15"),
        status: "completed",
        progressPercentage: 100,
        startedAt: new Date("2025-08-01"),
        completedAt: new Date("2025-08-10"),
        validatedBy: kadep?.id,
        validatedAt: new Date("2025-08-10"),
        supervisorNotes: "Judul sudah bagus dan fokus",
      },
      { 
        title: "BAB I - Pendahuluan", 
        description: "Latar belakang, rumusan masalah, tujuan penelitian",
        orderIndex: 2,
        targetDate: new Date("2025-09-01"),
        status: "completed",
        progressPercentage: 100,
        startedAt: new Date("2025-08-11"),
        completedAt: new Date("2025-08-28"),
        validatedBy: kadep?.id,
        validatedAt: new Date("2025-08-28"),
        supervisorNotes: "BAB I sudah lengkap, lanjut ke BAB II",
      },
      { 
        title: "BAB II - Tinjauan Pustaka", 
        description: "Dasar teori dan penelitian terkait",
        orderIndex: 3,
        targetDate: new Date("2025-09-20"),
        status: "completed",
        progressPercentage: 100,
        startedAt: new Date("2025-09-01"),
        completedAt: new Date("2025-09-18"),
        validatedBy: kadep?.id,
        validatedAt: new Date("2025-09-18"),
        supervisorNotes: "Referensi sudah cukup, tambahkan jurnal internasional",
      },
      { 
        title: "BAB III - Metodologi", 
        description: "Metodologi penelitian dan perancangan sistem",
        orderIndex: 4,
        targetDate: new Date("2025-10-15"),
        status: "in_progress",
        progressPercentage: 60,
        startedAt: new Date("2025-09-20"),
        studentNotes: "Sedang menyusun diagram alir dan use case",
      },
      { 
        title: "BAB IV - Implementasi", 
        description: "Implementasi sistem dan coding",
        orderIndex: 5,
        targetDate: new Date("2025-11-15"),
        status: "not_started",
        progressPercentage: 0,
      },
      { 
        title: "BAB V - Pengujian", 
        description: "Pengujian sistem dan analisis hasil",
        orderIndex: 6,
        targetDate: new Date("2025-12-15"),
        status: "not_started",
        progressPercentage: 0,
      },
    ];

    for (const milestone of milestones) {
      await prisma.thesisMilestone.create({
        data: {
          thesisId: thesis.id,
          ...milestone,
        },
      });
      console.log(`  ✅ Created milestone: ${milestone.title} (${milestone.status})`);
    }
  }
}

// ============================================================
// 9. SEED THESIS GUIDANCES (Sample Bimbingan Data)
// ============================================================
async function seedGuidances(thesisMap, userMap) {
  console.log("\n" + "=".repeat(60));
  console.log("📆 STEP 9: Seeding Thesis Guidances (Bimbingan)...");
  console.log("=".repeat(60));

  const fariz = userMap.get("fariz_2211523034@fti.unand.ac.id");
  const nabil = userMap.get("nabil_2211522018@fti.unand.ac.id");
  const kadep = userMap.get("kadep_si@fti.unand.ac.id");
  const pembimbing = userMap.get("pembimbing_si@fti.unand.ac.id");
  const penguji = userMap.get("penguji_si@fti.unand.ac.id");

  // Get lecturer records
  const kadepLecturer = await prisma.lecturer.findUnique({ where: { id: kadep?.id } });
  const pembimbingLecturer = await prisma.lecturer.findUnique({ where: { id: pembimbing?.id } });
  const pengujiLecturer = await prisma.lecturer.findUnique({ where: { id: penguji?.id } });

  // Thesis data
  const farizThesis = thesisMap.get(fariz?.id);
  const nabilThesis = thesisMap.get(nabil?.id);

  // Sample guidances for Fariz
  if (farizThesis && kadepLecturer && pembimbingLecturer) {
    const existingCount = await prisma.thesisGuidance.count({
      where: { thesisId: farizThesis.id },
    });

    if (existingCount === 0) {
      // Completed guidance
      await prisma.thesisGuidance.create({
        data: {
          thesisId: farizThesis.id,
          supervisorId: kadepLecturer.id,
          requestedDate: new Date("2025-09-01T10:00:00"),
          approvedDate: new Date("2025-09-01T10:00:00"),
          duration: 60,
          type: "online",
          meetingUrl: "https://meet.google.com/abc-defg-hij",
          studentNotes: "Konsultasi BAB I - Latar belakang dan rumusan masalah",
          supervisorFeedback: "BAB I sudah baik, lanjut ke BAB II. Perbanyak referensi jurnal internasional.",
          status: "completed",
          completedAt: new Date("2025-09-01T11:00:00"),
        },
      });
      console.log(`  ✅ Created completed guidance #1 for Fariz`);

      await prisma.thesisGuidance.create({
        data: {
          thesisId: farizThesis.id,
          supervisorId: pembimbingLecturer.id,
          requestedDate: new Date("2025-09-15T14:00:00"),
          approvedDate: new Date("2025-09-15T14:00:00"),
          duration: 90,
          type: "offline",
          location: "Ruang Dosen Lt. 2",
          studentNotes: "Konsultasi BAB II - Tinjauan pustaka sistem informasi",
          supervisorFeedback: "Tambahkan referensi tentang REST API dan microservices",
          status: "completed",
          completedAt: new Date("2025-09-15T15:30:00"),
        },
      });
      console.log(`  ✅ Created completed guidance #2 for Fariz`);

      // Accepted guidance (upcoming)
      await prisma.thesisGuidance.create({
        data: {
          thesisId: farizThesis.id,
          supervisorId: kadepLecturer.id,
          requestedDate: new Date("2025-11-20T10:00:00"),
          approvedDate: new Date("2025-11-20T10:00:00"),
          duration: 60,
          type: "online",
          meetingUrl: "https://meet.google.com/xyz-uvwx-yz",
          studentNotes: "Konsultasi BAB III - Metodologi penelitian",
          status: "accepted",
        },
      });
      console.log(`  ✅ Created accepted guidance #3 for Fariz`);

      // Requested guidance (pending)
      await prisma.thesisGuidance.create({
        data: {
          thesisId: farizThesis.id,
          supervisorId: pembimbingLecturer.id,
          requestedDate: new Date("2025-11-25T14:00:00"),
          duration: 60,
          type: "online",
          studentNotes: "Ingin konsultasi progress BAB IV - Implementasi sistem",
          status: "requested",
        },
      });
      console.log(`  ✅ Created requested guidance #4 for Fariz`);
    } else {
      console.log(`  ⏭️  Guidances exist for Fariz`);
    }
  }

  // Sample guidances for Nabil
  if (nabilThesis && pembimbingLecturer && pengujiLecturer) {
    const existingCount = await prisma.thesisGuidance.count({
      where: { thesisId: nabilThesis.id },
    });

    if (existingCount === 0) {
      // Completed guidance
      await prisma.thesisGuidance.create({
        data: {
          thesisId: nabilThesis.id,
          supervisorId: pembimbingLecturer.id,
          requestedDate: new Date("2025-09-05T09:00:00"),
          approvedDate: new Date("2025-09-05T09:00:00"),
          duration: 60,
          type: "online",
          meetingUrl: "https://zoom.us/j/123456789",
          studentNotes: "Konsultasi judul dan outline proposal",
          supervisorFeedback: "Judul sudah bagus, fokus pada fitur monitoring real-time",
          status: "completed",
          completedAt: new Date("2025-09-05T10:00:00"),
        },
      });
      console.log(`  ✅ Created completed guidance #1 for Nabil`);

      // Accepted guidance
      await prisma.thesisGuidance.create({
        data: {
          thesisId: nabilThesis.id,
          supervisorId: pengujiLecturer.id,
          requestedDate: new Date("2025-11-22T13:00:00"),
          approvedDate: new Date("2025-11-22T13:00:00"),
          duration: 45,
          type: "offline",
          location: "Lab Komputer",
          studentNotes: "Demo progress aplikasi mobile",
          status: "accepted",
        },
      });
      console.log(`  ✅ Created accepted guidance #2 for Nabil`);

      // Rejected guidance (example)
      await prisma.thesisGuidance.create({
        data: {
          thesisId: nabilThesis.id,
          supervisorId: pembimbingLecturer.id,
          requestedDate: new Date("2025-10-10T08:00:00"),
          duration: 60,
          type: "online",
          studentNotes: "Konsultasi BAB III",
          status: "rejected",
          rejectionReason: "Jadwal bentrok dengan seminar, silakan ajukan ulang untuk minggu depan",
        },
      });
      console.log(`  ✅ Created rejected guidance #3 for Nabil`);
    } else {
      console.log(`  ⏭️  Guidances exist for Nabil`);
    }
  }
}

// ============================================================
// 10. SEED ACTIVITY LOGS
// ============================================================
async function seedActivityLogs(thesisMap, userMap) {
  console.log("\n" + "=".repeat(60));
  console.log("📜 STEP 10: Seeding Activity Logs...");
  console.log("=".repeat(60));

  const fariz = userMap.get("fariz_2211523034@fti.unand.ac.id");
  const kadep = userMap.get("kadep_si@fti.unand.ac.id");
  const farizThesis = thesisMap.get(fariz?.id);

  if (farizThesis && fariz && kadep) {
    const existingCount = await prisma.thesisActivityLog.count({
      where: { thesisId: farizThesis.id },
    });

    if (existingCount === 0) {
      const logs = [
        { userId: fariz.id, activityType: "submission", activity: "Mengajukan judul tugas akhir" },
        { userId: kadep.id, activityType: "approval", activity: "Menyetujui judul tugas akhir" },
        { userId: fariz.id, activityType: "guidance", activity: "Mengajukan bimbingan BAB I" },
        { userId: kadep.id, activityType: "guidance", activity: "Menyetujui bimbingan BAB I" },
        { userId: fariz.id, activityType: "revision", activity: "Mengupload revisi BAB I" },
        { userId: kadep.id, activityType: "approval", activity: "Menyetujui BAB I" },
      ];

      for (const log of logs) {
        await prisma.thesisActivityLog.create({
          data: {
            thesisId: farizThesis.id,
            userId: log.userId,
            activityType: log.activityType,
            activity: log.activity,
          },
        });
      }
      console.log(`  ✅ Created ${logs.length} activity logs for Fariz's thesis`);
    } else {
      console.log(`  ⏭️  Activity logs exist for Fariz's thesis`);
    }
  }
}

// ============================================================
// MAIN EXECUTION
// ============================================================
async function main() {
  console.log("\n" + "=".repeat(60));
  console.log("🌱 MASTER SEED SCRIPT - Starting...");
  console.log("=".repeat(60));
  console.log(`📅 Date: ${new Date().toISOString()}`);

  try {
    // Run all seeds in order
    const roleMap = await seedRoles();
    const studentStatusMap = await seedStudentStatus();
    const thesisStatusMap = await seedThesisStatus();
    const academicYearMap = await seedAcademicYears();
    const templateMap = await seedMilestoneTemplates();
    const userMap = await seedUsers(roleMap, studentStatusMap);
    const thesisMap = await seedThesis(userMap, roleMap, thesisStatusMap, academicYearMap);
    await seedThesisMilestones(thesisMap, userMap);
    await seedGuidances(thesisMap, userMap);
    await seedActivityLogs(thesisMap, userMap);

    console.log("\n" + "=".repeat(60));
    console.log("✨ MASTER SEED COMPLETED SUCCESSFULLY!");
    console.log("=".repeat(60));

    console.log("\n📋 SUMMARY:");
    console.log(`   🔐 Roles: ${Object.values(ROLES).length}`);
    console.log(`   👥 Users: 16 (5 lecturers, 1 admin, 10 students)`);
    console.log(`   📖 Thesis: 2 (with supervisors and examiners for Fariz & Nabil)`);
    console.log(`   📊 Milestone Templates: 10`);
    console.log(`   🎯 Thesis Milestones: Custom per thesis`);
    console.log(`   📆 Guidances: Multiple samples per thesis`);

    console.log("\n🔑 LOGIN CREDENTIALS:");
    console.log(`   Password for all users: ${DEFAULT_PASSWORD}`);
    console.log("\n   Lecturers:");
    console.log("   - kadep_si@fti.unand.ac.id (Ketua Departemen)");
    console.log("   - sekdep_si@fti.unand.ac.id (Sekretaris Departemen)");
    console.log("   - pembimbing_si@fti.unand.ac.id (Pembimbing)");
    console.log("   - penguji_si@fti.unand.ac.id (Penguji)");
    console.log("   - gkm_si@fti.unand.ac.id (GKM)");
    console.log("\n   Admin:");
    console.log("   - admin_si@fti.unand.ac.id");
    console.log("\n   Students:");
    console.log("   - fariz_2211523034@fti.unand.ac.id");
    console.log("   - nabil_2211522018@fti.unand.ac.id");
    console.log("   - alya_202101001@fti.unand.ac.id");
    console.log("   - bagas_202101014@fti.unand.ac.id");
    console.log("   - chandra_202001111@fti.unand.ac.id");
    console.log("   - siti_2211523001@fti.unand.ac.id");
    console.log("   - andi_2211523002@fti.unand.ac.id");
    console.log("   - laila_2211523003@fti.unand.ac.id");
    console.log("   - rafi_2211523004@fti.unand.ac.id");
    console.log("   - maria_2211523005@fti.unand.ac.id");

  } catch (error) {
    console.error("\n❌ SEED FAILED:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main();

