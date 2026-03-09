import * as repository from '../repositories/assessment.repository.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';

const PASS_THRESHOLD = 60;

// ── Criteria ──────────────────────────────────────────────────────────

export const getCriteria = async (formCode) => {
  const criteria = await repository.findCriteriaByFormCode(formCode);
  return criteria.map((c) => ({
    id: c.id,
    code: c.code,
    name: c.name,
    maxWeight: c.maxWeight,
    description: c.cpmk?.description ?? '',
  }));
};

// ── Supervisor queue & scoring (TA-03A) ───────────────────────────────

export const getSupervisorQueue = async (lecturerId) => {
  const theses = await repository.findSupervisorScoringQueue(lecturerId);
  return theses.map((thesis) => {
    const existingScore = thesis.researchMethodScores?.[0];
    return {
      thesisId: thesis.id,
      studentName: thesis.student?.user?.fullName ?? '—',
      studentNim: thesis.student?.user?.identityNumber ?? '—',
      proposedTitle: thesis.title,
      existingScore: existingScore?.supervisorScore ?? null,
      isScored: !!existingScore,
    };
  });
};

export const submitSupervisorScore = async (thesisId, lecturerId, dto) => {
  if (!dto.scores || dto.scores.length === 0) {
    throw new BadRequestError('Skor rubrik wajib diisi');
  }

  const totalScore = dto.scores.reduce((a, s) => a + s.score, 0);

  await repository.upsertScore({
    thesisId,
    supervisorScore: totalScore,
    metopenLecturerId: lecturerId,
    metopenLecturerScore: 0,
    calculatedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return { success: true, score: totalScore };
};

// ── Metopen lecturer queue & scoring (TA-03B) ─────────────────────────

export const getMetopenQueue = async (lecturerId) => {
  const theses = await repository.findMetopenScoringQueue(lecturerId);
  return theses.map((thesis) => {
    const existingScore = thesis.researchMethodScores?.[0];
    const supervisor = thesis.thesisSupervisors?.[0]?.lecturer?.user?.fullName;
    return {
      thesisId: thesis.id,
      studentName: thesis.student?.user?.fullName ?? '—',
      studentNim: thesis.student?.user?.identityNumber ?? '—',
      proposedTitle: thesis.title,
      supervisorName: supervisor ?? null,
      existingScore: existingScore?.supervisorScore ?? null,
      isScored: !!existingScore,
    };
  });
};

export const submitMetopenScore = async (thesisId, lecturerId, dto) => {
  if (!dto.scores || dto.scores.length === 0) {
    throw new BadRequestError('Skor rubrik wajib diisi');
  }

  const ta03bScore = dto.scores.reduce((a, s) => a + s.score, 0);
  const existing = await repository.findScoreByThesisId(thesisId);
  const ta03aScore = existing?.supervisorScore ?? 0;
  const finalScore = ta03aScore + ta03bScore;

  await repository.upsertScore({
    thesisId,
    supervisorScore: ta03aScore,
    metopenLecturerId: lecturerId,
    metopenLecturerScore: ta03bScore,
    calculatedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return {
    thesisId,
    supervisorScore: ta03aScore,
    metopenLecturerScore: ta03bScore,
    finalScore,
    isPassed: finalScore >= PASS_THRESHOLD,
  };
};

export const publishFinalScore = async (thesisId, lecturerId) => {
  const existing = await repository.findScoreByThesisId(thesisId);
  if (!existing) throw new NotFoundError('Nilai belum diisi');

  const finalScore = (existing.supervisorScore ?? 0) + (existing.metopenLecturerScore ?? 0);

  return {
    thesisId,
    supervisorScore: existing.supervisorScore,
    metopenLecturerScore: existing.metopenLecturerScore,
    finalScore,
    isPassed: finalScore >= PASS_THRESHOLD,
  };
};
