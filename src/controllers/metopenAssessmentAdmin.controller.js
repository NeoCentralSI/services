import * as service from "../services/metopenAssessmentAdmin.service.js";

const VALID_ROLES = ["default", "supervisor"];

function validateRoleQuery(role) {
  if (!role || !VALID_ROLES.includes(role)) {
    const err = new Error("Role wajib diisi dan harus 'default' atau 'supervisor'");
    err.statusCode = 400;
    throw err;
  }
}

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
    const criteriaId = req.params.criteriaId ?? req.params.id;
    const data = await service.getCriteria(criteriaId);
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
    const data = await service.updateCriteria(req.params.criteriaId, req.validated ?? req.body);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function deleteCriteria(req, res, next) {
  try {
    const data = await service.deleteCriteria(req.params.criteriaId);
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
    const data = await service.createRubric(req.params.criteriaId, req.validated ?? req.body);
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function updateRubric(req, res, next) {
  try {
    const data = await service.updateRubric(req.params.rubricId, req.validated ?? req.body);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function deleteRubric(req, res, next) {
  try {
    const data = await service.deleteRubric(req.params.rubricId);
    res.json({ success: true, data, message: "Rubrik Metopen berhasil dinonaktifkan" });
  } catch (error) {
    next(error);
  }
}

export async function getCpmksWithRubrics(req, res, next) {
  try {
    const { role } = req.query;
    validateRoleQuery(role);
    const data = await service.getCpmksWithRubrics(role);
    res.json({
      success: true,
      message: "Berhasil mengambil CPMK research_method dan rubrik penilaian Metode Penelitian untuk proposal, TA-03A, dan TA-03B",
      data,
    });
  } catch (error) {
    next(error);
  }
}

export async function removeCpmkConfig(req, res, next) {
  try {
    const { cpmkId } = req.params;
    const { role } = req.query;
    validateRoleQuery(role);
    const data = await service.removeCpmkConfig(cpmkId, role);
    res.json({
      success: true,
      message: "Berhasil menghapus konfigurasi CPMK Metode Penelitian",
      data,
    });
  } catch (error) {
    next(error);
  }
}

export async function getWeightSummary(req, res, next) {
  try {
    const { role } = req.query;
    validateRoleQuery(role);
    const data = await service.getWeightSummary(role);
    const globalTotal = await service.getTotalActiveScore();
    res.json({
      success: true,
      message: "Berhasil mengambil ringkasan bobot penilaian Metode Penelitian untuk proposal, TA-03A, dan TA-03B",
      data: { ...data, globalTotalScore: globalTotal },
    });
  } catch (error) {
    next(error);
  }
}

export async function reorderCriteria(req, res, next) {
  try {
    await service.reorderCriteria(req.validated ?? req.body);
    res.json({ success: true, message: "Berhasil mengubah urutan kriteria Metode Penelitian" });
  } catch (error) {
    next(error);
  }
}

export async function reorderRubrics(req, res, next) {
  try {
    await service.reorderRubrics(req.validated ?? req.body);
    res.json({ success: true, message: "Berhasil mengubah urutan rubrik Metode Penelitian" });
  } catch (error) {
    next(error);
  }
}
