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
  sourceFiles: true,
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
  academicYear: {
    select: { id: true, year: true, semester: true, startDate: true, endDate: true },
  },
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

const ATTENDANCE_RECORD_INCLUDE = {
  import: {
    select: {
      id: true,
      academicYearId: true,
      classCode: true,
      courseName: true,
      semesterLabel: true,
      filterLabel: true,
      thresholdPercent: true,
      uploadedAt: true,
      uploadedByUserId: true,
      sourceFiles: true,
      document: { select: { id: true, fileName: true, filePath: true } },
    },
  },
  student: {
    select: {
      id: true,
      user: { select: { id: true, fullName: true, identityNumber: true } },
    },
  },
};

function normalizeIdentity(value) {
  return String(value ?? "").replace(/\s+/g, "").trim();
}

export function findLatestAttendanceImport(academicYearId, client = prisma) {
  return client.metopenAttendanceImport.findFirst({
    where: { academicYearId },
    orderBy: { uploadedAt: "desc" },
    select: IMPORT_SUMMARY_SELECT,
  });
}

export function findAcademicYearById(academicYearId, client = prisma) {
  return client.academicYear.findUnique({
    where: { id: academicYearId },
    select: { id: true, year: true, semester: true, startDate: true, endDate: true },
  });
}

export function findThesisAcademicYear(thesisId, client = prisma) {
  return client.thesis.findUnique({
    where: { id: thesisId },
    select: {
      id: true,
      academicYearId: true,
      ta04AssignmentAcademicYearId: true,
    },
  });
}

/**
 * Resolve attendance row for a thesis against a specific import.
 * Match by studentId FK OR student NIM (identityNumber). When NIM matches
 * but studentId was null (upload before student linked), backfill the FK.
 */
export async function findAttendanceRecordForThesis(importId, thesisId, client = prisma) {
  const thesis = await client.thesis.findUnique({
    where: { id: thesisId },
    select: {
      studentId: true,
      student: {
        select: {
          id: true,
          user: { select: { identityNumber: true } },
        },
      },
    },
  });

  if (!thesis?.studentId) return null;

  const rawIdentity = thesis.student?.user?.identityNumber ?? null;
  const identityNumber = rawIdentity ? normalizeIdentity(rawIdentity) : null;

  const orFilters = [{ studentId: thesis.studentId }];
  if (identityNumber) {
    orFilters.push({ identityNumber });
    if (rawIdentity && rawIdentity !== identityNumber) {
      orFilters.push({ identityNumber: rawIdentity });
    }
  }

  let record = await client.metopenAttendanceRecord.findFirst({
    where: {
      importId,
      OR: orFilters,
    },
    include: ATTENDANCE_RECORD_INCLUDE,
  });

  if (record && record.studentId == null && thesis.studentId) {
    record = await client.metopenAttendanceRecord.update({
      where: { id: record.id },
      data: { studentId: thesis.studentId },
      include: ATTENDANCE_RECORD_INCLUDE,
    });
  }

  return record;
}

export function findStudentsByIdentityNumbers(identityNumbers, client = prisma) {
  const normalized = [...new Set(identityNumbers.map(normalizeIdentity).filter(Boolean))];
  if (normalized.length === 0) return [];

  return client.student.findMany({
    where: {
      user: {
        identityNumber: { in: normalized },
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

export function findEligibleRecordsForImport(importId, client = prisma) {
  return client.metopenAttendanceRecord.findMany({
    where: {
      importId,
      isEligible: true,
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

export function findThesisForAttendanceReconcile(thesisId, client = prisma) {
  return client.thesis.findUnique({
    where: { id: thesisId },
    select: {
      id: true,
      studentId: true,
      title: true,
      isProposal: true,
      activePromotedAt: true,
      finalProposalVersionId: true,
      researchMethodScores: {
        take: 1,
        select: {
          id: true,
          isFinalized: true,
          attendanceAutoZeroedAt: true,
        },
      },
      advisorRequests: {
        where: {
          status: { in: ["active_official", "released"] },
        },
        take: 1,
        select: { id: true, status: true },
      },
    },
  });
}

export function findScoreableThesesByStudentIds(
  studentIds,
  academicYearId,
  closedStatusNames,
  client = prisma,
) {
  if (!studentIds.length) return [];

  return client.thesis.findMany({
    where: {
      studentId: { in: studentIds },
      academicYearId,
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
      isProposal: true,
      activePromotedAt: true,
      researchMethodScores: {
        take: 1,
        select: {
          id: true,
          isFinalized: true,
          attendanceAutoZeroedAt: true,
        },
      },
      advisorRequests: {
        where: {
          status: { in: ["active_official", "released"] },
        },
        take: 1,
        select: { id: true, status: true },
      },
    },
  });
}

export function clearAttendanceAutoZeroForTheses(items, client = prisma) {
  if (!Array.isArray(items) || items.length === 0) return [];

  return client.$transaction(async (tx) => {
    const cleared = [];

    for (const item of items) {
      const existing = await tx.researchMethodScore.findUnique({
        where: { thesisId: item.thesisId },
        select: {
          id: true,
          thesisId: true,
          attendanceAutoZeroedAt: true,
        },
      });

      if (!existing?.attendanceAutoZeroedAt) continue;

      await tx.researchMethodScoreDetail.deleteMany({
        where: { researchMethodScoreId: existing.id },
      });

      const scoreRecord = await tx.researchMethodScore.update({
        where: { thesisId: item.thesisId },
        data: {
          supervisorId: null,
          supervisorScore: null,
          lecturerId: null,
          lecturerScore: null,
          finalScore: null,
          isFinalized: false,
          finalizedBy: null,
          finalizedAt: null,
          calculatedAt: null,
          coSignedByLecturerId: null,
          coSignedAt: null,
          coSignNote: null,
          attendanceRecordId: item.attendanceRecordId,
          attendanceAutoZeroedAt: null,
          attendanceAutoZeroReason: null,
        },
      });

      cleared.push(scoreRecord);
    }

    return cleared;
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
