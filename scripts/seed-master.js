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
      isActive: true, // Current active academic year
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
// 5. SEED THESIS PROGRESS COMPONENTS
// ============================================================
async function seedProgressComponents() {
  console.log("\n" + "=".repeat(60));
  console.log("📊 STEP 5: Seeding Thesis Progress Components...");
  console.log("=".repeat(60));

  const components = [
    { name: "Pengajuan Judul", description: "Judul tugas akhir telah disetujui", orderIndex: 1, isMandatory: true },
    { name: "BAB I - Pendahuluan", description: "Bab 1 telah disetujui pembimbing", orderIndex: 2, isMandatory: true },
    { name: "BAB II - Tinjauan Pustaka", description: "Bab 2 telah disetujui pembimbing", orderIndex: 3, isMandatory: true },
    { name: "BAB III - Metodologi", description: "Bab 3 telah disetujui pembimbing", orderIndex: 4, isMandatory: true },
    { name: "Seminar Proposal", description: "Telah melaksanakan seminar proposal", orderIndex: 5, isMandatory: true },
    { name: "BAB IV - Implementasi", description: "Bab 4 telah disetujui pembimbing", orderIndex: 6, isMandatory: true },
    { name: "BAB V - Pengujian", description: "Bab 5 telah disetujui pembimbing", orderIndex: 7, isMandatory: true },
    { name: "BAB VI - Kesimpulan", description: "Bab 6 telah disetujui pembimbing", orderIndex: 8, isMandatory: true },
    { name: "Sidang Tugas Akhir", description: "Telah melaksanakan sidang tugas akhir", orderIndex: 9, isMandatory: true },
    { name: "Revisi Final", description: "Revisi final telah disetujui", orderIndex: 10, isMandatory: true },
  ];

  const componentMap = new Map();

  for (const comp of components) {
    let existing = await prisma.thesisProgressComponent.findFirst({
      where: { name: comp.name },
    });
    if (!existing) {
      existing = await prisma.thesisProgressComponent.create({ data: comp });
      console.log(`  ✅ Created component: ${comp.name}`);
    } else {
      console.log(`  ⏭️  Component exists: ${comp.name}`);
    }
    componentMap.set(comp.name, existing);
  }

  return componentMap;
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
      email: "kadep@fti.unand.ac.id",
      fullName: "Dr. Ahmad Kadep, M.Kom",
      identityType: "NIP",
      identityNumber: "198501012010011001",
      roles: [ROLES.KETUA_DEPARTEMEN, ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2, ROLES.PENGUJI],
      isLecturer: true,
    },
    {
      email: "sekdep@fti.unand.ac.id",
      fullName: "Dr. Budi Sekdep, M.T",
      identityType: "NIP",
      identityNumber: "198602022011012002",
      roles: [ROLES.SEKRETARIS_DEPARTEMEN, ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2, ROLES.PENGUJI],
      isLecturer: true,
    },
    {
      email: "pembimbing@fti.unand.ac.id",
      fullName: "Dr. Candra Pembimbing, M.Cs",
      identityType: "NIP",
      identityNumber: "198703032012013003",
      roles: [ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2, ROLES.PENGUJI],
      isLecturer: true,
    },
    {
      email: "penguji@fti.unand.ac.id",
      fullName: "Dr. Diana Penguji, M.Sc",
      identityType: "NIP",
      identityNumber: "198804042013014004",
      roles: [ROLES.PENGUJI, ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2],
      isLecturer: true,
    },
    {
      email: "gkm@fti.unand.ac.id",
      fullName: "Dr. Erik GKM, M.Eng",
      identityType: "NIP",
      identityNumber: "198905052014015005",
      roles: [ROLES.GKM, ROLES.PENGUJI, ROLES.PEMBIMBING_2],
      isLecturer: true,
    },
    {
      email: "admin@fti.unand.ac.id",
      fullName: "Admin Sistem FTI",
      identityType: "OTHER",
      identityNumber: "ADMIN001",
      roles: [ROLES.ADMIN],
      isLecturer: false,
    },
    {
      email: "fariz_2211523034@fti.unand.ac.id",
      fullName: "Fariz Ramadhan",
      identityType: "NIM",
      identityNumber: "2211523034",
      roles: [ROLES.MAHASISWA],
      isStudent: true,
      enrollmentYear: 2022,
    },
    {
      email: "nabil_2211522018@fti.unand.ac.id",
      fullName: "Nabil Putra",
      identityType: "NIM",
      identityNumber: "2211522018",
      roles: [ROLES.MAHASISWA],
      isStudent: true,
      enrollmentYear: 2022,
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
            skscompleted: 120,
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
  const kadep = userMap.get("kadep@fti.unand.ac.id");
  const pembimbing = userMap.get("pembimbing@fti.unand.ac.id");
  const penguji = userMap.get("penguji@fti.unand.ac.id");
  const sekdep = userMap.get("sekdep@fti.unand.ac.id");

  const thesisMap = new Map();

  // Thesis for Fariz
  if (fariz && kadep && pembimbing && penguji) {
    let thesis = await prisma.thesis.findFirst({
      where: { studentId: fariz.id },
    });

    if (!thesis) {
      thesis = await prisma.thesis.create({
        data: {
          studentId: fariz.id,
          title: "Implementasi Sistem Informasi Manajemen Tugas Akhir Berbasis Web",
          startDate: new Date("2024-09-01"),
          thesisStatusId: bimbinganStatus?.id,
          academicYearId: currentAcademicYear?.id,
        },
      });
      console.log(`  ✅ Created thesis for Fariz`);

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
      console.log(`  ⏭️  Thesis exists for Fariz`);
    }
    thesisMap.set(fariz.id, thesis);
  }

  // Thesis for Nabil
  if (nabil && pembimbing && penguji && sekdep) {
    let thesis = await prisma.thesis.findFirst({
      where: { studentId: nabil.id },
    });

    if (!thesis) {
      thesis = await prisma.thesis.create({
        data: {
          studentId: nabil.id,
          title: "Pengembangan Aplikasi Mobile untuk Monitoring Bimbingan Tugas Akhir",
          startDate: new Date("2024-09-01"),
          thesisStatusId: bimbinganStatus?.id,
          academicYearId: currentAcademicYear?.id,
        },
      });
      console.log(`  ✅ Created thesis for Nabil`);

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
      console.log(`  ⏭️  Thesis exists for Nabil`);
    }
    thesisMap.set(nabil.id, thesis);
  }

  return thesisMap;
}

// ============================================================
// 8. SEED THESIS PROGRESS COMPLETIONS
// ============================================================
async function seedProgressCompletions(thesisMap, componentMap) {
  console.log("\n" + "=".repeat(60));
  console.log("✅ STEP 8: Seeding Progress Completions...");
  console.log("=".repeat(60));

  // For each thesis, mark some components as completed
  for (const [studentId, thesis] of thesisMap) {
    if (!thesis) continue;

    // Check if already has completions
    const existingCount = await prisma.thesisProgressCompletion.count({
      where: { thesisId: thesis.id },
    });

    if (existingCount > 0) {
      console.log(`  ⏭️  Completions exist for thesis: ${thesis.title?.slice(0, 30)}...`);
      continue;
    }

    // Complete first 3 components for all students
    const completedComponents = [
      "Pengajuan Judul",
      "BAB I - Pendahuluan",
      "BAB II - Tinjauan Pustaka",
    ];

    for (const compName of completedComponents) {
      const component = componentMap.get(compName);
      if (!component) continue;

      await prisma.thesisProgressCompletion.create({
        data: {
          thesisId: thesis.id,
          componentId: component.id,
          completedAt: new Date(),
          validatedBySupervisor: true,
          validatedAt: new Date(),
          notes: "Disetujui oleh pembimbing",
        },
      });
      console.log(`  ✅ Completed: ${compName} for thesis ${thesis.id.slice(0, 8)}...`);
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
  const kadep = userMap.get("kadep@fti.unand.ac.id");
  const pembimbing = userMap.get("pembimbing@fti.unand.ac.id");
  const penguji = userMap.get("penguji@fti.unand.ac.id");

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
          requestedDate: new Date("2024-10-01T10:00:00"),
          approvedDate: new Date("2024-10-01T10:00:00"),
          duration: 60,
          type: "online",
          meetingUrl: "https://meet.google.com/abc-defg-hij",
          studentNotes: "Konsultasi BAB I - Latar belakang dan rumusan masalah",
          supervisorFeedback: "BAB I sudah baik, lanjut ke BAB II. Perbanyak referensi jurnal internasional.",
          status: "completed",
          completedAt: new Date("2024-10-01T11:00:00"),
        },
      });
      console.log(`  ✅ Created completed guidance #1 for Fariz`);

      await prisma.thesisGuidance.create({
        data: {
          thesisId: farizThesis.id,
          supervisorId: pembimbingLecturer.id,
          requestedDate: new Date("2024-10-15T14:00:00"),
          approvedDate: new Date("2024-10-15T14:00:00"),
          duration: 90,
          type: "offline",
          location: "Ruang Dosen Lt. 2",
          studentNotes: "Konsultasi BAB II - Tinjauan pustaka sistem informasi",
          supervisorFeedback: "Tambahkan referensi tentang REST API dan microservices",
          status: "completed",
          completedAt: new Date("2024-10-15T15:30:00"),
        },
      });
      console.log(`  ✅ Created completed guidance #2 for Fariz`);

      // Accepted guidance (upcoming)
      await prisma.thesisGuidance.create({
        data: {
          thesisId: farizThesis.id,
          supervisorId: kadepLecturer.id,
          requestedDate: new Date("2024-12-20T10:00:00"),
          approvedDate: new Date("2024-12-20T10:00:00"),
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
          requestedDate: new Date("2024-12-25T14:00:00"),
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
          requestedDate: new Date("2024-10-05T09:00:00"),
          approvedDate: new Date("2024-10-05T09:00:00"),
          duration: 60,
          type: "online",
          meetingUrl: "https://zoom.us/j/123456789",
          studentNotes: "Konsultasi judul dan outline proposal",
          supervisorFeedback: "Judul sudah bagus, fokus pada fitur monitoring real-time",
          status: "completed",
          completedAt: new Date("2024-10-05T10:00:00"),
        },
      });
      console.log(`  ✅ Created completed guidance #1 for Nabil`);

      // Accepted guidance
      await prisma.thesisGuidance.create({
        data: {
          thesisId: nabilThesis.id,
          supervisorId: pengujiLecturer.id,
          requestedDate: new Date("2024-12-22T13:00:00"),
          approvedDate: new Date("2024-12-22T13:00:00"),
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
          requestedDate: new Date("2024-11-10T08:00:00"),
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
  const kadep = userMap.get("kadep@fti.unand.ac.id");
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
    const componentMap = await seedProgressComponents();
    const userMap = await seedUsers(roleMap, studentStatusMap);
    const thesisMap = await seedThesis(userMap, roleMap, thesisStatusMap, academicYearMap);
    await seedProgressCompletions(thesisMap, componentMap);
    await seedGuidances(thesisMap, userMap);
    await seedActivityLogs(thesisMap, userMap);

    console.log("\n" + "=".repeat(60));
    console.log("✨ MASTER SEED COMPLETED SUCCESSFULLY!");
    console.log("=".repeat(60));

    console.log("\n📋 SUMMARY:");
    console.log(`   🔐 Roles: ${Object.values(ROLES).length}`);
    console.log(`   👥 Users: 8 (5 lecturers, 1 admin, 2 students)`);
    console.log(`   📖 Thesis: 2 (with supervisors and examiners)`);
    console.log(`   📊 Progress Components: 10`);
    console.log(`   📆 Guidances: Multiple samples per thesis`);

    console.log("\n🔑 LOGIN CREDENTIALS:");
    console.log(`   Password for all users: ${DEFAULT_PASSWORD}`);
    console.log("\n   Lecturers:");
    console.log("   - kadep@fti.unand.ac.id (Ketua Departemen)");
    console.log("   - sekdep@fti.unand.ac.id (Sekretaris Departemen)");
    console.log("   - pembimbing@fti.unand.ac.id (Pembimbing)");
    console.log("   - penguji@fti.unand.ac.id (Penguji)");
    console.log("   - gkm@fti.unand.ac.id (GKM)");
    console.log("\n   Admin:");
    console.log("   - admin@fti.unand.ac.id");
    console.log("\n   Students:");
    console.log("   - fariz_2211523034@fti.unand.ac.id");
    console.log("   - nabil_2211522018@fti.unand.ac.id");

  } catch (error) {
    console.error("\n❌ SEED FAILED:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main();
