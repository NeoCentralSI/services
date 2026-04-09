import prisma from "../../config/prisma.js";

export const getOverviewCompanies = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const search = req.query.search || "";
        const status = req.query.status || "save"; // default only show saved companies

        const skip = (page - 1) * limit;

        const where = {
            companyName: {
                contains: search,
            },
        };

        if (status && status !== "ALL") {
            where.status = status;
        }

        const [companies, total] = await Promise.all([
            prisma.company.findMany({
                where,
                skip,
                take: limit,
                orderBy: {
                    companyName: "asc",
                },
                select: {
                    id: true,
                    companyName: true,
                    companyAddress: true,
                    status: true,
                    _count: {
                        select: {
                            internshipProposals: true,
                        },
                    },
                    internshipProposals: {
                        select: {
                            _count: {
                                select: {
                                    internships: {
                                        where: {
                                            status: {
                                                in: ["ONGOING", "COMPLETED"],
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            }),
            prisma.company.count({ where }),
        ]);

        const formattedCompanies = companies.map(company => {
            const internCount = company.internshipProposals.reduce(
                (sum, proposal) => sum + proposal._count.internships,
                0
            );

            return {
                id: company.id,
                companyName: company.companyName,
                companyAddress: company.companyAddress,
                status: company.status,
                proposalCount: company._count.internshipProposals,
                internCount,
            };
        });

        // Sort by internCount desc
        formattedCompanies.sort((a, b) => b.internCount - a.internCount);

        res.json({
            success: true,
            data: formattedCompanies,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error("Error in getOverviewCompanies:", error);
        res.status(500).json({ success: false, message: "Gagal memuat daftar perusahaan" });
    }
};

export const getOverviewReports = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const search = req.query.search || "";
        const yearId = req.query.yearId || "";
        const companyId = req.query.companyId || "";

        const skip = (page - 1) * limit;

        const where = {
            status: "COMPLETED",
            reportTitle: {
                not: null,
            },
        };

        if (search) {
            where.OR = [
                {
                    reportTitle: {
                        contains: search,
                    },
                },
                {
                    student: {
                        user: {
                            fullName: {
                                contains: search,
                            },
                        },
                    },
                },
                {
                    proposal: {
                        targetCompany: {
                            companyName: {
                                contains: search,
                            },
                        },
                    },
                },
            ];
        }

        if (yearId && yearId !== "ALL") {
            where.proposal = {
                ...where.proposal,
                academicYearId: yearId,
            };
        }

        if (companyId && companyId !== "ALL") {
            where.proposal = {
                ...where.proposal,
                targetCompanyId: companyId,
            };
        }

        const [reports, total] = await Promise.all([
            prisma.internship.findMany({
                where,
                skip,
                take: limit,
                orderBy: {
                    reportUploadedAt: "desc",
                },
                select: {
                    id: true,
                    reportTitle: true,
                    reportUploadedAt: true,
                    student: {
                        select: {
                            user: {
                                select: {
                                    fullName: true,
                                    identityNumber: true,
                                },
                            },
                        },
                    },
                    proposal: {
                        select: {
                            academicYear: {
                                select: {
                                    year: true,
                                    semester: true,
                                },
                            },
                            targetCompany: {
                                select: {
                                    id: true,
                                    companyName: true,
                                },
                            },
                        },
                    },
                    supervisor: {
                        select: {
                            user: {
                                select: {
                                    fullName: true,
                                },
                            },
                        },
                    },
                },
            }),
            prisma.internship.count({ where }),
        ]);

        const formattedReports = reports.map(report => ({
            id: report.id,
            reportTitle: report.reportTitle,
            studentName: report.student?.user?.fullName,
            nim: report.student?.user?.identityNumber,
            companyName: report.proposal?.targetCompany?.companyName,
            academicYear: report.proposal?.academicYear ? `${report.proposal.academicYear.year} - ${report.proposal.academicYear.semester === 'ganjil' ? 'Ganjil' : 'Genap'}` : null,
            supervisorName: report.supervisor?.user?.fullName,
            uploadedAt: report.reportUploadedAt,
        }));

        res.json({
            success: true,
            data: formattedReports,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error("Error in getOverviewReports:", error);
        res.status(500).json({ success: false, message: "Gagal memuat arsip laporan akhir" });
    }
};

export const getOverviewStats = async (req, res) => {
    try {
        const [
            totalCompanies,
            totalInterns,
            totalReports,
        ] = await Promise.all([
            // Total Active Companies
            prisma.company.count({
                where: { status: "save" },
            }),
            // Total Completed Interns
            prisma.internship.count({
                where: { status: "COMPLETED" },
            }),
            // Total Submitted Reports
            prisma.internship.count({
                where: {
                    status: "COMPLETED",
                    reportTitle: { not: null },
                },
            }),
        ]);

        res.json({
            success: true,
            data: {
                totalCompanies,
                totalInterns,
                totalReports,
            },
        });
    } catch (error) {
        console.error("Error in getOverviewStats:", error);
        res.status(500).json({ success: false, message: "Gagal memuat statistik overview" });
    }
};
