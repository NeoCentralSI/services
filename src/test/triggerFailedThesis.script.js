/**
 * Standalone script: Trigger FAILED status for a specific thesis
 *
 * This script directly manipulates the database to simulate a thesis
 * exceeding the 1-year deadline, then runs the cron job function.
 * The changes are PERMANENT (not restored).
 *
 * Usage:
 *   cd c:\Projects\Tugas Akhir\backend
 *   node src/test/triggerFailedThesis.script.js
 */
import prisma from "../config/prisma.js";
import { updateAllThesisStatuses } from "../services/thesisStatus.service.js";

const THESIS_ID = "0a454898-508a-4c52-8bd7-51e24c600e5e";

async function main() {
    console.log("=== TRIGGER FAILED THESIS SCRIPT ===\n");

    // 1. Fetch the current thesis state
    const thesis = await prisma.thesis.findUnique({
        where: { id: THESIS_ID },
        include: {
            thesisStatus: { select: { id: true, name: true } },
            student: {
                select: {
                    user: { select: { id: true, fullName: true, identityNumber: true } },
                },
            },
        },
    });

    if (!thesis) {
        console.error(`❌ Thesis with ID ${THESIS_ID} not found!`);
        process.exit(1);
    }

    console.log(`📄 Thesis: "${thesis.title}"`);
    console.log(`👤 Student: ${thesis.student?.user?.fullName} (${thesis.student?.user?.identityNumber})`);
    console.log(`📊 Current status: ${thesis.thesisStatus?.name}, rating: ${thesis.rating}`);
    console.log(`📅 Current createdAt: ${thesis.createdAt.toISOString()}`);
    console.log(`📅 Current thesisStatusId: ${thesis.thesisStatusId}`);

    // Check pending guidances before
    const pendingBefore = await prisma.thesisGuidance.count({
        where: { thesisId: THESIS_ID, status: { in: ["requested", "accepted"] } },
    });
    console.log(`📋 Pending guidances before: ${pendingBefore}`);

    // 2. Set createdAt to > 1 year ago (400 days)
    const moreThanOneYearAgo = new Date();
    moreThanOneYearAgo.setDate(moreThanOneYearAgo.getDate() - 400);

    // Reset to non-terminal state so cron can process it
    const bimbinganStatus = await prisma.thesisStatus.findFirst({
        where: { name: "Bimbingan" },
    });

    if (!bimbinganStatus) {
        console.error("❌ 'Bimbingan' status not found in DB!");
        process.exit(1);
    }

    await prisma.thesis.update({
        where: { id: THESIS_ID },
        data: {
            createdAt: moreThanOneYearAgo,
            rating: "ONGOING",
            thesisStatusId: bimbinganStatus.id,
        },
    });
    console.log(`\n🔧 Set createdAt to ${moreThanOneYearAgo.toISOString()} (400 days ago)`);
    console.log(`🔧 Reset rating to ONGOING, status to Bimbingan`);

    // 3. Run the cron job
    console.log("\n⏳ Running updateAllThesisStatuses...\n");
    const summary = await updateAllThesisStatuses({ pageSize: 200, logger: console });
    console.log(`\n📊 Cron result: ${JSON.stringify(summary)}`);

    // 4. Verify the result
    const updatedThesis = await prisma.thesis.findUnique({
        where: { id: THESIS_ID },
        include: { thesisStatus: { select: { name: true } } },
    });

    console.log("\n=== VERIFICATION ===");
    console.log(`Rating: ${updatedThesis.rating} ${updatedThesis.rating === "FAILED" ? "✅" : "❌"}`);
    console.log(`Status: ${updatedThesis.thesisStatus?.name} ${updatedThesis.thesisStatus?.name === "Gagal" ? "✅" : "❌"}`);

    // Check pending guidances after
    const pendingAfter = await prisma.thesisGuidance.count({
        where: { thesisId: THESIS_ID, status: { in: ["requested", "accepted"] } },
    });
    console.log(`Pending guidances: ${pendingAfter} ${pendingAfter === 0 ? "✅" : "❌"}`);

    // Check student notification
    const studentUserId = thesis.student?.user?.id;
    if (studentUserId) {
        const notif = await prisma.notification.findFirst({
            where: { userId: studentUserId, title: { contains: "Tugas Akhir Gagal" } },
            orderBy: { createdAt: "desc" },
        });
        console.log(`Student notification: ${notif ? "✅ Created" : "❌ Not found"}`);
        if (notif) console.log(`  → "${notif.title}" - "${notif.message}"`);
    }

    console.log("\n=== DONE (changes are PERMANENT) ===");
    await prisma.$disconnect();
}

main().catch((err) => {
    console.error("❌ Script failed:", err);
    prisma.$disconnect();
    process.exit(1);
});
