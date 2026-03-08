import generated from '../src/generated/prisma/index.js';
const { PrismaClient } = generated;
const prisma = new PrismaClient();

async function main() {
    const kadep = await prisma.userHasRole.findFirst({
        where: {
            role: {
                name: {
                    contains: 'Ketua Departemen'
                }
            }
        },
        include: {
            user: true,
            role: true
        }
    });

    if (kadep) {
        console.log('KADEP_FOUND');
        console.log(`Name: ${kadep.user.fullName}`);
        console.log(`NIP: ${kadep.user.identityNumber}`);
        console.log(`Role: ${kadep.role.name}`);
    } else {
        console.log('KADEP_NOT_FOUND');
    }
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
