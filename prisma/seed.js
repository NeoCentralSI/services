import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import generated from "../src/generated/prisma/index.js";
import { syncDsiMaster } from "../scripts/sync-dsi-master.js";

dotenv.config();

const { PrismaClient } = generated;
const prisma = new PrismaClient();
const modelFields = new Map(
  generated.Prisma.dmmf.datamodel.models.map((model) => [
    model.name,
    new Set(model.fields.map((field) => field.name)),
  ])
);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(
  __dirname,
  "seed-data",
  "users-students-lecturers.json"
);

const VALID_IDENTITY_TYPES = new Set(["NIM", "NIP", "OTHER"]);
const VALID_STUDENT_STATUSES = new Set([
  "dropout",
  "bss",
  "lulus",
  "mengundurkan_diri",
  "active",
]);
const VALID_ROLE_STATUSES = new Set(["active", "nonActive"]);

function asDate(value, fallback = new Date()) {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function asBoolean(value) {
  return value === true || value === 1 || value === "1";
}

function asNullableString(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function normalizeIdentityType(value) {
  return VALID_IDENTITY_TYPES.has(value) ? value : "OTHER";
}

function normalizeStudentStatus(value) {
  return VALID_STUDENT_STATUSES.has(value) ? value : "active";
}

function normalizeRoleStatus(value) {
  return VALID_ROLE_STATUSES.has(value) ? value : "active";
}

function parseJson(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function pickModelData(modelName, data) {
  const fields = modelFields.get(modelName);
  if (!fields) return data;

  return Object.fromEntries(
    Object.entries(data).filter(([key]) => fields.has(key))
  );
}

async function loadSeedData() {
  const raw = await fs.readFile(DATA_PATH, "utf8");
  return JSON.parse(raw);
}

async function findExistingUser(seedUser) {
  const or = [{ id: seedUser.id }, { identityNumber: seedUser.identityNumber }];
  const email = asNullableString(seedUser.email);
  if (email) {
    or.push({ email });
  }

  return prisma.user.findFirst({ where: { OR: or } });
}

async function seedRoles(roles) {
  const roleIdMap = new Map();

  for (const role of roles) {
    let existing = await prisma.userRole.findFirst({
      where: {
        OR: [{ id: role.id }, { name: role.name }],
      },
    });

    if (existing) {
      existing = await prisma.userRole.update({
        where: { id: existing.id },
        data: { name: role.name },
      });
    } else {
      existing = await prisma.userRole.create({
        data: { id: role.id, name: role.name },
      });
    }

    roleIdMap.set(role.id, existing.id);
  }

  return roleIdMap;
}

async function seedUsers(users) {
  const userIdMap = new Map();

  for (const seedUser of users) {
    const now = new Date();
    const existing = await findExistingUser(seedUser);
    const data = pickModelData("User", {
      fullName: seedUser.fullName,
      identityNumber: seedUser.identityNumber,
      identityType: normalizeIdentityType(seedUser.identityType),
      email: asNullableString(seedUser.email),
      password: seedUser.password ?? null,
      phoneNumber: asNullableString(seedUser.phoneNumber),
      isVerified: asBoolean(seedUser.isVerified),
      oauthProvider: asNullableString(seedUser.oauthProvider),
      oauthId: asNullableString(seedUser.oauthId),
      avatarUrl: asNullableString(seedUser.avatarUrl),
      gender: seedUser.gender ?? null,
      token: null,
      refreshToken: null,
      oauthRefreshToken: null,
      createdAt: asDate(seedUser.createdAt, now),
      updatedAt: asDate(seedUser.updatedAt, now),
    });

    let user;
    if (existing) {
      user = await prisma.user.update({
        where: { id: existing.id },
        data,
      });
    } else {
      user = await prisma.user.create({
        data: {
          id: seedUser.id,
          ...data,
        },
      });
    }

    userIdMap.set(seedUser.id, user.id);
  }

  return userIdMap;
}

async function resolveScienceGroupId(scienceGroupId) {
  if (!scienceGroupId) return null;
  const existing = await prisma.scienceGroup.findUnique({
    where: { id: scienceGroupId },
    select: { id: true },
  });
  return existing?.id ?? null;
}

async function seedStudents(students, userIdMap) {
  let count = 0;

  for (const student of students) {
    const targetUserId = userIdMap.get(student.id);
    if (!targetUserId) continue;

    const data = pickModelData("Student", {
      status: normalizeStudentStatus(student.status),
      enrollmentYear: student.enrollmentYear ?? null,
      sksCompleted: Number(student.skscompleted ?? 0),
      gpa: student.gpa ?? null,
      graduationPredicate: asNullableString(student.graduationPredicate),
      mandatoryCoursesCompleted: asBoolean(student.mandatoryCoursesCompleted),
      mkwuCompleted: asBoolean(student.mkwuCompleted),
      internshipCompleted: asBoolean(student.internshipCompleted),
      kknCompleted: asBoolean(student.kknCompleted),
      researchMethodCompleted: asBoolean(student.researchMethodCompleted),
      currentSemester: student.currentSemester ?? null,
      createdAt: asDate(student.createdAt),
      updatedAt: asDate(student.updatedAt),
    });

    await prisma.student.upsert({
      where: { id: targetUserId },
      update: data,
      create: {
        id: targetUserId,
        ...data,
      },
    });
    count += 1;
  }

  return count;
}

async function seedLecturers(lecturers, userIdMap) {
  let count = 0;

  for (const lecturer of lecturers) {
    const targetUserId = userIdMap.get(lecturer.id);
    if (!targetUserId) continue;

    const data = pickModelData("Lecturer", {
      scienceGroupId: await resolveScienceGroupId(lecturer.scienceGroupId),
      data: parseJson(lecturer.data),
      createdAt: asDate(lecturer.createdAt),
      updatedAt: asDate(lecturer.updatedAt),
    });

    await prisma.lecturer.upsert({
      where: { id: targetUserId },
      update: data,
      create: {
        id: targetUserId,
        ...data,
      },
    });
    count += 1;
  }

  return count;
}

async function seedUserRoles(userHasRoles, userIdMap, roleIdMap) {
  let count = 0;

  for (const assignment of userHasRoles) {
    const userId = userIdMap.get(assignment.userId);
    const roleId = roleIdMap.get(assignment.roleId);
    if (!userId || !roleId) continue;

    await prisma.userHasRole.upsert({
      where: {
        userId_roleId: { userId, roleId },
      },
      update: {
        status: normalizeRoleStatus(assignment.status),
      },
      create: {
        userId,
        roleId,
        status: normalizeRoleStatus(assignment.status),
      },
    });
    count += 1;
  }

  return count;
}

async function main() {
  const seedData = await loadSeedData();

  console.log("Seeding users/students/lecturers from cloned snapshot...");
  console.log(`Snapshot generated at: ${seedData.generatedAt}`);

  const roleIdMap = await seedRoles(seedData.roles ?? []);
  const userIdMap = await seedUsers(seedData.users ?? []);
  const studentCount = await seedStudents(seedData.students ?? [], userIdMap);
  const lecturerCount = await seedLecturers(seedData.lecturers ?? [], userIdMap);
  const userRoleCount = await seedUserRoles(
    seedData.userHasRoles ?? [],
    userIdMap,
    roleIdMap
  );

  // Keep a fresh/reset database aligned with the canonical DSI master. The
  // synchronizer upserts by NIP/name and never deletes thesis transactions.
  const master = await syncDsiMaster(prisma);
  console.log(`DSI master synced: ${master.groups.length} KBK, ${master.lecturers.length} real lecturers`);

  console.log("Seed completed.");
  console.log(`Roles: ${roleIdMap.size}`);
  console.log(`Users: ${userIdMap.size}`);
  console.log(`Students: ${studentCount}`);
  console.log(`Lecturers: ${lecturerCount}`);
  console.log(`Role assignments: ${userRoleCount}`);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
