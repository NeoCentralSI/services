import * as repo from "../repositories/metopenClass.repository.js";
import prisma from "../config/prisma.js";
import {
  NotFoundError,
  BadRequestError,
  ForbiddenError,
  ConflictError,
} from "../utils/errors.js";
import {
  getActiveAcademicYear,
  getAcademicYearsWithStatus,
} from "../helpers/academicYear.helper.js";

function semesterLabel(semester) {
  return semester === "genap" ? "Genap" : "Ganjil";
}

function mapAcademicYear(academicYear, activeAcademicYearId = null) {
  if (!academicYear) return null;

  return {
    id: academicYear.id,
    year: academicYear.year,
    semester: academicYear.semester,
    label: `${semesterLabel(academicYear.semester)} ${academicYear.year}`,
    isActive: activeAcademicYearId ? academicYear.id === activeAcademicYearId : !!academicYear.isActive,
  };
}

function buildRosterData(enrollments, academicYear, activeAcademicYearId = null) {
  const studentMap = new Map();

  for (const enrollment of enrollments) {
    const studentId = enrollment.studentId;
    const studentEntry = studentMap.get(studentId) ?? {
      studentId,
      studentName: enrollment.student?.user?.fullName ?? "-",
      studentNim: enrollment.student?.user?.identityNumber ?? "-",
      studentEmail: enrollment.student?.user?.email ?? null,
      classAssignments: [],
    };

    studentEntry.classAssignments.push({
      classId: enrollment.classId,
      className: enrollment.metopenClass?.name ?? "-",
      lecturerId: enrollment.metopenClass?.lecturer?.id ?? null,
      lecturerName: enrollment.metopenClass?.lecturer?.user?.fullName ?? null,
      enrolledAt: enrollment.enrolledAt,
      isClassActive: enrollment.metopenClass?.isActive ?? true,
    });

    studentMap.set(studentId, studentEntry);
  }

  const students = Array.from(studentMap.values())
    .map((student) => {
      const uniqueClassIds = new Set(student.classAssignments.map((assignment) => assignment.classId));
      const sortedAssignments = [...student.classAssignments].sort((left, right) =>
        left.className.localeCompare(right.className, "id-ID")
      );

      return {
        ...student,
        classAssignments: sortedAssignments,
        classCount: uniqueClassIds.size,
        hasDuplicateEnrollment: uniqueClassIds.size > 1,
      };
    })
    .sort((left, right) => left.studentName.localeCompare(right.studentName, "id-ID"));

  const duplicateStudents = students.filter((student) => student.hasDuplicateEnrollment);
  const classCount = new Set(
    students.flatMap((student) => student.classAssignments.map((assignment) => assignment.classId))
  ).size;

  return {
    academicYear: mapAcademicYear(academicYear, activeAcademicYearId),
    students,
    summary: {
      totalStudents: students.length,
      duplicateStudents: duplicateStudents.length,
      totalAssignments: students.reduce((total, student) => total + student.classAssignments.length, 0),
      classCount,
    },
  };
}

async function findLecturerOrThrow(userId) {
  const lecturer = await prisma.lecturer.findUnique({ where: { id: userId } });
  if (!lecturer) {
    throw new ForbiddenError("Anda bukan dosen pengampu");
  }

  return lecturer;
}

async function resolveAcademicYear(academicYearId = null) {
  if (academicYearId) {
    const academicYear = await repo.findAcademicYearById(academicYearId);
    if (!academicYear) {
      throw new NotFoundError("Tahun ajaran tidak ditemukan");
    }

    const activeAcademicYear = await getActiveAcademicYear();
    return {
      academicYear,
      activeAcademicYearId: activeAcademicYear?.id ?? null,
    };
  }

  const activeAcademicYear = await getActiveAcademicYear();
  if (!activeAcademicYear) {
    throw new BadRequestError("Tidak ada tahun ajaran aktif");
  }

  return {
    academicYear: activeAcademicYear,
    activeAcademicYearId: activeAcademicYear.id,
  };
}

async function assertNoCrossClassDuplicateEnrollment(cls, studentIds) {
  const conflicts = await repo.findConflictingEnrollments(cls.academicYearId, studentIds, cls.id);
  if (conflicts.length === 0) {
    return;
  }

  const conflictSummaries = Array.from(
    conflicts.reduce((map, enrollment) => {
      const current = map.get(enrollment.studentId) ?? {
        studentName: enrollment.student?.user?.fullName ?? "-",
        studentNim: enrollment.student?.user?.identityNumber ?? "-",
        classes: [],
      };
      current.classes.push(enrollment.metopenClass?.name ?? "-");
      map.set(enrollment.studentId, current);
      return map;
    }, new Map())
  )
    .slice(0, 3)
    .map(([, conflict]) => `${conflict.studentName} (${conflict.studentNim}) sudah ada di ${conflict.classes.join(", ")}`);

  throw new ConflictError(
    `Mahasiswa sudah terdaftar pada kelas lain di tahun ajaran yang sama. ${conflictSummaries.join("; ")}`
  );
}

// ============================================
// Class CRUD
// ============================================

export async function getClasses(userId, academicYearId = null) {
  const lecturer = await findLecturerOrThrow(userId);
  const { academicYear } = await resolveAcademicYear(academicYearId);
  return repo.findClassesByLecturer(lecturer.id, academicYear.id);
}

export async function getAcademicYears() {
  const academicYears = await getAcademicYearsWithStatus();
  return academicYears.map((academicYear) => ({
    id: academicYear.id,
    year: academicYear.year,
    semester: academicYear.semester,
    label: `${semesterLabel(academicYear.semester)} ${academicYear.year}`,
    isActive: academicYear.isActive,
  }));
}

export async function getRoster(academicYearId = null) {
  const { academicYear, activeAcademicYearId } = await resolveAcademicYear(academicYearId);
  const enrollments = await repo.findRosterEnrollments(academicYear.id);
  return buildRosterData(enrollments, academicYear, activeAcademicYearId);
}

/**
 * Auto-sync class from SIA is intentionally disabled.
 * Current SIA payload does not provide authoritative class/section mapping.
 */
export async function autoSyncClass(userId) {
  await findLecturerOrThrow(userId);
  throw new BadRequestError(
    "Sync kelas dosen sudah dinonaktifkan. Daftar mahasiswa mengikuti hasil sync admin dan pemetaan kelas yang valid."
  );
}

export async function getClassById(classId) {
  const cls = await repo.findClassById(classId);
  if (!cls) throw new NotFoundError("Kelas tidak ditemukan");
  return cls;
}

export async function createClass(data, userId) {
  const lecturer = await findLecturerOrThrow(userId);
  const { academicYear } = await resolveAcademicYear(data.academicYearId || null);

  return repo.createClass({
    name: data.name,
    description: data.description,
    lecturerId: lecturer.id,
    academicYearId: academicYear.id,
  });
}

export async function updateClass(classId, data) {
  const existing = await repo.findClassById(classId);
  if (!existing) throw new NotFoundError("Kelas tidak ditemukan");

  const updateData = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;

  return repo.updateClass(classId, updateData);
}

export async function deleteClass(classId) {
  const existing = await repo.findClassById(classId);
  if (!existing) throw new NotFoundError("Kelas tidak ditemukan");

  if (existing._count.milestones > 0) {
    return repo.updateClass(classId, { isActive: false });
  }

  return repo.deleteClass(classId);
}

// ============================================
// Enrollment
// ============================================

export async function enrollStudents(classId, studentIds) {
  const cls = await repo.findClassById(classId);
  if (!cls) throw new NotFoundError("Kelas tidak ditemukan");

  const uniqueStudentIds = [...new Set(studentIds ?? [])];
  if (uniqueStudentIds.length === 0) {
    throw new BadRequestError("Minimal satu mahasiswa untuk di-enroll");
  }

  await assertNoCrossClassDuplicateEnrollment(cls, uniqueStudentIds);

  const result = await repo.enrollStudents(classId, uniqueStudentIds, cls.academicYearId);
  return { enrolled: result.count };
}

export async function unenrollStudent(classId, studentId) {
  try {
    await repo.unenrollStudent(classId, studentId);
    return { unenrolled: true };
  } catch {
    throw new NotFoundError("Mahasiswa tidak ditemukan di kelas ini");
  }
}

export async function getDuplicateEnrollmentAudit(academicYearId = null) {
  const { academicYear, activeAcademicYearId } = await resolveAcademicYear(academicYearId);
  const enrollments = await repo.findRosterEnrollments(academicYear.id);
  const roster = buildRosterData(enrollments, academicYear, activeAcademicYearId);

  return {
    academicYear: roster.academicYear,
    duplicates: roster.students
      .filter((student) => student.hasDuplicateEnrollment)
      .map((student) => ({
        studentId: student.studentId,
        studentName: student.studentName,
        studentNim: student.studentNim,
        classCount: student.classCount,
        hasDuplicateEnrollment: true,
        classAssignments: student.classAssignments,
      })),
    summary: {
      duplicateStudents: roster.summary.duplicateStudents,
      totalStudents: roster.summary.totalStudents,
    },
  };
}

export async function resolveDuplicateEnrollment({ academicYearId, studentId, keepClassId }) {
  const { academicYear, activeAcademicYearId } = await resolveAcademicYear(academicYearId);
  const conflicts = await repo.findConflictingEnrollments(academicYear.id, [studentId]);

  if (conflicts.length < 2) {
    throw new BadRequestError("Mahasiswa tidak memiliki duplikasi kelas pada tahun ajaran ini");
  }

  if (!conflicts.some((conflict) => conflict.classId === keepClassId)) {
    throw new BadRequestError("Kelas yang dipilih untuk dipertahankan tidak valid");
  }

  const result = await repo.resolveDuplicateEnrollment({
    academicYearId: academicYear.id,
    studentId,
    keepClassId,
  });

  if (!result) {
    throw new BadRequestError("Kelas yang dipilih untuk dipertahankan tidak ditemukan");
  }

  const keepClass = conflicts.find((conflict) => conflict.classId === keepClassId);
  const remainingRoster = await getDuplicateEnrollmentAudit(academicYear.id);
  const stillDuplicate = remainingRoster.duplicates.some((student) => student.studentId === studentId);

  return {
    academicYear: mapAcademicYear(academicYear, activeAcademicYearId),
    studentId,
    keepClassId,
    keepClassName: keepClass?.metopenClass?.name ?? result.keepEnrollment?.metopenClass?.name ?? "-",
    movedMilestones: result.movedMilestones,
    deletedEnrollments: result.deletedEnrollments,
    resolved: !stillDuplicate,
  };
}

// ============================================
// Publish Tasks to Class
// ============================================

export async function publishToClass(classId, { templateIds, templateDeadlines = {} }) {
  const cls = await repo.findClassById(classId);
  if (!cls) throw new NotFoundError("Kelas tidak ditemukan");

  if (!templateIds || templateIds.length === 0) {
    throw new BadRequestError("Pilih minimal satu template");
  }

  const enrolledStudentIds = await repo.findEnrolledStudentIds(classId);
  if (enrolledStudentIds.length === 0) {
    throw new BadRequestError("Belum ada mahasiswa di kelas ini");
  }

  const theses = await prisma.thesis.findMany({
    where: {
      studentId: { in: enrolledStudentIds },
      thesisStatus: { name: "Metopel" },
    },
    include: {
      thesisMilestones: {
        where: { metopenClassId: classId, status: { not: "archived" } },
        select: { milestoneTemplateId: true },
      },
    },
  });

  if (theses.length === 0) {
    return { assignedCount: 0, totalCreated: 0 };
  }

  const templates = await prisma.thesisMilestoneTemplate.findMany({
    where: { id: { in: templateIds }, isActive: true },
    orderBy: { orderIndex: "asc" },
  });

  if (templates.length === 0) {
    throw new BadRequestError("Tidak ada template aktif yang dipilih");
  }

  const milestonesData = [];
  let assignedCount = 0;

  for (const thesis of theses) {
    const existingTemplateIds = new Set(
      thesis.thesisMilestones?.map((milestone) => milestone.milestoneTemplateId) || []
    );

    let created = 0;
    for (const template of templates) {
      if (existingTemplateIds.has(template.id)) continue;

      const deadline = templateDeadlines[template.id]
        ? new Date(templateDeadlines[template.id])
        : new Date(Date.now() + (template.defaultDueDays ?? 14) * 24 * 60 * 60 * 1000);

      milestonesData.push({
        thesisId: thesis.id,
        title: template.name,
        description: template.description,
        orderIndex: template.orderIndex,
        milestoneTemplateId: template.id,
        metopenClassId: classId,
        targetDate: deadline,
        status: "not_started",
        progressPercentage: 0,
      });
      created++;
    }

    if (created > 0) assignedCount++;
  }

  if (milestonesData.length > 0) {
    await repo.createManyClassMilestones(milestonesData);
  }

  return {
    assignedCount,
    templatesPublished: templates.length,
    totalCreated: milestonesData.length,
  };
}

// ============================================
// Class Tasks View
// ============================================

export async function getClassTasks(classId) {
  const cls = await repo.findClassById(classId);
  if (!cls) throw new NotFoundError("Kelas tidak ditemukan");

  return repo.findClassTasks(classId);
}

export async function getClassTaskDetail(classId, templateId) {
  return repo.findClassTaskDetail(classId, templateId);
}

export async function getPublishedTemplateIds(classId) {
  return repo.findPublishedTemplateIdsForClass(classId);
}
