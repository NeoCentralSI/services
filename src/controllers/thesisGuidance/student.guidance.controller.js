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
  listSupervisorsService,
  getSupervisorAvailabilityService,
  getGuidancesNeedingSummaryService,
  submitSessionSummaryService,
  getCompletedGuidanceHistoryService,
  getGuidanceForExportService,
  markSessionCompleteService,
  getMyThesisDetailService,
  updateMyThesisTitleService,
  getThesisHistoryService,
  proposeThesisService,
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
      supervisorId,
      milestoneId,
      milestoneIds,
      documentUrl,
      duration,
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
    // File is optional - student can use previously uploaded file
    const result = await requestGuidanceService(
      req.user.sub,
      guidanceDate,
      studentNotes,
      file,
      supervisorId,
      { duration, milestoneId, milestoneIds: normalizedMilestoneIds, documentUrl }
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

// ==================== SESSION SUMMARY ====================

/**
 * GET /thesis-guidance/needs-summary
 * Get guidances that need summary submission (accepted + past scheduled time)
 */
export async function needsSummary(req, res, next) {
  try {
    const result = await getGuidancesNeedingSummaryService(req.user.sub);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /thesis-guidance/:guidanceId/submit-summary
 * Submit session summary after guidance
 */
export async function submitSummary(req, res, next) {
  try {
    const { guidanceId } = req.params;
    const { sessionSummary, actionItems } = req.body || {};
    const result = await submitSessionSummaryService(req.user.sub, guidanceId, {
      sessionSummary,
      actionItems,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /thesis-guidance/completed-history
 * Get completed guidance history for documentation
 */
export async function completedHistory(req, res, next) {
  try {
    const result = await getCompletedGuidanceHistoryService(req.user.sub);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /thesis-guidance/:guidanceId/export
 * Get single guidance detail for export/download
 */
export async function exportGuidance(req, res, next) {
  try {
    const { guidanceId } = req.params;
    const result = await getGuidanceForExportService(req.user.sub, guidanceId);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /thesis-guidance/:guidanceId/complete
 * Mark session as complete (student can directly complete without waiting for lecturer approval)
 */
export async function markSessionComplete(req, res, next) {
  try {
    const { guidanceId } = req.params;
    const { sessionSummary, actionItems } = req.body || {};
    const result = await markSessionCompleteService(req.user.sub, guidanceId, {
      sessionSummary,
      actionItems,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /thesis-guidance/student/my-thesis
 * Get current student's thesis detail
 */
export async function getMyThesis(req, res, next) {
  try {
    const result = await getMyThesisDetailService(req.user.sub);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /thesis-guidance/student/my-thesis/title
 * Update current student's thesis title
 */
export async function updateMyThesisTitle(req, res, next) {
  try {
    const { title } = req.body || {};
    const result = await updateMyThesisTitleService(req.user.sub, title);
    res.json({ success: true, message: "Judul tugas akhir berhasil diperbarui", ...result });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /thesis-guidance/history/theses
 * Get all theses for student (archive/history)
 */
export async function thesisHistory(req, res, next) {
  try {
    const result = await getThesisHistoryService(req.user.sub);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /thesis-guidance/student/propose
 * Propose new thesis (with auto-assigned supervisors from previous thesis)
 */
export async function proposeThesis(req, res, next) {
  try {
    const { title, topicId } = req.body || {};
    const result = await proposeThesisService(req.user.sub, { title, topicId });
    res.status(201).json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}
