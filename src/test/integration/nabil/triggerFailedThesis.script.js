/**
 * Standalone script: check that a thesis past its deadline is NOT failed automatically
 * (Paket A, K15: the rating job never changes `status`, never writes FAILED and never
 * cancels sessions).
 *
 * This script directly manipulates the database to simulate a thesis
 * exceeding the 1-year deadline, then runs the cron job function.
 * The changes are PERMANENT (not restored).
 *
 * Usage:
 *   node src/test/integration/nabil/triggerFailedThesis.script.js
 */
import prisma from "../../../config/prisma.js";
import { updateAllThesisStatuses } from "../../../services/thesisStatus.service.js";

const THESIS_ID = "0a454898-508a-4c52-8bd7-51e24c600e5e";

async function main() {
    console.log("=== DEADLINE CHECK SCRIPT ===\n");

    // 1. Fetch the current thesis state
    const thesis = await prisma.thesis.findUnique({ where: { id: THESIS_ID } });

    if (!thesis) {
        console.error(`❌ Thesis with ID ${THESIS_ID} not found!`);
        process.exit(1);
    }

    console.log(`📄 Thesis: "${thesis.title}"`);
    console.log(`📊 Current status: ${thesis.status}, rating: ${thesis.rating}`);
    console.log(`📅 Current createdAt: ${thesis.createdAt.toISOString()}`);

    // Check open sessions before
    const openBefore = await prisma.thesisGuidance.count({
        where: { thesisId: THESIS_ID, status: { in: ["requested", "accepted"] } },
    });
    console.log(`📋 Open guidances before: ${openBefore}`);

    // 2. Set createdAt to > 1 year ago (400 days); the job only reads status research
    const moreThanOneYearAgo = new Date();
    moreThanOneYearAgo.setDate(moreThanOneYearAgo.getDate() - 400);

    await prisma.thesis.update({
        where: { id: THESIS_ID },
        data: {
            createdAt: moreThanOneYearAgo,
            rating: "ONGOING",
            status: "research",
        },
    });
    console.log(`\n🔧 Set createdAt to ${moreThanOneYearAgo.toISOString()} (400 days ago)`);
    console.log(`🔧 Reset rating to ONGOING, status to research`);

    // 3. Run the cron job
    console.log("\n⏳ Running updateAllThesisStatuses...\n");
    const summary = await updateAllThesisStatuses({ pageSize: 200, logger: console });
    console.log(`\n📊 Cron result: ${JSON.stringify(summary)}`);

    // 4. Verify the result
    const updatedThesis = await prisma.thesis.findUnique({ where: { id: THESIS_ID } });

    console.log("\n=== VERIFICATION ===");
    console.log(`Rating: ${updatedThesis.rating} ${updatedThesis.rating !== "FAILED" ? "✅" : "❌"}`);
    console.log(`Status: ${updatedThesis.status} ${updatedThesis.status === "research" ? "✅" : "❌"}`);

    const openAfter = await prisma.thesisGuidance.count({
        where: { thesisId: THESIS_ID, status: { in: ["requested", "accepted"] } },
    });
    console.log(`Open guidances: ${openAfter} ${openAfter === openBefore ? "✅" : "❌"}`);

    console.log("\n=== DONE (changes are PERMANENT) ===");
    await prisma.$disconnect();
}

main().catch((err) => {
    console.error("❌ Script failed:", err);
    prisma.$disconnect();
    process.exit(1);
});
