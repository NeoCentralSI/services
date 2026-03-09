import * as gradingService from "../services/metopen.grading.service.js";

/**
 * GET /metopen/grading/class/:classId
 */
export async function getClassGradingSummary(req, res, next) {
  try {
    const { classId } = req.params;
    const summary = await gradingService.getClassGradingSummary(classId);
    res.json({ success: true, data: summary });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /metopen/grading/supervisor-score
 * Body: { thesisId, score } (legacy) or { thesisId, criteriaScores: [{ criteriaId, score }] }
 */
export async function inputSupervisorScore(req, res, next) {
  try {
    const body = req.validated ?? req.body;
    const supervisorId = req.user.sub;

    const result = await gradingService.inputSupervisorScore(
      body.thesisId,
      supervisorId,
      body
    );
    res.json({
      success: true,
      data: result,
      message: "Nilai pembimbing (TA-03A) berhasil disimpan",
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /metopen/grading/lecturer-score
 * Body: { thesisId, score } (legacy) or { thesisId, criteriaScores: [{ criteriaId, score }] }
 */
export async function inputLecturerScore(req, res, next) {
  try {
    const body = req.validated ?? req.body;
    const lecturerId = req.user.sub;

    const result = await gradingService.inputLecturerScore(
      body.thesisId,
      lecturerId,
      body
    );
    res.json({
      success: true,
      data: result,
      message: "Nilai pengampu (TA-03B) berhasil disimpan",
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /metopen/grading/rubric-criteria?role=supervisor|default
 */
export async function getRubricCriteria(req, res, next) {
  try {
    const role = req.query.role || "supervisor";
    const data = await import(
      "../repositories/metopen.grading.repository.js"
    ).then((repo) => repo.findMetopenAssessmentCriteria(role));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /metopen/grading/class/:classId/lock
 */
export async function lockClassGrades(req, res, next) {
  try {
    const { classId } = req.params;
    const lecturerId = req.user.sub;

    const results = await gradingService.lockClassGrades(classId, lecturerId);
    res.json({
      success: true,
      data: results,
      message: "Nilai akhir berhasil di-lock dan disimpan",
    });
  } catch (err) {
    next(err);
  }
}
