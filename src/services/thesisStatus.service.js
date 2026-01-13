import prisma from "../config/prisma.js";

const MONTH_2 = 60 * 24 * 60 * 60 * 1000;
const MONTH_4 = 120 * 24 * 60 * 60 * 1000;
const YEAR_1 = 365 * 24 * 60 * 60 * 1000;

function decideStatus(thesis) {
  const now = new Date();
  const created = new Date(thesis.createdAt);
  const age = now - created;

  // 1. FAILED: Jika > 1 tahun (dan belum selesai - checked outside)
  if (age > YEAR_1) {
    return "FAILED";
  }

  // Cari aktivitas milestone terakhir
  // thesis.thesisMilestones is array of { updatedAt }
  let lastActivity = created;
  if (thesis.thesisMilestones && thesis.thesisMilestones.length > 0) {
    // Assuming sorted desc by query
    const lastMilestone = thesis.thesisMilestones[0];
    const updateTime = new Date(lastMilestone.updatedAt);
    if (updateTime > lastActivity) lastActivity = updateTime;
  }

  const timeSinceLastChange = now - lastActivity;

  // 2. AT_RISK: > 4 bulan (120 hari) no change
  if (timeSinceLastChange > MONTH_4) {
    return "AT_RISK";
  }

  // 3. SLOW: > 2 bulan (60 hari) no change
  if (timeSinceLastChange > MONTH_2) {
    return "SLOW";
  }

  // 4. ONGOING
  return "ONGOING";
}

export async function updateAllThesisStatuses({ pageSize = 200, logger = console } = {}) {
  // 1. Get IDs of terminal statuses to skip
  const terminalStatuses = await prisma.thesisStatus.findMany({
    where: { name: { in: ["Selesai", "Gagal", "Lulus", "Drop Out"] } }, // Adjust names as per seed
    select: { id: true }
  });
  const terminalIds = new Set(terminalStatuses.map(s => s.id));

  let page = 0;
  const updated = { ONGOING: 0, SLOW: 0, AT_RISK: 0, FAILED: 0 };

  for (;;) {
    const theses = await prisma.thesis.findMany({
      skip: page * pageSize,
      take: pageSize,
      select: {
        id: true,
        rating: true,
        createdAt: true,
        thesisStatusId: true,
        thesisMilestones: {
          select: { updatedAt: true },
          orderBy: { updatedAt: 'desc' },
          take: 1
        }
      },
      orderBy: { id: "asc" },
    });
    
    if (theses.length === 0) break;

    await Promise.all(
      theses.map(async (t) => {
        // Skip if thesis is already in a terminal state (Selesai/Gagal)
        if (t.thesisStatusId && terminalIds.has(t.thesisStatusId)) {
          return;
        }

        const targetEnum = decideStatus(t);

        if (targetEnum !== t.rating) {
          await prisma.thesis.update({ 
            where: { id: t.id }, 
            data: { rating: targetEnum } 
          });
          if (updated[targetEnum] !== undefined) updated[targetEnum] += 1;
        }
      })
    );

    page += 1;
  }

  logger.log(
    `[thesis-status] Updated: ONGOING=${updated.ONGOING}, SLOW=${updated.SLOW}, AT_RISK=${updated.AT_RISK}, FAILED=${updated.FAILED}`
  );
  return updated;
}
