import prisma from "../src/config/prisma.js";
import { getLecturerQuotaSnapshots } from "../src/services/advisorQuota.service.js";
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
  const participants = await prisma.thesisParticipant.findMany({
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
          proposalStatus: true,
          thesisStatus: { select: { name: true } },
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
    thesisStatus: rows[0]?.thesis?.thesisStatus?.name ?? null,
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

async function findOrphanQuotaRows() {
  return prisma.$queryRaw`
    SELECT q.id, q.lecturer_id AS lecturerId, q.academic_year_id AS academicYearId
    FROM lecturer_supervision_quotas q
    LEFT JOIN lecturers l ON l.user_id = q.lecturer_id
    LEFT JOIN academic_years ay ON ay.id = q.academic_year_id
    WHERE l.user_id IS NULL
       OR ay.id IS NULL
  `;
}

async function findStaleQuotaRows() {
  const quotaRows = await prisma.lecturerSupervisionQuota.findMany({
    select: {
      id: true,
      lecturerId: true,
      academicYearId: true,
      currentCount: true,
    },
    orderBy: [{ academicYearId: "asc" }, { lecturerId: "asc" }],
  });

  const academicYearIds = [...new Set(quotaRows.map((row) => row.academicYearId).filter(Boolean))];
  const snapshotByKey = new Map();
  for (const academicYearId of academicYearIds) {
    const snapshots = await getLecturerQuotaSnapshots({ academicYearId, includeEntries: false });
    for (const snapshot of snapshots) {
      snapshotByKey.set(`${academicYearId}:${snapshot.lecturerId}`, snapshot);
    }
  }

  return quotaRows
    .map((row) => {
      const snapshot = snapshotByKey.get(`${row.academicYearId}:${row.lecturerId}`);
      const expectedCurrentCount = snapshot?.currentCount ?? 0;
      if (row.currentCount === expectedCurrentCount) return null;
      return {
        id: row.id,
        lecturerId: row.lecturerId,
        academicYearId: row.academicYearId,
        currentCount: row.currentCount,
        expectedCurrentCount,
      };
    })
    .filter(Boolean);
}

async function main() {
  const [duplicateRoleNames, duplicateActiveSupervisorRoles, orphanQuotaRows, staleQuotaRows] =
    await Promise.all([
      findDuplicateRoleNames(),
      findDuplicateActiveSupervisorRoles(),
      findOrphanQuotaRows(),
      findStaleQuotaRows(),
    ]);

  const result = {
    ok:
      duplicateRoleNames.length === 0 &&
      duplicateActiveSupervisorRoles.length === 0 &&
      orphanQuotaRows.length === 0 &&
      staleQuotaRows.length === 0,
    duplicateRoleNames,
    duplicateActiveSupervisorRoles,
    orphanQuotaRows,
    staleQuotaRows,
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
