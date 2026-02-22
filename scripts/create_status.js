import generated from "../src/generated/prisma/index.js";
const { PrismaClient } = generated;

const prisma = new PrismaClient();

async function main() {
    console.log("Seeding ThesisStatus...");

    const statusName = "Diajukan";

    const existing = await prisma.thesisStatus.findFirst({
        where: { name: statusName }
    });

    if (existing) {
        console.log(`Status '${statusName}' already exists.`);
    } else {
        await prisma.thesisStatus.create({
            data: {
                name: statusName
            }
        });
        console.log(`Status '${statusName}' created.`);
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
