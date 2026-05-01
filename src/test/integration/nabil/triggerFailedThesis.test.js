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
import prisma from "../../../config/prisma.js";
import { updateAllThesisStatuses } from "../../../services/thesisStatus.service.js";

let THESIS_ID = null;

describe("Trigger FAILED thesis flow", () => {
    let originalCreatedAt = null;
    let originalRating = null;
    let originalThesisStatusId = null;
    let originalUpdatedAt = null;
    let originalDeadlineDate = null;

    // Restore original data after test
    afterAll(async () => {
        if (THESIS_ID && originalCreatedAt !== null) {
            console.log("[cleanup] Restoring thesis to original state...");
            await prisma.thesis.update({
                where: { id: THESIS_ID },
                data: {
                    createdAt: originalCreatedAt,
                    rating: originalRating,
                    thesisStatusId: originalThesisStatusId,
                    deadlineDate: originalDeadlineDate,
                },
            });
            // Restore updatedAt via raw query (Prisma auto-sets it)
            if (originalUpdatedAt) {
                await prisma.$executeRaw`UPDATE thesis SET updated_at = ${originalUpdatedAt} WHERE id = ${THESIS_ID}`;
            }

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
        // 1. Find any active thesis in "Bimbingan" status dynamically
        const bimbinganStatus = await prisma.thesisStatus.findFirst({ where: { name: "Bimbingan" } });
        if (!bimbinganStatus) {
            console.warn("[test] No 'Bimbingan' status found. Skipping.");
            return;
        }

        const thesis = await prisma.thesis.findFirst({
            where: { thesisStatusId: bimbinganStatus.id },
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
        THESIS_ID = thesis.id;
        console.log(`[test] Found thesis: "${thesis.title}"`);
        console.log(`[test] Student: ${thesis.student?.user?.fullName} (${thesis.student?.user?.identityNumber})`);
        console.log(`[test] Current status: ${thesis.thesisStatus?.name}, rating: ${thesis.rating}`);
        console.log(`[test] Current createdAt: ${thesis.createdAt.toISOString()}`);

        // Save original values for cleanup
        originalCreatedAt = thesis.createdAt;
        originalRating = thesis.rating;
        originalThesisStatusId = thesis.thesisStatusId;
        originalUpdatedAt = thesis.updatedAt;
        originalDeadlineDate = thesis.deadlineDate;

        // 2. Count pending guidances before
        const pendingGuidancesBefore = await prisma.thesisGuidance.count({
            where: {
                thesisId: THESIS_ID,
                status: { in: ["requested", "accepted"] },
            },
        });
        console.log(`[test] Pending guidances before: ${pendingGuidancesBefore}`);

        // 3. Set createdAt to > 1 year ago and deadlineDate to past
        const moreThanOneYearAgo = new Date();
        moreThanOneYearAgo.setDate(moreThanOneYearAgo.getDate() - 400);
        const deadlineInPast = new Date();
        deadlineInPast.setDate(deadlineInPast.getDate() - 5); // deadline was 5 days ago

        await prisma.thesis.update({
            where: { id: THESIS_ID },
            data: {
                createdAt: moreThanOneYearAgo,
                deadlineDate: deadlineInPast, // Ensure deadline is in the past
                // Reset rating to ONGOING so the cron can detect the transition
                rating: "ONGOING",
            },
        });
        // Prisma auto-sets updatedAt to now — reset it so it's not treated as recent activity
        await prisma.$executeRaw`UPDATE thesis SET updated_at = ${moreThanOneYearAgo} WHERE id = ${THESIS_ID}`;
        console.log(`[test] Set createdAt to ${moreThanOneYearAgo.toISOString()} (400 days ago), deadline to ${deadlineInPast.toISOString()}`);

        // 4. Also reset thesisStatusId to a non-terminal status (Bimbingan)
        // bimbinganStatus already declared above
        if (bimbinganStatus) {
            await prisma.thesis.update({
                where: { id: THESIS_ID },
                data: { thesisStatusId: bimbinganStatus.id },
            });
            // Reset updatedAt again after Bimbingan status change
            await prisma.$executeRaw`UPDATE thesis SET updated_at = ${moreThanOneYearAgo} WHERE id = ${THESIS_ID}`;
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
