import {
  listMyGuidancesService,
  getGuidanceDetailService,
  requestGuidanceService,
  rescheduleGuidanceService,
  cancelGuidanceService,
  updateStudentNotesService,
  getMyProgressService,
  completeProgressComponentsService,
  guidanceHistoryService,
  activityLogService,
  listSupervisorsService,
} from "../../services/thesisGuidance/student.guidance.service.js";

export async function listMyGuidances(req, res, next) {
  try {
    const status = req.query?.status;
    const result = await listMyGuidancesService(req.user.sub, status);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function guidanceDetail(req, res, next) {
  try {
    const { guidanceId } = req.params;
    const result = await getGuidanceDetailService(req.user.sub, guidanceId);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function requestGuidance(req, res, next) {
  try {
    const { guidanceDate, studentNotes, meetingUrl, supervisorId, milestoneId, documentUrl, type, duration, location } = (req.validated ?? req.body ?? {});
    const file = req.file || null;
    if (!file) {
      const err = new Error("Thesis file is required (field name: 'file')");
      err.statusCode = 400;
      throw err;
    }
    const result = await requestGuidanceService(req.user.sub, guidanceDate, studentNotes, file, meetingUrl, supervisorId, { type, duration, location, milestoneId, documentUrl });
    res.status(201).json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function rescheduleGuidance(req, res, next) {
  try {
    const { guidanceId } = req.params;
    const { guidanceDate, studentNotes, type, duration, location } = (req.validated ?? req.body ?? {});
    const result = await rescheduleGuidanceService(req.user.sub, guidanceId, guidanceDate, studentNotes, { type, duration, location });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function cancelGuidance(req, res, next) {
  try {
    const { guidanceId } = req.params;
    const { reason } = req.body || {};
    const result = await cancelGuidanceService(req.user.sub, guidanceId, reason);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function updateStudentNotes(req, res, next) {
  try {
    const { guidanceId } = req.params;
    const { studentNotes } = req.body || {};
    const result = await updateStudentNotesService(req.user.sub, guidanceId, studentNotes);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function myProgress(req, res, next) {
  try {
    const result = await getMyProgressService(req.user.sub);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function completeProgressComponents(req, res, next) {
  try {
    const { componentIds, completedAt } = req.body || {};
    const result = await completeProgressComponentsService(req.user.sub, componentIds, completedAt);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function guidanceHistory(req, res, next) {
  try {
    const result = await guidanceHistoryService(req.user.sub);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function activityLog(req, res, next) {
  try {
    const result = await activityLogService(req.user.sub);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function listSupervisors(req, res, next) {
  try {
    const result = await listSupervisorsService(req.user.sub);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}
