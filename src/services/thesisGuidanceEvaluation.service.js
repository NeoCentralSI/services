/**
 * TA-17: Evaluasi Bimbingan Berkala (FR-EVL-01)
 * 6 bulan: peringatan + perpanjangan 1 bulan atau wajib ulang proposal
 * 1 tahun: rekomendasi penghentian bimbingan (harus disetujui KaDep)
 */
import * as repo from '../repositories/thesisGuidanceEvaluation.repository.js';
import { ROLES } from '../constants/roles.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';
import { createNotificationsForUsers } from './notification.service.js';

const EVALUATION_TYPES = {
  SIX_MONTH: 'six_month',
  ONE_YEAR: 'one_year',
};

const RECOMMENDATIONS = {
  EXTEND_ONE_MONTH: 'extend_1_month',
  REVISE_PROPOSAL: 'revise_proposal',
  TERMINATE_SUPERVISION: 'terminate_supervision',
};

/**
 * Dosen Pembimbing submits evaluation (6 month or 1 year)
 */
export async function submitEvaluation(lecturerId, data) {
  const { thesisId, evaluationType, recommendation, notes } = data;

  if (![EVALUATION_TYPES.SIX_MONTH, EVALUATION_TYPES.ONE_YEAR].includes(evaluationType)) {
    throw new BadRequestError('Jenis evaluasi harus six_month atau one_year');
  }

  const validRecs =
    evaluationType === EVALUATION_TYPES.SIX_MONTH
      ? [RECOMMENDATIONS.EXTEND_ONE_MONTH, RECOMMENDATIONS.REVISE_PROPOSAL]
      : [RECOMMENDATIONS.TERMINATE_SUPERVISION];
  if (!validRecs.includes(recommendation)) {
    throw new BadRequestError(
      `Rekomendasi untuk ${evaluationType} harus salah satu: ${validRecs.join(', ')}`
    );
  }

  const thesisSupervisor = await repo.findThesisSupervisor(
    thesisId, lecturerId, [ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2]
  );

  if (!thesisSupervisor) {
    throw new NotFoundError('Anda bukan pembimbing aktif untuk tugas akhir ini');
  }

  const existing = await repo.findPendingEvaluation(thesisSupervisor.id);
  if (existing) {
    throw new BadRequestError('Sudah ada evaluasi yang menunggu persetujuan KaDep');
  }

  const evalRecord = await repo.createEvaluation({
    thesisId,
    thesisSupervisorId: thesisSupervisor.id,
    evaluationType,
    recommendation,
    notes: notes || null,
    status: 'pending',
  });

  // Notify KaDep
  const kadepUsers = await repo.findUsersByActiveRole(ROLES.KETUA_DEPARTEMEN);
  const studentName = thesisSupervisor.thesis?.student?.user?.fullName || 'Mahasiswa';
  const typeLabel = evaluationType === EVALUATION_TYPES.SIX_MONTH ? '6 bulan' : '1 tahun';
  const msg = `Evaluasi bimbingan ${typeLabel} untuk ${studentName} menunggu persetujuan.`;

  if (kadepUsers.length > 0) {
    await createNotificationsForUsers(
      kadepUsers.map((u) => u.id),
      { title: 'Evaluasi Bimbingan TA-17', message: msg }
    );
  }

  return evalRecord;
}

/**
 * KaDep approves or rejects evaluation
 */
export async function kadepReviewEvaluation(evaluationId, userId, data) {
  const { action, kadepNotes } = data;

  const evaluation = await repo.findEvaluationById(evaluationId);

  if (!evaluation) {
    throw new NotFoundError('Evaluasi tidak ditemukan');
  }
  if (evaluation.status !== 'pending') {
    throw new BadRequestError('Evaluasi ini sudah diproses');
  }

  if (action === 'approve') {
    return repo.approveEvaluation(evaluationId, userId, kadepNotes);
  } else if (action === 'reject') {
    return repo.rejectEvaluation(evaluationId, userId, kadepNotes);
  }

  throw new BadRequestError('Aksi harus approve atau reject');
}

/**
 * Get pending evaluations for KaDep
 */
export async function getPendingEvaluations() {
  return repo.findPendingEvaluations();
}

/**
 * Get evaluations for a thesis (lecturer)
 */
export async function getEvaluationsForThesis(thesisId, lecturerId) {
  const supervisor = await repo.findSupervisorId(thesisId, lecturerId);
  if (!supervisor) return [];

  return repo.findEvaluationsForThesis(supervisor.id);
}
