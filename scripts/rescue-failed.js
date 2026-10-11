import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function rescue() {
    console.log("🚀 Starting Rescue Operation for Incorrectly Failed Theses...");
    const now = new Date();

    // 2. Find theses that are 'Gagal' status and 'FAILED' rating but deadline is in the future
    const incorrectTheses = await prisma.thesis.findMany({
        where: {
            status: 'failed',
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

        // Reset status to research (K15; the rating job no longer fails theses)
        await prisma.thesis.update({
            where: { id: t.id },
            data: {
                status: 'research',
                statusChangedAt: new Date(),
                rating: 'ONGOING' // Reset to ongoing, the next cron will decide SLOW/AT_RISK
            }
        });

        console.log(`   ✅ Status reset to 'research' and rating to 'ONGOING'.`);
    }

    console.log("🏁 Rescue Operation Completed.");
}

rescue().catch(console.error).finally(() => prisma.$disconnect());
