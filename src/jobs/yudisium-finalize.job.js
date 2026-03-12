import prisma from "../config/prisma.js";

/**
 * Auto-finalize yudisium events whose event date has passed.
 * Runs daily. When today > eventDate, transitions yudisium status to "finalized"
 * and all participants with status "approved" to "finalized".
 */
export async function finalizeCompletedYudisium() {
    try {
        const now = new Date();
        // Start of today in UTC
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        const yudisiums = await prisma.yudisium.findMany({
            where: {
                eventDate: { lt: today },
                status: { notIn: ["finalized", "draft"] },
            },
            select: { id: true, name: true, status: true, eventDate: true },
        });

        if (yudisiums.length === 0) return;

        for (const yudisium of yudisiums) {
            await prisma.$transaction(async (tx) => {
                await tx.yudisium.update({
                    where: { id: yudisium.id },
                    data: { status: "finalized" },
                });

                await tx.yudisiumParticipant.updateMany({
                    where: {
                        yudisiumId: yudisium.id,
                        status: "approved",
                    },
                    data: { status: "finalized" },
                });
            });

            console.log(`[Yudisium Finalize] ${yudisium.name} → finalized`);
        }
    } catch (error) {
        console.error("[Yudisium Finalize] Error:", error.message);
    }
}
