import generated from '../src/generated/prisma/index.js';
const { PrismaClient } = generated;
const prisma = new PrismaClient();

async function main() {
    const roles = await prisma.userRole.findMany({
        include: {
            userHasRoles: {
                include: {
                    user: {
                        select: {
                            fullName: true,
                            identityNumber: true
                        }
                    }
                }
            }
        }
    });

    console.log('--- User Roles and Assigned Users ---');
    roles.forEach(role => {
        console.log(`\nRole: ${role.name} (${role.id})`);
        role.userHasRoles.forEach(ur => {
            console.log(`  - ${ur.user.fullName} (NIP: ${ur.user.identityNumber})`);
        });
    });
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
