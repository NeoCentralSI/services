import { ROLES, isPembimbing1, isPembimbing2, supervisorRoleEnum } from "../constants/roles.js";
import { BadRequestError } from "./errors.js";

const SUPERVISOR_ROLE_NAMES = [ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2];

function normalizeName(value) {
  return String(value || "").trim().toLowerCase();
}

function roleNameFromInput(input, roles) {
  if (input.roleId && roles.byId.has(input.roleId)) {
    return roles.byId.get(input.roleId).name;
  }

  const rawRole = input.roleName ?? input.supervisorRole ?? input.role ?? null;
  if (isPembimbing1(rawRole)) return ROLES.PEMBIMBING_1;
  if (isPembimbing2(rawRole)) return ROLES.PEMBIMBING_2;

  return null;
}

export function supervisorRoleAlias(participant) {
  const roleName = participant?.role?.name ?? participant?.roleName ?? participant?.supervisorRole;
  if (isPembimbing1(roleName)) return "pembimbing_1";
  if (isPembimbing2(roleName)) return "pembimbing_2";
  return supervisorRoleEnum(roleName) ?? participant?.supervisorRole ?? null;
}

export function withSupervisorRoleAlias(participant) {
  if (!participant || typeof participant !== "object") return participant;
  return {
    ...participant,
    supervisorRole: supervisorRoleAlias(participant),
  };
}

export function withSupervisorRoleAliases(participants = []) {
  return participants.map(withSupervisorRoleAlias);
}

export async function getCanonicalSupervisorRoles(client) {
  const roles = await client.userRole.findMany({
    where: { name: { in: SUPERVISOR_ROLE_NAMES } },
    select: { id: true, name: true },
  });

  const byName = new Map();
  const byId = new Map();
  for (const role of roles) {
    const key = normalizeName(role.name);
    if (byName.has(key)) {
      throw new BadRequestError(`Role "${role.name}" terduplikasi. Jalankan audit integritas role terlebih dahulu.`);
    }
    byName.set(key, role);
    byId.set(role.id, role);
  }

  for (const name of SUPERVISOR_ROLE_NAMES) {
    if (!byName.has(normalizeName(name))) {
      throw new BadRequestError(`Role "${name}" tidak ditemukan di sistem.`);
    }
  }

  return {
    pembimbing1: byName.get(normalizeName(ROLES.PEMBIMBING_1)),
    pembimbing2: byName.get(normalizeName(ROLES.PEMBIMBING_2)),
    byName,
    byId,
  };
}

export async function canonicalizeSupervisorAssignments(client, supervisors = [], options = {}) {
  const { requireP1 = true } = options;
  const rows = Array.isArray(supervisors) ? supervisors.filter(Boolean) : [];

  if (rows.length === 0) {
    if (requireP1) {
      throw new BadRequestError("Pembimbing 1 wajib diisi.");
    }
    return [];
  }

  const roles = await getCanonicalSupervisorRoles(client);
  const canonical = rows.map((row) => {
    const lecturerId = row.lecturerId ?? row.id ?? null;
    const roleName = roleNameFromInput(row, roles);

    if (!lecturerId) {
      throw new BadRequestError("Dosen pembimbing wajib diisi.");
    }
    if (!roleName) {
      throw new BadRequestError("Role pembimbing tidak valid. Gunakan Pembimbing 1 atau Pembimbing 2.");
    }

    const role = roleName === ROLES.PEMBIMBING_1 ? roles.pembimbing1 : roles.pembimbing2;
    return {
      lecturerId,
      roleId: role.id,
      roleName,
      supervisorRole: supervisorRoleEnum(roleName),
    };
  });

  const lecturerIds = new Set();
  let p1Count = 0;
  let p2Count = 0;

  for (const row of canonical) {
    if (lecturerIds.has(row.lecturerId)) {
      throw new BadRequestError("Dosen yang sama tidak boleh menjadi Pembimbing 1 dan Pembimbing 2 pada thesis yang sama.");
    }
    lecturerIds.add(row.lecturerId);

    if (row.roleName === ROLES.PEMBIMBING_1) p1Count += 1;
    if (row.roleName === ROLES.PEMBIMBING_2) p2Count += 1;
  }

  if (p1Count > 1) {
    throw new BadRequestError("Mahasiswa hanya boleh memiliki satu Pembimbing 1 aktif.");
  }
  if (p2Count > 1) {
    throw new BadRequestError("Mahasiswa hanya boleh memiliki satu Pembimbing 2 aktif.");
  }
  if (requireP1 && p1Count !== 1) {
    throw new BadRequestError("Pembimbing 1 wajib tepat satu.");
  }

  return canonical;
}

export async function createSupervisorAssignments(client, thesisId, supervisors = [], options = {}) {
  const canonical = await canonicalizeSupervisorAssignments(client, supervisors, options);
  if (canonical.length === 0) {
    return { created: [], affectedLecturerIds: [] };
  }

  const roleIds = canonical.map((row) => row.roleId);
  const lecturerIds = canonical.map((row) => row.lecturerId);
  const existing = await client.thesisParticipant.findMany({
    where: {
      thesisId,
      status: "active",
      OR: [{ roleId: { in: roleIds } }, { lecturerId: { in: lecturerIds } }],
    },
    select: {
      id: true,
      lecturerId: true,
      roleId: true,
      role: { select: { name: true } },
      lecturer: { select: { user: { select: { fullName: true } } } },
    },
  });

  for (const row of canonical) {
    const sameRole = existing.find((item) => item.roleId === row.roleId);
    if (sameRole) {
      const lecturerName = sameRole.lecturer?.user?.fullName ?? "dosen lain";
      throw new BadRequestError(`Mahasiswa ini sudah memiliki ${row.roleName} (${lecturerName}).`);
    }

    const sameLecturer = existing.find((item) => item.lecturerId === row.lecturerId);
    if (sameLecturer) {
      const roleName = sameLecturer.role?.name ?? "pembimbing lain";
      throw new BadRequestError(`Dosen ini sudah terdaftar sebagai ${roleName} untuk mahasiswa tersebut.`);
    }
  }

  const created = [];
  for (const row of canonical) {
    const participant = await client.thesisParticipant.create({
      data: {
        thesisId,
        lecturerId: row.lecturerId,
        roleId: row.roleId,
      },
      select: { id: true, thesisId: true, lecturerId: true, roleId: true, status: true },
    });
    created.push(participant);
  }

  return {
    created,
    affectedLecturerIds: [...new Set(canonical.map((row) => row.lecturerId))],
  };
}

export async function replaceSupervisorAssignments(client, thesisId, supervisors = [], options = {}) {
  const canonical = await canonicalizeSupervisorAssignments(client, supervisors, options);
  const activeExisting = await client.thesisParticipant.findMany({
    where: { thesisId, status: "active" },
    select: { id: true, lecturerId: true, roleId: true },
  });

  const targetKeys = new Set(canonical.map((row) => `${row.lecturerId}:${row.roleId}`));
  const keepIds = activeExisting
    .filter((row) => targetKeys.has(`${row.lecturerId}:${row.roleId}`))
    .map((row) => row.id);
  const toTerminate = activeExisting.filter((row) => !keepIds.includes(row.id));

  if (toTerminate.length > 0) {
    await client.thesisParticipant.updateMany({
      where: { id: { in: toTerminate.map((row) => row.id) } },
      data: { status: "terminated" },
    });
  }

  const created = [];
  const reactivated = [];
  for (const row of canonical) {
    const exactActive = activeExisting.find(
      (item) => item.lecturerId === row.lecturerId && item.roleId === row.roleId && keepIds.includes(item.id),
    );
    if (exactActive) continue;

    const reusable = await client.thesisParticipant.findFirst({
      where: {
        thesisId,
        lecturerId: row.lecturerId,
        status: "terminated",
      },
      select: { id: true },
      orderBy: { updatedAt: "desc" },
    });

    if (reusable) {
      const participant = await client.thesisParticipant.update({
        where: { id: reusable.id },
        data: { roleId: row.roleId, status: "active", seminarReady: false, defenceReady: false },
        select: { id: true, thesisId: true, lecturerId: true, roleId: true, status: true },
      });
      reactivated.push(participant);
    } else {
      const participant = await client.thesisParticipant.create({
        data: {
          thesisId,
          lecturerId: row.lecturerId,
          roleId: row.roleId,
        },
        select: { id: true, thesisId: true, lecturerId: true, roleId: true, status: true },
      });
      created.push(participant);
    }
  }

  const affectedLecturerIds = [
    ...new Set([
      ...activeExisting.map((row) => row.lecturerId),
      ...canonical.map((row) => row.lecturerId),
    ]),
  ];

  return { created, reactivated, terminated: toTerminate, affectedLecturerIds };
}
