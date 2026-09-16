/**
 * Repository untuk kelengkapan `StudentAcademicYearSnapshot` per periode.
 *
 * Query layer saja: hitung cakupan snapshot satu periode, ambil observasi
 * akademik terakhir yang tersimpan di `students`, dan tulis baris snapshot yang
 * belum ada. Aturan bisnis (idempotensi, fill-only-null) ada di
 * `studentPeriodSnapshot.service.js`.
 *
 * Canon ref: §5.1 (source of truth eligibility SIA), KC-20260731-02 (seluruh
 * snapshot wajib period-scoped).
 */

import prisma from "../config/prisma.js";

const STUDENT_OBSERVATION_SELECT = {
  id: true,
  eligibleMetopen: true,
  researchMethodCompleted: true,
  metopenEligibilitySource: true,
  metopenEligibilityUpdatedAt: true,
  takingThesisCourse: true,
  thesisCourseEnrollmentSource: true,
  thesisCourseEnrollmentUpdatedAt: true,
};

const SNAPSHOT_STATE_SELECT = {
  id: true,
  studentId: true,
  eligibleMetopen: true,
  takingThesisCourse: true,
};

export function findAcademicYearById(academicYearId, client = prisma) {
  return client.academicYear.findUnique({
    where: { id: academicYearId },
    select: {
      id: true,
      year: true,
      semester: true,
      startDate: true,
      endDate: true,
      isActive: true,
    },
  });
}

export function countStudents(client = prisma) {
  return client.student.count();
}

/**
 * Mahasiswa yang punya minimal satu observasi akademik tersimpan di `students`.
 * `null` tidak pernah diartikan `false` (KC-20260731-02).
 */
export function findStudentAcademicObservations(client = prisma) {
  return client.student.findMany({
    where: {
      OR: [
        { eligibleMetopen: { not: null } },
        { takingThesisCourse: { not: null } },
      ],
    },
    select: STUDENT_OBSERVATION_SELECT,
    orderBy: { id: "asc" },
  });
}

export function findSnapshotStatesForPeriod(academicYearId, client = prisma) {
  return client.studentAcademicYearSnapshot.findMany({
    where: { academicYearId },
    select: SNAPSHOT_STATE_SELECT,
  });
}

export function countSnapshotsForPeriod(academicYearId, client = prisma) {
  return client.studentAcademicYearSnapshot.count({ where: { academicYearId } });
}

export function countEligibleSnapshotsForPeriod(academicYearId, client = prisma) {
  return client.studentAcademicYearSnapshot.count({
    where: { academicYearId, eligibleMetopen: true },
  });
}

export function countThesisCourseSnapshotsForPeriod(academicYearId, client = prisma) {
  return client.studentAcademicYearSnapshot.count({
    where: { academicYearId, takingThesisCourse: { not: null } },
  });
}

/**
 * Tulis hasil backfill dalam satu transaksi.
 * `creates` memakai `skipDuplicates` sebagai lapis kedua di atas unique
 * `(student_id, academic_year_id)`; `fills` hanya mengisi kolom yang masih NULL
 * (payload sudah disaring di service). Tidak ada operasi delete di sini.
 */
export async function applyPeriodSnapshotBackfill(
  { creates = [], fills = [] },
  client = prisma,
) {
  const operations = [];
  if (creates.length > 0) {
    operations.push(
      client.studentAcademicYearSnapshot.createMany({
        data: creates,
        skipDuplicates: true,
      }),
    );
  }
  for (const fill of fills) {
    operations.push(
      client.studentAcademicYearSnapshot.update({
        where: { id: fill.id },
        data: fill.data,
      }),
    );
  }
  if (operations.length === 0) {
    return { created: 0, filled: 0 };
  }

  const results = await client.$transaction(operations);
  const created = creates.length > 0 ? (results[0]?.count ?? 0) : 0;
  return { created, filled: fills.length };
}
