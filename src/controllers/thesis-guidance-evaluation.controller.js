import * as service from "../services/thesis-guidance-evaluation.service.js";
import { ROLES } from "../constants/roles.js";
import { userHasActiveRole } from "../repositories/thesis-change-request.repository.js";

/** GET /thesis-guidance-evaluations/context[?thesisId=] */
export async function getContext(req, res, next) {
  try {
    const thesisId = typeof req.query.thesisId === "string" && req.query.thesisId ? req.query.thesisId : null;
    // The Ketua Departemen reads any thesis; everyone else only their own or supervised one.
    const asDepartment = thesisId ? await userHasActiveRole(req.user.sub, ROLES.KETUA_DEPARTEMEN) : false;
    res.json({ success: true, data: await service.getEvaluationContext(req.user.sub, thesisId, { asDepartment }) });
  } catch (err) {
    next(err);
  }
}

/** POST /thesis-guidance-evaluations */
export async function submitEvaluation(req, res, next) {
  try {
    const data = await service.submitEvaluation(req.user.sub, req.validated);
    res.status(201).json({
      success: true,
      message: data.requiresKadep ? "Evaluasi dikirim dan menunggu keputusan Ketua Departemen" : "Evaluasi tercatat: lanjut bimbingan",
      data,
    });
  } catch (err) {
    next(err);
  }
}

/** GET /thesis-guidance-evaluations/department?scope=pending|history&search=&page=&pageSize= */
export async function listForDepartment(req, res, next) {
  try {
    const { scope, search, page, pageSize } = req.query;
    const result = await service.listForDepartment({ scope, search, page, pageSize });
    res.json({ success: true, data: result.data, meta: result.meta });
  } catch (err) {
    next(err);
  }
}

/** POST /thesis-guidance-evaluations/:id/decision */
export async function decideAsKadep(req, res, next) {
  try {
    const data = await service.decideAsKadep(req.user.sub, req.params.id, req.validated);
    res.json({ success: true, message: req.validated.approve ? "Evaluasi disetujui" : "Evaluasi ditolak", data });
  } catch (err) {
    next(err);
  }
}
