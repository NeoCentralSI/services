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
    const data = await service.getRequestDetail(id);
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
