/**
 * Sinkronisasi master DSI yang aman terhadap transaksi.
 *
 * - KBK di-upsert dengan nama exact (4 KBK routing TA).
 * - Dosen di-upsert berdasarkan NIP; transaksi tidak disentuh selain nama
 *   master dan relasi master yang memang perlu dipindahkan.
 * - Topik lama dipindahkan ke topik resmi sebelum record lama dihapus.
 * - Hafzatin sengaja tetap tanpa KBK sampai ada keputusan resmi.
 *
 * Jalankan: node scripts/sync-dsi-master.js
 * Hanya gabung KBK usang (tanpa upsert dosen/topik):
 *   node scripts/sync-dsi-master.js --legacy-groups-only
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PrismaClient } from "../src/generated/prisma/index.js";
import { ROLES } from "../src/constants/roles.js";

let defaultPrisma;
function getDefaultPrisma() {
  defaultPrisma ??= new PrismaClient();
  return defaultPrisma;
}

export const CANONICAL_GROUPS = [
  "Sistem Enterprise",
  "Rekayasa Data dan Business Intelligence",
  "Tata Kelola dan Infrastruktur Teknologi Informasi",
  "Pengembangan Sistem",
];

const REAL_LECTURERS = [
  ["Afriyanti Dwi Kartika, M.T", "198904212019032024", "Sistem Enterprise"],
  ["Aina Hubby Aziira, M.Eng", "199504302022032013", "Rekayasa Data dan Business Intelligence"],
  ["Febby Apri Wenando, M.Eng", "199104172022031007", "Rekayasa Data dan Business Intelligence"],
  ["Dwi Welly Sukma Nirad, M.T", "199108122019032018", "Pengembangan Sistem"],
  ["Fajril Akbar, M.Sc", "198001102008121002", "Rekayasa Data dan Business Intelligence"],
  ["Hafizah Hanim, M.Kom", "199309292019032022", "Rekayasa Data dan Business Intelligence"],
  ["Hafzatin Nurlatifa, M.Eng", "199601222024062002", null],
  ["Haris Suryamen, M.Sc", "197503232012121001", "Rekayasa Data dan Business Intelligence"],
  ["Hasdi Putra, M.T", "198307272008121003", "Sistem Enterprise"],
  ["Husnil Kamil, M.T", "198201182008121002", "Sistem Enterprise"],
  ["Jefril Rahmadoni, M.Kom", "198904152019031009", "Sistem Enterprise"],
  ["Nisa Dwi Angresti, M.Kom", "199206042024062001", "Pengembangan Sistem"],
  ["Rahmatika Pratama Santi, M.T", "199308152022032017", "Tata Kelola dan Infrastruktur Teknologi Informasi"],
  ["Ricky Akbar, M. Kom", "198410062012121001", "Sistem Enterprise"],
  ["Prof. Ir. Surya Afnarius, PhD", "196404091995121001", "Rekayasa Data dan Business Intelligence"],
  ["Ullya Mega Wahyuni, M.Kom", "199011032019032008", "Tata Kelola dan Infrastruktur Teknologi Informasi"],
  ["Adi Arga Arifnur, M.Kom", "199208202019031005", "Tata Kelola dan Infrastruktur Teknologi Informasi"],
];

const OFFICIAL_TOPICS = [
  ["Sistem Pendukung Keputusan (SPK)", "Rekayasa Data dan Business Intelligence"],
  ["Business Intelligence (BI)", "Rekayasa Data dan Business Intelligence"],
  ["Machine Learning", "Rekayasa Data dan Business Intelligence"],
  ["Enterprise System", "Sistem Enterprise"],
  ["Pengembangan Sistem (Enterprise Application)", "Pengembangan Sistem"],
];

const TOPIC_MERGES = [
  ["Sistem Informasi Manajemen", "Pengembangan Sistem (Enterprise Application)"],
  ["Data Mining & Knowledge Discovery", "Machine Learning"],
  ["Data Warehouse & Business Intelligence", "Business Intelligence (BI)"],
];

// Mapping kategori lama hanya untuk merelokasi master yang tersisa setelah
// topik transaksi lama dipindahkan. Ini tidak mengubah thesis/request.
export const LEGACY_GROUP_TARGETS = {
  "Sistem Informasi": "Sistem Enterprise",
  "KBK Sistem Informasi": "Sistem Enterprise",
  "Big Data & Analitika": "Rekayasa Data dan Business Intelligence",
  "Kecerdasan Buatan": "Rekayasa Data dan Business Intelligence",
  "Rekayasa Perangkat Lunak": "Pengembangan Sistem",
  "Internet of Things": "Tata Kelola dan Infrastruktur Teknologi Informasi",
};

const log = (message) => console.log(`  [MASTER] ${message}`);

async function upsertGroups(client) {
  const groups = new Map();
  for (const name of CANONICAL_GROUPS) {
    const matches = await client.scienceGroup.findMany({ where: { name }, orderBy: { createdAt: "asc" } });
    const group = matches[0] ?? await client.scienceGroup.create({ data: { name } });
    groups.set(name, group);
    for (const duplicate of matches.slice(1)) {
      await client.lecturer.updateMany({ where: { scienceGroupId: duplicate.id }, data: { scienceGroupId: group.id } });
      await client.thesisTopic.updateMany({ where: { scienceGroupId: duplicate.id }, data: { scienceGroupId: group.id } });
      await client.scienceGroup.delete({ where: { id: duplicate.id } });
      log(`merges duplicate KBK "${name}" (${duplicate.id})`);
    }
  }
  return groups;
}

async function upsertRealLecturers(client, groups) {
  const lecturerRoleNames = [ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2, ROLES.PENGUJI];
  const roles = await client.userRole.findMany({ where: { name: { in: lecturerRoleNames } } });
  const roleByName = new Map(roles.map((role) => [role.name, role]));
  const result = [];
  for (const [fullName, nip, groupName] of REAL_LECTURERS) {
    let user = await client.user.findUnique({ where: { identityNumber: nip } });
    if (!user) {
      user = await client.user.create({
        data: { fullName, identityNumber: nip, identityType: "NIP", isVerified: true },
      });
      log(`created dosen ${fullName} (${nip})`);
    } else {
      if (user.fullName !== fullName || user.identityType !== "NIP") {
        user = await client.user.update({ where: { id: user.id }, data: { fullName, identityType: "NIP" } });
        log(`normalized dosen ${nip} → ${fullName}`);
      }
    }
    const scienceGroupId = groupName ? groups.get(groupName).id : null;
    const existingLecturer = await client.lecturer.findUnique({ where: { id: user.id }, select: { scienceGroupId: true } });
    if (!existingLecturer) await client.lecturer.create({ data: { id: user.id, scienceGroupId } });
    else if (existingLecturer.scienceGroupId !== scienceGroupId) {
      await client.lecturer.update({ where: { id: user.id }, data: { scienceGroupId } });
    }
    for (const roleName of lecturerRoleNames) {
      const role = roleByName.get(roleName);
      if (!role) continue;
      await client.userHasRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
        update: { status: "active" },
        create: { userId: user.id, roleId: role.id, status: "active" },
      });
    }
    result.push({ fullName, nip, groupName });
  }
  return result;
}

async function prefixDummyLecturers(client, realNips) {
  const dummies = await client.user.findMany({
    where: { email: { endsWith: "@dummy.ac.id" }, identityType: "NIP", identityNumber: { notIn: realNips } },
    select: { id: true, fullName: true },
  });
  for (const dummy of dummies) {
    if (!dummy.fullName.startsWith("[DUMMY]")) {
      await client.user.update({ where: { id: dummy.id }, data: { fullName: `[DUMMY] ${dummy.fullName}` } });
    }
  }
  return dummies.length;
}

async function upsertOfficialTopics(client, groups) {
  const topics = new Map();
  for (const [name, groupName] of OFFICIAL_TOPICS) {
    const existing = await client.thesisTopic.findFirst({ where: { name }, orderBy: { createdAt: "asc" } });
    const topic = existing
      ? await client.thesisTopic.update({ where: { id: existing.id }, data: { name, scienceGroupId: groups.get(groupName).id } })
      : await client.thesisTopic.create({ data: { name, scienceGroupId: groups.get(groupName).id, isPublished: true } });
    topics.set(name, topic);
  }
  return topics;
}

async function moveTopicReferences(client, oldTopicId, targetTopicId) {
  const thesis = await client.thesis.updateMany({ where: { thesisTopicId: oldTopicId }, data: { thesisTopicId: targetTopicId } });
  const requests = await client.thesisAdvisorRequest.updateMany({ where: { topicId: oldTopicId }, data: { topicId: targetTopicId } });
  const drafts = await client.thesisAdvisorRequestDraft.updateMany({ where: { topicId: oldTopicId }, data: { topicId: targetTopicId } });
  const changes = await client.thesisChangeRequest.updateMany({ where: { newTopicId: oldTopicId }, data: { newTopicId: targetTopicId } });
  return { thesis: thesis.count, requests: requests.count, drafts: drafts.count, changes: changes.count };
}

async function mergeTopics(client, officialTopics) {
  const merged = [];
  for (const [oldName, targetName] of TOPIC_MERGES) {
    const oldTopic = await client.thesisTopic.findFirst({ where: { name: oldName } });
    const targetTopic = officialTopics.get(targetName);
    if (!oldTopic || oldTopic.id === targetTopic.id) continue;
    const moved = await moveTopicReferences(client, oldTopic.id, targetTopic.id);
    await client.thesisTopic.delete({ where: { id: oldTopic.id } });
    merged.push({ from: oldName, to: targetName, moved });
  }
  return merged;
}

async function normalizeRemainingTopics(client, groups, officialTopics) {
  const topics = await client.thesisTopic.findMany({ include: { scienceGroup: true } });
  let relinked = 0;
  for (const topic of topics) {
    if (officialTopics.has(topic.name)) continue;
    if (topic.name === "test" && !topic.name.startsWith("[DUMMY]")) {
      await client.thesisTopic.update({ where: { id: topic.id }, data: { name: "[DUMMY] test" } });
    }
    const targetName = LEGACY_GROUP_TARGETS[topic.scienceGroup?.name] ?? "Pengembangan Sistem";
    if (topic.scienceGroupId !== groups.get(targetName).id) {
      await client.thesisTopic.update({ where: { id: topic.id }, data: { scienceGroupId: groups.get(targetName).id } });
      relinked += 1;
    }
  }
  return relinked;
}

async function mergeLegacyGroups(client, groups) {
  const legacy = await client.scienceGroup.findMany({ where: { name: { notIn: CANONICAL_GROUPS } } });
  const merged = [];
  for (const group of legacy) {
    const targetName = LEGACY_GROUP_TARGETS[group.name];
    if (!targetName) {
      merged.push({ name: group.name, action: "skipped-no-target" });
      continue;
    }
    const targetId = groups.get(targetName).id;
    await client.lecturer.updateMany({ where: { scienceGroupId: group.id }, data: { scienceGroupId: targetId } });
    await client.thesisTopic.updateMany({ where: { scienceGroupId: group.id }, data: { scienceGroupId: targetId } });
    await client.scienceGroup.delete({ where: { id: group.id } });
    merged.push({ name: group.name, target: targetName, action: "merged" });
  }
  return merged;
}

export async function syncDsiMaster(client = getDefaultPrisma()) {
  return client.$transaction(async (tx) => {
    const groups = await upsertGroups(tx);
    const lecturers = await upsertRealLecturers(tx, groups);
    const realNips = REAL_LECTURERS.map(([, nip]) => nip);
    const dummyCount = await prefixDummyLecturers(tx, realNips);
    const officialTopics = await upsertOfficialTopics(tx, groups);
    const topicMerges = await mergeTopics(tx, officialTopics);
    const relinkedTopics = await normalizeRemainingTopics(tx, groups, officialTopics);
    const groupMerges = await mergeLegacyGroups(tx, groups);
    return {
      groups: CANONICAL_GROUPS,
      lecturers,
      dummyCount,
      topicMerges,
      relinkedTopics,
      groupMerges,
    };
  });
}

/** Gabungkan nama KBK usang ke 4 nama resmi. Tidak mengubah NIP dosen atau topik. */
export async function mergeLegacyScienceGroups(client = getDefaultPrisma()) {
  return client.$transaction(async (tx) => {
    const groups = await upsertGroups(tx);
    const groupMerges = await mergeLegacyGroups(tx, groups);
    return {
      groups: CANONICAL_GROUPS,
      groupMerges,
    };
  });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const client = getDefaultPrisma();
  const run = process.argv.includes("--legacy-groups-only")
    ? mergeLegacyScienceGroups(client)
    : syncDsiMaster(client);
  run
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => { console.error(error); process.exitCode = 1; })
    .finally(() => client.$disconnect());
}
