import prisma from "../../config/prisma.js";
import {
  ASSESSOR,
  ASSESSOR_LABELS,
  DEFAULT_MINIMUM_SCORE,
  LOCKED_MINIMUM_REASON,
  PROPOSAL_PASSED_MESSAGE,
  RESEARCH_METHOD_RESULT,
} from "../../constants/research-method.js";
import { ROLES } from "../../constants/roles.js";
import { CLOSED_THESIS_STATUSES, THESIS_STATUS } from "../../constants/thesisStatus.js";
import { formatAcademicYearLabel, resolveOperationalAcademicYear } from "../../helpers/academicYear.helper.js";
import { uploadUrl } from "../../helpers/guidanceFile.helper.js";
import * as repo from "../../repositories/research-method/assessment.repository.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../utils/errors.js";
import { AUDIT_ACTIONS, ENTITY_TYPES, logAudit } from "../auditLog.service.js";
import { createNotificationEventForUsers } from "../notification.service.js";
import { changeThesisStatus } from "../thesisLifecycle.service.js";

/**
 * Penilaian Proposal, in the form of the Sidang TA assessment. The supervisor (Pembimbing 1, or
 * Pembimbing 2 as a backup) and the Research Method coordinator each score their own criteria of the
 * semester, in any order. Each party may save a draft as often as needed; a draft is never shown to
 * the other party and never counts. Sending locks the party's score. When the second score is sent
 * the attempt is final: passed when the sum reaches the semester's minimum. A pass moves the thesis
 * to the research phase in the same transaction. Class attendance is the course's business (SIA)
 * and plays no part here.
 */

const PARTY_LABEL = ASSESSOR_LABELS;
const OTHER = { [ASSESSOR.SUPERVISOR]: ASSESSOR.COORDINATOR, [ASSESSOR.COORDINATOR]: ASSESSOR.SUPERVISOR };

export function minimumScoreOf(academicYear) {
  return academicYear?.researchMethodMinimumScore ?? DEFAULT_MINIMUM_SCORE;
}

function normalizeScore(value, name) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric)) throw new BadRequestError(`Skor ${name} wajib berupa bilangan bulat.`);
  if (numeric < 0) throw new BadRequestError(`Skor ${name} tidak boleh negatif.`);
  return numeric;
}

function criterionDto(c) {
  return { id: c.id, name: c.name, maxScore: c.maxScore, cpmk: c.researchMethodCpmk, rubrics: c.assessmentRubrics };
}

/** The form of one assessor for a semester: criteria with their rubrics, weight, minimum. */
export async function getAssessmentForm(party, academicYearId) {
  if (!Object.values(ASSESSOR).includes(party)) throw new BadRequestError("Penilai harus pembimbing atau koordinator.");
  const year = await repo.findAcademicYear(academicYearId);
  if (!year) throw new NotFoundError("Periode akademik tidak ditemukan.");
  const criteria = await repo.findCriteria(party, year.id);
  return {
    party,
    academicYear: { id: year.id, label: formatAcademicYearLabel(year) },
    weight: criteria.reduce((sum, c) => sum + c.maxScore, 0),
    minimumScore: minimumScoreOf(year),
    criteria: criteria.map(criterionDto),
  };
}

/** The rubric whose range holds the score (kept with the detail as a record), or null. */
export function rubricFor(criterion, score) {
  return (criterion.assessmentRubrics ?? []).find((r) => score >= r.minScore && score <= r.maxScore) ?? null;
}

/**
 * Whole numbers from 0 to the criterion's maximum, each criterion once. Sending needs every
 * criterion; a draft may leave some empty. The rubric is a reference, not a choice.
 */
export async function validateScores(party, scores, academicYearId, { isDraft = false } = {}) {
  if (!Array.isArray(scores)) throw new BadRequestError("Nilai per kriteria wajib diisi.");
  if (!isDraft && scores.length === 0) throw new BadRequestError("Nilai per kriteria wajib diisi.");
  const criteria = await repo.findCriteria(party, academicYearId);
  if (criteria.length === 0) throw new BadRequestError(`Kriteria penilaian ${PARTY_LABEL[party]} semester ini belum dikonfigurasi.`);
  const byId = new Map(criteria.map((c) => [c.id, c]));
  const seen = new Set();
  const details = scores.map((item) => {
    const criteriaId = String(item?.criteriaId ?? "").trim();
    const criterion = byId.get(criteriaId);
    if (!criterion) throw new BadRequestError(`Kriteria ${criteriaId || "(kosong)"} tidak berlaku untuk penilaian ${PARTY_LABEL[party]}.`);
    if (seen.has(criteriaId)) throw new BadRequestError(`Kriteria ${criterion.name} dikirim lebih dari satu kali.`);
    seen.add(criteriaId);
    const score = normalizeScore(item.score, criterion.name);
    if (score > criterion.maxScore) throw new BadRequestError(`Skor ${criterion.name} melebihi batas maksimum ${criterion.maxScore}.`);
    return { criteriaId, rubricId: rubricFor(criterion, score)?.id ?? null, score };
  });
  if (!isDraft) {
    const missing = criteria.filter((c) => !seen.has(c.id));
    if (missing.length) throw new BadRequestError(`Semua kriteria wajib dinilai. Belum ada nilai untuk: ${missing.map((c) => c.name).join(", ")}.`);
  }
  return { total: details.reduce((sum, d) => sum + d.score, 0), details };
}

const activeSupervisor = (attempt, lecturerId) =>
  attempt.thesis.thesisSupervisors.find((s) => s.lecturerId === lecturerId) ?? null;

const scoreOf = (attempt, party) => (party === ASSESSOR.SUPERVISOR ? attempt.supervisorScore : attempt.coordinatorScore);
const detailsOf = (attempt, party) => (party === ASSESSOR.SUPERVISOR ? attempt.supervisorDetails : attempt.coordinatorDetails) ?? [];

/** Why this party cannot score the attempt now, or null. */
export function scoringBlockReason(attempt, party, operationalYearId) {
  if (attempt.academicYearId !== operationalYearId) return "Penilaian hanya dapat dikirim pada semester berjalan. Semester ini ditampilkan sebagai riwayat.";
  if (attempt.thesis.student?.status !== "active") return "Mahasiswa tidak aktif. Penilaian hanya untuk mahasiswa aktif.";
  if (CLOSED_THESIS_STATUSES.includes(attempt.thesis.status)) return "Tugas akhir ini sudah berakhir.";
  if (!attempt.thesis.supervisorAssignedAt) return "Penilaian menunggu Penetapan Pembimbing.";
  if (!attempt.proposalFilePath) return "Mahasiswa belum mengajukan proposal final.";
  if (attempt.isFinalized) return "Penilaian proposal sudah final.";
  if (scoreOf(attempt, party) != null) return `Nilai ${PARTY_LABEL[party]} sudah dikirim dan terkunci.`;
  return null;
}

export function decideResult(finalScore, minimum) {
  return finalScore >= minimum ? RESEARCH_METHOD_RESULT.PASSED : RESEARCH_METHOD_RESULT.FAILED;
}

async function notifyProgress(attempt, party, finalized) {
  try {
    const name = attempt.thesis.student?.user?.fullName ?? "Mahasiswa";
    const title = attempt.thesis.title || "proposal";
    const data = { thesisId: attempt.thesis.id, assessmentId: attempt.id };
    if (finalized) {
      if (finalized.result === RESEARCH_METHOD_RESULT.PASSED) {
        await createNotificationEventForUsers([attempt.thesis.student.id, ...attempt.thesis.thesisSupervisors.map((s) => s.lecturerId)], {
          title: "Proposal Lulus",
          message: PROPOSAL_PASSED_MESSAGE,
          type: "research_method_promoted",
          data: { ...data, route: "/tugas-akhir" },
        }, { push: true });
        return;
      }
      await createNotificationEventForUsers([attempt.thesis.student.id], {
        title: "Nilai Proposal Final",
        message: `Nilai proposal "${title}" sudah final: ${finalized.finalScore} (Tidak Lulus). Ajukan proposal final baru pada semester berikutnya; pembimbing dan judul tetap.`,
        type: "research_method_assessment_finalized",
        data: { ...data, route: "/tugas-akhir/proposal" },
      }, { push: true });
      return;
    }
    if (party === ASSESSOR.SUPERVISOR) {
      const coordinators = await repo.findCoordinatorUserIds();
      await createNotificationEventForUsers(coordinators, {
        title: "Penilaian Proposal Menunggu Koordinator",
        message: `Pembimbing sudah menilai proposal ${name}. Nilai koordinator untuk "${title}" belum dikirim.`,
        type: "research_method_coordinator_pending",
        data: { ...data, route: `/metode-penelitian/penilaian/${attempt.id}` },
      }, { push: true });
    } else {
      await createNotificationEventForUsers(attempt.thesis.thesisSupervisors.map((s) => s.lecturerId), {
        title: "Penilaian Proposal Menunggu Pembimbing",
        message: `Koordinator sudah menilai proposal ${name}. Nilai pembimbing untuk "${title}" belum dikirim.`,
        type: "research_method_supervisor_pending",
        data: { ...data, route: `/tugas-akhir/proposal/penilaian/${attempt.id}` },
      }, { push: true });
    }
  } catch (error) {
    console.error("[research-method:assessment] notifikasi gagal:", error?.message ?? error);
  }
}

/**
 * Save a draft or send one assessor's score. Supervisor: an active Pembimbing 1 or 2 of the thesis.
 * Coordinator: the role is checked by the route. The second sent score finalizes the attempt; a pass
 * moves the thesis to research (start date, audit) in the same transaction.
 */
export async function submitScore(assessmentId, party, userId, scores, { isDraft = false } = {}) {
  const attempt = await repo.findAttempt(assessmentId);
  if (!attempt) throw new NotFoundError("Penilaian proposal tidak ditemukan.");
  if (party === ASSESSOR.SUPERVISOR && !activeSupervisor(attempt, userId)) {
    throw new ForbiddenError("Hanya Pembimbing 1 atau Pembimbing 2 aktif yang dapat mengisi nilai pembimbing.");
  }
  const operational = await resolveOperationalAcademicYear();
  const blocked = scoringBlockReason(attempt, party, operational?.id);
  if (blocked) {
    const locked = attempt.isFinalized || scoreOf(attempt, party) != null;
    throw locked || attempt.academicYearId !== operational?.id ? new ForbiddenError(blocked) : new BadRequestError(blocked);
  }
  const { total, details } = await validateScores(party, scores, attempt.academicYearId, { isDraft });
  const minimum = minimumScoreOf(attempt.academicYear);

  const outcome = await prisma.$transaction(async (tx) => {
    await repo.lockAttempt(tx, attempt.id);
    const current = await tx.researchMethodAssessment.findUnique({ where: { id: attempt.id } });
    if (current.isFinalized) throw new ForbiddenError("Penilaian proposal sudah final dan tidak dapat diubah.");
    if (scoreOf(current, party) != null) throw new ForbiddenError(`Nilai ${PARTY_LABEL[party]} sudah dikirim dan terkunci.`);
    await repo.replaceDetails(party, attempt.id, details, tx);
    if (isDraft) return { finalized: null, promoted: false };

    const now = new Date();
    const own = party === ASSESSOR.SUPERVISOR
      ? { supervisorId: userId, supervisorScore: total, supervisorScoredAt: now }
      : { coordinatorId: userId, coordinatorScore: total, coordinatorScoredAt: now };
    const other = scoreOf(current, OTHER[party]);
    const finalScore = other != null ? total + other : null;
    const completion = finalScore != null
      ? { finalScore, isFinalized: true, finalizedBy: userId, finalizedAt: now, result: decideResult(finalScore, minimum) }
      : {};
    const updated = await tx.researchMethodAssessment.update({ where: { id: attempt.id }, data: { ...own, ...completion } });
    if (!updated.isFinalized) return { finalized: null, promoted: false };

    // A pass starts the research phase at once: status, start date and the audit, in this transaction.
    let promoted = false;
    if (updated.result === RESEARCH_METHOD_RESULT.PASSED) {
      const thesis = await tx.thesis.findUnique({ where: { id: attempt.thesis.id } });
      if (thesis?.status === THESIS_STATUS.PROPOSAL) {
        await changeThesisStatus(tx, thesis, THESIS_STATUS.RESEARCH, { actorUserId: userId, now });
        await tx.auditLog.create({
          data: {
            userId,
            action: AUDIT_ACTIONS.RESEARCH_METHOD_PROMOTED,
            entity: ENTITY_TYPES.THESIS,
            entityId: thesis.id,
            changes: {
              oldValues: { status: THESIS_STATUS.PROPOSAL },
              newValues: { status: THESIS_STATUS.RESEARCH, startDate: now.toISOString() },
              metadata: { assessmentId: attempt.id, academicYearId: attempt.academicYearId, finalScore, minimumScore: minimum },
            },
          },
        });
        promoted = true;
      }
    }
    return { finalized: updated, promoted };
  });

  if (!isDraft) {
    await logAudit({
      actorUserId: userId,
      action: AUDIT_ACTIONS.RESEARCH_METHOD_ASSESSMENT_SUBMITTED,
      entityType: ENTITY_TYPES.RESEARCH_METHOD_ASSESSMENT,
      entityId: attempt.id,
      newValues: { party, score: total, ...(outcome.finalized ? { finalScore: outcome.finalized.finalScore, result: outcome.finalized.result } : {}) },
      metadata: { thesisId: attempt.thesis.id, academicYearId: attempt.academicYearId, minimumScore: minimum, movedToResearch: outcome.promoted },
    });
    await notifyProgress(attempt, party, outcome.finalized);
  }
  return getAttemptView(attempt.id);
}

function personName(lecturer) {
  return lecturer?.user?.fullName ?? null;
}

/** One attempt as the pages show it. A party's details show only once its score is sent. */
export async function getAttemptView(assessmentId) {
  const attempt = await repo.findAttempt(assessmentId);
  if (!attempt) throw new NotFoundError("Penilaian proposal tidak ditemukan.");
  return toView(attempt);
}

function toView(attempt, extra = {}) {
  return {
    id: attempt.id,
    academicYear: { id: attempt.academicYear.id, label: formatAcademicYearLabel(attempt.academicYear) },
    minimumScore: minimumScoreOf(attempt.academicYear),
    thesis: {
      id: attempt.thesis.id,
      title: attempt.thesis.title,
      status: attempt.thesis.status,
      supervisorAssignedAt: attempt.thesis.supervisorAssignedAt,
      supervisors: attempt.thesis.thesisSupervisors.map((s) => ({ lecturerId: s.lecturerId, fullName: personName(s.lecturer), role: s.role?.name ?? null })),
    },
    student: {
      id: attempt.thesis.student?.id,
      fullName: attempt.thesis.student?.user?.fullName ?? null,
      identityNumber: attempt.thesis.student?.user?.identityNumber ?? null,
    },
    proposal: attempt.proposalFilePath
      ? { fileName: attempt.proposalFileName, url: uploadUrl(attempt.proposalFilePath), submittedAt: attempt.proposalSubmittedAt }
      : null,
    supervisorScore: attempt.supervisorScore,
    supervisorScoredAt: attempt.supervisorScoredAt,
    supervisorName: personName(attempt.supervisor),
    supervisorDetails: attempt.supervisorScore != null ? attempt.supervisorDetails : [],
    coordinatorScore: attempt.coordinatorScore,
    coordinatorScoredAt: attempt.coordinatorScoredAt,
    coordinatorName: personName(attempt.coordinator),
    coordinatorDetails: attempt.coordinatorScore != null ? attempt.coordinatorDetails : [],
    finalScore: attempt.finalScore,
    isFinalized: attempt.isFinalized,
    finalizedAt: attempt.finalizedAt,
    result: attempt.result,
    ...extra,
  };
}

function rowFor(attempt, party, operationalYearId) {
  const block = scoringBlockReason(attempt, party, operationalYearId);
  const ownDraftSaved = scoreOf(attempt, party) == null && detailsOf(attempt, party).length > 0;
  return toView(attempt, { canScore: block === null, scoreBlockReason: block, ownDraftSaved });
}

/**
 * Tugas Akhir > Proposal (supervisor): proposal-phase students of this lecturer and every attempt
 * of the semester on their theses, with "Nilai Proposal" availability.
 */
export async function getSupervisorQueue(lecturerId, academicYearId = null) {
  const operational = await resolveOperationalAcademicYear();
  const yearId = academicYearId || operational?.id;
  if (!yearId) throw new BadRequestError("Periode akademik berjalan belum ditetapkan.");
  const year = await repo.findAcademicYear(yearId);
  if (!year) throw new NotFoundError("Periode akademik tidak ditemukan.");
  const [attempts, theses] = await Promise.all([
    repo.findAttemptsForSupervisor(lecturerId, year.id),
    yearId === operational?.id ? repo.findProposalThesesForSupervisor(lecturerId) : [],
  ]);
  const rows = attempts.map((attempt) => rowFor(attempt, ASSESSOR.SUPERVISOR, operational?.id));
  const withAttempt = new Set(attempts.map((a) => a.thesisId));
  const waiting = theses
    .filter((t) => !withAttempt.has(t.id))
    .map((thesis) => ({
      id: null,
      thesis: {
        id: thesis.id,
        title: thesis.title,
        status: thesis.status,
        supervisorAssignedAt: thesis.supervisorAssignedAt,
        supervisors: thesis.thesisSupervisors.map((s) => ({ lecturerId: s.lecturerId, fullName: personName(s.lecturer), role: s.role?.name ?? null })),
      },
      student: { id: thesis.student?.id, fullName: thesis.student?.user?.fullName ?? null, identityNumber: thesis.student?.user?.identityNumber ?? null },
      proposal: null,
      canScore: false,
      scoreBlockReason: thesis.supervisorAssignedAt ? "Mahasiswa belum mengajukan proposal final." : "Penilaian menunggu Penetapan Pembimbing.",
      ownDraftSaved: false,
    }));
  const all = [...rows, ...waiting].sort((a, b) => String(a.student.identityNumber).localeCompare(String(b.student.identityNumber)));
  return {
    academicYear: { id: year.id, label: formatAcademicYearLabel(year), isOperational: year.id === operational?.id },
    minimumScore: minimumScoreOf(year),
    rows: all,
  };
}

/** Metode Penelitian > Penilaian Proposal (coordinator only): every attempt with a final proposal. */
export async function getCoordinatorQueue(academicYearId = null) {
  const operational = await resolveOperationalAcademicYear();
  const yearId = academicYearId || operational?.id;
  if (!yearId) throw new BadRequestError("Periode akademik berjalan belum ditetapkan.");
  const year = await repo.findAcademicYear(yearId);
  if (!year) throw new NotFoundError("Periode akademik tidak ditemukan.");
  const attempts = (await repo.findAttemptsForPeriod(year.id)).filter((a) => a.proposalFilePath);
  const rows = attempts
    .map((attempt) => rowFor(attempt, ASSESSOR.COORDINATOR, operational?.id))
    .sort((a, b) => String(a.student.identityNumber).localeCompare(String(b.student.identityNumber)));
  return {
    academicYear: { id: year.id, label: formatAcademicYearLabel(year), isOperational: year.id === operational?.id },
    minimumScore: minimumScoreOf(year),
    rows,
  };
}

/**
 * The score page of one attempt for one party: the criteria with this party's draft or sent score,
 * and the other party's sent score (never its draft) as a read-only reference.
 */
export async function getScoreForm(assessmentId, party, userId) {
  const attempt = await repo.findAttempt(assessmentId);
  if (!attempt) throw new NotFoundError("Penilaian proposal tidak ditemukan.");
  if (party === ASSESSOR.SUPERVISOR && !activeSupervisor(attempt, userId)) {
    throw new ForbiddenError("Hanya Pembimbing 1 atau Pembimbing 2 aktif yang dapat membuka form nilai pembimbing.");
  }
  const otherParty = OTHER[party];
  const [operational, ownCriteria, otherCriteria, viewer] = await Promise.all([
    resolveOperationalAcademicYear(),
    repo.findCriteria(party, attempt.academicYearId),
    repo.findCriteria(otherParty, attempt.academicYearId),
    prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } }),
  ]);
  const ownScore = scoreOf(attempt, party);
  const ownDetails = new Map(detailsOf(attempt, party).map((d) => [d.assessmentCriteriaId, d.score]));
  const otherScore = scoreOf(attempt, otherParty);
  const otherDetails = new Map((otherScore != null ? detailsOf(attempt, otherParty) : []).map((d) => [d.assessmentCriteriaId, d.score]));
  const blockReason = scoringBlockReason(attempt, party, operational?.id);
  const sentBy = party === ASSESSOR.SUPERVISOR ? attempt.supervisor : attempt.coordinator;
  const otherBy = otherParty === ASSESSOR.SUPERVISOR ? attempt.supervisor : attempt.coordinator;
  const otherAt = otherParty === ASSESSOR.SUPERVISOR ? attempt.supervisorScoredAt : attempt.coordinatorScoredAt;
  return {
    party,
    academicYear: { id: attempt.academicYear.id, label: formatAcademicYearLabel(attempt.academicYear) },
    weight: ownCriteria.reduce((sum, c) => sum + c.maxScore, 0),
    minimumScore: minimumScoreOf(attempt.academicYear),
    criteria: ownCriteria.map((c) => ({ ...criterionDto(c), score: ownDetails.has(c.id) ? ownDetails.get(c.id) : null })),
    assessment: toView(attempt),
    own: {
      status: ownScore != null ? "submitted" : ownDetails.size > 0 ? "draft" : "empty",
      total: ownScore,
      submittedAt: party === ASSESSOR.SUPERVISOR ? attempt.supervisorScoredAt : attempt.coordinatorScoredAt,
      name: ownScore != null ? personName(sentBy) : viewer?.fullName ?? null,
    },
    other: {
      party: otherParty,
      submitted: otherScore != null,
      total: otherScore,
      weight: otherCriteria.reduce((sum, c) => sum + c.maxScore, 0),
      name: otherScore != null ? personName(otherBy) : null,
      submittedAt: otherScore != null ? otherAt : null,
      criteria: otherScore != null
        ? otherCriteria.map((c) => ({ id: c.id, name: c.name, cpmkCode: c.researchMethodCpmk.code, maxScore: c.maxScore, score: otherDetails.get(c.id) ?? null }))
        : [],
    },
    canEdit: blockReason === null,
    blockReason,
  };
}

/** Detail for the supervisor, the coordinator, Kadep/Sekdep/Admin, or the student (final only). */
export async function getAttemptForUser(assessmentId, userId, roles) {
  const attempt = await repo.findAttempt(assessmentId);
  if (!attempt) throw new NotFoundError("Penilaian proposal tidak ditemukan.");
  const privileged = roles.some((r) => [ROLES.KOORDINATOR_METODE_PENELITIAN, ROLES.KETUA_DEPARTEMEN, ROLES.SEKRETARIS_DEPARTEMEN, ROLES.ADMIN].includes(r));
  if (privileged || activeSupervisor(attempt, userId)) return toView(attempt);
  if (attempt.thesis.student?.id === userId) {
    const view = toView(attempt);
    return attempt.isFinalized ? view : { ...view, supervisorScore: null, coordinatorScore: null, supervisorDetails: [], coordinatorDetails: [] };
  }
  throw new ForbiddenError("Anda tidak memiliki akses ke penilaian proposal ini.");
}

/**
 * Sekdep sets the semester's minimum passing score, like the seminar and defence minimums. It
 * locks once the semester has a final result.
 */
export async function setMinimumScore(academicYearId, minimumScore, userId) {
  const year = await repo.findAcademicYear(academicYearId);
  if (!year) throw new NotFoundError("Periode akademik tidak ditemukan.");
  if (await repo.periodHasFinalResult(year.id)) throw new BadRequestError(LOCKED_MINIMUM_REASON);
  const updated = await repo.updateMinimumScore(year.id, minimumScore);
  await logAudit({
    actorUserId: userId,
    action: AUDIT_ACTIONS.ACADEMIC_YEAR_UPDATED,
    entityType: ENTITY_TYPES.ACADEMIC_YEAR,
    entityId: year.id,
    oldValues: { researchMethodMinimumScore: year.researchMethodMinimumScore },
    newValues: { researchMethodMinimumScore: minimumScore },
  });
  return { academicYearId: updated.id, researchMethodMinimumScore: updated.researchMethodMinimumScore };
}
