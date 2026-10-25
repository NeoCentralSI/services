/**
 * Graduation predicate and study length, computed (never stored): from the GPA and the number of
 * semesters from the student's intake semester to the semester of the yudisium period they
 * take part in (or the running semester when they are not in a yudisium).
 *
 * Leave semesters are not subtracted: the semesters a student was on leave are not stored
 * (the student status keeps only its current value).
 */
import prisma from "../config/prisma.js";
import { GRADUATION_PREDICATE, GRADUATION_PREDICATE_RULES as RULES } from "../constants/graduationPredicate.js";

/**
 * Semesters from the intake (Ganjil of `enrollmentYear`) up to and including `academicYear`
 * ({ year: "2026/2027", semester: "ganjil" | "genap" }). Null when either is unknown.
 */
export function countStudySemesters(enrollmentYear, academicYear) {
  if (!enrollmentYear || !academicYear?.year) return null;
  const intake = Number(enrollmentYear);
  const startYear = Number(String(academicYear.year).split("/")[0]);
  if (!Number.isInteger(intake) || !Number.isInteger(startYear)) return null;
  const semesters = (startYear - intake) * 2 + (academicYear.semester === "genap" ? 2 : 1);
  return semesters > 0 ? semesters : null;
}

/** "Dengan Pujian", "Sangat Memuaskan", "Memuaskan", or null (no predicate, or the GPA is unknown). */
export function computeGraduationPredicate({ gpa, studySemesters }) {
  const value = Number(gpa);
  if (gpa === null || gpa === undefined || !Number.isFinite(value)) return null;
  if (value > RULES.withPraiseMinGpaExclusive) {
    return studySemesters !== null && studySemesters !== undefined && studySemesters <= RULES.withPraiseMaxSemesters
      ? GRADUATION_PREDICATE.WITH_PRAISE
      : GRADUATION_PREDICATE.VERY_SATISFACTORY;
  }
  if (value >= RULES.verySatisfactoryMinGpa) return GRADUATION_PREDICATE.VERY_SATISFACTORY;
  if (value >= RULES.satisfactoryMinGpa) return GRADUATION_PREDICATE.SATISFACTORY;
  return null;
}

/** "9 semester (4 tahun 6 bulan)", or "-" when unknown. */
export function formatStudyLength(studySemesters) {
  if (!studySemesters) return "-";
  const years = Math.floor(studySemesters / 2);
  const months = (studySemesters % 2) * 6;
  const parts = [years ? `${years} tahun` : null, months ? `${months} bulan` : null].filter(Boolean).join(" ");
  return `${studySemesters} semester (${parts})`;
}

/**
 * Predicate and study length of one student. The end semester is the one of the given yudisium
 * period, else of the student's latest yudisium participation, else the running semester.
 */
export async function getStudentGraduationSummary(studentId, { academicYear = null, client = prisma } = {}) {
  const student = await client.student.findUnique({ where: { id: studentId }, select: { gpa: true, enrollmentYear: true } });
  if (!student) return { predicate: null, studySemesters: null, studyLength: "-" };
  let endYear = academicYear;
  if (!endYear) {
    const participation = await client.yudisiumParticipant.findFirst({
      where: { thesis: { studentId }, yudisium: { academicYearId: { not: null } } },
      orderBy: { createdAt: "desc" },
      select: { yudisium: { select: { academicYear: { select: { year: true, semester: true } } } } },
    });
    endYear = participation?.yudisium?.academicYear ?? (await client.academicYear.findFirst({ where: { isActive: true }, select: { year: true, semester: true } }));
  }
  return summarize(student, endYear);
}

/** The same, for rows already loaded: `student` { gpa, enrollmentYear }, `academicYear` { year, semester }. */
export function summarize(student, academicYear) {
  const studySemesters = countStudySemesters(student?.enrollmentYear, academicYear);
  return {
    predicate: computeGraduationPredicate({ gpa: student?.gpa, studySemesters }),
    studySemesters,
    studyLength: formatStudyLength(studySemesters),
  };
}

/** Summaries of many students in two queries: Map studentId → { predicate, studySemesters, studyLength }. */
export async function getGraduationSummaries(students, { client = prisma } = {}) {
  const ids = students.map((s) => s.id).filter(Boolean);
  const [participations, active] = await Promise.all([
    ids.length
      ? client.yudisiumParticipant.findMany({
        where: { thesis: { studentId: { in: ids } }, yudisium: { academicYearId: { not: null } } },
        orderBy: { createdAt: "desc" },
        select: { thesis: { select: { studentId: true } }, yudisium: { select: { academicYear: { select: { year: true, semester: true } } } } },
      })
      : [],
    client.academicYear.findFirst({ where: { isActive: true }, select: { year: true, semester: true } }),
  ]);
  const yearOf = new Map();
  for (const p of participations) {
    if (!yearOf.has(p.thesis.studentId)) yearOf.set(p.thesis.studentId, p.yudisium.academicYear);
  }
  return new Map(students.map((s) => [s.id, summarize(s, yearOf.get(s.id) ?? active)]));
}
