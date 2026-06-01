import prisma from "../config/prisma.js";

export const findAll = async ({ academicYearId = null } = {}) => {
    const where = {};
    if (academicYearId) {
        where.academicYearId = academicYearId;
    }

    const cpmks = await prisma.thesisCpmk.findMany({
        where,
        include: {
            academicYear: {
                select: {
                    id: true,
                    semester: true,
                    year: true,
                    isActive: true,
                },
            },
            thesisSeminarAssessmentCriterias: {
                include: {
                    _count: {
                        select: { examinerAssessmentDetails: true }
                    }
                }
            },
            thesisDefenceExaminerAssessmentCriterias: {
                include: {
                    _count: {
                        select: { examinerAssessmentDetails: true }
                    }
                }
            },
            thesisDefenceSupervisorAssessmentCriterias: {
                include: {
                    _count: {
                        select: { supervisorAssessmentDetails: true }
                    }
                }
            }
        },
        orderBy: { code: "asc" },
    });

    return cpmks.map(cpmk => {
        const hasDetails = 
            cpmk.thesisSeminarAssessmentCriterias.some(c => c._count.examinerAssessmentDetails > 0) ||
            cpmk.thesisDefenceExaminerAssessmentCriterias.some(c => c._count.examinerAssessmentDetails > 0) ||
            cpmk.thesisDefenceSupervisorAssessmentCriterias.some(c => c._count.supervisorAssessmentDetails > 0);
        
        return {
            ...cpmk,
            hasAssessmentDetails: hasDetails,
            thesisSeminarAssessmentCriterias: undefined,
            thesisDefenceExaminerAssessmentCriterias: undefined,
            thesisDefenceSupervisorAssessmentCriterias: undefined,
        };
    });
};

export const findById = async (id) => {
    return await prisma.thesisCpmk.findUnique({
        where: { id },
        include: {
            academicYear: {
                select: {
                    id: true,
                    semester: true,
                    year: true,
                    isActive: true,
                },
            },
        },
    });
};

export const findByCode = async (code, academicYearId, excludeId = null) => {
    const where = {
        code,
        academicYearId,
    };
    if (excludeId) {
        where.id = { not: excludeId };
    }
    return await prisma.thesisCpmk.findFirst({ where });
};

export const create = async (data) => {
    return await prisma.thesisCpmk.create({ data });
};

export const update = async (id, data) => {
    return await prisma.thesisCpmk.update({
        where: { id },
        data,
    });
};

export const remove = async (id) => {
    return await prisma.$transaction(async (tx) => {
        // Find all criteria IDs to delete their rubrics
        const seminarCriterias = await tx.thesisSeminarAssessmentCriteria.findMany({ where: { thesisCpmkId: id }, select: { id: true } });
        const examinerCriterias = await tx.thesisDefenceExaminerAssessmentCriteria.findMany({ where: { thesisCpmkId: id }, select: { id: true } });
        const supervisorCriterias = await tx.thesisDefenceSupervisorAssessmentCriteria.findMany({ where: { thesisCpmkId: id }, select: { id: true } });

        const seminarIds = seminarCriterias.map(c => c.id);
        const examinerIds = examinerCriterias.map(c => c.id);
        const supervisorIds = supervisorCriterias.map(c => c.id);

        // Delete rubrics
        if (seminarIds.length > 0) {
            await tx.thesisSeminarAssessmentRubric.deleteMany({ where: { assessmentCriteriaId: { in: seminarIds } } });
            await tx.thesisSeminarAssessmentCriteria.deleteMany({ where: { thesisCpmkId: id } });
        }
        
        if (examinerIds.length > 0) {
            await tx.thesisDefenceExaminerAssessmentRubric.deleteMany({ where: { assessmentCriteriaId: { in: examinerIds } } });
            await tx.thesisDefenceExaminerAssessmentCriteria.deleteMany({ where: { thesisCpmkId: id } });
        }

        if (supervisorIds.length > 0) {
            await tx.thesisDefenceSupervisorAssessmentRubric.deleteMany({ where: { assessmentCriteriaId: { in: supervisorIds } } });
            await tx.thesisDefenceSupervisorAssessmentCriteria.deleteMany({ where: { thesisCpmkId: id } });
        }

        // Delete CPMK
        return await tx.thesisCpmk.delete({
            where: { id },
        });
    });
};

export const hasRelatedData = async (id) => {
    const seminarDetails = await prisma.thesisSeminarExaminerAssessmentDetail.count({
        where: { criteria: { thesisCpmkId: id } }
    });
    const defenceExaminerDetails = await prisma.thesisDefenceExaminerAssessmentDetail.count({
        where: { criteria: { thesisCpmkId: id } }
    });
    const defenceSupervisorDetails = await prisma.thesisDefenceSupervisorAssessmentDetail.count({
        where: { criteria: { thesisCpmkId: id } }
    });
    
    return seminarDetails > 0 || defenceExaminerDetails > 0 || defenceSupervisorDetails > 0;
};

export const copyTemplate = async (sourceAcademicYearId, targetAcademicYearId) => {
    return await prisma.$transaction(async (tx) => {
        const sourceCpmks = await tx.thesisCpmk.findMany({
            where: { academicYearId: sourceAcademicYearId },
            include: {
                thesisSeminarAssessmentCriterias: {
                    include: {
                        assessmentRubrics: { orderBy: { displayOrder: "asc" } },
                    },
                    orderBy: { displayOrder: "asc" },
                },
                thesisDefenceExaminerAssessmentCriterias: {
                    include: {
                        assessmentRubrics: { orderBy: { displayOrder: "asc" } },
                    },
                    orderBy: { displayOrder: "asc" },
                },
                thesisDefenceSupervisorAssessmentCriterias: {
                    include: {
                        assessmentRubrics: { orderBy: { displayOrder: "asc" } },
                    },
                    orderBy: { displayOrder: "asc" },
                },
            },
            orderBy: { code: "asc" },
        });

        const targetCount = await tx.thesisCpmk.count({
            where: { academicYearId: targetAcademicYearId },
        });

        if (targetCount > 0) {
            const err = new Error(
                "Tahun ajaran tujuan sudah memiliki data CPMK. Hapus data existing terlebih dahulu."
            );
            err.statusCode = 400;
            throw err;
        }

        const created = {
            cpmk: 0,
            seminarCriteria: 0,
            seminarRubrics: 0,
            defenceExaminerCriteria: 0,
            defenceExaminerRubrics: 0,
            defenceSupervisorCriteria: 0,
            defenceSupervisorRubrics: 0,
        };

        for (const sourceCpmk of sourceCpmks) {
            const newCpmk = await tx.thesisCpmk.create({
                data: {
                    academicYearId: targetAcademicYearId,
                    code: sourceCpmk.code,
                    description: sourceCpmk.description,
                },
            });
            created.cpmk += 1;

            // Copy Seminar Criteria
            for (const sourceCriteria of sourceCpmk.thesisSeminarAssessmentCriterias) {
                const newCriteria = await tx.thesisSeminarAssessmentCriteria.create({
                    data: {
                        thesisCpmkId: newCpmk.id,
                        name: sourceCriteria.name,
                        maxScore: sourceCriteria.maxScore,
                        displayOrder: sourceCriteria.displayOrder,
                    },
                });
                created.seminarCriteria += 1;

                if (sourceCriteria.assessmentRubrics.length > 0) {
                    await tx.thesisSeminarAssessmentRubric.createMany({
                        data: sourceCriteria.assessmentRubrics.map((rubric) => ({
                            assessmentCriteriaId: newCriteria.id,
                            minScore: rubric.minScore,
                            maxScore: rubric.maxScore,
                            description: rubric.description,
                            displayOrder: rubric.displayOrder,
                        })),
                    });
                    created.seminarRubrics += sourceCriteria.assessmentRubrics.length;
                }
            }

            // Copy Defence Examiner Criteria
            for (const sourceCriteria of sourceCpmk.thesisDefenceExaminerAssessmentCriterias) {
                const newCriteria = await tx.thesisDefenceExaminerAssessmentCriteria.create({
                    data: {
                        thesisCpmkId: newCpmk.id,
                        name: sourceCriteria.name,
                        maxScore: sourceCriteria.maxScore,
                        displayOrder: sourceCriteria.displayOrder,
                    },
                });
                created.defenceExaminerCriteria += 1;

                if (sourceCriteria.assessmentRubrics.length > 0) {
                    await tx.thesisDefenceExaminerAssessmentRubric.createMany({
                        data: sourceCriteria.assessmentRubrics.map((rubric) => ({
                            assessmentCriteriaId: newCriteria.id,
                            minScore: rubric.minScore,
                            maxScore: rubric.maxScore,
                            description: rubric.description,
                            displayOrder: rubric.displayOrder,
                        })),
                    });
                    created.defenceExaminerRubrics += sourceCriteria.assessmentRubrics.length;
                }
            }

            // Copy Defence Supervisor Criteria
            for (const sourceCriteria of sourceCpmk.thesisDefenceSupervisorAssessmentCriterias) {
                const newCriteria = await tx.thesisDefenceSupervisorAssessmentCriteria.create({
                    data: {
                        thesisCpmkId: newCpmk.id,
                        name: sourceCriteria.name,
                        maxScore: sourceCriteria.maxScore,
                        displayOrder: sourceCriteria.displayOrder,
                    },
                });
                created.defenceSupervisorCriteria += 1;

                if (sourceCriteria.assessmentRubrics.length > 0) {
                    await tx.thesisDefenceSupervisorAssessmentRubric.createMany({
                        data: sourceCriteria.assessmentRubrics.map((rubric) => ({
                            assessmentCriteriaId: newCriteria.id,
                            minScore: rubric.minScore,
                            maxScore: rubric.maxScore,
                            description: rubric.description,
                            displayOrder: rubric.displayOrder,
                        })),
                    });
                    created.defenceSupervisorRubrics += sourceCriteria.assessmentRubrics.length;
                }
            }
        }

        return created;
    });
};
