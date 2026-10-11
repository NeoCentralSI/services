import prisma from "../config/prisma.js";
import { THESIS_STATUS, TA_PHASE } from "../constants/thesisStatus.js";

const MONTH_2 = 60 * 24 * 60 * 60 * 1000;
const MONTH_4 = 120 * 24 * 60 * 60 * 1000;

/**
 * Rating monitoring (ONGOING / SLOW / AT_RISK) dari aktivitas terakhir fase TA.
 * Rating adalah indikator terpisah dan tidak pernah mengubah status TA (K15);
 * job ini tidak menulis FAILED/CANCELLED.
 */
function decideRating(thesis) {
  const now = new Date();
  const created = new Date(thesis.createdAt);

  // Aligned with Monitoring Logic (calculateLastActivity in monitoring.service.js)
  // Collect activity dates from all sources: guidance, milestone, seminar, thesis
  const dates = [];

  // Source 1: Latest completed TA-phase guidance (approvedDate or completedAt)
  const latestGuidance = thesis.thesisGuidances?.[0];
  if (latestGuidance) {
    const d = latestGuidance.approvedDate || latestGuidance.completedAt;
    if (d) dates.push(new Date(d));
  }

  // Source 2: Latest completed TA-phase milestone (updatedAt or completedAt)
  const completedMilestones = (thesis.thesisMilestones || []).filter(m => m.status === "completed");
  if (completedMilestones.length > 0) {
    const latestMilestone = completedMilestones.sort((a, b) =>
      new Date(b.updatedAt || b.completedAt || 0).getTime() -
      new Date(a.updatedAt || a.completedAt || 0).getTime()
    )[0];
    const d = latestMilestone.updatedAt || latestMilestone.completedAt;
    if (d) dates.push(new Date(d));
  }

  // Source 3: Latest seminar (updatedAt)
  const latestSeminar = thesis.thesisSeminars?.[0];
  if (latestSeminar?.updatedAt) {
    dates.push(new Date(latestSeminar.updatedAt));
  }

  // Source 4: Fallback to thesis.updatedAt
  if (thesis.updatedAt) dates.push(new Date(thesis.updatedAt));

  // Pick the most recent valid date
  const validDates = dates.filter(d => !isNaN(d.getTime()));
  const lastActivity = validDates.length > 0
    ? new Date(Math.max(...validDates.map(d => d.getTime())))
    : created;

  const timeSinceLastChange = now - lastActivity;

  // AT_RISK: > 4 bulan (120 hari) no change
  if (timeSinceLastChange > MONTH_4) {
    return "AT_RISK";
  }

  // SLOW: > 2 bulan (60 hari) no change
  if (timeSinceLastChange > MONTH_2) {
    return "SLOW";
  }

  return "ONGOING";
}

/** Ratings the job manages. Any other stored value (FAILED/CANCELLED) is left as-is. */
const MANAGED_RATINGS = new Set(["ONGOING", "SLOW", "AT_RISK"]);

/**
 * Recompute the monitoring rating of running TA-phase theses.
 * - Only `status = research` (proposal is ignored; BSS stops the clock, K5; closed TA is final).
 * - Never changes `status`, never writes FAILED/CANCELLED, never cancels sessions.
 */
export async function updateAllThesisStatuses({ pageSize = 200, logger = console } = {}) {
  let page = 0;
  const updated = { ONGOING: 0, SLOW: 0, AT_RISK: 0 };

  for (; ;) {
    const theses = await prisma.thesis.findMany({
      where: { status: THESIS_STATUS.RESEARCH },
      skip: page * pageSize,
      take: pageSize,
      select: {
        id: true,
        rating: true,
        createdAt: true,
        updatedAt: true,
        thesisGuidances: {
          where: { status: 'completed', ...TA_PHASE },
          select: { completedAt: true, approvedDate: true },
          orderBy: { completedAt: 'desc' },
          take: 1
        },
        thesisMilestones: {
          where: TA_PHASE,
          select: { status: true, updatedAt: true, completedAt: true },
        },
        thesisSeminars: {
          orderBy: { updatedAt: 'desc' },
          take: 1,
          select: { updatedAt: true },
        },
      },
      orderBy: { id: "asc" },
    });

    if (theses.length === 0) break;

    await Promise.all(
      theses.map(async (t) => {
        if (!MANAGED_RATINGS.has(t.rating)) return;
        const targetRating = decideRating(t);
        if (targetRating === t.rating) return;
        await prisma.thesis.update({
          where: { id: t.id },
          data: { rating: targetRating },
        });
        updated[targetRating] += 1;
      })
    );

    page += 1;
  }

  logger.log(
    `[thesis-status] Updated: ONGOING=${updated.ONGOING}, SLOW=${updated.SLOW}, AT_RISK=${updated.AT_RISK}`
  );
  return updated;
}

/**
 * Get count of failed theses (status `failed`, K15)
 */
export async function getFailedThesesCount() {
  return await prisma.thesis.count({
    where: { status: THESIS_STATUS.FAILED }
  });
}

/**
 * Get list of failed theses (status `failed`, K15) with student info
 */
export async function getFailedTheses() {
  return await prisma.thesis.findMany({
    where: { status: THESIS_STATUS.FAILED },
    select: {
      id: true,
      title: true,
      rating: true,
      createdAt: true,
      student: {
        select: {
          user: {
            select: {
              id: true,
              fullName: true,
              identityNumber: true,
              email: true,
            }
          }
        }
      }
    },
    orderBy: { createdAt: 'asc' }
  });
}
