import * as service from "../services/researchMethodAssessmentAdmin.service.js";

function assessor(req) {
  return service.requireAssessor(req.query.assessor);
}

export async function listCpmks(req, res, next) {
  try {
    const data = await service.listCpmks(req.query.academicYearId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function createCpmk(req, res, next) {
  try {
    const data = await service.createCpmk(req.validated ?? req.body);
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function updateCpmk(req, res, next) {
  try {
    const data = await service.updateCpmk(
      req.params.cpmkId,
      req.validated ?? req.body,
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function deleteCpmk(req, res, next) {
  try {
    const data = await service.deleteCpmk(req.params.cpmkId);
    res.json({
      success: true,
      message: "CPMK Metode Penelitian berhasil dihapus",
      data,
    });
  } catch (error) {
    next(error);
  }
}

export async function getConfiguredCpmks(req, res, next) {
  try {
    const data = await service.getConfiguredCpmks(
      assessor(req),
      req.query.academicYearId,
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function createCriteria(req, res, next) {
  try {
    const data = await service.createCriteria(
      assessor(req),
      req.validated ?? req.body,
    );
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function updateCriteria(req, res, next) {
  try {
    const data = await service.updateCriteria(
      assessor(req),
      req.params.criteriaId,
      req.validated ?? req.body,
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function deleteCriteria(req, res, next) {
  try {
    const data = await service.deleteCriteria(
      assessor(req),
      req.params.criteriaId,
    );
    res.json({
      success: true,
      message: "Kriteria penilaian berhasil dihapus",
      data,
    });
  } catch (error) {
    next(error);
  }
}

export async function removeCpmkConfig(req, res, next) {
  try {
    const data = await service.removeCpmkConfig(
      assessor(req),
      req.params.cpmkId,
    );
    res.json({
      success: true,
      message: "Konfigurasi rubrik CPMK berhasil dihapus",
      data,
    });
  } catch (error) {
    next(error);
  }
}

export async function listRubrics(req, res, next) {
  try {
    const data = await service.listRubrics(
      assessor(req),
      req.params.criteriaId,
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function createRubric(req, res, next) {
  try {
    const data = await service.createRubric(
      assessor(req),
      req.params.criteriaId,
      req.validated ?? req.body,
    );
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function updateRubric(req, res, next) {
  try {
    const data = await service.updateRubric(
      assessor(req),
      req.params.rubricId,
      req.validated ?? req.body,
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function deleteRubric(req, res, next) {
  try {
    const data = await service.deleteRubric(
      assessor(req),
      req.params.rubricId,
    );
    res.json({
      success: true,
      message: "Rubrik penilaian berhasil dihapus",
      data,
    });
  } catch (error) {
    next(error);
  }
}

export async function getWeightSummary(req, res, next) {
  try {
    const data = await service.getWeightSummary(req.query.academicYearId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function reorderCriteria(req, res, next) {
  try {
    await service.reorderCriteria(
      assessor(req),
      req.validated ?? req.body,
    );
    res.json({
      success: true,
      message: "Urutan kriteria berhasil disimpan",
    });
  } catch (error) {
    next(error);
  }
}

export async function reorderRubrics(req, res, next) {
  try {
    await service.reorderRubrics(
      assessor(req),
      req.validated ?? req.body,
    );
    res.json({
      success: true,
      message: "Urutan rubrik berhasil disimpan",
    });
  } catch (error) {
    next(error);
  }
}
