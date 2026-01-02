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
  getSupervisorAvailabilityService,
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
    // DEBUG: Log req.body to see what's received
    console.log("[requestGuidance] req.body:", JSON.stringify(req.body, null, 2));
    console.log("[requestGuidance] req.body['milestoneIds[]']:", req.body?.["milestoneIds[]"]);
    console.log("[requestGuidance] req.body.milestoneIds:", req.body?.milestoneIds);
    console.log("[requestGuidance] req.validated:", JSON.stringify(req.validated, null, 2));
    
    const {
      guidanceDate,
      studentNotes,
      meetingUrl,
      supervisorId,
      milestoneId,
      milestoneIds,
      documentUrl,
      type,
      duration,
      location,
    } = (req.validated ?? req.body ?? {});
    // Collect milestoneIds from both milestoneIds and milestoneIds[] form fields
    const rawMilestoneIds =
      (req.body && (req.body["milestoneIds[]"] || req.body.milestoneIds)) || milestoneIds;
    console.log("[requestGuidance] rawMilestoneIds:", rawMilestoneIds);
    const normalizedMilestoneIds = Array.isArray(rawMilestoneIds)
      ? rawMilestoneIds
      : rawMilestoneIds
        ? [rawMilestoneIds]
        : undefined;
    console.log("[requestGuidance] normalizedMilestoneIds:", normalizedMilestoneIds);
    const file = req.file || null;
    if (!file) {
      const err = new Error("Thesis file is required (field name: 'file')");
      err.statusCode = 400;
      throw err;
    }
    const result = await requestGuidanceService(
      req.user.sub,
      guidanceDate,
      studentNotes,
      file,
      meetingUrl,
      supervisorId,
      { type, duration, location, milestoneId, milestoneIds: normalizedMilestoneIds, documentUrl }
    );
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

export async function supervisorAvailability(req, res, next) {
  try {
    const { supervisorId } = req.params;
    const { start, end } = req.query || {};
    const result = await getSupervisorAvailabilityService(req.user.sub, supervisorId, start, end);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}
