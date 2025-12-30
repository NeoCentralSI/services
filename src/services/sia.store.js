import redisClient from "../config/redis.js";

const indexKey = "sia:students:index";
const statusKey = "sia:sync:status";

const studentKey = (nim) => `sia:student:${nim}`;
const metaKey = (nim) => `sia:student:${nim}:meta`;

const hasJson = typeof redisClient.json?.set === "function";

export async function saveStudents(students) {
  let updated = 0;
  let skipped = 0;
  const updatedNims = [];

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

    if (hasJson) {
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

export async function getAllCachedStudents() {
  const nims = await redisClient.sMembers(indexKey);
  if (!nims || nims.length === 0) return [];

  if (hasJson && typeof redisClient.json.mGet === "function") {
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
