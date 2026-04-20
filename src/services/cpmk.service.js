import * as repository from "../repositories/cpmk.repository.js";
import { getActiveAcademicYearId } from "../helpers/academicYear.helper.js";
import prisma from "../config/prisma.js";

class NotFoundError extends Error {
    constructor(message) {
        super(message);
        this.name = "NotFoundError";
        this.statusCode = 404;
    }
}

class ValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = "ValidationError";
        this.statusCode = 400;
    }
}

class ConflictError extends Error {
    constructor(message) {
        super(message);
        this.name = "ConflictError";
        this.statusCode = 409;
    }
}

const toCpmkResponse = (item) => {
    const hasAssessmentDetails = Boolean(item.hasAssessmentDetails);
    return ({
    id: item.id,
    academicYearId: item.academicYearId,
    academicYear: item.academicYear
        ? {
            id: item.academicYear.id,
            semester: item.academicYear.semester,
            year: item.academicYear.year,
            isActive: item.academicYear.isActive,
        }
        : null,
    code: item.code,
    description: item.description,
    type: item.type,
    maxScore: null,
    hasCriteria:
        item.hasCriteria !== undefined
            ? item.hasCriteria
            : (item._count?.assessmentCriterias ?? 0) > 0,
    hasAssessmentDetails,
    canEditCode:
        item.canEditCode !== undefined
            ? item.canEditCode
            : !hasAssessmentDetails,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    });
};

const getCriteriaByCpmkIds = async (cpmkIds) => {
    if (cpmkIds.length === 0) return [];
    return await prisma.assessmentCriteria.findMany({
        where: { cpmkId: { in: cpmkIds } },
        select: { id: true, cpmkId: true },
    });
};

const getAssessmentDetailCriteriaIdSet = async (criteriaIds) => {
    if (criteriaIds.length === 0) return new Set();

    const [seminarDetails, defenceDetails] = await Promise.all([
        prisma.thesisSeminarExaminerAssessmentDetail.findMany({
            where: { assessmentCriteriaId: { in: criteriaIds } },
            select: { assessmentCriteriaId: true },
        }),
        prisma.thesisDefenceExaminerAssessmentDetail.findMany({
            where: { assessmentCriteriaId: { in: criteriaIds } },
            select: { assessmentCriteriaId: true },
        }),
    ]);

    return new Set(
        [...seminarDetails, ...defenceDetails].map((item) => item.assessmentCriteriaId)
    );
};

const buildCpmkAssessmentDetailMap = async (cpmkIds) => {
    const criteriaRows = await getCriteriaByCpmkIds(cpmkIds);
    const criteriaIds = criteriaRows.map((row) => row.id);
    const criteriaWithDetails = await getAssessmentDetailCriteriaIdSet(criteriaIds);

    const cpmkMap = new Map(cpmkIds.map((id) => [id, false]));
    for (const row of criteriaRows) {
        if (criteriaWithDetails.has(row.id)) {
            cpmkMap.set(row.cpmkId, true);
        }
    }

    return cpmkMap;
};

const hasCpmkAssessmentDetails = async (cpmkId) => {
    const criteriaRows = await getCriteriaByCpmkIds([cpmkId]);
    const criteriaIds = criteriaRows.map((row) => row.id);
    const criteriaWithDetails = await getAssessmentDetailCriteriaIdSet(criteriaIds);
    return criteriaRows.some((row) => criteriaWithDetails.has(row.id));
};

async function resolveAcademicYearId(inputAcademicYearId) {
    if (inputAcademicYearId) return inputAcademicYearId;
    return await getActiveAcademicYearId();
}

export const getAllCpmks = async ({ academicYearId } = {}) => {
    const resolvedAcademicYearId = await resolveAcademicYearId(academicYearId);
    if (!resolvedAcademicYearId) {
        return [];
    }

    const data = await repository.findAll({ academicYearId: resolvedAcademicYearId });
    const detailMap = await buildCpmkAssessmentDetailMap(data.map((item) => item.id));

    return data.map((item) =>
        toCpmkResponse({
            ...item,
            hasAssessmentDetails: detailMap.get(item.id) ?? false,
        })
    );
};

export const getCpmkById = async (id) => {
    const data = await repository.findById(id);
    if (!data) {
        throw new NotFoundError("Data CPMK tidak ditemukan");
    }
    const hasAssessmentDetails = await hasCpmkAssessmentDetails(data.id);
    return toCpmkResponse({
        ...data,
        hasAssessmentDetails,
    });
};

export const createCpmk = async (data) => {
    const resolvedAcademicYearId = await resolveAcademicYearId(data.academicYearId);
    if (!resolvedAcademicYearId) {
        throw new ValidationError("Tahun ajaran aktif tidak ditemukan. Silakan pilih tahun ajaran terlebih dahulu.");
    }

    // Check code uniqueness
    if (data.code) {
        const existing = await repository.findByCode(data.code, data.type, resolvedAcademicYearId);
        if (existing) {
            throw new ConflictError(`Kode CPMK "${data.code}" sudah digunakan pada tahun ajaran yang dipilih`);
        }
    }

    const created = await repository.create({
        academicYearId: resolvedAcademicYearId,
        code: data.code,
        description: data.description,
        type: data.type,
    });
    const withRelations = await repository.findById(created.id);
    return toCpmkResponse(withRelations);
};

export const updateCpmk = async (id, data) => {
    const existing = await repository.findById(id);
    if (!existing) {
        throw new NotFoundError("Data CPMK tidak ditemukan");
    }

    const targetAcademicYearId = await resolveAcademicYearId(data.academicYearId || existing.academicYearId);
    if (!targetAcademicYearId) {
        throw new ValidationError("Tahun ajaran aktif tidak ditemukan. Silakan pilih tahun ajaran terlebih dahulu.");
    }

    const hasAssessmentDetails = await hasCpmkAssessmentDetails(id);
    if (
        hasAssessmentDetails
        && data.code !== undefined
        && data.code !== existing.code
    ) {
        throw new ValidationError(
            "Kode CPMK tidak dapat diubah karena sudah memiliki detail penilaian turunan"
        );
    }

    const updateData = {};
    const nextCode = data.code ?? existing.code;
    const nextType = data.type ?? existing.type;

    if (
        nextCode !== existing.code
        || nextType !== existing.type
        || targetAcademicYearId !== existing.academicYearId
    ) {
        const duplicate = await repository.findByCode(nextCode, nextType, targetAcademicYearId, id);
        if (duplicate) {
            throw new ConflictError(`Kode CPMK "${nextCode}" sudah digunakan pada tahun ajaran yang dipilih`);
        }
    }

    if (data.code !== undefined) {
        updateData.code = data.code;
    }

    if (data.description !== undefined) updateData.description = data.description;
    if (data.type !== undefined) updateData.type = data.type;
    if (data.academicYearId !== undefined) updateData.academicYearId = targetAcademicYearId;

    if (Object.keys(updateData).length === 0) {
        return toCpmkResponse({
            ...existing,
            hasAssessmentDetails,
        });
    }

    const updated = await repository.update(id, updateData);
    const withRelations = await repository.findById(updated.id);
    return toCpmkResponse({
        ...withRelations,
        hasAssessmentDetails,
    });
};

export const deleteCpmk = async (id) => {
    const existing = await repository.findById(id);
    if (!existing) {
        throw new NotFoundError("Data CPMK tidak ditemukan");
    }

    const hasAssessmentDetails = await hasCpmkAssessmentDetails(id);
    if (hasAssessmentDetails) {
        throw new ValidationError(
            "Tidak dapat menghapus CPMK karena sudah memiliki detail penilaian turunan"
        );
    }

    return await prisma.$transaction(async (tx) => {
        const criteriaRows = await tx.assessmentCriteria.findMany({
            where: { cpmkId: id },
            select: { id: true },
        });

        const criteriaIds = criteriaRows.map((row) => row.id);

        if (criteriaIds.length > 0) {
            await tx.assessmentRubric.deleteMany({
                where: { assessmentCriteriaId: { in: criteriaIds } },
            });
            await tx.assessmentCriteria.deleteMany({
                where: { id: { in: criteriaIds } },
            });
        }

        return await tx.cpmk.delete({ where: { id } });
    });
};

export const getCpmkHierarchy = async ({
    academicYearId,
    appliesTo,
    role,
    type = "thesis",
} = {}) => {
    const resolvedAcademicYearId = await resolveAcademicYearId(academicYearId);
    if (!resolvedAcademicYearId) {
        return [];
    }

    if (!["seminar", "defence"].includes(appliesTo)) {
        throw new ValidationError("Parameter appliesTo harus bernilai 'seminar' atau 'defence'");
    }

    if (appliesTo === "defence" && !["examiner", "supervisor"].includes(role)) {
        throw new ValidationError("Role untuk defence harus 'examiner' atau 'supervisor'");
    }

    const cpmks = await repository.findCpmksWithCriteriaRubrics({
        academicYearId: resolvedAcademicYearId,
        appliesTo,
        role: appliesTo === "defence" ? role : null,
        type,
    });

    const allCriteria = cpmks.flatMap((item) => item.assessmentCriterias);
    const criteriaWithDetails = await getAssessmentDetailCriteriaIdSet(
        allCriteria.map((criteria) => criteria.id)
    );

    return cpmks.map((item) => {
        const assessmentCriterias = item.assessmentCriterias.map((criteria) => ({
            ...criteria,
            hasAssessmentDetails: criteriaWithDetails.has(criteria.id),
        }));

        return {
            ...toCpmkResponse({
                ...item,
                hasAssessmentDetails: assessmentCriterias.some((criteria) => criteria.hasAssessmentDetails),
            }),
            assessmentCriterias,
        };
    });
};

export const copyTemplateCpmk = async ({
    sourceAcademicYearId,
    targetAcademicYearId,
}) => {
    if (!sourceAcademicYearId || !targetAcademicYearId) {
        throw new ValidationError("sourceAcademicYearId dan targetAcademicYearId wajib diisi");
    }

    if (sourceAcademicYearId === targetAcademicYearId) {
        throw new ValidationError("Tahun ajaran sumber dan tujuan tidak boleh sama");
    }

    return await repository.copyTemplateAcrossAcademicYears({
        sourceAcademicYearId,
        targetAcademicYearId,
    });
};
