import * as repo from "../repositories/metopen.grading.repository.js";
import { NotFoundError, BadRequestError } from "../utils/errors.js";

/**
 * Get class grading summary for Pengampu.
 *
 * lecturerScore and supervisorScore are sourced exclusively from
 * ResearchMethodScore (TA-03B rubric and TA-03A rubric respectively).
 * Formative milestone scores are NOT used for the 70:30 final grade.
 */
export async function getClassGradingSummary(classId) {
  const data = await repo.findClassGradingData(classId);

  return data.map((enrollment) => {
    const student = enrollment.student;
    const thesis = student?.thesis?.[0];

    if (!thesis) {
      return {
        studentId: student.id,
        studentName: student.user?.fullName,
        studentNim: student.user?.identityNumber,
        status: "no_thesis",
        lecturerScore: null,
        supervisorScore: null,
        finalScore: null,
        isPassed: null,
      };
    }

    const rmScore = thesis.researchMethodScores?.[0];
    const supervisors =
      thesis.thesisSupervisors
        ?.map((s) => s.lecturer?.user?.fullName)
        .join(", ") || "-";

    const supervisorScore = rmScore?.supervisorScore ?? null;
    const lecturerScore = rmScore?.lecturerScore ?? null;

    let finalScore = null;
    let isPassed = null;

    if (supervisorScore !== null && lecturerScore !== null) {
      finalScore = Math.round(supervisorScore * 0.7 + lecturerScore * 0.3);
      isPassed = finalScore >= 60;
    }

    return {
      thesisId: thesis.id,
      studentId: student.id,
      studentName: student.user?.fullName,
      studentNim: student.user?.identityNumber,
      supervisors,
      lecturerScore,
      supervisorScore,
      finalScore,
      isPassed,
      calculatedAt: rmScore?.calculatedAt ?? null,
    };
  });
}

/**
 * Supervisor inputs TA-03A score (70% weight).
 * Accepts either a single score (legacy) or detailed per-criteria scores.
 */
export async function inputSupervisorScore(thesisId, supervisorId, data) {
  const thesisData = await repo.findStudentGradingData(thesisId);
  if (!thesisData)
    throw new NotFoundError("Data Tugas Akhir/Metopen mhs tidak ditemukan");

  const isAssigned = thesisData.thesisSupervisors.some(
    (s) => s.lecturerId === supervisorId
  );
  if (!isAssigned) {
    throw new BadRequestError(
      "Anda bukan dosen pembimbing untuk mahasiswa ini"
    );
  }

  const criteriaScores = Array.isArray(data.criteriaScores)
    ? data.criteriaScores
    : [];
  let totalScore;

  if (criteriaScores.length > 0) {
    totalScore = Math.round(
      criteriaScores.reduce((sum, cs) => sum + (cs.score || 0), 0) /
        criteriaScores.length
    );
  } else {
    totalScore = typeof data === "number" ? data : data.score;
  }

  if (totalScore == null || totalScore < 0 || totalScore > 100) {
    throw new BadRequestError("Nilai harus berada antara 0 dan 100");
  }

  const rmScore = await repo.upsertResearchMethodScore({
    thesisId,
    supervisorId,
    supervisorScore: totalScore,
  });

  if (criteriaScores.length > 0) {
    await repo.upsertScoreDetails(rmScore.id, criteriaScores);
  }

  return rmScore;
}

/**
 * Pengampu inputs TA-03B score (30% weight).
 * Accepts either a single score (legacy) or detailed per-criteria scores.
 * BR-11: Supervisor must have scored before the pengampu can input.
 */
export async function inputLecturerScore(thesisId, lecturerId, data) {
  const thesisData = await repo.findStudentGradingData(thesisId);
  if (!thesisData)
    throw new NotFoundError("Data Tugas Akhir/Metopen mhs tidak ditemukan");

  const rmScore = thesisData.researchMethodScores?.[0];
  if (!rmScore || rmScore.supervisorScore == null) {
    throw new BadRequestError(
      "Nilai Dosen Pembimbing belum tersedia. Silakan tunggu Pembimbing menginput nilai terlebih dahulu."
    );
  }

  const criteriaScores = Array.isArray(data.criteriaScores)
    ? data.criteriaScores
    : [];
  let totalScore;

  if (criteriaScores.length > 0) {
    totalScore = Math.round(
      criteriaScores.reduce((sum, cs) => sum + (cs.score || 0), 0) /
        criteriaScores.length
    );
  } else {
    totalScore = typeof data === "number" ? data : data.score;
  }

  if (totalScore == null || totalScore < 0 || totalScore > 100) {
    throw new BadRequestError("Nilai harus berada antara 0 dan 100");
  }

  const updated = await repo.upsertResearchMethodScore({
    thesisId,
    lecturerId,
    lecturerScore: totalScore,
  });

  if (criteriaScores.length > 0) {
    await repo.upsertScoreDetails(updated.id, criteriaScores);
  }

  return updated;
}

/**
 * Pengampu locks and calculates final grade for entire class.
 *
 * PRD: 70% Pembimbing (TA-03A supervisorScore) + 30% Pengampu (TA-03B lecturerScore).
 * Pass threshold: finalScore >= 60.
 *
 * BR-11: All students must have both supervisorScore AND lecturerScore before locking.
 */
export async function lockClassGrades(classId, lecturerId) {
  const data = await repo.findClassGradingData(classId);
  if (!data || data.length === 0)
    throw new NotFoundError("Kelas tidak ditemukan atau kosong");

  const missingSupervisor = [];
  const missingLecturer = [];

  for (const enrollment of data) {
    const thesis = enrollment.student?.thesis?.[0];
    if (!thesis) continue;
    const rmScore = thesis.researchMethodScores?.[0];
    const name =
      enrollment.student?.user?.fullName ||
      enrollment.student?.user?.identityNumber ||
      "Unknown";

    if (rmScore?.supervisorScore == null) missingSupervisor.push(name);
    if (rmScore?.lecturerScore == null) missingLecturer.push(name);
  }

  if (missingSupervisor.length > 0) {
    throw new BadRequestError(
      `Tidak dapat mengunci nilai: ${missingSupervisor.length} mahasiswa belum mendapatkan nilai Pembimbing (TA-03A). Contoh: ${missingSupervisor.slice(0, 3).join(", ")}${missingSupervisor.length > 3 ? ", ..." : ""}`
    );
  }
  if (missingLecturer.length > 0) {
    throw new BadRequestError(
      `Tidak dapat mengunci nilai: ${missingLecturer.length} mahasiswa belum mendapatkan nilai Pengampu (TA-03B). Contoh: ${missingLecturer.slice(0, 3).join(", ")}${missingLecturer.length > 3 ? ", ..." : ""}`
    );
  }

  const results = [];
  const now = new Date();

  for (const enrollment of data) {
    const thesis = enrollment.student?.thesis?.[0];
    if (!thesis) continue;

    const rmScore = thesis.researchMethodScores?.[0];
    const supervisorScore = rmScore.supervisorScore;
    const lecturerScore = rmScore.lecturerScore;
    const finalScore = Math.round(supervisorScore * 0.7 + lecturerScore * 0.3);

    const updated = await repo.upsertResearchMethodScore({
      thesisId: thesis.id,
      lecturerId,
      lecturerScore,
      supervisorScore,
      finalScore,
      isFinalized: true,
      finalizedBy: lecturerId,
      finalizedAt: now,
      calculatedAt: now,
    });

    const isPassed = finalScore >= 60;
    results.push({ ...updated, finalScore, isPassed });
  }

  return results;
}
