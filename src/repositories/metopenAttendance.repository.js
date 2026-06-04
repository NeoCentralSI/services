import prisma from "../config/prisma.js";

const IMPORT_SUMMARY_SELECT = {
  id: true,
  academicYearId: true,
  documentId: true,
  uploadedByUserId: true,
  classCode: true,
  courseName: true,
  semesterLabel: true,
  filterLabel: true,
  lecturerNames: true,
  thresholdPercent: true,
  totalRows: true,
  matchedRows: true,
  eligibleRows: true,
  ineligibleRows: true,
  autoZeroedCount: true,
  skippedFinalizedCount: true,
  uploadedAt: true,
  createdAt: true,
  updatedAt: true,
  document: { select: { id: true, fileName: true, filePath: true, fileSize: true, mimeType: true } },
  uploadedBy: { select: { id: true, fullName: true, identityNumber: true } },
  records: {
    where: { isEligible: false },
    take: 10,
    orderBy: [{ attendancePercentage: "asc" }, { studentName: "asc" }],
    select: {
      id: true,
      identityNumber: true,
      studentName: true,
      presentCount: true,
      totalMeetings: true,
      attendancePercentage: true,
      isEligible: true,
      studentId: true,
    },
  },
};

export function findLatestAttendanceImport(client = prisma) {
  return client.metopenAttendanceImport.findFirst({
    orderBy: { uploadedAt: "desc" },
    select: IMPORT_SUMMARY_SELECT,
  });
}

export function findAttendanceRecordForThesis(importId, thesisId, client = prisma) {
  return client.metopenAttendanceRecord.findFirst({
    where: {
      importId,
      student: {
        thesis: {
          some: { id: thesisId },
        },
      },
    },
    include: {
      import: {
        select: {
          id: true,
          classCode: true,
          courseName: true,
          semesterLabel: true,
          filterLabel: true,
          thresholdPercent: true,
          uploadedAt: true,
          document: { select: { id: true, fileName: true, filePath: true } },
        },
      },
      student: {
        select: {
          id: true,
          user: { select: { id: true, fullName: true, identityNumber: true } },
        },
      },
    },
  });
}

export function findStudentsByIdentityNumbers(identityNumbers, client = prisma) {
  return client.student.findMany({
    where: {
      user: {
        identityNumber: { in: identityNumbers },
      },
    },
    select: {
      id: true,
      user: { select: { id: true, fullName: true, identityNumber: true } },
    },
  });
}

export async function createAttendanceImportWithRecords({
  documentTypeName,
  documentData,
  importData,
  records,
}, client = prisma) {
  return client.$transaction(async (tx) => {
    let documentType = await tx.documentType.findFirst({
      where: { name: documentTypeName },
      select: { id: true },
    });

    if (!documentType) {
      documentType = await tx.documentType.create({
        data: { name: documentTypeName },
        select: { id: true },
      });
    }

    const document = await tx.document.create({
      data: {
        ...documentData,
        documentTypeId: documentType.id,
      },
      select: { id: true, fileName: true, filePath: true, fileSize: true, mimeType: true },
    });

    await tx.metopenAttendanceImport.create({
      data: {
        ...importData,
        documentId: document.id,
      },
    });

    if (records.length > 0) {
      await tx.metopenAttendanceRecord.createMany({
        data: records,
      });
    }

    const attendanceImport = await tx.metopenAttendanceImport.findUnique({
      where: { id: importData.id },
      select: IMPORT_SUMMARY_SELECT,
    });

    return { import: attendanceImport, document };
  });
}

export function updateAttendanceImportCounts(importId, data, client = prisma) {
  return client.metopenAttendanceImport.update({
    where: { id: importId },
    data,
    select: IMPORT_SUMMARY_SELECT,
  });
}

export function findIneligibleRecordsForImport(importId, client = prisma) {
  return client.metopenAttendanceRecord.findMany({
    where: {
      importId,
      isEligible: false,
      studentId: { not: null },
    },
    select: {
      id: true,
      studentId: true,
      identityNumber: true,
      studentName: true,
      attendancePercentage: true,
      presentCount: true,
      totalMeetings: true,
    },
  });
}

export function findScoreableThesesByStudentIds(studentIds, closedStatusNames, client = prisma) {
  if (!studentIds.length) return [];

  return client.thesis.findMany({
    where: {
      studentId: { in: studentIds },
      finalProposalVersionId: { not: null },
      student: { status: "active" },
      OR: [
        { thesisStatusId: null },
        { thesisStatus: { name: { notIn: closedStatusNames } } },
      ],
    },
    select: {
      id: true,
      studentId: true,
      title: true,
      researchMethodScores: {
        take: 1,
        select: {
          id: true,
          isFinalized: true,
          attendanceAutoZeroedAt: true,
        },
      },
    },
  });
}

export function autoZeroResearchMethodScore({
  thesisId,
  actorUserId,
  attendanceRecordId,
  reason,
  skipFinalized = false,
}, client = prisma) {
  return client.$transaction(async (tx) => {
    const existing = await tx.researchMethodScore.findUnique({
      where: { thesisId },
      select: {
        id: true,
        thesisId: true,
        isFinalized: true,
        attendanceAutoZeroedAt: true,
      },
    });

    if (existing?.isFinalized && !existing.attendanceAutoZeroedAt) {
      if (skipFinalized) {
        return { skipped: true, scoreRecord: existing };
      }
      return { blockedFinalized: true, scoreRecord: existing };
    }

    const now = new Date();
    const zeroFields = {
      supervisorId: null,
      supervisorScore: 0,
      lecturerId: null,
      lecturerScore: 0,
      finalScore: 0,
      isFinalized: true,
      finalizedBy: actorUserId,
      finalizedAt: now,
      calculatedAt: now,
      coSignedByLecturerId: null,
      coSignedAt: null,
      coSignNote: null,
      attendanceRecordId,
      attendanceAutoZeroedAt: now,
      attendanceAutoZeroReason: reason,
    };

    let scoreRecord;
    if (existing) {
      await tx.researchMethodScoreDetail.deleteMany({
        where: { researchMethodScoreId: existing.id },
      });
      scoreRecord = await tx.researchMethodScore.update({
        where: { thesisId },
        data: zeroFields,
      });
    } else {
      scoreRecord = await tx.researchMethodScore.create({
        data: {
          thesisId,
          ...zeroFields,
        },
      });
    }

    return { skipped: false, blockedFinalized: false, scoreRecord };
  });
}
