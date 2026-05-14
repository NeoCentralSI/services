import * as service from "../services/advisorRequest.service.js";

// ============================================
// Student endpoints
// ============================================

export async function getLecturerCatalog(req, res, next) {
  try {
    const academicYearId = req.query.academicYearId || null;
    const data = await service.getLecturerCatalog(req.user.sub, academicYearId);
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function submitRequest(req, res, next) {
  try {
    const body = req.validated ?? req.body ?? {};
    const data = await service.submitRequest(req.user.sub, body);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getMyRequests(req, res, next) {
  try {
    const data = await service.getMyRequests(req.user.sub);
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getMyAccessState(req, res, next) {
  try {
    const data = await service.getMyAccessState(req.user.sub);
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getMyDraft(req, res, next) {
  try {
    const data = await service.getMyDraft(req.user.sub);
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function saveMyDraft(req, res, next) {
  try {
    const body = req.validated ?? req.body ?? {};
    const data = await service.saveMyDraft(req.user.sub, body);
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function withdrawRequest(req, res, next) {
  try {
    const { id } = req.params;
    const data = await service.withdrawRequest(id, req.user.sub);
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ============================================
// Dosen endpoints
// ============================================

export async function getDosenInbox(req, res, next) {
  try {
    const data = await service.getDosenInbox(req.user.sub);
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getDosenInboxHistory(req, res, next) {
  try {
    const data = await service.getDosenInboxHistory(req.user.sub);
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function respondByLecturer(req, res, next) {
  try {
    const { id } = req.params;
    const body = req.validated ?? req.body ?? {};
    const data = await service.respondByLecturer(id, req.user.sub, body);
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function markUnderReview(req, res, next) {
  try {
    const { id } = req.params;
    const data = await service.markUnderReview(id, req.user.sub);
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ============================================
// KaDep endpoints
// ============================================

export async function getKadepQueue(req, res, next) {
  try {
    const data = await service.getKadepQueue();
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getRecommendations(req, res, next) {
  try {
    const { id } = req.params;
    const data = await service.getRecommendations(id);
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function decideByKadep(req, res, next) {
  try {
    const kadepUserId = req.user.sub;
    const { id } = req.params;
    const body = req.validated ?? req.body ?? {};
    const data = await service.decideByKadep(id, kadepUserId, body);
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function assignAdvisor(req, res, next) {
  try {
    const kadepUserId = req.user.sub;
    const { id } = req.params;
    const data = await service.assignAdvisor(id, kadepUserId);
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getRequestDetail(req, res, next) {
  try {
    const { id } = req.params;
    const data = await service.getRequestDetail(id, req.user.sub);
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getBatchTA04(req, res, next) {
  try {
    const { academicYearId } = req.params;
    const { pdfBuffer, fileName } = await service.generateBatchTA04(academicYearId);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
}

export async function finalizeBatchTA04(req, res, next) {
  try {
    const { academicYearId } = req.params;
    const data = await service.finalizeBatchTA04(academicYearId);
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
