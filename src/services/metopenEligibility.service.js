import prisma from "../config/prisma.js";
import { getActiveAcademicYear } from "../helpers/academicYear.helper.js";
import { buildRuntimeSnapshotObservationPatch } from "./studentPeriodSnapshot.service.js";
import {
  studentHasOfficialMetopenArchive,
  studentHasTakenMetopen,
} from "../helpers/metopenArchive.helper.js";

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

export function normalizeSiaObservation(raw = {}) {
  return {
    nim: String(raw?.nim ?? "").trim(),
    name: raw?.name ? String(raw.name).trim() : null,
    eligibleMetopen: deriveMetopenEligibilityFromSiaStudent(raw),
    takingThesisCourse: deriveThesisCourseEnrollmentFromSiaStudent(raw),
    currentSemesterCourses: Array.isArray(raw?.currentSemesterCourses)
      ? raw.currentSemesterCourses
      : undefined,
  };
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
      hasTakenMetopen: false,
      isMetopenArchive: false,
    };
  }

  const thesis = findLatestThesis(student);
  const eligibleMetopen =
    typeof student.eligibleMetopen === "boolean" ? student.eligibleMetopen : null;
  const takingFromStudent =
    typeof student.takingThesisCourse === "boolean" ? student.takingThesisCourse : null;

  const [activeYear, hasTakenMetopen, isOfficialArchive] = await Promise.all([
    getActiveAcademicYear(client),
    studentHasTakenMetopen(student.id, { client }),
    studentHasOfficialMetopenArchive(student.id, { client }),
  ]);
  const snapshot = activeYear
    ? await client.studentAcademicYearSnapshot.findUnique({
      where: {
        studentId_academicYearId: {
          studentId: student.id,
          academicYearId: activeYear.id,
        },
      },
      select: { takingThesisCourse: true },
    })
    : null;
  const takingFromSnapshot =
    typeof snapshot?.takingThesisCourse === "boolean" ? snapshot.takingThesisCourse : null;
  const takingThesisCourse = takingFromSnapshot ?? takingFromStudent;
  const readOnly = isOfficialArchive;

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
    hasTakenMetopen,
    isMetopenArchive: readOnly,
  };
}

export async function setStudentMetopenEligibility(
  studentId,
  { eligibleMetopen, source, updatedAt = new Date() },
  { client = prisma } = {},
) {
  const hasEligibilityValue = typeof eligibleMetopen === "boolean";
  const updatedStudent = await client.student.update({
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
      researchMethodCompleted: true,
      takingThesisCourse: true,
    },
  });

  if (hasEligibilityValue) {
    await stampObservationOnActiveYear(
      studentId,
      {
        eligibleMetopen,
        researchMethodCompleted: updatedStudent.researchMethodCompleted,
        takingThesisCourse: undefined,
        source,
        updatedAt,
      },
      { client },
    );
  }

  return updatedStudent;
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

  if (hasEnrollmentValue) {
    await stampObservationOnActiveYear(
      studentId,
      {
        eligibleMetopen: undefined,
        takingThesisCourse,
        source,
        updatedAt,
      },
      { client },
    );

    const academicYear = await getActiveAcademicYear();
    const { syncBookingActivationForStudent } = await import("./metopen.service.js");
    await syncBookingActivationForStudent(studentId, academicYear?.id ?? null);
  }

  return updatedStudent;
}

/**
 * Tempel observasi ke ember tahun ajaran aktif hari ini.
 * SIA tidak mengirim academicYearId; first-write eligible, KRS selalu ditimpa.
 */
async function stampObservationOnActiveYear(
  studentId,
  {
    eligibleMetopen,
    researchMethodCompleted = null,
    takingThesisCourse,
    source,
    updatedAt = new Date(),
  },
  { client = prisma } = {},
) {
  const academicYear = await getActiveAcademicYear();
  if (!academicYear) return null;
  const normalizedSource = source === "devtools" ? "devtools" : "sia";
  const existing = await client.studentAcademicYearSnapshot.findUnique({
    where: {
      studentId_academicYearId: {
        studentId,
        academicYearId: academicYear.id,
      },
    },
  });
  const observation = {
    eligibleMetopen,
    researchMethodCompleted,
    eligibilitySource: normalizedSource,
    eligibilityCapturedAt: updatedAt,
    takingThesisCourse,
    thesisCourseSource: normalizedSource,
    thesisCourseCapturedAt: updatedAt,
    capturedAt: updatedAt,
  };

  if (!existing) {
    const hasEligibility = typeof eligibleMetopen === "boolean";
    const hasThesisCourse = typeof takingThesisCourse === "boolean";
    if (!hasEligibility && !hasThesisCourse) return academicYear;
    await client.studentAcademicYearSnapshot.create({
      data: {
        studentId,
        academicYearId: academicYear.id,
        eligibleMetopen: hasEligibility ? eligibleMetopen : null,
        researchMethodCompleted: hasEligibility ? researchMethodCompleted : null,
        takingThesisCourse: hasThesisCourse ? takingThesisCourse : null,
        eligibilitySource: hasEligibility ? normalizedSource : null,
        eligibilityCapturedAt: hasEligibility ? updatedAt : null,
        thesisCourseSource: hasThesisCourse ? normalizedSource : null,
        thesisCourseCapturedAt: hasThesisCourse ? updatedAt : null,
        capturedAt: updatedAt,
      },
    });
    return academicYear;
  }

  const fillData = buildRuntimeSnapshotObservationPatch(existing, observation);
  if (Object.keys(fillData).length > 0) {
    await client.studentAcademicYearSnapshot.update({
      where: { id: existing.id },
      data: fillData,
    });
  }
  return academicYear;
}

/**
 * Satu colokan observasi akademik: SIA nyata, SIA_MOCK, atau toggle DevTools.
 * Tidak menulis balik flag SIA. Tempel ke tahun ajaran aktif.
 */
export async function applyObservation(
  {
    studentId,
    eligibleMetopen,
    takingThesisCourse,
    source,
    updatedAt = new Date(),
  },
  { client = prisma } = {},
) {
  let student = null;
  if (eligibleMetopen !== undefined) {
    student = await setStudentMetopenEligibility(
      studentId,
      { eligibleMetopen, source, updatedAt },
      { client },
    );
  }
  if (takingThesisCourse !== undefined) {
    student = await setStudentThesisCourseEnrollment(
      studentId,
      { takingThesisCourse, source, updatedAt },
      { client },
    );
  }
  return student;
}
