import prisma from "../../config/prisma.js";

const getTwoMonthsAgo = () => {
    const d = new Date();
    d.setMonth(d.getMonth() - 2);
    return d;
};

export const getInternshipMonitoringStats = async (academicYearId) => {
    const twoMonthsAgo = getTwoMonthsAgo();

    const where = {
        ...(academicYearId && academicYearId !== 'all' ? {
            proposal: {
                academicYearId: academicYearId
            }
        } : {})
    };

    // 1. Basic Counts
    const stats = await prisma.internship.groupBy({
        by: ['status'],
        where: where,
        _count: {
            id: true
        }
    });

    const statusCounts = stats.reduce((acc, item) => {
        acc[item.status] = item._count.id;
        return acc;
    }, {});

    // 2. Waiting Verification (Any document needs verification)
    // In this system, 'SUBMITTED' means it's waiting for Sekdep/Admin to approve.
    const waitingVerificationCount = await prisma.internship.count({
        where: {
            ...where,
            OR: [
                { companyReceiptStatus: 'SUBMITTED' },
                { logbookDocumentStatus: 'SUBMITTED' },
                { completionCertificateStatus: 'SUBMITTED' },
                { reportFinalStatus: 'SUBMITTED' }
            ]
        }
    });

    // 3. Overdue (> 2 months since actualEndDate)
    const overdueCount = await prisma.internship.count({
        where: {
            ...where,
            status: { not: 'COMPLETED' },
            actualEndDate: {
                lt: twoMonthsAgo
            }
        }
    });

    // 4. Status Distribution for Chart
    const allStatuses = ['PENDING', 'ONGOING', 'COMPLETED', 'FAILED'];
    const distribution = allStatuses.map(s => ({
        name: s,
        value: statusCounts[s] || 0
    }));

    return {
        summary: {
            totalOngoing: statusCounts['ONGOING'] || 0,
            waitingVerification: waitingVerificationCount,
            overdue: overdueCount,
            completed: statusCounts['COMPLETED'] || 0
        },
        distribution
    };
};

export const getDetailedMonitoringList = async (academicYearId) => {
    const today = new Date();
    const twoMonthsAgo = getTwoMonthsAgo();

    const where = {
        status: { not: 'COMPLETED' },
        actualEndDate: { not: null },
        ...(academicYearId && academicYearId !== 'all' ? {
            proposal: {
                academicYearId: academicYearId
            }
        } : {})
    };

    const internships = await prisma.internship.findMany({
        where: where,
        include: {
            student: {
                include: {
                    user: true
                }
            },
            supervisor: {
                include: {
                    user: true
                }
            },
            seminars: {
                where: {
                    status: 'COMPLETED'
                },
                take: 1
            }
        },
        orderBy: {
            actualEndDate: 'asc'
        }
    });

    return internships.map(item => {
        const endDate = new Date(item.actualEndDate);
        const diffInMs = today - endDate;
        const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

        let deadlineStatus = 'Aman';
        if (diffInDays > 60) {
            deadlineStatus = 'Terlambat';
        } else if (diffInDays > 45) {
            deadlineStatus = 'Peringatan';
        }

        return {
            id: item.id,
            name: item.student.user.fullName,
            nim: item.student.identityNumber,
            supervisor: item.supervisor?.user.fullName || 'Belum Ditunjuk',
            endDate: item.actualEndDate,
            daysPast: diffInDays,
            status: deadlineStatus,
            progress: {
                field: item.fieldAssessmentStatus === 'COMPLETED',
                lecturer: item.lecturerAssessmentStatus === 'COMPLETED',
                seminar: item.seminars.length > 0,
                report: item.reportFinalStatus === 'APPROVED'
            }
        };
    });
};
