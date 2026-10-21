import prisma from "../src/config/prisma.js";
import { ROLES } from "../src/constants/roles.js";

function groupBy(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return [...map.entries()].filter(([, items]) => items.length > 1);
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

async function findDuplicateRoleNames() {
  const roles = await prisma.userRole.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return groupBy(roles, (role) => normalize(role.name)).map(([name, rows]) => ({
    name,
    count: rows.length,
    rows,
  }));
}

async function findDuplicateActiveSupervisorRoles() {
  const participants = await prisma.thesisSupervisors.findMany({
    where: {
      status: "active",
      role: { name: { in: [ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2] } },
    },
    select: {
      id: true,
      thesisId: true,
      lecturerId: true,
      roleId: true,
      createdAt: true,
      role: { select: { name: true } },
      lecturer: { select: { user: { select: { fullName: true, identityNumber: true } } } },
      thesis: {
        select: {
          id: true,
          title: true,
          academicYearId: true,
          status: true,
          student: { select: { user: { select: { fullName: true, identityNumber: true } } } },
        },
      },
    },
    orderBy: [{ thesisId: "asc" }, { createdAt: "asc" }],
  });

  return groupBy(
    participants,
    (participant) => `${participant.thesisId}:${normalize(participant.role?.name)}`,
  ).map(([, rows]) => ({
    thesisId: rows[0]?.thesisId,
    roleName: rows[0]?.role?.name,
    count: rows.length,
    student: rows[0]?.thesis?.student?.user ?? null,
    thesisTitle: rows[0]?.thesis?.title ?? null,
    academicYearId: rows[0]?.thesis?.academicYearId ?? null,
    thesisStatus: rows[0]?.thesis?.status ?? null,
    participants: rows.map((row) => ({
      participantId: row.id,
      lecturerId: row.lecturerId,
      lecturer: row.lecturer?.user ?? null,
      roleId: row.roleId,
      roleName: row.role?.name ?? null,
      createdAt: row.createdAt,
    })),
  }));
}

async function main() {
  // Supervision load is computed, not stored (plan 10.1), so there are no quota rows to audit.
  const [duplicateRoleNames, duplicateActiveSupervisorRoles] = await Promise.all([
    findDuplicateRoleNames(),
    findDuplicateActiveSupervisorRoles(),
  ]);

  const result = {
    ok: duplicateRoleNames.length === 0 && duplicateActiveSupervisorRoles.length === 0,
    duplicateRoleNames,
    duplicateActiveSupervisorRoles,
  };

  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
