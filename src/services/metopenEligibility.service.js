import prisma from "../config/prisma.js";

const METOPEN_COURSE_HINTS = ["metodologi penelitian", "metode penelitian"];
const THESIS_COURSE_HINTS = ["tugas akhir", "skripsi"];

function findLatestThesis(student) {
  return student?.thesis?.[0] ?? null;
}

export function deriveMetopenEligibilityFromSiaStudent(student = null) {
  if (!student || typeof student !== "object") return null;
  if (typeof student.eligibleMetopen === "boolean") {
    return student.eligibleMetopen;
  }

  const courses = Array.isArray(student.currentSemesterCourses) ? student.currentSemesterCourses : [];
  const hasMetopenCourse = courses.some((course) => {
    const name = String(course?.name ?? "").toLowerCase();
    return METOPEN_COURSE_HINTS.some((hint) => name.includes(hint));
  });

  return hasMetopenCourse ? true : null;
}

export function deriveThesisCourseEnrollmentFromSiaStudent(student = null) {
  if (!student || typeof student !== "object") return null;
  if (typeof student.takingThesisCourse === "boolean") {
    return student.takingThesisCourse;
  }

  const courses = Array.isArray(student.currentSemesterCourses)
    ? student.currentSemesterCourses
    : null;

  if (!courses) {
    return null;
  }

  return courses.some((course) => {
    const name = String(course?.name ?? "").toLowerCase();
    return THESIS_COURSE_HINTS.some((hint) => name.includes(hint));
  });
}

export async function getStudentMetopenEligibilityContext(userId, { client = prisma } = {}) {
  return client.student.findUnique({
    where: { id: userId },
    select: {
      id: true,
      eligibleMetopen: true,
      metopenEligibilitySource: true,
      metopenEligibilityUpdatedAt: true,
      takingThesisCourse: true,
      thesisCourseEnrollmentSource: true,
      thesisCourseEnrollmentUpdatedAt: true,
      user: {
        select: {
          id: true,
          identityNumber: true,
          fullName: true,
          email: true,
        },
      },
      thesis: {
        take: 1,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          proposalStatus: true,
          thesisStatus: {
            select: { id: true, name: true },
          },
        },
      },
    },
  });
}

export async function resolveMetopenEligibilityState(userId, { client = prisma } = {}) {
  const student = await getStudentMetopenEligibilityContext(userId, { client });
  if (!student) {
    return {
      studentId: null,
      eligibleMetopen: null,
      hasExternalStatus: false,
      canAccess: false,
      canSubmit: false,
      readOnly: false,
      thesisId: null,
      thesisPhase: null,
      source: null,
      updatedAt: null,
      takingThesisCourse: null,
      hasThesisCourseStatus: false,
      canAccessTugasAkhir: false,
      thesisCourseEnrollmentSource: null,
      thesisCourseEnrollmentUpdatedAt: null,
    };
  }

  const thesis = findLatestThesis(student);
  const readOnly = thesis?.proposalStatus === "accepted";
  const eligibleMetopen =
    typeof student.eligibleMetopen === "boolean" ? student.eligibleMetopen : null;
  const takingThesisCourse =
    typeof student.takingThesisCourse === "boolean" ? student.takingThesisCourse : null;

  return {
    studentId: student.id,
    eligibleMetopen,
    hasExternalStatus: eligibleMetopen !== null,
    canAccess: eligibleMetopen === true || readOnly,
    canSubmit: eligibleMetopen === true && !readOnly,
    readOnly,
    thesisId: thesis?.id ?? null,
    thesisPhase: thesis?.thesisStatus?.name ?? null,
    source: student.metopenEligibilitySource ?? null,
    updatedAt: student.metopenEligibilityUpdatedAt ?? null,
    takingThesisCourse,
    hasThesisCourseStatus: takingThesisCourse !== null,
    canAccessTugasAkhir: takingThesisCourse === true,
    thesisCourseEnrollmentSource: student.thesisCourseEnrollmentSource ?? null,
    thesisCourseEnrollmentUpdatedAt: student.thesisCourseEnrollmentUpdatedAt ?? null,
  };
}

export async function setStudentMetopenEligibility(
  studentId,
  { eligibleMetopen, source, updatedAt = new Date() },
  { client = prisma } = {},
) {
  const hasEligibilityValue = typeof eligibleMetopen === "boolean";
  return client.student.update({
    where: { id: studentId },
    data: {
      eligibleMetopen: hasEligibilityValue ? eligibleMetopen : null,
      metopenEligibilitySource: hasEligibilityValue ? source : null,
      metopenEligibilityUpdatedAt: hasEligibilityValue ? updatedAt : null,
    },
    select: {
      id: true,
      eligibleMetopen: true,
      metopenEligibilitySource: true,
      metopenEligibilityUpdatedAt: true,
    },
  });
}

export async function setStudentThesisCourseEnrollment(
  studentId,
  { takingThesisCourse, source, updatedAt = new Date() },
  { client = prisma } = {},
) {
  const hasEnrollmentValue = typeof takingThesisCourse === "boolean";
  const updatedStudent = await client.student.update({
    where: { id: studentId },
    data: {
      takingThesisCourse: hasEnrollmentValue ? takingThesisCourse : null,
      thesisCourseEnrollmentSource: hasEnrollmentValue ? source : null,
      thesisCourseEnrollmentUpdatedAt: hasEnrollmentValue ? updatedAt : null,
    },
    select: {
      id: true,
      takingThesisCourse: true,
      thesisCourseEnrollmentSource: true,
      thesisCourseEnrollmentUpdatedAt: true,
    },
  });

  if (updatedStudent.takingThesisCourse === true) {
    try {
      const { syncKadepProposalQueueForStudent } = await import("./metopen.service.js");
      await syncKadepProposalQueueForStudent(studentId);
    } catch (error) {
      console.warn(
        `[metopenEligibility] Failed to sync KaDep proposal queue for student ${studentId}:`,
        error?.message ?? error,
      );
    }
  }

  return updatedStudent;
}
