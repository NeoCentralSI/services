/**
 * Thesis supervisors service — FR-CHG-02: KaDep/Admin assigns Pembimbing 2 (co-advisor)
 */
import { hasPembimbing2, createThesisSupervisors, markSupervisor2RequestsProcessedForThesis } from '../repositories/thesisGuidance/supervisor2.repository.js';
import prisma from '../config/prisma.js';
import { ROLES } from '../constants/roles.js';
import { syncQuotaCount } from '../utils/quotaSync.js';
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
 * KaDep or Admin assigns Pembimbing 2 (co-advisor) to a thesis.
 * Jalur B: bypass kuota (hak prerogatif KaDep), tapi tetap reset isFinalized
 * dan dequeue TA-04 jika P1 sudah submit tanpa co-sign P2.
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

    // Reset isFinalized jika score sudah di-finalize tanpa co-sign P2 — hindari deadlock.
    const existingScore = await tx.researchMethodScore.findFirst({
      where: { thesisId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, isFinalized: true, coSignedAt: true, supervisorScore: true },
    });
    if (existingScore?.isFinalized && !existingScore.coSignedAt && existingScore.supervisorScore != null) {
      await tx.researchMethodScore.update({
        where: { id: existingScore.id },
        data: { isFinalized: false, finalizedBy: null, finalizedAt: null },
      });
    }

    if (thesis.proposalStatus === 'accepted') {
      await tx.thesis.update({
        where: { id: thesisId },
        data: { titleApprovalDocumentId: null },
      });
    }

    // Celah #4: Cleanup pending student requests untuk thesis ini (hindari status stale).
    await markSupervisor2RequestsProcessedForThesis(thesisId, tx);
  });

  if (thesis.academicYearId) {
    await syncQuotaCount(prisma, lecturerId, thesis.academicYearId);
  }

  // Backward-compatible lifecycle sync after P2 assignment.
  let dequeued = false;
  try {
    const { syncKadepProposalQueueByThesisId } = await import('./metopen.service.js');
    const syncResult = await syncKadepProposalQueueByThesisId(thesisId);
    dequeued = syncResult?.dequeued === true;
  } catch (syncErr) {
    console.warn('[thesisSupervisors] TA-04 lifecycle sync failed:', syncErr?.message || syncErr);
  }

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

  // Notifikasi dequeue ke P1 + P2 jika thesis di-dequeue dari TA-04.
  if (dequeued) {
    const p1 = thesis.thesisSupervisors.find(
      (s) => s.role?.name === ROLES.PEMBIMBING_1
    );
    const cosignTargets = [lecturerId];
    if (p1?.lecturerId) cosignTargets.push(p1.lecturerId);
    await createNotificationsForUsers(cosignTargets, {
      title: 'Co-sign Pembimbing 2 Diperlukan',
      message: `${lecturerName} ditambahkan sebagai Pembimbing 2. Promosi aktif menunggu co-sign TA-03A diberikan.`,
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
