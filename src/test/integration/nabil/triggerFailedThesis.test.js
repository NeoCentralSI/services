/**
 * Integration test: a thesis past its deadline is NOT failed automatically (Paket A, K15)
 *
 * This test directly manipulates the database to simulate a running TA
 * (status `research`) exceeding the 1-year deadline, then runs the cron
 * job function. The rating job may only set ONGOING/SLOW/AT_RISK: it never
 * changes `status`, never writes FAILED and never cancels sessions.
 *
 * Usage:
 *   npx vitest run -c vitest.integration.config.js src/test/integration/nabil/triggerFailedThesis.test.js
 *
 * IMPORTANT: This hits the REAL database. Make sure .env is configured correctly.
 */
import { describe, it, expect, afterAll } from "vitest";
import prisma from "../../../config/prisma.js";
import { updateAllThesisStatuses } from "../../../services/thesisStatus.service.js";
import { runCleanupIfEnabled } from "./cleanup.js";

let THESIS_ID = null;

describe("Deadline does not fail a thesis automatically", () => {
    let originalCreatedAt = null;
    let originalRating = null;
    let originalStatus = null;
    let originalUpdatedAt = null;
    let originalDeadlineDate = null;

    // Restore original data after test
    afterAll(async () => {
        await runCleanupIfEnabled("triggerFailedThesis", async () => {
            if (THESIS_ID && originalCreatedAt !== null) {
                console.log("[cleanup] Restoring thesis to original state...");
                await prisma.thesis.update({
                    where: { id: THESIS_ID },
                    data: {
                        createdAt: originalCreatedAt,
                        rating: originalRating,
                        status: originalStatus,
                        deadlineDate: originalDeadlineDate,
                    },
                });
                // Restore updatedAt via raw query (Prisma auto-sets it)
                if (originalUpdatedAt) {
                    await prisma.$executeRaw`UPDATE thesis SET updated_at = ${originalUpdatedAt} WHERE id = ${THESIS_ID}`;
                }
                console.log("[cleanup] Thesis restored successfully.");
            }
        });
        await prisma.$disconnect();
    });

    it("keeps status research and open sessions when createdAt and deadline are long past", async () => {
        // 1. Find any running TA dynamically
        const thesis = await prisma.thesis.findFirst({
            where: { status: "research" },
            include: {
                student: {
                    select: {
                        user: { select: { id: true, fullName: true, identityNumber: true } },
                    },
                },
            },
        });

        if (!thesis) {
            console.warn("[test] No thesis with status research found. Skipping.");
            return;
        }
        THESIS_ID = thesis.id;
        console.log(`[test] Found thesis: "${thesis.title}" (status ${thesis.status}, rating ${thesis.rating})`);

        // Save original values for cleanup
        originalCreatedAt = thesis.createdAt;
        originalRating = thesis.rating;
        originalStatus = thesis.status;
        originalUpdatedAt = thesis.updatedAt;
        originalDeadlineDate = thesis.deadlineDate;

        // 2. Count open sessions before
        const openGuidancesBefore = await prisma.thesisGuidance.count({
            where: {
                thesisId: THESIS_ID,
                status: { in: ["requested", "accepted"] },
            },
        });

        // 3. Set createdAt to > 1 year ago and deadlineDate to past
        const moreThanOneYearAgo = new Date();
        moreThanOneYearAgo.setDate(moreThanOneYearAgo.getDate() - 400);
        const deadlineInPast = new Date();
        deadlineInPast.setDate(deadlineInPast.getDate() - 5);

        await prisma.thesis.update({
            where: { id: THESIS_ID },
            data: {
                createdAt: moreThanOneYearAgo,
                deadlineDate: deadlineInPast,
                rating: "ONGOING",
            },
        });
        // Prisma auto-sets updatedAt to now — reset it so it's not treated as recent activity
        await prisma.$executeRaw`UPDATE thesis SET updated_at = ${moreThanOneYearAgo} WHERE id = ${THESIS_ID}`;

        // 4. Run the cron job
        const summary = await updateAllThesisStatuses({ pageSize: 200, logger: console });
        console.log("[test] Cron result:", JSON.stringify(summary));

        // 5. Verify: status unchanged, rating never FAILED
        const updatedThesis = await prisma.thesis.findUnique({ where: { id: THESIS_ID } });
        expect(updatedThesis.status).toBe("research");
        expect(updatedThesis.rating).not.toBe("FAILED");
        expect(["ONGOING", "SLOW", "AT_RISK"]).toContain(updatedThesis.rating);

        // 6. Verify: open sessions were not cancelled
        const openGuidancesAfter = await prisma.thesisGuidance.count({
            where: {
                thesisId: THESIS_ID,
                status: { in: ["requested", "accepted"] },
            },
        });
        expect(openGuidancesAfter).toBe(openGuidancesBefore);

        // 7. The summary no longer has a FAILED bucket
        expect(summary).not.toHaveProperty("FAILED");
    }, 30000); // 30s timeout for DB operations
});
