import prisma from "../../config/prisma.js";

const requirementDocumentInclude = {
  requirement: {
    select: { id: true, academicYearId: true, name: true, description: true, displayOrder: true },
  },
  verifier: { select: { id: true, fullName: true } },
};

export async function findRequirementsByAcademicYear(academicYearId, client = prisma) {
  return client.thesisSeminarRequirement.findMany({
    where: { academicYearId },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
  });
}

export async function findRequirementForAcademicYear(requirementId, academicYearId, client = prisma) {
  return client.thesisSeminarRequirement.findFirst({ where: { id: requirementId, academicYearId } });
}

export async function findSeminarDocument(thesisSeminarId, requirementId, client = prisma) {
  return client.thesisSeminarRequirementDocument.findUnique({
    where: {
      thesisSeminarId_thesisSeminarRequirementId: {
        thesisSeminarId,
        thesisSeminarRequirementId: requirementId,
      },
    },
    include: requirementDocumentInclude,
  });
}

export async function findSeminarDocuments(thesisSeminarId, client = prisma) {
  return client.thesisSeminarRequirementDocument.findMany({
    where: { thesisSeminarId },
    include: requirementDocumentInclude,
    orderBy: [{ requirement: { displayOrder: "asc" } }, { submittedAt: "asc" }],
  });
}

export async function upsertSeminarDocument(thesisSeminarId, requirementId, data, client = prisma) {
  return client.thesisSeminarRequirementDocument.upsert({
    where: {
      thesisSeminarId_thesisSeminarRequirementId: {
        thesisSeminarId,
        thesisSeminarRequirementId: requirementId,
      },
    },
    create: { thesisSeminarId, thesisSeminarRequirementId: requirementId, ...data },
    update: data,
    include: requirementDocumentInclude,
  });
}

export async function verifyRequirementDocumentAtomic({
  academicYearId,
  thesisSeminarId,
  requirementId,
  status,
  notes,
  verifiedBy,
}) {
  return prisma.$transaction(async (tx) => {
    const seminar = await tx.thesisSeminar.findUnique({
      where: { id: thesisSeminarId },
      select: {
        id: true,
        status: true,
        thesis: {
          select: {
            student: { select: { user: { select: { id: true } } } },
          },
        },
      },
    });
    if (!seminar) return { kind: "seminar_not_found" };
    if (seminar.status !== "registered") {
      return { kind: "seminar_locked", seminarStatus: seminar.status };
    }

    const requirement = await findRequirementForAcademicYear(
      requirementId,
      academicYearId,
      tx
    );
    if (!requirement) return { kind: "requirement_not_found" };

    const existing = await findSeminarDocument(thesisSeminarId, requirementId, tx);
    if (!existing) return { kind: "document_not_found" };

    const verifiedAt = new Date();
    const document = await tx.thesisSeminarRequirementDocument.update({
      where: {
        thesisSeminarId_thesisSeminarRequirementId: {
          thesisSeminarId,
          thesisSeminarRequirementId: requirementId,
        },
      },
      data: { status, notes: notes || null, verifiedBy, verifiedAt },
      include: requirementDocumentInclude,
    });

    let seminarTransitioned = false;
    if (status === "approved") {
      const [requiredCount, approvedCount] = await Promise.all([
        tx.thesisSeminarRequirement.count({
          where: { academicYearId: academicYearId },
        }),
        tx.thesisSeminarRequirementDocument.count({
          where: {
            thesisSeminarId,
            status: "approved",
            requirement: { academicYearId: academicYearId },
          },
        }),
      ]);

      if (requiredCount > 0 && approvedCount === requiredCount) {
        const transition = await tx.thesisSeminar.updateMany({
          where: { id: thesisSeminarId, status: "registered" },
          data: { status: "verified", verifiedAt },
        });
        seminarTransitioned = transition.count === 1;
      }
    }

    return {
      kind: "ok",
      document,
      requirement,
      studentUserId: seminar.thesis.student.user.id,
      seminarTransitioned,
      newSeminarStatus: seminarTransitioned ? "verified" : seminar.status,
    };
  }, { isolationLevel: "Serializable" });
}
