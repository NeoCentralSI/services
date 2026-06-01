import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const academicYearId = 'some-academic-year-id';
    
    const count = await prisma.thesisSeminarExaminerAssessmentDetail.count({
        where: {
            criteria: {
                thesisCpmk: {
                    academicYearId: academicYearId
                }
            }
        }
    });
    console.log(count);
}
main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
