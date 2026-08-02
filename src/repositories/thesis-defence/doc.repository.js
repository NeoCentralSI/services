import prisma from "../../config/prisma.js";

const requirementDocumentInclude = {
  requirement: {
    select: { id: true, academicYearId: true, name: true, description: true, displayOrder: true },
  },
  verifier: { select: { id: true, fullName: true } },
  defence: {
    select: {
      id: true,
      thesisId: true,
      thesis: {
        select: {
          id: true,
          studentId: true,
          student: {
            select: { id: true }
          },
          thesisSupervisors: {
            select: { lecturerId: true }
          }
        }
      },
      examiners: {
        select: { lecturerId: true, availabilityStatus: true }
      }
    }
  }
};

export async function findRequirementsByAcademicYear(academicYearId, client = prisma) {
  return client.thesisDefenceRequirement.findMany({
    where: { academicYearId },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
  });
}

export async function findRequirementForAcademicYear(requirementId, academicYearId, client = prisma) {
  return client.thesisDefenceRequirement.findFirst({ where: { id: requirementId, academicYearId } });
}

export async function findDefenceDocument(thesisDefenceId, requirementId, client = prisma) {
  return client.thesisDefenceRequirementDocument.findUnique({
    where: {
      thesisDefenceId_thesisDefenceRequirementId: {
        thesisDefenceId,
        thesisDefenceRequirementId: requirementId,
      },
    },
    include: requirementDocumentInclude,
  });
}

export async function findDefenceDocuments(thesisDefenceId, client = prisma) {
  return client.thesisDefenceRequirementDocument.findMany({
    where: { thesisDefenceId },
    include: requirementDocumentInclude,
    orderBy: [{ requirement: { displayOrder: "asc" } }, { submittedAt: "asc" }],
  });
}

export async function upsertDefenceDocument(thesisDefenceId, requirementId, data, client = prisma) {
  return client.thesisDefenceRequirementDocument.upsert({
    where: {
      thesisDefenceId_thesisDefenceRequirementId: {
        thesisDefenceId,
        thesisDefenceRequirementId: requirementId,
      },
    },
    create: { thesisDefenceId, thesisDefenceRequirementId: requirementId, ...data },
    update: data,
    include: requirementDocumentInclude,
  });
}

export async function verifyRequirementDocumentAtomic({
  academicYearId,
  thesisDefenceId,
  requirementId,
  status,
  notes,
  verifiedBy,
}) {
  return prisma.$transaction(async (tx) => {
    const defence = await tx.thesisDefence.findUnique({
      where: { id: thesisDefenceId },
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
    if (!defence) return { kind: "defence_not_found" };
    if (defence.status !== "registered") {
      return { kind: "defence_locked", defenceStatus: defence.status };
    }

    const requirement = await findRequirementForAcademicYear(
      requirementId,
      academicYearId,
      tx
    );
    if (!requirement) return { kind: "requirement_not_found" };

    const existing = await findDefenceDocument(thesisDefenceId, requirementId, tx);
    if (!existing) return { kind: "document_not_found" };

    const verifiedAt = new Date();
    const document = await tx.thesisDefenceRequirementDocument.update({
      where: {
        thesisDefenceId_thesisDefenceRequirementId: {
          thesisDefenceId,
          thesisDefenceRequirementId: requirementId,
        },
      },
      data: { status, notes: notes || null, verifiedBy, verifiedAt },
      include: requirementDocumentInclude,
    });

    let defenceTransitioned = false;
    if (status === "approved") {
      const [requiredCount, approvedCount] = await Promise.all([
        tx.thesisDefenceRequirement.count({
          where: { academicYearId: academicYearId },
        }),
        tx.thesisDefenceRequirementDocument.count({
          where: {
            thesisDefenceId,
            status: "approved",
            requirement: { academicYearId: academicYearId },
          },
        }),
      ]);

      if (requiredCount > 0 && approvedCount === requiredCount) {
        const transition = await tx.thesisDefence.updateMany({
          where: { id: thesisDefenceId, status: "registered" },
          data: { status: "verified", verifiedAt },
        });
        defenceTransitioned = transition.count === 1;
      }
    }

    return {
      kind: "ok",
      document,
      requirement,
      studentUserId: defence.thesis.student.user.id,
      defenceTransitioned,
      newDefenceStatus: defenceTransitioned ? "verified" : defence.status,
    };
  }, { isolationLevel: "Serializable" });
}
