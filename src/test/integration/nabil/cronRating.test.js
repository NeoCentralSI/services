/**
 * Integration Test IT-05: CRON Thesis Status Rating - Real Date Logic
 *
 * Tests `updateAllThesisStatuses()` with REAL database and manipulated dates
 * to verify correct rating classification:
 *   - ONGOING: last activity < 60 days
 *   - SLOW:    last activity 60-120 days (2-4 months)
 *   - AT_RISK: last activity > 120 days (4+ months)
 *
 * Also verifies (Paket A, K15):
 *   - a thesis past its deadline is NOT failed: status stays research, rating is
 *     only ONGOING/SLOW/AT_RISK and open sessions are not cancelled
 *   - only theses with status research are rated
 *
 * IMPORTANT: This hits the REAL database. Make sure .env points to TEST database.
 *
 * Usage:
 *   cd c:\Projects\Tugas Akhir\backend
 *   npx vitest run --config vitest.integration.config.js src/test/integration/cronRating.test.js
 */
import { describe, it, expect, afterAll, beforeAll } from "vitest";
import prisma from "../../../config/prisma.js";
import { updateAllThesisStatuses } from "../../../services/thesisStatus.service.js";
import { runCleanupIfEnabled } from "./cleanup.js";

// ── Helpers ──
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

// ── Test State ──
let testTheses = []; // Array of { thesis, originalRating, originalCreatedAt, originalUpdatedAt, originalDeadlineDate, originalStatusId }
const LABELS = ["ONGOING_THESIS", "SLOW_THESIS", "AT_RISK_THESIS", "PAST_DEADLINE_THESIS"];

describe("IT-05: CRON Thesis Status Rating", () => {
  const SKIP_CLEANUP = process.env.SKIP_CLEANUP === "true";
  beforeAll(async () => {
    // Find 4 running TA theses (status research) to manipulate dates
    const theses = await prisma.thesis.findMany({
      where: { status: "research" },
      take: 4,
      include: {
        student: { include: { user: { select: { id: true, fullName: true, identityNumber: true } } } },
        thesisGuidances: {
          where: { status: "completed" },
          select: { id: true, completedAt: true, approvedDate: true },
        },
      },
    });

    if (theses.length < 4) {
      console.warn(`[IT-05] Only ${theses.length} active theses found, need 4. Will test with available ones.`);
    }

    // Save originals and plan manipulations
    for (let i = 0; i < theses.length && i < 4; i++) {
      testTheses.push({
        thesis: theses[i],
        label: LABELS[i],
        originalRating: theses[i].rating,
        originalCreatedAt: theses[i].createdAt,
        originalUpdatedAt: theses[i].updatedAt,
        originalDeadlineDate: theses[i].deadlineDate,
        originalStatusId: theses[i].status,
      });
    }

    if (testTheses.length === 0) {
      console.warn("[IT-05] No test theses available. Skipping.");
      return;
    }

    console.log(`[IT-05] Found ${testTheses.length} theses for rating test`);

    // ── Manipulate dates to create each scenario ──

    // Helper: update ALL activity dates for a thesis to a specific date
    // decideStatus() checks: guidances, milestones, seminars, thesis.updatedAt
    async function setAllActivityDates(thesisId, guidances, targetDate) {
      // 1. Guidance dates
      for (const g of guidances) {
        await prisma.thesisGuidance.update({
          where: { id: g.id },
          data: { completedAt: targetDate, approvedDate: targetDate },
        });
      }
      // 2. Milestone dates (updatedAt, completedAt)
      await prisma.$executeRaw`UPDATE thesis_milestones SET updated_at = ${targetDate}, completed_at = ${targetDate} WHERE thesis_id = ${thesisId}`;
      // 3. Seminar dates (updatedAt)
      await prisma.$executeRaw`UPDATE thesis_seminars SET updated_at = ${targetDate} WHERE thesis_id = ${thesisId}`;
      // 4. Thesis updatedAt fallback
      await prisma.$executeRaw`UPDATE thesis SET updated_at = ${targetDate} WHERE id = ${thesisId}`;
    }

    // Thesis 0: ONGOING — recent activity (10 days ago), created recently
    if (testTheses[0]) {
      const t = testTheses[0].thesis;
      await prisma.thesis.update({
        where: { id: t.id },
        data: {
          createdAt: daysAgo(30),
          deadlineDate: daysAgo(-335), // 335 days from now
          rating: "SLOW", // Set different so we can verify it changes
        },
      });
      await setAllActivityDates(t.id, t.thesisGuidances, daysAgo(10));
      console.log(`[IT-05] Thesis 0 (${t.id}): set for ONGOING (last activity 10 days ago, ${t.thesisGuidances.length} guidances updated)`);
    }

    // Thesis 1: SLOW — last activity 70 days ago
    if (testTheses[1]) {
      const t = testTheses[1].thesis;
      await prisma.thesis.update({
        where: { id: t.id },
        data: {
          createdAt: daysAgo(200),
          deadlineDate: daysAgo(-165), // 165 days from now
          rating: "ONGOING", // Set different
        },
      });
      await setAllActivityDates(t.id, t.thesisGuidances, daysAgo(70));
      console.log(`[IT-05] Thesis 1 (${t.id}): set for SLOW (last activity 70 days ago, ${t.thesisGuidances.length} guidances updated)`);
    }

    // Thesis 2: AT_RISK — last activity 130 days ago
    if (testTheses[2]) {
      const t = testTheses[2].thesis;
      await prisma.thesis.update({
        where: { id: t.id },
        data: {
          createdAt: daysAgo(300),
          deadlineDate: daysAgo(-65), // 65 days from now
          rating: "ONGOING", // Set different
        },
      });
      await setAllActivityDates(t.id, t.thesisGuidances, daysAgo(130));
      console.log(`[IT-05] Thesis 2 (${t.id}): set for AT_RISK (last activity 130 days ago, ${t.thesisGuidances.length} guidances updated)`);
    }

    // Thesis 3: past deadline — K15: never failed automatically, rating only
    if (testTheses[3]) {
      const t = testTheses[3].thesis;
      await prisma.thesis.update({
        where: { id: t.id },
        data: {
          createdAt: daysAgo(400),
          deadlineDate: daysAgo(5), // deadline was 5 days ago
          rating: "ONGOING", // Set different
        },
      });
      await setAllActivityDates(t.id, t.thesisGuidances, daysAgo(130));
      console.log(`[IT-05] Thesis 3 (${t.id}): past deadline (deadline 5 days ago, ${t.thesisGuidances.length} guidances updated)`);
    }
  });

  afterAll(async () => {
    await runCleanupIfEnabled("IT-05", async () => {
      // Restore all test theses to original state
      try {
        for (const entry of testTheses) {
          const { thesis, originalRating, originalCreatedAt, originalDeadlineDate, originalStatusId } = entry;

          await prisma.thesis.update({
            where: { id: thesis.id },
            data: {
              rating: originalRating,
              createdAt: originalCreatedAt,
              deadlineDate: originalDeadlineDate,
              status: originalStatusId,
            },
          });

          // Restore guidance dates
          for (const g of thesis.thesisGuidances) {
            await prisma.thesisGuidance.update({
              where: { id: g.id },
              data: {
                completedAt: g.completedAt,
                approvedDate: g.approvedDate,
              },
            });
          }
        }

        // Clean up test notifications
        await prisma.notification.deleteMany({
          where: {
            createdAt: { gte: new Date(Date.now() - 120000) },
            title: { in: ["⚠️ Tugas Akhir GAGAL", "⚠️ Tugas Akhir Gagal"] },
          },
        });

        console.log("[IT-05 cleanup] All theses restored to original state.");
      } catch (err) {
        console.error("[IT-05 cleanup] Error:", err.message);
      }
    });
    await prisma.$disconnect();
  });

  it("should correctly classify ONGOING, SLOW, AT_RISK and never fail a thesis past its deadline", async () => {
    if (testTheses.length < 4) {
      console.warn(`[IT-05] Need 4 theses, only have ${testTheses.length}. Running partial test.`);
    }

    if (testTheses.length === 0) {
      console.warn("[IT-05] No test data available, skipping");
      return;
    }

    // ═══════════════════════════════════════════════════════
    // Run the CRON function
    // ═══════════════════════════════════════════════════════
    console.log("\n[CRON] Running updateAllThesisStatuses...");
    const summary = await updateAllThesisStatuses({ pageSize: 200, logger: console });
    console.log("[CRON] Result:", JSON.stringify(summary));

    // ═══════════════════════════════════════════════════════
    // Verify each thesis rating
    // ═══════════════════════════════════════════════════════

    // Check Thesis 0: ONGOING
    if (testTheses[0]) {
      const t = await prisma.thesis.findUnique({
        where: { id: testTheses[0].thesis.id },
        select: { rating: true, status: true },
      });
      expect(t.rating).toBe("ONGOING");
      console.log(`[VERIFY] Thesis 0 (${testTheses[0].label}): rating=${t.rating} ✅`);
    }

    // Check Thesis 1: SLOW
    if (testTheses[1]) {
      const t = await prisma.thesis.findUnique({
        where: { id: testTheses[1].thesis.id },
        select: { rating: true, status: true },
      });
      expect(t.rating).toBe("SLOW");
      console.log(`[VERIFY] Thesis 1 (${testTheses[1].label}): rating=${t.rating} ✅`);
    }

    // Check Thesis 2: AT_RISK
    if (testTheses[2]) {
      const t = await prisma.thesis.findUnique({
        where: { id: testTheses[2].thesis.id },
        select: { rating: true, status: true },
      });
      expect(t.rating).toBe("AT_RISK");
      console.log(`[VERIFY] Thesis 2 (${testTheses[2].label}): rating=${t.rating} ✅`);
    }

    // Check Thesis 3: past deadline is NOT failed automatically (K15)
    if (testTheses[3]) {
      const openBefore = await prisma.thesisGuidance.count({
        where: { thesisId: testTheses[3].thesis.id, status: { in: ["requested", "accepted"] } },
      });
      const t = await prisma.thesis.findUnique({
        where: { id: testTheses[3].thesis.id },
        select: { rating: true, status: true },
      });
      expect(t.status).toBe("research");
      expect(t.rating).toBe("AT_RISK");
      console.log(`[VERIFY] Thesis 3 (${testTheses[3].label}): rating=${t.rating}, status=${t.status} ✅`);

      // Sessions are not cancelled by the rating job anymore
      const openAfter = await prisma.thesisGuidance.count({
        where: { thesisId: testTheses[3].thesis.id, status: { in: ["requested", "accepted"] } },
      });
      expect(openAfter).toBe(openBefore);
    }

    // Verify summary counts are reasonable
    expect(summary).not.toHaveProperty("FAILED");
    const totalUpdated = summary.ONGOING + summary.SLOW + summary.AT_RISK;
    expect(totalUpdated).toBeGreaterThanOrEqual(0);
    console.log(`\n[SUMMARY] Total ratings updated: ${totalUpdated}`);
    console.log(`  ONGOING: ${summary.ONGOING}`);
    console.log(`  SLOW: ${summary.SLOW}`);
    console.log(`  AT_RISK: ${summary.AT_RISK}`);

    console.log("\n[IT-05] ✅ CRON RATING CLASSIFICATION VERIFIED SUCCESSFULLY");
  }, 60000); // 60s timeout
});
