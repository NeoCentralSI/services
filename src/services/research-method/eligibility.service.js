import prisma from "../../config/prisma.js";

/**
 * Academic flags per student per semester (plan 10.6, K11): whether the student takes Metode
 * Penelitian and whether the student takes Tugas Akhir in that semester. They come from SIA
 * (read only) or from DevTools, and live in `student_academic_year_snapshots`.
 */

/** Value of `ExternalAcademicSnapshotSource`. */
export const ACADEMIC_FLAG_SOURCE = Object.freeze({ SIA: "sia", DEVTOOLS: "devtools" });

const RESEARCH_METHOD_COURSE_HINTS = ["metodologi penelitian", "metode penelitian"];
const THESIS_COURSE_HINTS = ["tugas akhir", "skripsi"];

function courseNames(raw) {
  return Array.isArray(raw?.currentSemesterCourses)
    ? raw.currentSemesterCourses.map((course) => String(course?.name ?? "").toLowerCase())
    : null;
}

/**
 * Whether the SIA record says the student takes Metode Penelitian. The dummy-SIA contract
 * still calls the field `eligibleMetopen`; a course list is the fallback. Null = unknown.
 */
export function deriveResearchMethodFlag(raw = null) {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.eligibleResearchMethod === "boolean") return raw.eligibleResearchMethod;
  if (typeof raw.eligibleMetopen === "boolean") return raw.eligibleMetopen;
  const names = courseNames(raw);
  if (!names) return null;
  return names.some((name) => RESEARCH_METHOD_COURSE_HINTS.some((hint) => name.includes(hint))) ? true : null;
}

/** Whether the SIA record says the student takes Tugas Akhir. Null = unknown. */
export function deriveThesisCourseFlag(raw = null) {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.takingThesisCourse === "boolean") return raw.takingThesisCourse;
  const names = courseNames(raw);
  if (!names) return null;
  return names.some((name) => THESIS_COURSE_HINTS.some((hint) => name.includes(hint)));
}

/** The internal academic record of one SIA student row (K11). */
export function normalizeSiaObservation(raw = {}) {
  return {
    nim: String(raw?.nim ?? "").trim(),
    name: raw?.name ? String(raw.name).trim() : null,
    eligibleResearchMethod: deriveResearchMethodFlag(raw),
    takingThesisCourse: deriveThesisCourseFlag(raw),
  };
}

/**
 * Patch for an existing semester row from a SIA observation. The Metode Penelitian flag is
 * written once per semester (the first observation wins); the Tugas Akhir flag follows every
 * observation, because KRS changes during the semester.
 */
export function buildObservationPatch(existing, observation = {}) {
  const data = {};
  const capturedAt = observation.capturedAt ?? new Date();
  const source = observation.source ?? ACADEMIC_FLAG_SOURCE.SIA;

  if (existing.eligibleResearchMethod == null && typeof observation.eligibleResearchMethod === "boolean") {
    data.eligibleResearchMethod = observation.eligibleResearchMethod;
    data.eligibilitySource = source;
    data.eligibilityCapturedAt = capturedAt;
  }
  if (typeof observation.takingThesisCourse === "boolean") {
    data.takingThesisCourse = observation.takingThesisCourse;
    data.thesisCourseSource = source;
    data.thesisCourseCapturedAt = capturedAt;
  }
  if (Object.keys(data).length > 0) data.capturedAt = capturedAt;
  return data;
}

/** New semester row from an observation, or null when the observation carries no flag. */
export function buildObservationRow(studentId, academicYearId, observation = {}) {
  const hasResearchMethod = typeof observation.eligibleResearchMethod === "boolean";
  const hasThesisCourse = typeof observation.takingThesisCourse === "boolean";
  if (!hasResearchMethod && !hasThesisCourse) return null;
  const capturedAt = observation.capturedAt ?? new Date();
  const source = observation.source ?? ACADEMIC_FLAG_SOURCE.SIA;
  return {
    studentId,
    academicYearId,
    eligibleResearchMethod: hasResearchMethod ? observation.eligibleResearchMethod : null,
    takingThesisCourse: hasThesisCourse ? observation.takingThesisCourse : null,
    eligibilitySource: hasResearchMethod ? source : null,
    eligibilityCapturedAt: hasResearchMethod ? capturedAt : null,
    thesisCourseSource: hasThesisCourse ? source : null,
    thesisCourseCapturedAt: hasThesisCourse ? capturedAt : null,
    capturedAt,
  };
}

/** The flags of one student in one semester (null fields when unknown). */
export async function getStudentPeriodFlags(studentId, academicYearId, { client = prisma } = {}) {
  if (!studentId || !academicYearId) return null;
  return client.studentAcademicYearSnapshot.findUnique({
    where: { studentId_academicYearId: { studentId, academicYearId } },
  });
}

/**
 * Set flags of one student in one semester explicitly (DevTools, or a SIA read that is the
 * authority for that semester). Fields left undefined are not touched; null clears a flag.
 */
export async function setStudentPeriodFlags(
  studentId,
  academicYearId,
  { eligibleResearchMethod, takingThesisCourse } = {},
  { source = ACADEMIC_FLAG_SOURCE.DEVTOOLS, client = prisma, now = new Date() } = {},
) {
  const data = { capturedAt: now };
  if (eligibleResearchMethod !== undefined) {
    data.eligibleResearchMethod = eligibleResearchMethod;
    data.eligibilitySource = eligibleResearchMethod === null ? null : source;
    data.eligibilityCapturedAt = eligibleResearchMethod === null ? null : now;
  }
  if (takingThesisCourse !== undefined) {
    data.takingThesisCourse = takingThesisCourse;
    data.thesisCourseSource = takingThesisCourse === null ? null : source;
    data.thesisCourseCapturedAt = takingThesisCourse === null ? null : now;
  }
  return client.studentAcademicYearSnapshot.upsert({
    where: { studentId_academicYearId: { studentId, academicYearId } },
    create: { studentId, academicYearId, ...data },
    update: data,
  });
}

/**
 * How many students have semester flags for an academic year (shown with the SIA sync status).
 * Defaults to the operational academic year.
 */
export async function getPeriodFlagCoverage(academicYearId = null, { client = prisma } = {}) {
  const academicYear = academicYearId
    ? await client.academicYear.findUnique({ where: { id: academicYearId } })
    : await client.academicYear.findFirst({ where: { isActive: true } });
  if (!academicYear) return null;
  const [totalStudents, withFlags, takingResearchMethod, takingThesisCourse] = await Promise.all([
    client.student.count(),
    client.studentAcademicYearSnapshot.count({ where: { academicYearId: academicYear.id } }),
    client.studentAcademicYearSnapshot.count({ where: { academicYearId: academicYear.id, eligibleResearchMethod: true } }),
    client.studentAcademicYearSnapshot.count({ where: { academicYearId: academicYear.id, takingThesisCourse: true } }),
  ]);
  return {
    academicYear: { id: academicYear.id, semester: academicYear.semester, year: academicYear.year },
    totalStudents,
    studentsWithFlags: withFlags,
    studentsWithoutFlags: Math.max(totalStudents - withFlags, 0),
    takingResearchMethod,
    takingThesisCourse,
  };
}

/**
 * Flags of the running semester for one student, for the user profile and the sidebar.
 * @returns {Promise<{ eligibleResearchMethod: boolean|null, takingThesisCourse: boolean|null }>}
 */
export async function getCurrentStudentFlags(studentId, { client = prisma } = {}) {
  const active = await client.academicYear.findFirst({ where: { isActive: true }, select: { id: true } });
  const row = active ? await getStudentPeriodFlags(studentId, active.id, { client }) : null;
  return {
    eligibleResearchMethod: row?.eligibleResearchMethod ?? null,
    takingThesisCourse: row?.takingThesisCourse ?? null,
  };
}
