import prisma from "../../config/prisma.js";
import { ASSESSOR, ASSESSOR_LABELS, DEFAULT_MINIMUM_SCORE, RESEARCH_METHOD_RESULT } from "../../constants/research-method.js";
import { ROLES } from "../../constants/roles.js";
import { CLOSED_THESIS_STATUSES } from "../../constants/thesisStatus.js";
import { formatAcademicYearLabel, resolveOperationalAcademicYear } from "../../helpers/academicYear.helper.js";
import { uploadUrl } from "../../helpers/guidanceFile.helper.js";
import * as repo from "../../repositories/research-method/assessment.repository.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../utils/errors.js";
import { AUDIT_ACTIONS, ENTITY_TYPES, logAudit } from "../auditLog.service.js";
import { createNotificationEventForUsers } from "../notification.service.js";
import { assertAttendanceAllowsScoring, getAttendanceForAttempt } from "./attendance.service.js";

/**
 * Penilaian Proposal (plan 10.2, K9): the supervisor (Pembimbing 1, or Pembimbing 2 as a
 * backup, no co-sign) and the Research Method coordinator each score their own criteria of the
 * period. A party's weight is the sum of its criteria's max scores. Each score is locked when
 * sent (R23); when both are in, the final score is their sum and the attempt is finalized:
 * passed when attendance is at least 75% and the final score reaches the period's minimum.
 */

const PARTY_LABEL = ASSESSOR_LABELS;

export function minimumScoreOf(academicYear) {
  return academicYear?.researchMethodMinimumScore ?? DEFAULT_MINIMUM_SCORE;
}

function normalizeScore(value, name) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric)) throw new BadRequestError(`Skor ${name} wajib berupa bilangan bulat.`);
  if (numeric < 0) throw new BadRequestError(`Skor ${name} tidak boleh negatif.`);
  return numeric;
}

/** The form of one assessor for a period: criteria, rubrics, weight. */
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
    criteria: criteria.map((c) => ({
      id: c.id,
      name: c.name,
      maxScore: c.maxScore,
      cpmk: c.researchMethodCpmk,
      rubrics: c.assessmentRubrics,
    })),
  };
}

/**
 * R22: integers from 0 to the criterion max, inside the chosen rubric's range; a rubric is
 * required when the criterion has rubrics; every criterion once; the total within the weight.
 */
export async function validateScores(party, scores, academicYearId) {
  if (!Array.isArray(scores) || scores.length === 0) throw new BadRequestError("Nilai per kriteria wajib diisi.");
  const criteria = await repo.findCriteria(party, academicYearId);
  if (criteria.length === 0) throw new BadRequestError(`Kriteria penilaian ${PARTY_LABEL[party]} periode ini belum dikonfigurasi.`);
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
    const rubrics = criterion.assessmentRubrics ?? [];
    let rubricId = null;
    if (item.rubricId) {
      const rubric = rubrics.find((r) => r.id === item.rubricId);
      if (!rubric) throw new BadRequestError(`Rubrik yang dipilih tidak berlaku untuk kriteria ${criterion.name}.`);
      if (score < rubric.minScore || score > rubric.maxScore) {
        throw new BadRequestError(`Skor ${criterion.name} harus berada dalam rentang rubrik ${rubric.minScore}-${rubric.maxScore}.`);
      }
      rubricId = rubric.id;
    } else if (rubrics.length > 0) {
      throw new BadRequestError(`Rubrik penilaian wajib dipilih untuk kriteria ${criterion.name}.`);
    }
    return { criteriaId, rubricId, score };
  });
  const missing = criteria.filter((c) => !seen.has(c.id));
  if (missing.length) throw new BadRequestError(`Semua kriteria wajib dinilai. Belum ada nilai untuk: ${missing.map((c) => c.name).join(", ")}.`);
  const total = details.reduce((sum, d) => sum + d.score, 0);
  const weight = criteria.reduce((sum, c) => sum + c.maxScore, 0);
  if (total > weight) throw new BadRequestError(`Total nilai ${PARTY_LABEL[party]} melebihi bobot ${weight} (dihitung: ${total}).`);
  return { total, details };
}

const activeSupervisor = (attempt, lecturerId) =>
  attempt.thesis.thesisSupervisors.find((s) => s.lecturerId === lecturerId) ?? null;

/**
 * Why this party cannot score the attempt now (R21, R23), or null. Attendance is checked
 * separately because it may set the automatic 0.
 */
export function scoringBlockReason(attempt, party, operationalYearId) {
  if (attempt.academicYearId !== operationalYearId) return "Penilaian hanya dapat dikirim pada periode berjalan. Periode ini ditampilkan sebagai riwayat.";
  if (attempt.thesis.student?.status !== "active") return "Mahasiswa tidak aktif. Penilaian hanya untuk mahasiswa aktif.";
  if (CLOSED_THESIS_STATUSES.includes(attempt.thesis.status)) return "Tugas akhir ini sudah berakhir.";
  if (!attempt.thesis.supervisorAssignedAt) return "Penilaian menunggu Penetapan Pembimbing.";
  if (!attempt.proposalFilePath) return "Mahasiswa belum mengajukan proposal final.";
  if (attempt.attendanceAutoZeroedAt) return "Presensi di bawah 75%: nilai otomatis 0 dan bersifat final.";
  if (attempt.isFinalized) return "Penilaian proposal sudah final.";
  const score = party === ASSESSOR.SUPERVISOR ? attempt.supervisorScore : attempt.coordinatorScore;
  if (score != null) return `Nilai ${PARTY_LABEL[party]} sudah dikirim dan terkunci.`;
  return null;
}

function decideResult(finalScore, minimum, attendanceEligible) {
  return attendanceEligible && finalScore >= minimum ? RESEARCH_METHOD_RESULT.PASSED : RESEARCH_METHOD_RESULT.FAILED;
}

async function notifyProgress(attempt, party, finalized) {
  try {
    const name = attempt.thesis.student?.user?.fullName ?? "Mahasiswa";
    const title = attempt.thesis.title || "proposal";
    const data = { thesisId: attempt.thesis.id, assessmentId: attempt.id };
    if (finalized) {
      const passed = finalized.result === RESEARCH_METHOD_RESULT.PASSED;
      await createNotificationEventForUsers([attempt.thesis.student.id], {
        title: "Nilai Metode Penelitian Final",
        message: `Nilai proposal "${title}" sudah final: ${finalized.finalScore} (${passed ? "Lulus" : "Tidak Lulus"}). ${passed
          ? "Anda naik ke fase Penelitian setelah terdaftar mengambil mata kuliah Tugas Akhir pada semester berikutnya."
          : "Anda mengulang Metode Penelitian pada periode berikutnya dengan pembimbing dan judul yang sama."}`,
        type: "research_method_assessment_finalized",
        data: { ...data, route: "/tugas-akhir/proposal" },
      }, { push: true });
      return;
    }
    if (party === ASSESSOR.SUPERVISOR) {
      const coordinators = await repo.findCoordinatorUserIds();
      await createNotificationEventForUsers(coordinators, {
        title: "Penilaian Proposal Menunggu Koordinator",
        message: `Pembimbing sudah menilai proposal ${name}. Nilai koordinator untuk "${title}" belum diisi.`,
        type: "research_method_coordinator_pending",
        data: { ...data, route: "/metode-penelitian/penilaian" },
      }, { push: true });
    } else {
      await createNotificationEventForUsers(attempt.thesis.thesisSupervisors.map((s) => s.lecturerId), {
        title: "Penilaian Proposal Menunggu Pembimbing",
        message: `Koordinator sudah menilai proposal ${name}. Nilai pembimbing untuk "${title}" belum diisi.`,
        type: "research_method_supervisor_pending",
        data: { ...data, route: "/tugas-akhir/proposal" },
      }, { push: true });
    }
  } catch (error) {
    console.error("[research-method:assessment] notifikasi gagal:", error?.message ?? error);
  }
}

/**
 * Send one assessor's score. Supervisor: an active Pembimbing 1 or 2 of the thesis (K9).
 * Coordinator: the role is checked by the route.
 */
export async function submitScore(assessmentId, party, userId, scores) {
  const attempt = await repo.findAttempt(assessmentId);
  if (!attempt) throw new NotFoundError("Penilaian proposal tidak ditemukan.");
  if (party === ASSESSOR.SUPERVISOR && !activeSupervisor(attempt, userId)) {
    throw new ForbiddenError("Hanya Pembimbing 1 atau Pembimbing 2 aktif yang dapat mengisi nilai pembimbing.");
  }
  const operational = await resolveOperationalAcademicYear();
  const blocked = scoringBlockReason(attempt, party, operational?.id);
  if (blocked) {
    const locked = attempt.isFinalized || (party === ASSESSOR.SUPERVISOR ? attempt.supervisorScore : attempt.coordinatorScore) != null;
    throw locked || attempt.academicYearId !== operational?.id ? new ForbiddenError(blocked) : new BadRequestError(blocked);
  }
  const attendanceRecord = await assertAttendanceAllowsScoring(attempt, userId);
  const { total, details } = await validateScores(party, scores, attempt.academicYearId);
  const minimum = minimumScoreOf(attempt.academicYear);

  const finalized = await prisma.$transaction(async (tx) => {
    await repo.lockAttempt(tx, attempt.id);
    const current = await tx.researchMethodAssessment.findUnique({ where: { id: attempt.id } });
    if (current.isFinalized) throw new ForbiddenError("Penilaian proposal sudah final dan tidak dapat diubah.");
    const already = party === ASSESSOR.SUPERVISOR ? current.supervisorScore : current.coordinatorScore;
    if (already != null) throw new ForbiddenError(`Nilai ${PARTY_LABEL[party]} sudah dikirim dan terkunci.`);
    const now = new Date();
    const own = party === ASSESSOR.SUPERVISOR
      ? { supervisorId: userId, supervisorScore: total, supervisorScoredAt: now }
      : { coordinatorId: userId, coordinatorScore: total, coordinatorScoredAt: now };
    const other = party === ASSESSOR.SUPERVISOR ? current.coordinatorScore : current.supervisorScore;
    const completion = other != null
      ? (() => {
          const finalScore = total + other;
          return {
            finalScore,
            isFinalized: true,
            finalizedBy: userId,
            finalizedAt: now,
            result: decideResult(finalScore, minimum, attendanceRecord.isEligible),
          };
        })()
      : {};
    const updated = await tx.researchMethodAssessment.update({
      where: { id: attempt.id },
      data: { ...own, ...completion, attendanceRecordId: attendanceRecord.id },
    });
    await repo.createDetails(party, attempt.id, details, tx);
    return updated.isFinalized ? updated : null;
  });

  await logAudit({
    actorUserId: userId,
    action: AUDIT_ACTIONS.RESEARCH_METHOD_ASSESSMENT_SUBMITTED,
    entityType: ENTITY_TYPES.RESEARCH_METHOD_ASSESSMENT,
    entityId: attempt.id,
    newValues: { party, score: total, ...(finalized ? { finalScore: finalized.finalScore, result: finalized.result } : {}) },
    metadata: { thesisId: attempt.thesis.id, academicYearId: attempt.academicYearId, minimumScore: minimum },
  });
  await notifyProgress(attempt, party, finalized);
  return getAttemptView(attempt.id);
}

function personName(lecturer) {
  return lecturer?.user?.fullName ?? null;
}

/** One attempt as the pages show it (scores per criterion, attendance, result). */
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
    supervisorDetails: attempt.supervisorDetails,
    coordinatorScore: attempt.coordinatorScore,
    coordinatorScoredAt: attempt.coordinatorScoredAt,
    coordinatorName: personName(attempt.coordinator),
    coordinatorDetails: attempt.coordinatorDetails,
    finalScore: attempt.finalScore,
    isFinalized: attempt.isFinalized,
    finalizedAt: attempt.finalizedAt,
    result: attempt.result,
    attendance: attempt.attendanceRecord
      ? {
          attendancePercentage: attempt.attendanceRecord.attendancePercentage,
          isEligible: attempt.attendanceRecord.isEligible,
          presentCount: attempt.attendanceRecord.presentCount,
          totalMeetings: attempt.attendanceRecord.totalMeetings,
        }
      : null,
    attendanceAutoZeroed: Boolean(attempt.attendanceAutoZeroedAt),
    ...extra,
  };
}

async function withAttendance(attempt) {
  if (attempt.attendanceRecord) return attempt;
  if (!attempt.proposalFilePath) return attempt;
  const attendance = await getAttendanceForAttempt(attempt);
  return attendance.record ? { ...attempt, attendanceRecord: attendance.record } : { ...attempt, attendanceMessage: attendance.message };
}

async function rowFor(attempt, party, operationalYearId) {
  const enriched = await withAttendance(attempt);
  const block = scoringBlockReason(enriched, party, operationalYearId)
    ?? enriched.attendanceMessage
    ?? (enriched.attendanceRecord && !enriched.attendanceRecord.isEligible ? "Presensi di bawah 75%: nilai otomatis 0 saat penilaian dikirim." : null);
  return toView(enriched, { canScore: block === null, scoreBlockReason: block });
}

/**
 * Tugas Akhir > Proposal (supervisor): proposal-phase students of this lecturer and every attempt
 * of the period on their theses, with "Nilai Proposal" availability.
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
  const rows = [];
  for (const attempt of attempts) rows.push(await rowFor(attempt, ASSESSOR.SUPERVISOR, operational?.id));
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
    }));
  const all = [...rows, ...waiting].sort((a, b) => String(a.student.identityNumber).localeCompare(String(b.student.identityNumber)));
  return {
    academicYear: { id: year.id, label: formatAcademicYearLabel(year), isOperational: year.id === operational?.id },
    minimumScore: minimumScoreOf(year),
    rows: all,
  };
}

/** Metode Penelitian > Penilaian Proposal (coordinator): every attempt with a final proposal. */
export async function getCoordinatorQueue(academicYearId = null) {
  const operational = await resolveOperationalAcademicYear();
  const yearId = academicYearId || operational?.id;
  if (!yearId) throw new BadRequestError("Periode akademik berjalan belum ditetapkan.");
  const year = await repo.findAcademicYear(yearId);
  if (!year) throw new NotFoundError("Periode akademik tidak ditemukan.");
  const attempts = (await repo.findAttemptsForPeriod(year.id)).filter((a) => a.proposalFilePath);
  const rows = [];
  for (const attempt of attempts) rows.push(await rowFor(attempt, ASSESSOR.COORDINATOR, operational?.id));
  rows.sort((a, b) => String(a.student.identityNumber).localeCompare(String(b.student.identityNumber)));
  return {
    academicYear: { id: year.id, label: formatAcademicYearLabel(year), isOperational: year.id === operational?.id },
    minimumScore: minimumScoreOf(year),
    rows,
  };
}

/** Detail for the supervisor, the coordinator, Kadep/Sekdep/Admin, or the student (final only). */
export async function getAttemptForUser(assessmentId, userId, roles) {
  const attempt = await repo.findAttempt(assessmentId);
  if (!attempt) throw new NotFoundError("Penilaian proposal tidak ditemukan.");
  const privileged = roles.some((r) => [ROLES.KOORDINATOR_METODE_PENELITIAN, ROLES.KETUA_DEPARTEMEN, ROLES.SEKRETARIS_DEPARTEMEN, ROLES.ADMIN].includes(r));
  if (privileged || activeSupervisor(attempt, userId)) return toView(await withAttendance(attempt));
  if (attempt.thesis.student?.id === userId) {
    const view = toView(attempt);
    return attempt.isFinalized ? view : { ...view, supervisorScore: null, coordinatorScore: null, supervisorDetails: [], coordinatorDetails: [] };
  }
  throw new ForbiddenError("Anda tidak memiliki akses ke penilaian proposal ini.");
}

/** Sekdep sets the period's minimum passing score (10.2), like the seminar and defence minimums. */
export async function setMinimumScore(academicYearId, minimumScore, userId) {
  const year = await repo.findAcademicYear(academicYearId);
  if (!year) throw new NotFoundError("Periode akademik tidak ditemukan.");
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
