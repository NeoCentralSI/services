/**
 * Thesis supervisors service — FR-CHG-02: KaDep/Admin assigns Pembimbing 2 (co-advisor)
 */
import { hasPembimbing2, createThesisSupervisors } from '../repositories/thesisGuidance/supervisor2.repository.js';
import prisma from '../config/prisma.js';
import { ROLES } from '../constants/roles.js';

class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.statusCode = 404;
  }
}

class BadRequestError extends Error {
  constructor(message) {
    super(message);
    this.statusCode = 400;
  }
}

/**
 * KaDep or Admin assigns Pembimbing 2 (co-advisor) to a thesis
 */
export async function assignCoAdvisor(thesisId, lecturerId) {
  const thesis = await prisma.thesis.findUnique({
    where: { id: thesisId },
    include: {
      student: { include: { user: { select: { id: true, fullName: true } } } },
      thesisSupervisors: { include: { lecturer: true, role: true } },
    },
  });

  if (!thesis) {
    throw new NotFoundError('Tugas akhir tidak ditemukan');
  }

  const alreadyHas = await hasPembimbing2(thesisId);
  if (alreadyHas) {
    throw new BadRequestError('Mahasiswa ini sudah memiliki Pembimbing 2');
  }

  const lecturer = await prisma.lecturer.findUnique({
    where: { id: lecturerId },
    include: { user: { select: { fullName: true } } },
  });
  if (!lecturer) {
    throw new NotFoundError('Dosen tidak ditemukan');
  }

  const isAlreadySupervisor = thesis.thesisSupervisors.some(
    (s) => s.lecturerId === lecturerId
  );
  if (isAlreadySupervisor) {
    throw new BadRequestError('Dosen ini sudah terdaftar sebagai pembimbing mahasiswa tersebut');
  }

  await createThesisSupervisors(thesisId, lecturerId);

  return {
    message: 'Pembimbing 2 berhasil ditetapkan',
    thesisId,
    lecturerId,
    lecturerName: lecturer.user?.fullName || 'Dosen',
  };
}
