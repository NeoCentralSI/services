/**
 * The one place that reads SIA's data (K45). Every step of the sync (academic data, semester
 * flags, student status, GPA, CPL) works on the normalized record returned here, never on SIA's
 * raw fields. When the real SIA sends a different shape, only this file changes.
 *
 * Contract read (dummy-SIA `GET /students`):
 *   { success, period: { academicYear: "2026/2027", semester: "ganjil" }, count, data: [record] }
 */
import {
  RESEARCH_METHOD_COURSE_CODES,
  RESEARCH_METHOD_COURSE_NAME,
  THESIS_COURSE_CODES,
  THESIS_COURSE_NAME,
} from "../constants/siaCourses.js";

/** SIA's student status → NeoCentral's `StudentStatus`. */
export const SIA_STUDENT_STATUS = Object.freeze({
  aktif: "active",
  cuti: "bss",
  lulus: "lulus",
  mengundurkan_diri: "mengundurkan_diri",
  drop_out: "dropout",
});

const text = (value) => (value === null || value === undefined ? "" : String(value).normalize("NFKC").trim());
const intOrNull = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
};
const boolOrNull = (value) => (typeof value === "boolean" ? value : null);

/** GPA with two decimals, or null when missing or out of 0–4. */
export function normalizeGpa(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 4) return null;
  return Math.round(n * 100) / 100;
}

/** The semester the data is about: { academicYear: "2026/2027", semester: "ganjil" | "genap" } or null. */
export function normalizePeriod(period) {
  const academicYear = text(period?.academicYear);
  const semester = text(period?.semester).toLowerCase();
  if (!/^\d{4}\/\d{4}$/.test(academicYear) || !["ganjil", "genap"].includes(semester)) return null;
  return { academicYear, semester };
}

const courseMatches = (course, codes, name) =>
  codes.includes(text(course.code).toUpperCase()) || name.test(text(course.name));

/**
 * One SIA record as NeoCentral reads it. Fields SIA did not send are null (left alone by the
 * sync); `takesResearchMethod`/`takesThesis` come from the current courses.
 */
export function normalizeSiaStudent(raw) {
  const courses = Array.isArray(raw?.currentCourses) ? raw.currentCourses : null;
  const currentCourses = (courses ?? [])
    .filter((c) => c && (c.code || c.name))
    .map((c) => ({ code: text(c.code).toUpperCase(), name: text(c.name), credits: intOrNull(c.credits) }));
  const statusKey = text(raw?.studentStatus).toLowerCase();
  return {
    nim: text(raw?.nim),
    name: text(raw?.name),
    enrollmentYear: intOrNull(raw?.enrollmentYear),
    studentStatus: SIA_STUDENT_STATUS[statusKey] ?? null,
    rawStudentStatus: statusKey || null,
    currentSemester: intOrNull(raw?.currentSemester),
    sksCompleted: intOrNull(raw?.sksCompleted),
    gpa: normalizeGpa(raw?.gpa),
    mandatoryCoursesCompleted: boolOrNull(raw?.mandatoryCoursesCompleted),
    mkwuCompleted: boolOrNull(raw?.mkwuCompleted),
    internshipCompleted: boolOrNull(raw?.internshipCompleted),
    kknCompleted: boolOrNull(raw?.kknCompleted),
    researchMethodCompleted: boolOrNull(raw?.researchMethodCompleted),
    currentCourses,
    // Without a course list nothing is known about the semester flags.
    takesResearchMethod: courses ? currentCourses.some((c) => courseMatches(c, RESEARCH_METHOD_COURSE_CODES, RESEARCH_METHOD_COURSE_NAME)) : null,
    takesThesis: courses ? currentCourses.some((c) => courseMatches(c, THESIS_COURSE_CODES, THESIS_COURSE_NAME)) : null,
    // `cplCode` in the contract; `code` was the earlier name. The description is a guard when sent.
    cplScores: (Array.isArray(raw?.cplScores) ? raw.cplScores : []).map((row) => ({
      code: text(row?.cplCode ?? row?.code).toUpperCase(),
      description: row?.description === undefined || row?.description === null ? null : text(row.description),
      score: row?.score,
      inputAt: row?.inputAt ?? null,
    })),
  };
}

/** The whole response: its period and the normalized records (records without a NIM are dropped). */
export function normalizeSiaResponse(json) {
  const rows = Array.isArray(json?.data) ? json.data : [];
  return {
    period: normalizePeriod(json?.period),
    students: rows.map(normalizeSiaStudent).filter((s) => s.nim),
  };
}
