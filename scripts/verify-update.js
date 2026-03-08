import { PrismaClient } from "../src/generated/prisma/index.js";
const prisma = new PrismaClient();

async function main() {
    const samples = await prisma.thesis.findMany({
        where: { thesisGuidances: { some: {} } },
        include: {
            thesisGuidances: {
                orderBy: { requestedDate: 'asc' },
                take: 2
            }
        },
        take: 3
    });

    console.log(JSON.stringify(samples.map(th => ({
        title: th.title,
        guidances: th.thesisGuidances.map(g => ({
            summary: g.sessionSummary,
            action: g.actionItems
        }))
    })), null, 2));
}

main().finally(() => prisma.$disconnect());
