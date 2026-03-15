import prisma from "../../config/prisma.js";

/**
 * Check if a student has passed seminar (status = 'passed' or 'passed_with_revision')
 * by looking at their thesis → thesisSeminars
 */
export const checkStudentSeminarPassStatus = async (studentId) => {
  const passedSeminar = await prisma.thesisSeminar.findFirst({
    where: {
      thesis: {
        studentId,
      },
      status: {
        in: ["passed", "passed_with_revision"],
      },
    },
    select: {
      id: true,
      status: true,
      // Include revisions to check completion
      examiners: {
        select: {
          id: true,
          seminar: {
            select: {
              id: true,
            },
          },
        },
      },
    },
  });

  return passedSeminar;
};

/**
 * Get the student's thesis with defence-related info:
 * supervisors (defenceReady), latest defence, seminar revision status
 */
export const getStudentThesisWithDefenceInfo = async (studentId) => {
  return prisma.thesis.findFirst({
    where: { studentId },
    select: {
      id: true,
      title: true,
      thesisSupervisors: {
        select: {
          id: true,
          lecturerId: true,
          defenceReady: true,
          role: { select: { id: true, name: true } },
          lecturer: {
            select: {
              id: true,
              user: { select: { id: true, fullName: true } },
            },
          },
        },
      },
      thesisSeminars: {
        where: {
          status: { in: ["passed", "passed_with_revision"] },
        },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          status: true,
          revisionFinalizedAt: true,
          examiners: {
            select: {
              id: true,
            },
          },
        },
      },
      thesisDefences: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          status: true,
          registeredAt: true,
          date: true,
          startTime: true,
          endTime: true,
          meetingLink: true,
          finalScore: true,
          grade: true,
          resultFinalizedAt: true,
          cancelledReason: true,
          room: { select: { id: true, name: true } },
          documents: {
            select: {
              thesisDefenceId: true,
              documentTypeId: true,
              documentId: true,
              status: true,
              submittedAt: true,
              verifiedAt: true,
              notes: true,
            },
          },
          examiners: {
            select: {
              id: true,
              lecturerId: true,
              order: true,
              availabilityStatus: true,
              assessmentScore: true,
              assessmentSubmittedAt: true,
              revisionNotes: true,
            },
            orderBy: { order: "asc" },
          },
        },
      },
    },
  });
};

/**
 * Count seminar revisions: total and finished
 */
export const countSeminarRevisions = async (seminarId) => {
  const [total, finished] = await Promise.all([
    prisma.thesisSeminarRevision.count({
      where: {
        seminarExaminer: {
          seminar: { id: seminarId },
        },
      },
    }),
    prisma.thesisSeminarRevision.count({
      where: {
        seminarExaminer: {
          seminar: { id: seminarId },
        },
        isFinished: true,
      },
    }),
  ]);
  return { total, finished };
};

/**
 * Get defence document types (the 5 required document types for sidang)
 */
export const DEFENCE_DOC_TYPES = [
  "Laporan Tugas Akhir",
  "Slide Presentasi",
  "Draft Jurnal TEKNOSI",
  "Sertifikat TOEFL",
  "Sertifikat SAPS",
];

export const getDefenceDocumentTypes = async () => {
  const types = await prisma.documentType.findMany({
    where: { name: { in: DEFENCE_DOC_TYPES } },
  });
  // Preserve the defined order
  return DEFENCE_DOC_TYPES
    .map((name) => types.find((t) => t.name === name))
    .filter(Boolean);
};

/**
 * Get or create a document type by name
 */
export const getOrCreateDocumentType = async (name) => {
  let dt = await prisma.documentType.findFirst({ where: { name } });
  if (!dt) {
    dt = await prisma.documentType.create({ data: { name } });
  }
  return dt;
};

/**
 * Ensure all defence document types exist
 */
export const ensureDefenceDocumentTypes = async () => {
  const result = {};
  for (const name of DEFENCE_DOC_TYPES) {
    result[name] = await getOrCreateDocumentType(name);
  }
  return result;
};

/**
 * Get all defence documents for a defence
 */
export const findDefenceDocuments = async (thesisDefenceId) => {
  const docs = await prisma.thesisDefenceDocument.findMany({
    where: { thesisDefenceId },
    include: {
      verifier: { select: { fullName: true } },
    },
  });

  // Manually join Document data for file info
  const docIds = docs.map((d) => d.documentId).filter(Boolean);
  const documents = docIds.length
    ? await prisma.document.findMany({
        where: { id: { in: docIds } },
        select: { id: true, fileName: true, filePath: true },
      })
    : [];
  const docMap = new Map(documents.map((d) => [d.id, d]));

  return docs.map((d) => ({
    thesisDefenceId: d.thesisDefenceId,
    documentTypeId: d.documentTypeId,
    documentId: d.documentId,
    status: d.status,
    submittedAt: d.submittedAt,
    verifiedAt: d.verifiedAt,
    notes: d.notes,
    verifiedBy: d.verifier?.fullName || null,
    fileName: docMap.get(d.documentId)?.fileName || null,
    filePath: docMap.get(d.documentId)?.filePath || null,
  }));
};

/**
 * Create a new ThesisDefence record with status 'registered'
 */
export const createThesisDefence = async (thesisId) => {
  return prisma.thesisDefence.create({
    data: {
      thesisId,
      registeredAt: new Date(),
      status: "registered",
    },
  });
};

/**
 * Upload a defence document (upsert)
 */
export const upsertDefenceDocument = async ({
  thesisDefenceId,
  documentTypeId,
  documentId,
}) => {
  return prisma.thesisDefenceDocument.upsert({
    where: {
      thesisDefenceId_documentTypeId: { thesisDefenceId, documentTypeId },
    },
    update: {
      documentId,
      status: "submitted",
      submittedAt: new Date(),
      verifiedAt: null,
      verifiedBy: null,
      notes: null,
    },
    create: {
      thesisDefenceId,
      documentTypeId,
      documentId,
      status: "submitted",
      submittedAt: new Date(),
    },
  });
};

/**
 * Get all defence sessions for student's thesis (history)
 */
export const getAllStudentDefences = async (studentId) => {
  return prisma.thesisDefence.findMany({
    where: {
      thesis: { studentId },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      registeredAt: true,
      date: true,
      startTime: true,
      endTime: true,
      meetingLink: true,
      examinerAverageScore: true,
      supervisorScore: true,
      supervisorNotes: true,
      finalScore: true,
      grade: true,
      resultFinalizedAt: true,
      cancelledReason: true,
      updatedAt: true,
      room: { select: { id: true, name: true } },
      examiners: {
        where: { availabilityStatus: "available" },
        select: {
          id: true,
          lecturerId: true,
          order: true,
          assessmentScore: true,
          assessmentSubmittedAt: true,
        },
        orderBy: { order: "asc" },
      },
    },
  });
};

/**
 * Get examiner assessment details for a defence.
 */
export const getStudentDefenceExaminerAssessmentDetails = async (defenceId) => {
  return prisma.thesisDefenceExaminerAssessmentDetail.findMany({
    where: {
      defenceExaminer: {
        thesisDefenceId: defenceId,
        availabilityStatus: "available",
      },
    },
    include: {
      defenceExaminer: {
        select: {
          id: true,
          lecturerId: true,
          order: true,
        },
      },
      criteria: {
        select: {
          id: true,
          name: true,
          maxScore: true,
          displayOrder: true,
          cpmk: {
            select: {
              id: true,
              code: true,
              description: true,
            },
          },
        },
      },
    },
  });
};

/**
 * Get supervisor assessment details for a defence.
 */
export const getStudentDefenceSupervisorAssessmentDetails = async (defenceId) => {
  return prisma.thesisDefenceSupervisorAssessmentDetail.findMany({
    where: { thesisDefenceId: defenceId },
    include: {
      criteria: {
        select: {
          id: true,
          name: true,
          maxScore: true,
          displayOrder: true,
          cpmk: {
            select: {
              id: true,
              code: true,
              description: true,
            },
          },
        },
      },
    },
  });
};

/**
 * Find a specific defence detail for student detail page.
 */
export const findStudentDefenceDetail = async (defenceId) => {
  return prisma.thesisDefence.findUnique({
    where: { id: defenceId },
    select: {
      id: true,
      thesisId: true,
      status: true,
      registeredAt: true,
      date: true,
      startTime: true,
      endTime: true,
      meetingLink: true,
      examinerAverageScore: true,
      supervisorScore: true,
      supervisorNotes: true,
      finalScore: true,
      grade: true,
      resultFinalizedAt: true,
      updatedAt: true,
      cancelledReason: true,
      room: { select: { id: true, name: true } },
      resultFinalizer: {
        select: {
          lecturer: {
            select: {
              user: { select: { fullName: true } },
            },
          },
          role: { select: { name: true } },
        },
      },
      thesis: {
        select: {
          id: true,
          studentId: true,
          title: true,
          thesisSupervisors: {
            select: {
              role: { select: { name: true } },
              lecturer: { select: { user: { select: { fullName: true } } } },
            },
          },
        },
      },
      examiners: {
        where: { availabilityStatus: "available" },
        select: {
          id: true,
          lecturerId: true,
          order: true,
          assessmentScore: true,
          assessmentSubmittedAt: true,
          revisionNotes: true,
        },
        orderBy: { order: "asc" },
      },
      documents: {
        select: {
          thesisDefenceId: true,
          documentTypeId: true,
          documentId: true,
          status: true,
          submittedAt: true,
          verifiedAt: true,
          notes: true,
        },
      },
    },
  });
};

/**
 * Get revisions for a defence.
 */
export const getStudentDefenceRevisions = async (defenceId) => {
  return prisma.thesisDefenceRevision.findMany({
    where: {
      defenceExaminer: {
        defence: { id: defenceId },
      },
    },
    include: {
      defenceExaminer: {
        select: {
          id: true,
          lecturerId: true,
          order: true,
          defence: {
            select: {
              id: true,
              status: true,
              thesis: {
                select: {
                  studentId: true,
                },
              },
            },
          },
        },
      },
      supervisor: {
        select: {
          lecturer: {
            select: {
              user: { select: { fullName: true } },
            },
          },
        },
      },
    },
    orderBy: { id: "asc" },
  });
};

/**
 * Create defence revision item.
 */
export const createStudentDefenceRevision = async ({ defenceExaminerId, description }) => {
  return prisma.thesisDefenceRevision.create({
    data: {
      defenceExaminerId,
      description,
      isFinished: false,
    },
  });
};

/**
 * Find defence revision by id (for auth checks)
 */
export const findDefenceRevisionById = async (revisionId) => {
  return prisma.thesisDefenceRevision.findUnique({
    where: { id: revisionId },
    include: {
      defenceExaminer: {
        select: {
          id: true,
          lecturerId: true,
          order: true,
          defence: {
            select: {
              id: true,
              status: true,
              thesis: {
                select: {
                  studentId: true,
                },
              },
            },
          },
        },
      },
      supervisor: {
        select: {
          lecturer: {
            select: {
              user: { select: { fullName: true } },
            },
          },
        },
      },
    },
  });
};

/**
 * Legacy submit action (save + submit at once)
 */
export const submitDefenceRevisionAction = async (revisionId, revisionAction) => {
  return prisma.thesisDefenceRevision.update({
    where: { id: revisionId },
    data: {
      revisionAction,
      studentSubmittedAt: new Date(),
    },
  });
};
