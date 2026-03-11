const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    try {
        const student = await prisma.student.findFirst({
            where: { user: { identityNumber: '2111523020' } },
            include: { user: true }
        });

        if (!student) {
            console.log('Student not found');
            return;
        }

        const t = await prisma.thesis.findFirst({
            where: { studentId: student.id },
            include: {
                thesisStatus: true,
                academicYear: true,
                thesisMilestones: { orderBy: { updatedAt: 'desc' }, take: 1 },
                thesisGuidances: { where: { status: 'completed' }, orderBy: { completedAt: 'desc' }, take: 1 }
            }
        });

        if (!t) {
            console.log('Thesis not found');
            return;
        }

        console.log(JSON.stringify({
            studentName: student.user.fullName,
            nim: student.user.identityNumber,
            thesisTitle: t.title,
            createdAt: t.createdAt,
            deadlineDate: t.deadlineDate,
            rating: t.rating,
            status: t.thesisStatus?.name,
            academicYear: t.academicYear?.name,
            lastMilestone: t.thesisMilestones?.[0]?.updatedAt,
            lastGuidance: t.thesisGuidances?.[0]?.completedAt || t.thesisGuidances?.[0]?.approvedDate
        }, null, 2));
    } catch (err) {
        console.error(err);
    }
}

check().finally(() => prisma.$disconnect());
