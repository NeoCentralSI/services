/**
 * Integration test: Trigger FAILED status for a specific thesis
 *
 * This test directly manipulates the database to simulate a thesis
 * exceeding the 1-year deadline, then runs the cron job function
 * to verify the full FAILED flow works correctly.
 *
 * Usage:
 *   cd c:\Projects\Tugas Akhir\backend
 *   npx vitest run src/test/triggerFailedThesis.test.js
 *
 * IMPORTANT: This hits the REAL database. Make sure .env is configured correctly.
 */
import { describe, it, expect, afterAll } from "vitest";
import prisma from "../config/prisma.js";
import { updateAllThesisStatuses } from "../services/thesisStatus.service.js";

const THESIS_ID = "0a454898-508a-4c52-8bd7-51e24c600e5e";

describe("Trigger FAILED thesis flow", () => {
    let originalCreatedAt = null;
    let originalRating = null;
    let originalThesisStatusId = null;

    // Restore original data after test
    afterAll(async () => {
        if (originalCreatedAt !== null) {
            console.log("[cleanup] Restoring thesis to original state...");
            await prisma.thesis.update({
                where: { id: THESIS_ID },
                data: {
                    createdAt: originalCreatedAt,
                    rating: originalRating,
                    thesisStatusId: originalThesisStatusId,
                },
            });

            // Also restore any cancelled guidances back to their original state
            // (we can't perfectly restore these, but set them back to 'requested')
            await prisma.thesisGuidance.updateMany({
                where: {
                    thesisId: THESIS_ID,
                    status: "cancelled",
                },
                data: {
                    status: "requested",
                },
            });

            console.log("[cleanup] Thesis restored successfully.");
        }
        await prisma.$disconnect();
    });

    it("should mark thesis as FAILED and perform cleanup when createdAt > 1 year ago", async () => {
        // 1. Fetch the current thesis state
        const thesis = await prisma.thesis.findUnique({
            where: { id: THESIS_ID },
            include: {
                thesisStatus: { select: { name: true } },
                student: {
                    select: {
                        user: { select: { id: true, fullName: true, identityNumber: true } },
                    },
                },
            },
        });

        expect(thesis).not.toBeNull();
        console.log(`[test] Found thesis: "${thesis.title}"`);
        console.log(`[test] Student: ${thesis.student?.user?.fullName} (${thesis.student?.user?.identityNumber})`);
        console.log(`[test] Current status: ${thesis.thesisStatus?.name}, rating: ${thesis.rating}`);
        console.log(`[test] Current createdAt: ${thesis.createdAt.toISOString()}`);

        // Save original values for cleanup
        originalCreatedAt = thesis.createdAt;
        originalRating = thesis.rating;
        originalThesisStatusId = thesis.thesisStatusId;

        // 2. Count pending guidances before
        const pendingGuidancesBefore = await prisma.thesisGuidance.count({
            where: {
                thesisId: THESIS_ID,
                status: { in: ["requested", "accepted"] },
            },
        });
        console.log(`[test] Pending guidances before: ${pendingGuidancesBefore}`);

        // 3. Set createdAt to > 1 year ago (e.g., 400 days ago)
        const moreThanOneYearAgo = new Date();
        moreThanOneYearAgo.setDate(moreThanOneYearAgo.getDate() - 400);

        await prisma.thesis.update({
            where: { id: THESIS_ID },
            data: {
                createdAt: moreThanOneYearAgo,
                // Reset rating to ONGOING so the cron can detect the transition
                rating: "ONGOING",
            },
        });
        console.log(`[test] Set createdAt to ${moreThanOneYearAgo.toISOString()} (400 days ago)`);

        // 4. Also reset thesisStatusId to a non-terminal status (Bimbingan)
        const bimbinganStatus = await prisma.thesisStatus.findFirst({
            where: { name: "Bimbingan" },
        });
        if (bimbinganStatus) {
            await prisma.thesis.update({
                where: { id: THESIS_ID },
                data: { thesisStatusId: bimbinganStatus.id },
            });
        }

        // 5. Run the cron job
        console.log("[test] Running updateAllThesisStatuses...");
        const summary = await updateAllThesisStatuses({ pageSize: 200, logger: console });
        console.log("[test] Cron result:", JSON.stringify(summary));

        // 6. Verify: thesis should now be FAILED
        const updatedThesis = await prisma.thesis.findUnique({
            where: { id: THESIS_ID },
            include: {
                thesisStatus: { select: { name: true } },
            },
        });

        expect(updatedThesis.rating).toBe("FAILED");
        expect(updatedThesis.thesisStatus?.name).toBe("Gagal");
        console.log(`[test] ✅ Thesis rating: ${updatedThesis.rating}`);
        console.log(`[test] ✅ Thesis status: ${updatedThesis.thesisStatus?.name}`);

        // 7. Verify: pending guidances should be cancelled
        const pendingGuidancesAfter = await prisma.thesisGuidance.count({
            where: {
                thesisId: THESIS_ID,
                status: { in: ["requested", "accepted"] },
            },
        });
        console.log(`[test] Pending guidances after: ${pendingGuidancesAfter}`);
        expect(pendingGuidancesAfter).toBe(0);

        // 8. Verify: student notification was created
        const studentUserId = thesis.student?.user?.id;
        if (studentUserId) {
            const notification = await prisma.notification.findFirst({
                where: {
                    userId: studentUserId,
                    title: { contains: "Tugas Akhir Gagal" },
                },
                orderBy: { createdAt: "desc" },
            });
            console.log(`[test] Student notification found: ${!!notification}`);
            if (notification) {
                console.log(`[test] ✅ Notification: "${notification.title}" - "${notification.message}"`);
            }
        }

        // 9. Summary should include at least 1 FAILED
        expect(summary.FAILED).toBeGreaterThanOrEqual(1);
        console.log(`[test] ✅ Summary FAILED count: ${summary.FAILED}`);
    }, 30000); // 30s timeout for DB operations
});
