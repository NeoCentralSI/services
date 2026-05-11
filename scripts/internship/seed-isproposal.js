import pkg from '../src/generated/prisma/index.js';
const { PrismaClient } = pkg;
const prisma = new PrismaClient();

async function main() {
    console.log("Setting isProposal to false for all existing Thesis records...");
    const updateResult = await prisma.thesis.updateMany({
        data: {
            isProposal: false,
        },
    });
    console.log(`Updated ${updateResult.count} Thesis records.`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
