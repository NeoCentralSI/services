import prisma from "../../config/prisma.js";

/**
 * Academic flags per student per semester (plan 10.6, K11): whether the student takes Metode
 * Penelitian and whether the student takes Tugas Akhir in that semester. They come from SIA
 * (read only) or from DevTools, and live in `student_academic_year_snapshots`.
 */

/** Value of `ExternalAcademicSnapshotSource`. */
export const ACADEMIC_FLAG_SOURCE = Object.freeze({ SIA: "sia", DEVTOOLS: "devtools" });

/**
 * Write the semester flags SIA reports for one period (`GET /enrollments` of the dummy-SIA
 * contract: nim, takesResearchMethod, takesThesis). SIA is the authority for the students it
 * lists: both flags are overwritten with source `sia`. Students SIA does not list keep theirs.
 * @returns {Promise<{ fetched: number, created: number, updated: number, unknownStudents: number }>}
 */
export async function applySiaEnrollments(academicYearId, rows = [], { capturedAt = new Date(), client = prisma } = {}) {
  const valid = rows.filter((r) => r?.nim && (typeof r.takesResearchMethod === "boolean" || typeof r.takesThesis === "boolean"));
  const users = valid.length
    ? await client.user.findMany({ where: { identityNumber: { in: valid.map((r) => String(r.nim)) }, student: { isNot: null } }, select: { id: true, identityNumber: true } })
    : [];
  const userOf = new Map(users.map((u) => [u.identityNumber, u.id]));
  const existing = users.length
    ? await client.studentAcademicYearSnapshot.findMany({ where: { academicYearId, studentId: { in: users.map((u) => u.id) } }, select: { studentId: true } })
    : [];
  const has = new Set(existing.map((e) => e.studentId));
  let created = 0;
  let updated = 0;
  for (const row of valid) {
    const studentId = userOf.get(String(row.nim));
    if (!studentId) continue;
    await setStudentPeriodFlags(
      studentId,
      academicYearId,
      {
        ...(typeof row.takesResearchMethod === "boolean" ? { eligibleResearchMethod: row.takesResearchMethod } : {}),
        ...(typeof row.takesThesis === "boolean" ? { takingThesisCourse: row.takesThesis } : {}),
      },
      { source: ACADEMIC_FLAG_SOURCE.SIA, client, now: capturedAt },
    );
    if (has.has(studentId)) updated += 1;
    else created += 1;
  }
  return { fetched: rows.length, created, updated, unknownStudents: valid.length - users.length };
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
