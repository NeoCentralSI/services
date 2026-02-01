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
      fullName: "Ricky Akbar M.Kom",
      identityType: "NIP",
      identityNumber: "198410062012121001",
      roles: [ROLES.KETUA_DEPARTEMEN, ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2, ROLES.PENGUJI],
      isLecturer: true,
    },
    {
      email: "sekdep_si@fti.unand.ac.id",
      fullName: "Afriyanti Dwi Kartika, M.T",
      identityType: "NIP",
      identityNumber: "198904212019032024",
      roles: [ROLES.SEKRETARIS_DEPARTEMEN, ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2, ROLES.PENGUJI],
      isLecturer: true,
    },
    {
      email: "pembimbing_si@fti.unand.ac.id",
      fullName: "Husnil Kamil, MT",
      identityType: "NIP",
      identityNumber: "198201182008121002",
      roles: [ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2, ROLES.PENGUJI],
      isLecturer: true,
    },
    {
      email: "penguji_si@fti.unand.ac.id",
      fullName: "Aina Hubby Aziira, M.Eng",
      identityType: "NIP",
      identityNumber: "199504302022032013",
      roles: [ROLES.PENGUJI, ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2],
      isLecturer: true,
    },
    {
      email: "gkm_si@fti.unand.ac.id",
      fullName: "Ullya Mega Wahyuni, M.Kom",
      identityType: "NIP",
      identityNumber: "199011032019032008",
      roles: [ROLES.GKM, ROLES.PENGUJI, ROLES.PEMBIMBING_2],
      isLecturer: true,
    },
    {
      email: "admin_si@fti.unand.ac.id",
      fullName: "Nindy Malisha, SE",
      identityType: "OTHER",
      identityNumber: "220199206201501201",
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
      sksCompleted: 137,
    },
    {
      email: "khalied_2211523030@fti.unand.ac.id",
      fullName: "Khalied Nauly Maturino",
      identityType: "NIM",
      identityNumber: "2211523030",
      roles: [ROLES.MAHASISWA],
      isStudent: true,
      enrollmentYear: 2022,
      sksCompleted: 141,
    },
    {
      email: "mustafa_2211522036@fti.unand.ac.id",
      fullName: "Mustafa Fathur Rahman",
      identityType: "NIM",
      identityNumber: "2211522036",
      roles: [ROLES.MAHASISWA],
      isStudent: true,
      enrollmentYear: 2022,
      sksCompleted: 137,
    },
    {
      email: "muhammad_2211521020@fti.unand.ac.id",
      fullName: "Muhammad Nouval Habibie",
      identityType: "NIM",
      identityNumber: "2211521020",
      roles: [ROLES.MAHASISWA],
      isStudent: true,
      enrollmentYear: 2022,
      sksCompleted: 137,
    },
    {
      email: "daffa_2211523022@fti.unand.ac.id",
      fullName: "Daffa Agustian Saadi",
      identityType: "NIM",
      identityNumber: "2211523022",
      roles: [ROLES.MAHASISWA],
      isStudent: true,
      enrollmentYear: 2022,
      sksCompleted: 137,
    },
    {
      email: "ilham_2211522028@fti.unand.ac.id",
      fullName: "Ilham",
      identityType: "NIM",
      identityNumber: "2211522028",
      roles: [ROLES.MAHASISWA],
      isStudent: true,
      enrollmentYear: 2022,
      sksCompleted: 137,
    },
    {
      email: "syauqi_2211523012@fti.unand.ac.id",
      fullName: "Syauqi",
      identityType: "NIM",
      identityNumber: "2211523012",
      roles: [ROLES.MAHASISWA],
      isStudent: true,
      enrollmentYear: 2022,
      sksCompleted: 125,
    },
    {
      email: "dimas_2311523026@fti.unand.ac.id",
      fullName: "Dimas",
      identityType: "NIM",
      identityNumber: "2311523026",
      roles: [ROLES.MAHASISWA],
      isStudent: true,
      enrollmentYear: 2023,
      sksCompleted: 99,
    },
    {
      email: "john_2411522001@fti.unand.ac.id",
      fullName: "John",
      identityType: "NIM",
      identityNumber: "2411522001",
      roles: [ROLES.MAHASISWA],
      isStudent: true,
      enrollmentYear: 2024,
      sksCompleted: 60,
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
            skscompleted: userData.sksCompleted,
          },
        });
        console.log(`    🎓 Created Student record (SKS: ${userData.sksCompleted})`);
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

  // Get thesis topic "Pengembangan Sistem (Enterprise Application)"
  let thesisTopic = await prisma.thesisTopic.findFirst({
    where: { name: "Pengembangan Sistem (Enterprise Application)" },
  });
  
  if (!thesisTopic) {
    // Create if not exists
    thesisTopic = await prisma.thesisTopic.create({
      data: { name: "Pengembangan Sistem (Enterprise Application)" },
    });
    console.log(`  ✅ Created thesis topic: Pengembangan Sistem (Enterprise Application)`);
  }

  // Get all users
  const nabil = userMap.get("nabil_2211522018@fti.unand.ac.id");
  const fariz = userMap.get("fariz_2211523034@fti.unand.ac.id");
  const khalied = userMap.get("khalied_2211523030@fti.unand.ac.id");
  const fathur = userMap.get("mustafa_2211522036@fti.unand.ac.id");
  const nouval = userMap.get("muhammad_2211521020@fti.unand.ac.id");
  const daffa = userMap.get("daffa_2211523022@fti.unand.ac.id");
  const ilham = userMap.get("ilham_2211522028@fti.unand.ac.id");
  
  const husnil = userMap.get("pembimbing_si@fti.unand.ac.id");
  const afriyanti = userMap.get("sekdep_si@fti.unand.ac.id");

  const thesisMap = new Map();

  // Helper function to create thesis
  async function createThesis(student, title, pembimbing1User, pembimbing2User = null, withTopic = false) {
    if (!student || !pembimbing1User) {
      console.log(`  ⚠️  Skipping thesis - Missing student or pembimbing1`);
      return null;
    }

    let thesis = await prisma.thesis.findFirst({
      where: { studentId: student.id },
    });

    if (!thesis) {
      const startDate = new Date("2025-08-01");
      const deadlineDate = new Date(startDate);
      deadlineDate.setFullYear(deadlineDate.getFullYear() + 1);

      thesis = await prisma.thesis.create({
        data: {
          studentId: student.id,
          title: title,
          thesisTopicId: withTopic ? thesisTopic.id : null,
          startDate: startDate,
          deadlineDate: deadlineDate,
          thesisStatusId: bimbinganStatus?.id,
          academicYearId: currentAcademicYear?.id,
        },
      });
      console.log(`  ✅ Created thesis for ${student.fullName}`);
      console.log(`     Title: ${title}`);
      if (withTopic) {
        console.log(`     Topic: Pengembangan Sistem (Enterprise Application)`);
      }

      // Add Pembimbing 1
      await prisma.thesisParticipant.create({
        data: {
          thesisId: thesis.id,
          lecturerId: pembimbing1User.id,
          roleId: pembimbing1Role.id,
        },
      });
      console.log(`    📌 Pembimbing 1: ${pembimbing1User.fullName}`);

      // Add Pembimbing 2 if exists
      if (pembimbing2User) {
        await prisma.thesisParticipant.create({
          data: {
            thesisId: thesis.id,
            lecturerId: pembimbing2User.id,
            roleId: pembimbing2Role.id,
          },
        });
        console.log(`    📌 Pembimbing 2: ${pembimbing2User.fullName}`);
      }
    } else {
      console.log(`  ⏭️  Thesis exists for ${student.fullName}`);
    }

    thesisMap.set(student.id, thesis);
    return thesis;
  }

  // 1. Nabil - sistem monitoring tugas akhir di dsi (WITH topic & milestone)
  await createThesis(
    nabil,
    "Sistem Monitoring Tugas Akhir di DSI",
    husnil,
    afriyanti,
    true // with topic
  );

  // 2. Fariz - sistem kerja praktek di dsi (WITH topic & milestone)
  await createThesis(
    fariz,
    "Sistem Kerja Praktek di DSI",
    husnil,
    afriyanti,
    true // with topic
  );

  // 3. Khalied - sistem informasi beasiswa non apbn (NO topic, NO milestone)
  await createThesis(
    khalied,
    "Sistem Informasi Beasiswa Non APBN",
    husnil,
    null,
    false // no topic
  );

  // 4. Fathur - sistem informasi manajemen seminar sidang dan yudisium di dsi (WITH topic & milestone)
  await createThesis(
    fathur,
    "Sistem Informasi Manajemen Seminar Sidang dan Yudisium di DSI",
    husnil,
    afriyanti,
    true // with topic
  );

  // 5. Nouval - sistem informasi management kelompok keilmuan di dsi (NO topic, NO milestone)
  await createThesis(
    nouval,
    "Sistem Informasi Management Kelompok Keilmuan di DSI",
    husnil,
    null,
    false // no topic
  );

  // 6. Daffa Agustian - sistem informasi generate report di dinas radio kota padang (NO topic, NO milestone)
  await createThesis(
    daffa,
    "Sistem Informasi Generate Report di Dinas Radio Kota Padang",
    afriyanti,
    null,
    false // no topic
  );

  // 7. Ilham - sistem informasi pengelolaan proposal TA di dsi (NO topic, NO milestone)
  await createThesis(
    ilham,
    "Sistem Informasi Pengelolaan Proposal TA di DSI",
    husnil,
    afriyanti,
    false // no topic
  );

  return thesisMap;
}

// ============================================================
// 8. SEED THESIS MILESTONES (Custom per Thesis)
// ============================================================
async function seedThesisMilestones(thesisMap, userMap) {
  console.log("\n" + "=".repeat(60));
  console.log("✅ STEP 8: Seeding Thesis Milestones...");
  console.log("=".repeat(60));

  const husnil = userMap.get("pembimbing_si@fti.unand.ac.id");
  const nabil = userMap.get("nabil_2211522018@fti.unand.ac.id");
  const fariz = userMap.get("fariz_2211523034@fti.unand.ac.id");
  const fathur = userMap.get("mustafa_2211522036@fti.unand.ac.id");

  // Milestone configurations per student
  // Nabil: 80%, Fariz: 40%, Fathur: 60%
  // Khalied, Nouval, Daffa, Ilham: 0% (kosong)
  const milestoneConfig = {
    [nabil?.id]: { completionPercentage: 80, name: "Nabil" },
    [fariz?.id]: { completionPercentage: 40, name: "Fariz" },
    [fathur?.id]: { completionPercentage: 60, name: "Fathur" },
  };

  // Base milestones template (5 milestones, each worth 20%)
  const baseMilestones = [
    { 
      title: "Pengajuan Judul & BAB I", 
      description: "Judul tugas akhir dan pendahuluan (latar belakang, rumusan masalah, tujuan)",
      orderIndex: 1,
      targetDate: new Date("2025-09-01"),
      weight: 20,
    },
    { 
      title: "BAB II - Tinjauan Pustaka", 
      description: "Dasar teori dan penelitian terkait",
      orderIndex: 2,
      targetDate: new Date("2025-10-01"),
      weight: 20,
    },
    { 
      title: "BAB III - Metodologi", 
      description: "Metodologi penelitian dan perancangan sistem",
      orderIndex: 3,
      targetDate: new Date("2025-11-01"),
      weight: 20,
    },
    { 
      title: "BAB IV - Implementasi", 
      description: "Implementasi sistem dan coding",
      orderIndex: 4,
      targetDate: new Date("2025-12-15"),
      weight: 20,
    },
    { 
      title: "BAB V - Pengujian & Kesimpulan", 
      description: "Pengujian sistem, analisis hasil, dan kesimpulan",
      orderIndex: 5,
      targetDate: new Date("2026-01-31"),
      weight: 20,
    },
  ];

  for (const [studentId, thesis] of thesisMap) {
    if (!thesis) continue;

    const config = milestoneConfig[studentId];
    
    // Skip if no config (Khalied, Nouval, Daffa, Ilham - no milestones)
    if (!config) {
      console.log(`  ⏭️  Skipping milestones for thesis: ${thesis.title?.slice(0, 40)}... (no milestone data)`);
      continue;
    }

    // Check if already has milestones
    const existingCount = await prisma.thesisMilestone.count({
      where: { thesisId: thesis.id },
    });

    if (existingCount > 0) {
      console.log(`  ⏭️  Milestones exist for ${config.name}`);
      continue;
    }

    console.log(`  📋 Creating milestones for ${config.name} (Target: ${config.completionPercentage}%)`);

    let accumulatedPercentage = 0;
    
    for (const milestone of baseMilestones) {
      accumulatedPercentage += milestone.weight;
      
      let status, progressPercentage, startedAt, completedAt, validatedBy, validatedAt, supervisorNotes;
      
      if (accumulatedPercentage <= config.completionPercentage) {
        // Completed milestone
        status = "completed";
        progressPercentage = 100;
        startedAt = new Date(milestone.targetDate.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days before target
        completedAt = new Date(milestone.targetDate.getTime() - 5 * 24 * 60 * 60 * 1000); // 5 days before target
        validatedBy = husnil?.id;
        validatedAt = completedAt;
        supervisorNotes = "Milestone sudah selesai dengan baik";
      } else if (accumulatedPercentage - milestone.weight < config.completionPercentage) {
        // Partially completed milestone (in progress)
        status = "in_progress";
        const remaining = config.completionPercentage - (accumulatedPercentage - milestone.weight);
        progressPercentage = Math.round((remaining / milestone.weight) * 100);
        startedAt = new Date(milestone.targetDate.getTime() - 30 * 24 * 60 * 60 * 1000);
      } else {
        // Not started
        status = "not_started";
        progressPercentage = 0;
      }

      await prisma.thesisMilestone.create({
        data: {
          thesisId: thesis.id,
          title: milestone.title,
          description: milestone.description,
          orderIndex: milestone.orderIndex,
          targetDate: milestone.targetDate,
          status,
          progressPercentage,
          startedAt,
          completedAt,
          validatedBy,
          validatedAt,
          supervisorNotes,
        },
      });
      console.log(`    ✅ ${milestone.title}: ${status} (${progressPercentage}%)`);
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

  // Get users
  const nabil = userMap.get("nabil_2211522018@fti.unand.ac.id");
  const fariz = userMap.get("fariz_2211523034@fti.unand.ac.id");
  const fathur = userMap.get("mustafa_2211522036@fti.unand.ac.id");
  const husnil = userMap.get("pembimbing_si@fti.unand.ac.id");
  const afriyanti = userMap.get("sekdep_si@fti.unand.ac.id");

  // Get lecturer records
  const husnilLecturer = await prisma.lecturer.findUnique({ where: { id: husnil?.id } });
  const afriyantiLecturer = await prisma.lecturer.findUnique({ where: { id: afriyanti?.id } });

  // Guidance configuration:
  // Nabil: 5 bimbingan, Fathur: 5 bimbingan, Fariz: 4 bimbingan
  // Timeline: August 2025 - Feb 2026, interval 2-3 weeks
  
  const guidanceSchedules = {
    nabil: {
      thesis: thesisMap.get(nabil?.id),
      name: "Nabil",
      count: 5,
      sessions: [
        { date: "2025-08-18", topic: "Konsultasi judul dan outline proposal", supervisor: husnilLecturer },
        { date: "2025-09-08", topic: "Review BAB I - Pendahuluan", supervisor: afriyantiLecturer },
        { date: "2025-10-01", topic: "Konsultasi BAB II - Tinjauan Pustaka", supervisor: husnilLecturer },
        { date: "2025-10-22", topic: "Review referensi dan literatur", supervisor: afriyantiLecturer },
        { date: "2025-11-12", topic: "Konsultasi BAB III - Metodologi", supervisor: husnilLecturer },
      ],
    },
    fathur: {
      thesis: thesisMap.get(fathur?.id),
      name: "Fathur",
      count: 5,
      sessions: [
        { date: "2025-08-20", topic: "Konsultasi judul sistem seminar sidang yudisium", supervisor: husnilLecturer },
        { date: "2025-09-10", topic: "Review BAB I - Latar belakang masalah", supervisor: afriyantiLecturer },
        { date: "2025-10-03", topic: "Konsultasi BAB II - Dasar teori", supervisor: husnilLecturer },
        { date: "2025-10-24", topic: "Review diagram sistem", supervisor: afriyantiLecturer },
        { date: "2025-11-14", topic: "Konsultasi progress BAB III", supervisor: husnilLecturer },
      ],
    },
    fariz: {
      thesis: thesisMap.get(fariz?.id),
      name: "Fariz",
      count: 4,
      sessions: [
        { date: "2025-08-25", topic: "Konsultasi judul sistem kerja praktek", supervisor: husnilLecturer },
        { date: "2025-09-15", topic: "Review BAB I - Pendahuluan", supervisor: afriyantiLecturer },
        { date: "2025-10-08", topic: "Konsultasi BAB II - Tinjauan Pustaka", supervisor: husnilLecturer },
        { date: "2025-10-29", topic: "Review progress BAB II", supervisor: afriyantiLecturer },
      ],
    },
  };

  const feedbackTemplates = [
    "Sudah baik, lanjutkan ke tahap berikutnya. Perhatikan konsistensi penulisan.",
    "Progress bagus. Tambahkan referensi jurnal internasional minimal 5 paper.",
    "Sudah sesuai dengan arahan. Perbaiki format penulisan sesuai pedoman.",
    "Bagus, metodologi sudah jelas. Pastikan diagram alir lengkap.",
    "Sudah on track. Fokus pada implementasi fitur utama terlebih dahulu.",
  ];

  for (const [key, config] of Object.entries(guidanceSchedules)) {
    if (!config.thesis) {
      console.log(`  ⚠️  Thesis not found for ${config.name}, skipping...`);
      continue;
    }

    const existingCount = await prisma.thesisGuidance.count({
      where: { thesisId: config.thesis.id },
    });

    if (existingCount > 0) {
      console.log(`  ⏭️  Guidances exist for ${config.name}`);
      continue;
    }

    console.log(`  📋 Creating ${config.count} guidances for ${config.name}`);

    for (let i = 0; i < config.sessions.length; i++) {
      const session = config.sessions[i];
      const requestedDate = new Date(`${session.date}T10:00:00`);
      const completedAt = new Date(`${session.date}T11:00:00`);

      await prisma.thesisGuidance.create({
        data: {
          thesisId: config.thesis.id,
          supervisorId: session.supervisor.id,
          requestedDate: requestedDate,
          approvedDate: requestedDate,
          duration: 60,
          studentNotes: session.topic,
          supervisorFeedback: feedbackTemplates[i % feedbackTemplates.length],
          status: "completed",
          completedAt: completedAt,
        },
      });
      console.log(`    ✅ Bimbingan #${i + 1}: ${session.date} - ${session.topic.slice(0, 40)}...`);
    }
  }

  // Students without guidances: Khalied, Nouval, Daffa, Ilham
  console.log(`  ℹ️  Khalied, Nouval, Daffa, Ilham: No guidance records (as specified)`);
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
    const userMap = await seedUsers(roleMap, studentStatusMap);
    const thesisMap = await seedThesis(userMap, roleMap, thesisStatusMap, academicYearMap);
    await seedThesisMilestones(thesisMap, userMap);
    await seedGuidances(thesisMap, userMap);

    console.log("\n" + "=".repeat(60));
    console.log("✨ MASTER SEED COMPLETED SUCCESSFULLY!");
    console.log("=".repeat(60));

    console.log("\n📋 SUMMARY:");
    console.log(`   🔐 Roles: ${Object.values(ROLES).length}`);
    console.log(`   👥 Users: 16 (5 lecturers, 1 admin, 10 students)`);
    console.log(`   📖 Thesis: 7 mahasiswa dengan judul TA`);
    console.log(`     - Topic: Pengembangan Sistem (Enterprise Application)`);
    console.log(`   🎯 Thesis Milestones:`);
    console.log(`     - Nabil: 80% | Fathur: 60% | Fariz: 40%`);
    console.log(`     - Khalied, Nouval, Daffa, Ilham: 0%`);
    console.log(`   📆 Guidances:`);
    console.log(`     - Nabil: 5x | Fathur: 5x | Fariz: 4x`);
    console.log(`     - Khalied, Nouval, Daffa, Ilham: 0x`);

    console.log("\n🔑 LOGIN CREDENTIALS:");
    console.log(`   Password for all users: ${DEFAULT_PASSWORD}`);
    console.log("\n   Lecturers:");
    console.log("   - kadep_si@fti.unand.ac.id (Ketua Departemen)");
    console.log("   - sekdep_si@fti.unand.ac.id (Sekretaris Departemen - Afriyanti)");
    console.log("   - pembimbing_si@fti.unand.ac.id (Pembimbing - Husnil)");
    console.log("   - penguji_si@fti.unand.ac.id (Penguji)");
    console.log("   - gkm_si@fti.unand.ac.id (GKM)");
    console.log("\n   Admin:");
    console.log("   - admin_si@fti.unand.ac.id");
    console.log("\n   Students (with thesis):");
    console.log("   - nabil_2211522018@fti.unand.ac.id (80% milestone, 5 bimbingan)");
    console.log("   - fariz_2211523034@fti.unand.ac.id (40% milestone, 4 bimbingan)");
    console.log("   - khalied_2211523030@fti.unand.ac.id (0% milestone)");
    console.log("   - mustafa_2211522036@fti.unand.ac.id (Fathur - 60% milestone, 5 bimbingan)");
    console.log("   - muhammad_2211521020@fti.unand.ac.id (Nouval - 0% milestone)");
    console.log("   - daffa_2211523022@fti.unand.ac.id (0% milestone)");
    console.log("   - ilham_2211522028@fti.unand.ac.id (0% milestone)");
    console.log("\n   Students (without thesis):");
    console.log("   - syauqi_2211523012@fti.unand.ac.id");
    console.log("   - dimas_2311523026@fti.unand.ac.id");
    console.log("   - john_2411522001@fti.unand.ac.id");

  } catch (error) {
    console.error("\n❌ SEED FAILED:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main();

