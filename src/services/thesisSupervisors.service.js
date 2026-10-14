/**
 * Thesis supervisors service — FR-CHG-02: KaDep/Admin assigns Pembimbing 2 (co-advisor)
 */
import { hasPembimbing2, createThesisSupervisors, markSupervisor2RequestsProcessedForThesis } from '../repositories/thesisGuidance/supervisor2.repository.js';
import prisma from '../config/prisma.js';
import { createNotificationsForUsers } from './notification.service.js';
import { sendFcmToUsers } from './push.service.js';
import { logAudit, AUDIT_ACTIONS, ENTITY_TYPES } from './auditLog.service.js';
import { toTitleCaseName } from '../utils/global.util.js';

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
 * KaDep or Admin assigns Pembimbing 2 to a proposal-phase thesis directly (bypasses the
 * supervision limit; prerogative of the Head of Department). No co-sign step (K9).
 */
export async function assignCoAdvisor(thesisId, lecturerId, actorUserId) {
  const thesis = await prisma.thesis.findUnique({
    where: { id: thesisId },
    include: {
      student: { include: { user: { select: { id: true, fullName: true } } } },
      thesisSupervisors: { where: { status: 'active' }, include: { lecturer: true, role: true } },
    },
  });

  if (!thesis) {
    throw new NotFoundError('Tugas akhir tidak ditemukan');
  }
  // Direct assignment is a proposal-phase path. A research thesis gets its Pembimbing 2
  // through Pengajuan Perubahan Tugas Akhir (thesis-change-request.service.js).
  if (thesis.status !== 'proposal') {
    throw new BadRequestError(
      'Penetapan langsung Pembimbing 2 hanya untuk tugas akhir berstatus "Proposal". Untuk fase penelitian, gunakan Pengajuan Perubahan Tugas Akhir.'
    );
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

  await prisma.$transaction(async (tx) => {
    await createThesisSupervisors(thesisId, lecturerId, tx);

    // Celah #4: Cleanup pending student requests untuk thesis ini (hindari status stale).
    await markSupervisor2RequestsProcessedForThesis(thesisId, tx);
  });

  // Celah #7: Notifikasi ke semua pihak terkait.
  const lecturerName = toTitleCaseName(lecturer.user?.fullName || 'Dosen');
  const studentUserId = thesis.student?.user?.id;
  const studentName = thesis.student?.user?.fullName
    ? toTitleCaseName(thesis.student.user.fullName)
    : 'Mahasiswa';

  // Notifikasi ke P2 baru.
  await createNotificationsForUsers([lecturerId], {
    title: 'Penetapan Pembimbing 2',
    message: `Anda ditetapkan sebagai Pembimbing 2 untuk tugas akhir ${studentName} oleh Ketua Departemen.`,
  });
  await sendFcmToUsers([lecturerId], {
    title: 'Penetapan Pembimbing 2',
    body: `Anda ditetapkan sebagai Pembimbing 2 untuk tugas akhir ${studentName}.`,
    data: { type: 'supervisor2_kadep_assigned', thesisId },
    dataOnly: true,
  });

  // Notifikasi ke mahasiswa.
  if (studentUserId) {
    await createNotificationsForUsers([studentUserId], {
      title: 'Pembimbing 2 Ditetapkan',
      message: `Ketua Departemen menetapkan ${lecturerName} sebagai Pembimbing 2 Anda.`,
    });
    await sendFcmToUsers([studentUserId], {
      title: 'Pembimbing 2 Ditetapkan',
      body: `${lecturerName} ditetapkan sebagai Pembimbing 2 Anda oleh KaDep.`,
      data: { type: 'supervisor2_kadep_assigned', thesisId },
      dataOnly: true,
    });
  }

  // Celah #7: Audit trail.
  await logAudit({
    actorUserId: actorUserId || null,
    action: AUDIT_ACTIONS.REQUEST_ADVISOR_KADEP_APPROVED,
    entityType: ENTITY_TYPES.SUPERVISOR2_REQUEST,
    entityId: thesisId,
    newValues: { thesisId, lecturerId, lecturerName, role: 'pembimbing_2', viaJalurB: true },
  });

  return {
    message: 'Pembimbing 2 berhasil ditetapkan',
    thesisId,
    lecturerId,
    lecturerName,
  };
}
