import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function rescue() {
    console.log("🚀 Starting Rescue Operation for Incorrectly Failed Theses...");
    const now = new Date();

    // 1. Get terminal status IDs and 'Bimbingan' status ID
    const statuses = await prisma.thesisStatus.findMany({
        where: { name: { in: ["Gagal", "Bimbingan"] } }
    });

    const gagalStatusId = statuses.find(s => s.name === "Gagal")?.id;
    const bimbinganStatusId = statuses.find(s => s.name === "Bimbingan")?.id;

    if (!gagalStatusId || !bimbinganStatusId) {
        console.error("❌ Required statuses not found in DB.");
        return;
    }

    // 2. Find theses that are 'Gagal' status and 'FAILED' rating but deadline is in the future
    const incorrectTheses = await prisma.thesis.findMany({
        where: {
            thesisStatusId: gagalStatusId,
            rating: 'FAILED',
            deadlineDate: {
                gt: now
            }
        },
        include: {
            student: { include: { user: true } }
        }
    });

    console.log(`🔍 Found ${incorrectTheses.length} potentially incorrect 'FAILED' theses.`);

    for (const t of incorrectTheses) {
        console.log(`🛠️ Rescuing ${t.student.user.fullName} (${t.student.user.identityNumber})`);
        console.log(`   - Current Deadline: ${t.deadlineDate}`);

        // Reset status to Bimbingan
        await prisma.thesis.update({
            where: { id: t.id },
            data: {
                thesisStatusId: bimbinganStatusId,
                rating: 'ONGOING' // Reset to ongoing, the next cron will decide SLOW/AT_RISK
            }
        });

        console.log(`   ✅ Status reset to 'Bimbingan' and rating to 'ONGOING'.`);
    }

    console.log("🏁 Rescue Operation Completed.");
}

rescue().catch(console.error).finally(() => prisma.$disconnect());
