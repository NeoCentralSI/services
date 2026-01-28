/**
 * Thesis Data Seeding Script
 * 
 * Generates varied thesis data for testing monitoring features:
 * - Multiple thesis statuses
 * - Various progress levels (0%, 25%, 50%, 75%, 100%)
 * - At-risk students (no activity > 2 months)
 * - Students ready for seminar (both supervisors approved)
 * - Different supervisor combinations
 * 
 * Usage: node scripts/seed-thesis-data.js
 */

import { PrismaClient } from "../src/generated/prisma/index.js";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

// ============================================================
// CONSTANTS
// ============================================================
const ROLES = {
  PEMBIMBING_1: "Pembimbing 1",
  PEMBIMBING_2: "Pembimbing 2",
  MAHASISWA: "Mahasiswa",
};

const DEFAULT_PASSWORD = "password123";

// Thesis statuses with weights for distribution
const THESIS_STATUSES = {
  "Bimbingan": 0.5,          // 50%
  "Acc Seminar": 0.2,        // 20%
  "Penelitian": 0.15,        // 15%
  "Seminar Proposal": 0.08,  // 8%
  "Sidang": 0.05,            // 5%
  "Selesai": 0.02,           // 2%
};

// Sample thesis titles
const THESIS_TITLES = [
  "Implementasi Machine Learning untuk Prediksi Harga Saham",
  "Sistem Informasi Manajemen Perpustakaan Berbasis Web",
  "Analisis Sentimen Media Sosial Menggunakan Deep Learning",
  "Pengembangan Aplikasi Mobile untuk Manajemen Keuangan Pribadi",
  "Sistem Rekomendasi Film Menggunakan Collaborative Filtering",
  "Deteksi Objek Real-time Menggunakan YOLO Algorithm",
  "Chatbot Customer Service Berbasis Natural Language Processing",
  "Sistem Monitoring IoT untuk Smart Home",
  "Analisis Big Data untuk Prediksi Churn Pelanggan",
  "Aplikasi Augmented Reality untuk Pendidikan Interaktif",
  "Blockchain untuk Sistem Voting Elektronik yang Aman",
  "Optimasi Rute Pengiriman Menggunakan Genetic Algorithm",
  "Sistem Pengenalan Wajah untuk Presensi Otomatis",
  "Platform E-Learning Adaptif Berbasis AI",
  "Analisis Performa Website Menggunakan Web Scraping",
  "Sistem Keamanan Jaringan dengan Intrusion Detection",
  "Aplikasi Telemedicine untuk Konsultasi Kesehatan Online",
  "Prediksi Cuaca Menggunakan Time Series Analysis",
  "Sistem Manajemen Proyek Berbasis Agile Methodology",
  "Computer Vision untuk Deteksi Penyakit Tanaman",
];

// ============================================================
// UTILITY FUNCTIONS
// ============================================================
function generateNIM(index) {
  const year = 2021;
  const sequence = String(index).padStart(4, '0');
  return `${year}${sequence}`;
}

function generateNIP() {
  let nip = "";
  for (let i = 0; i < 18; i++) {
    nip += Math.floor(Math.random() * 10).toString();
  }
  return nip;
}

function getRandomElement(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function getWeightedStatus() {
  const rand = Math.random();
  let cumulative = 0;
  
  for (const [status, weight] of Object.entries(THESIS_STATUSES)) {
    cumulative += weight;
    if (rand <= cumulative) {
      return status;
    }
  }
  
  return "Bimbingan"; // fallback
}

function generateDateRange(monthsAgo, daysVariation = 30) {
  const date = new Date();
  date.setMonth(date.getMonth() - monthsAgo);
  date.setDate(date.getDate() - Math.floor(Math.random() * daysVariation));
  return date;
}

// ============================================================
// MAIN SEEDING FUNCTIONS
// ============================================================
async function ensureRolesExist() {
  console.log("\n📋 Ensuring roles exist...");
  
  const roleMap = new Map();
  
  for (const [key, roleName] of Object.entries(ROLES)) {
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
    
    roleMap.set(key, role);
  }
  
  return roleMap;
}

async function ensureStudentStatusExists() {
  console.log("\n📚 Ensuring student status exists...");
  
  let status = await prisma.studentStatus.findFirst({
    where: { name: "Aktif" },
  });
  
  if (!status) {
    status = await prisma.studentStatus.create({
      data: { name: "Aktif" },
    });
    console.log("  ✅ Created status: Aktif");
  } else {
    console.log("  ⏭️  Status exists: Aktif");
  }
  
  return status;
}

async function ensureAcademicYearsExist() {
  console.log("\n📅 Ensuring academic years exist...");
  
  const academicYears = [
    {
      key: "ganjil-2024",
      semester: "ganjil",
      year: 2024,
      startDate: new Date("2024-08-01"),
      endDate: new Date("2025-01-31"),
      isActive: false,
    },
    {
      key: "genap-2024",
      semester: "genap",
      year: 2024,
      startDate: new Date("2025-02-01"),
      endDate: new Date("2025-07-31"),
      isActive: false,
    },
    {
      key: "ganjil-2025",
      semester: "ganjil",
      year: 2025,
      startDate: new Date("2025-08-01"),
      endDate: new Date("2026-01-31"),
      isActive: true,
    },
  ];
  
  const academicYearMap = new Map();
  
  for (const ay of academicYears) {
    let existing = await prisma.academicYear.findFirst({
      where: { 
        semester: ay.semester,
        year: ay.year 
      },
    });
    
    if (!existing) {
      existing = await prisma.academicYear.create({
        data: {
          semester: ay.semester,
          year: ay.year,
          startDate: ay.startDate,
          endDate: ay.endDate,
          isActive: ay.isActive,
        },
      });
      console.log(`  ✅ Created academic year: ${ay.key}${ay.isActive ? ' (ACTIVE)' : ''}`);
    } else {
      console.log(`  ⏭️  Academic year exists: ${ay.key}${existing.isActive ? ' (ACTIVE)' : ''}`);
    }
    
    academicYearMap.set(ay.key, existing);
  }
  
  return academicYearMap;
}

async function ensureThesisStatusesExist() {
  console.log("\n📊 Ensuring thesis statuses exist...");
  
  const statusMap = new Map();
  
  for (const statusName of Object.keys(THESIS_STATUSES)) {
    let status = await prisma.thesisStatus.findFirst({
      where: { name: statusName },
    });
    
    if (!status) {
      status = await prisma.thesisStatus.create({
        data: { name: statusName },
      });
      console.log(`  ✅ Created thesis status: ${statusName}`);
    } else {
      console.log(`  ⏭️  Thesis status exists: ${statusName}`);
    }
    
    statusMap.set(statusName, status);
  }
  
  return statusMap;
}

async function getSupervisors() {
  console.log("\n👨‍🏫 Getting existing supervisors...");
  
  const supervisorRole = await prisma.userRole.findFirst({
    where: { name: ROLES.PEMBIMBING_1 },
  });
  
  const supervisors = await prisma.lecturer.findMany({
    where: {
      user: {
        userHasRoles: {
          some: {
            roleId: supervisorRole.id,
          },
        },
      },
    },
    include: {
      user: true,
    },
  });
  
  if (supervisors.length === 0) {
    console.log("  ⚠️  No supervisors found! Creating sample supervisors...");
    return await createSampleSupervisors(supervisorRole);
  }
  
  console.log(`  ✅ Found ${supervisors.length} supervisors`);
  return supervisors;
}

async function createSampleSupervisors(supervisorRole) {
  const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  const supervisors = [];
  
  const supervisorNames = [
    "Dr. Ahmad Wijaya, S.Kom., M.Kom.",
    "Dr. Siti Nurhaliza, S.Kom., M.T.",
    "Prof. Dr. Budi Santoso, S.T., M.Kom.",
    "Dr. Dewi Lestari, S.Kom., M.Sc.",
    "Dr. Eko Prasetyo, S.Kom., M.Kom.",
  ];
  
  for (let i = 0; i < supervisorNames.length; i++) {
    const nip = generateNIP();
    const email = `supervisor${i + 1}@univ.ac.id`;
    
    const user = await prisma.user.create({
      data: {
        fullName: supervisorNames[i],
        identityNumber: nip,
        identityType: "NIP",
        email: email,
        password: hashedPassword,
        isVerified: true,
        userHasRoles: {
          create: {
            roleId: supervisorRole.id,
            status: "active",
          },
        },
        lecturer: {
          create: {},
        },
      },
      include: {
        lecturer: true,
      },
    });
    
    supervisors.push(user.lecturer);
    console.log(`  ✅ Created supervisor: ${supervisorNames[i]}`);
  }
  
  return supervisors;
}

async function createStudentsWithThesis(
  roleMap,
  studentStatus,
  academicYearMap,
  statusMap,
  supervisors
) {
  console.log("\n👨‍🎓 Creating students with thesis data...");
  console.log("=".repeat(60));
  
  const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  const thesisCount = 20;
  const createdTheses = [];
  
  // Get role IDs for thesis participants
  const pembimbing1Role = await prisma.userRole.findFirst({
    where: { name: ROLES.PEMBIMBING_1 },
  });
  const pembimbing2Role = await prisma.userRole.findFirst({
    where: { name: ROLES.PEMBIMBING_2 },
  });
  
  // Get existing student count to generate unique NIMs
  const existingStudentsCount = await prisma.student.count();
  
  // Academic year distribution: 60% current, 25% previous semester, 15% older
  const academicYearDistribution = [
    { key: "ganjil-2025", weight: 0.60 },  // 12 students
    { key: "genap-2024", weight: 0.25 },   // 5 students
    { key: "ganjil-2024", weight: 0.15 },  // 3 students
  ];
  
  function getAcademicYearForIndex(index) {
    const normalizedIndex = index / thesisCount;
    let cumulative = 0;
    
    for (const dist of academicYearDistribution) {
      cumulative += dist.weight;
      if (normalizedIndex < cumulative) {
        return academicYearMap.get(dist.key);
      }
    }
    
    return academicYearMap.get("ganjil-2025"); // fallback
  }
  
  for (let i = 0; i < thesisCount; i++) {
    const nim = generateNIM(existingStudentsCount + i + 1);
    const email = `student${existingStudentsCount + i + 1}@student.univ.ac.id`;
    const thesisStatus = getWeightedStatus();
    
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { identityNumber: nim },
    });
    
    if (existingUser) {
      console.log(`  ⏭️  Student ${i + 1}/${thesisCount}: User with NIM ${nim} already exists, skipping...`);
      continue;
    }
    
    // Determine special cases based on index
    const isAtRisk = i >= 17; // Last 3 students are at-risk
    const isReadyForSeminar = i >= 14 && i < 17; // 3 students ready for seminar
    const progress = isReadyForSeminar ? 100 : Math.floor(Math.random() * 101);
    
    // Get academic year for this student
    const academicYear = getAcademicYearForIndex(i);
    
    // Create user and student
    const user = await prisma.user.create({
      data: {
        fullName: `Student ${i + 1}`,
        identityNumber: nim,
        identityType: "NIM",
        email: email,
        password: hashedPassword,
        isVerified: true,
        userHasRoles: {
          create: {
            roleId: roleMap.get("MAHASISWA").id,
            status: "active",
          },
        },
        student: {
          create: {
            studentStatusId: studentStatus.id,
            enrollmentYear: 2021,
            skscompleted: 120,
          },
        },
      },
      include: {
        student: true,
      },
    });
    
    // Select supervisors
    const supervisor1 = supervisors[i % supervisors.length];
    const supervisor2 = supervisors[(i + 1) % supervisors.length];
    
    // Determine start date and deadline
    const startDate = generateDateRange(6, 90); // Started 3-9 months ago
    const deadlineDate = new Date(startDate);
    deadlineDate.setMonth(deadlineDate.getMonth() + 12); // 1 year deadline
    
    // Create thesis
    const thesis = await prisma.thesis.create({
      data: {
        studentId: user.student.id,
        thesisStatusId: statusMap.get(
          isReadyForSeminar ? "Acc Seminar" : thesisStatus
        ).id,
        academicYearId: academicYear.id,
        title: getRandomElement(THESIS_TITLES),
        startDate: startDate,
        deadlineDate: deadlineDate,
        seminarReadyApprovedBySupervisor1: isReadyForSeminar,
        seminarReadyApprovedBySupervisor2: isReadyForSeminar,
        seminarReadyApprovedAt: isReadyForSeminar ? new Date() : null,
      },
    });
    
    // Create thesis participants (supervisors)
    await prisma.thesisParticipant.createMany({
      data: [
        {
          thesisId: thesis.id,
          lecturerId: supervisor1.id,
          roleId: pembimbing1Role.id,
        },
        {
          thesisId: thesis.id,
          lecturerId: supervisor2.id,
          roleId: pembimbing2Role.id,
        },
      ],
    });
    
    // Create milestones based on progress
    const milestoneCount = 4;
    const completedMilestones = Math.floor((progress / 100) * milestoneCount);
    
    for (let m = 1; m <= milestoneCount; m++) {
      const isCompleted = m <= completedMilestones;
      
      await prisma.thesisMilestone.create({
        data: {
          thesisId: thesis.id,
          title: `Milestone ${m}`,
          description: `Description for milestone ${m}`,
          orderIndex: m,
          targetDate: new Date(
            startDate.getTime() + m * 30 * 24 * 60 * 60 * 1000
          ),
          status: isCompleted ? "completed" : "not_started",
          progressPercentage: isCompleted ? 100 : 0,
          startedAt: isCompleted ? generateDateRange(6 - m, 15) : null,
          completedAt: isCompleted ? generateDateRange(5 - m, 15) : null,
        },
      });
    }
    
    // Create guidance sessions
    const guidanceCount = isAtRisk ? 2 : Math.floor(Math.random() * 8) + 3;
    
    for (let g = 0; g < guidanceCount; g++) {
      const monthsAgo = isAtRisk 
        ? Math.floor(Math.random() * 3) + 3 // 3-6 months ago for at-risk
        : Math.floor(Math.random() * 5); // 0-5 months ago for normal
      
      const guidanceDate = generateDateRange(monthsAgo, 30);
      const supervisorId = g % 2 === 0 ? supervisor1.id : supervisor2.id;
      
      await prisma.thesisGuidance.create({
        data: {
          thesisId: thesis.id,
          supervisorId: supervisorId,
          requestedDate: guidanceDate,
          approvedDate: guidanceDate,
          studentNotes: `Guidance session ${g + 1} agenda`,
          supervisorFeedback: `Feedback from guidance ${g + 1}`,
          status: "completed",
          completedAt: guidanceDate,
        },
      });
    }
    
    createdTheses.push({
      student: user.fullName,
      nim: nim,
      title: thesis.title,
      status: isReadyForSeminar ? "Acc Seminar" : thesisStatus,
      academicYear: `${academicYear.semester}-${academicYear.year}`,
      progress: `${progress}%`,
      isAtRisk,
      isReadyForSeminar,
    });
    
    console.log(
      `  ✅ Created thesis ${i + 1}/${thesisCount}: ${user.fullName} - ${thesis.title.substring(0, 40)}...`
    );
  }
  
  return createdTheses;
}

// ============================================================
// SUMMARY DISPLAY
// ============================================================
function displaySummary(theses) {
  console.log("\n" + "=".repeat(60));
  console.log("📊 SEEDING SUMMARY");
  console.log("=".repeat(60));
  
  console.log(`\n✅ Total theses created: ${theses.length}`);
  
  // Count by status
  const statusCounts = {};
  theses.forEach((t) => {
    statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
  });
  
  console.log("\n📈 Distribution by status:");
  for (const [status, count] of Object.entries(statusCounts)) {
    console.log(`  - ${status}: ${count}`);
  }
  
  // Count by academic year
  const yearCounts = {};
  theses.forEach((t) => {
    yearCounts[t.academicYear] = (yearCounts[t.academicYear] || 0) + 1;
  });
  
  console.log("\n📅 Distribution by academic year:");
  for (const [year, count] of Object.entries(yearCounts)) {
    console.log(`  - ${year}: ${count}`);
  }
  
  // Special cases
  const atRiskCount = theses.filter((t) => t.isAtRisk).length;
  const readyForSeminarCount = theses.filter((t) => t.isReadyForSeminar).length;
  
  console.log("\n🎯 Special cases:");
  console.log(`  - At-risk students: ${atRiskCount}`);
  console.log(`  - Ready for seminar: ${readyForSeminarCount}`);
  
  // Progress distribution
  const progressRanges = {
    "0-25%": 0,
    "26-50%": 0,
    "51-75%": 0,
    "76-99%": 0,
    "100%": 0,
  };
  
  theses.forEach((t) => {
    const progress = parseInt(t.progress);
    if (progress === 0) progressRanges["0-25%"]++;
    else if (progress <= 25) progressRanges["0-25%"]++;
    else if (progress <= 50) progressRanges["26-50%"]++;
    else if (progress <= 75) progressRanges["51-75%"]++;
    else if (progress < 100) progressRanges["76-99%"]++;
    else progressRanges["100%"]++;
  });
  
  console.log("\n📊 Progress distribution:");
  for (const [range, count] of Object.entries(progressRanges)) {
    console.log(`  - ${range}: ${count}`);
  }
  
  console.log("\n" + "=".repeat(60));
  console.log("✨ Thesis data seeding completed successfully!");
  console.log("=".repeat(60));
  
  console.log("\n💡 You can now test the monitoring dashboard with:");
  console.log("  - Various thesis statuses");
  console.log("  - Different progress levels");
  console.log("  - At-risk students (no activity > 2 months)");
  console.log("  - Students ready for seminar");
  console.log("  - Multiple supervisor combinations");
  
  console.log("\n📝 Test credentials:");
  console.log(`  - Students: student1@student.univ.ac.id to student20@student.univ.ac.id`);
  console.log(`  - Supervisors: supervisor1@univ.ac.id to supervisor5@univ.ac.id`);
  console.log(`  - Password: ${DEFAULT_PASSWORD}`);
}

// ============================================================
// MAIN EXECUTION
// ============================================================
async function main() {
  console.log("\n" + "=".repeat(60));
  console.log("🚀 THESIS DATA SEEDING SCRIPT");
  console.log("=".repeat(60));
  
  try {
    // Step 1: Ensure all prerequisites exist
    const roleMap = await ensureRolesExist();
    const studentStatus = await ensureStudentStatusExists();
    const academicYearMap = await ensureAcademicYearsExist();
    const statusMap = await ensureThesisStatusesExist();
    const supervisors = await getSupervisors();
    
    // Step 2: Create students with thesis data
    const theses = await createStudentsWithThesis(
      roleMap,
      studentStatus,
      academicYearMap,
      statusMap,
      supervisors
    );
    
    // Step 3: Display summary
    displaySummary(theses);
    
  } catch (error) {
    console.error("\n❌ Error during seeding:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
