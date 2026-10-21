import fs from "fs";
import path from "path";
import prisma from "../src/config/prisma.js";
import { ROLES } from "../src/constants/roles.js";

function parseArgs(argv) {
  const args = { apply: false, mapPath: null };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === "--apply") {
      args.apply = true;
    } else if (item === "--map") {
      args.mapPath = argv[i + 1] ?? null;
      i += 1;
    }
  }
  return args;
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function groupBy(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return [...map.values()].filter((items) => items.length > 1);
}

function readMapping(mapPath) {
  if (!mapPath) {
    throw new Error("Mapping eksplisit wajib diisi. Gunakan: node scripts/repair-supervisor-integrity.js --map ./mapping.json");
  }

  const resolved = path.resolve(process.cwd(), mapPath);
  const parsed = JSON.parse(fs.readFileSync(resolved, "utf8"));
  const keepParticipantIds = Array.isArray(parsed)
    ? parsed
    : parsed.keepParticipantIds ?? parsed.keep ?? [];

  if (!Array.isArray(keepParticipantIds) || keepParticipantIds.length === 0) {
    throw new Error("Mapping harus berisi array keepParticipantIds.");
  }

  return new Set(keepParticipantIds.map(String));
}

async function findDuplicateGroups(client = prisma) {
  const participants = await client.thesisSupervisors.findMany({
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
          academicYearId: true,
          title: true,
          student: { select: { user: { select: { fullName: true, identityNumber: true } } } },
        },
      },
    },
    orderBy: [{ thesisId: "asc" }, { createdAt: "asc" }],
  });

  return groupBy(
    participants,
    (participant) => `${participant.thesisId}:${normalize(participant.role?.name)}`,
  );
}

function buildPlan(groups, keepIds) {
  return groups.map((group) => {
    const keepRows = group.filter((row) => keepIds.has(row.id));
    if (keepRows.length !== 1) {
      throw new Error(
        `Group thesis=${group[0]?.thesisId} role=${group[0]?.role?.name} harus punya tepat satu participant id pada mapping.`,
      );
    }

    const keep = keepRows[0];
    return {
      thesisId: group[0]?.thesisId,
      roleName: group[0]?.role?.name,
      academicYearId: group[0]?.thesis?.academicYearId ?? null,
      student: group[0]?.thesis?.student?.user ?? null,
      thesisTitle: group[0]?.thesis?.title ?? null,
      keep: {
        participantId: keep.id,
        lecturerId: keep.lecturerId,
        lecturer: keep.lecturer?.user ?? null,
      },
      terminate: group
        .filter((row) => row.id !== keep.id)
        .map((row) => ({
          participantId: row.id,
          lecturerId: row.lecturerId,
          lecturer: row.lecturer?.user ?? null,
        })),
    };
  });
}

async function applyPlan(plan) {
  // Supervision load is computed from active relations (plan 10.1); nothing else to sync.
  return prisma.$transaction(async (tx) => {
    for (const item of plan) {
      await tx.thesisSupervisors.updateMany({
        where: { id: { in: item.terminate.map((row) => row.participantId) } },
        data: { status: "terminated" },
      });
    }
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const keepIds = readMapping(args.mapPath);
  const groups = await findDuplicateGroups();
  const plan = buildPlan(groups, keepIds);

  if (!args.apply) {
    console.log(JSON.stringify({ dryRun: true, plan }, null, 2));
    return;
  }

  await applyPlan(plan);
  console.log(JSON.stringify({ dryRun: false, repairedGroups: plan.length, plan }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
