import {
  browseLecturerQuotas,
  getLecturerQuotaDetail,
  checkQuotaAvailability,
  getScienceGroups as getScienceGroupsService,
  getTopics as getTopicsService,
  getDefaultQuotaConfig,
  setDefaultQuotaConfig,
  setLecturerQuotaConfig,
  deleteLecturerQuotaConfig,
  toggleLecturerAcceptingRequests,
  getQuotaMonitoring,
} from "../services/quota.service.js";

function withRemaining(item) {
  return {
    ...item,
    remaining: Math.max(0, (item.quotaMax ?? 0) - (item.currentCount ?? 0)),
  };
}

export async function browseLecturers(req, res, next) {
  try {
    const data = await browseLecturerQuotas(req.query.academicYearId);
    res.status(200).json({ success: true, data: data.map(withRemaining) });
  } catch (error) {
    next(error);
  }
}

export async function getLecturerDetail(req, res, next) {
  try {
    const data = await getLecturerQuotaDetail(req.params.lecturerId, req.query.academicYearId);
    res.status(200).json({ success: true, data: withRemaining(data) });
  } catch (error) {
    next(error);
  }
}

export async function checkQuota(req, res, next) {
  try {
    const data = await checkQuotaAvailability(req.params.lecturerId, req.query.academicYearId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getScienceGroups(_req, res, next) {
  try {
    const data = await getScienceGroupsService();
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getTopics(_req, res, next) {
  try {
    const data = await getTopicsService();
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function toggleAcceptingRequests(req, res, next) {
  try {
    const body = req.validated ?? req.body ?? {};
    const lecturerId = req.user?.sub;
    const data = await toggleLecturerAcceptingRequests(lecturerId, body.acceptingRequests);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getDefaultQuota(req, res, next) {
  try {
    const academicYearId = req.query.academicYearId || req.body?.academicYearId;
    const data = await getDefaultQuotaConfig(academicYearId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function setDefaultQuota(req, res, next) {
  try {
    const body = req.validated ?? req.body ?? {};
    const data = await setDefaultQuotaConfig(body.academicYearId, body);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function setLecturerQuota(req, res, next) {
  try {
    const body = req.validated ?? req.body ?? {};
    const data = await setLecturerQuotaConfig(req.params.lecturerId, body.academicYearId, body);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function deleteLecturerQuota(req, res, next) {
  try {
    const data = await deleteLecturerQuotaConfig(req.params.quotaId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getMonitoring(req, res, next) {
  try {
    const data = await getQuotaMonitoring(req.query.academicYearId);
    res.status(200).json({ success: true, data: data.map(withRemaining) });
  } catch (error) {
    next(error);
  }
}
