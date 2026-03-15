import * as service from "../services/metopenAssessmentAdmin.service.js";

export async function listCriteria(req, res, next) {
  try {
    const data = await service.listCriteria(req.query.role || null);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getCriteria(req, res, next) {
  try {
    const data = await service.getCriteria(req.params.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function createCriteria(req, res, next) {
  try {
    const data = await service.createCriteria(req.validated ?? req.body);
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function updateCriteria(req, res, next) {
  try {
    const data = await service.updateCriteria(req.params.id, req.validated ?? req.body);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function deleteCriteria(req, res, next) {
  try {
    const data = await service.deleteCriteria(req.params.id);
    res.json({ success: true, data, message: "Kriteria Metopen berhasil dinonaktifkan" });
  } catch (error) {
    next(error);
  }
}

export async function listRubrics(req, res, next) {
  try {
    const data = await service.listRubrics(req.params.criteriaId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function createRubric(req, res, next) {
  try {
    const data = await service.createRubric(req.validated ?? req.body);
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function updateRubric(req, res, next) {
  try {
    const data = await service.updateRubric(req.params.id, req.validated ?? req.body);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function deleteRubric(req, res, next) {
  try {
    const data = await service.deleteRubric(req.params.id);
    res.json({ success: true, data, message: "Rubrik Metopen berhasil dinonaktifkan" });
  } catch (error) {
    next(error);
  }
}
