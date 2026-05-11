import redisClient from "../config/redis.js";

const indexKey = "sia:students:index";
const statusKey = "sia:sync:status";

const studentKey = (nim) => `sia:student:${nim}`;
const metaKey = (nim) => `sia:student:${nim}:meta`;

/**
 * Runtime probe — check once whether the Redis server actually supports
 * the RedisJSON module (the client library always exposes .json methods
 * even when the server doesn't have the module loaded).
 */
let _jsonSupported = null; // null = not probed yet
async function serverHasJson() {
  if (_jsonSupported !== null) return _jsonSupported;
  try {
    await redisClient.json.type("__json_probe__");
    _jsonSupported = true;
  } catch {
    _jsonSupported = false;
  }
  return _jsonSupported;
}

export async function saveStudents(students) {
  let updated = 0;
  let skipped = 0;
  const updatedNims = [];
  const useJson = await serverHasJson();

  for (const student of students) {
    const nim = student?.nim;
    if (!nim) continue;

    const meta = await redisClient.hGetAll(metaKey(nim));
    const incomingHash = student.hash;
    if (meta?.hash && meta.hash === incomingHash) {
      skipped += 1;
      continue;
    }

    const multi = redisClient.multi();

    if (useJson) {
      multi.json.set(studentKey(nim), "$", student.data);
    } else {
      multi.set(studentKey(nim), JSON.stringify(student.data));
    }

    multi.hSet(metaKey(nim), { hash: incomingHash, fetchedAt: student.fetchedAt });
    multi.sAdd(indexKey, nim);

    await multi.exec();
    updated += 1;
    updatedNims.push(nim);
  }
  return { updated, skipped, updatedNims };
}

export async function saveSyncStatus(status) {
  await redisClient.hSet(statusKey, {
    ...status,
    lastRun: status.lastRun?.toISOString?.() || status.lastRun,
  });
}

export async function getSyncStatus() {
  return redisClient.hGetAll(statusKey);
}

export async function getCachedStudent(nim) {
  if (!nim) return null;
  const useJson = await serverHasJson();
  if (useJson) {
    const val = await redisClient.json.get(studentKey(nim), { path: "$" });
    return Array.isArray(val) ? val[0] : val;
  }
  const raw = await redisClient.get(studentKey(nim));
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function getAllCachedStudents() {
  const nims = await redisClient.sMembers(indexKey);
  if (!nims || nims.length === 0) return [];

  const useJson = await serverHasJson();
  if (useJson) {
    const values = await redisClient.json.mGet(nims.map(studentKey), "$");
    return values.map((v) => (Array.isArray(v) ? v[0] : v)).filter(Boolean);
  }

  const values = await redisClient.mGet(nims.map(studentKey));
  return values
    .map((v) => {
      try {
        return JSON.parse(v);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/**
 * Clean up obsolete student data from cache
 * Removes students that no longer exist in current sync
 */
export async function cleanupObsoleteStudents(currentNims) {
  const allNims = await redisClient.sMembers(indexKey);
  const currentNimSet = new Set(currentNims);
  const obsoleteNims = allNims.filter((nim) => !currentNimSet.has(nim));

  if (obsoleteNims.length === 0) {
    return { cleaned: 0 };
  }

  const multi = redisClient.multi();
  for (const nim of obsoleteNims) {
    multi.del(studentKey(nim));
    multi.del(metaKey(nim));
    multi.sRem(indexKey, nim);
  }
  await multi.exec();

  console.log(`🧹 Cleaned up ${obsoleteNims.length} obsolete student records`);
  return { cleaned: obsoleteNims.length, nims: obsoleteNims };
}
