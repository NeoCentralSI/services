import { fetchStudentsFull, hashStudent } from "./sia.client.js";
import { saveStudents, saveSyncStatus } from "./sia.store.js";
import prisma from "../config/prisma.js";

export async function runSiaSync() {
  const startedAt = new Date();
  let summary = {
    lastRun: startedAt,
    fetched: 0,
    updated: 0,
    skipped: 0,
    error: "",
    durationMs: 0,
  };

  try {
    const data = await fetchStudentsFull();
    summary.fetched = Array.isArray(data) ? data.length : 0;

    const stamped = data.map((student) => ({
      nim: student.nim,
      data: student,
      hash: hashStudent(student),
      fetchedAt: startedAt.toISOString(),
    }));

    const { updated, skipped } = await saveStudents(stamped);
    summary.updated = updated;
    summary.skipped = skipped;

    // Patch skscompleted in DB for matching students (by identityNumber = NIM)
    await updateStudentSks(stamped);
  } catch (err) {
    summary.error = err?.message || String(err);
    throw err;
  } finally {
    summary.durationMs = Date.now() - startedAt.getTime();
    await saveSyncStatus(summary);
  }
}

async function updateStudentSks(stamped) {
  for (const entry of stamped) {
    const nim = entry.nim;
    const sksVal = Number(entry.data?.sksCompleted);
    if (!nim || Number.isNaN(sksVal)) continue;

    try {
      const user = await prisma.user.findUnique({
        where: { identityNumber: nim },
        select: { id: true },
      });
      if (!user) continue;

      await prisma.student.update({
        where: { id: user.id },
        data: { skscompleted: sksVal },
      });
    } catch (err) {
      console.warn(`Failed to update sks for NIM ${nim}:`, err.message);
    }
  }
}
