import * as coreService from "../services/thesis-defence.service.js";
import * as docService from "../services/thesis-defence-doc.service.js";
import * as examinerService from "../services/thesis-defence-examiner.service.js";
import * as revisionService from "../services/thesis-defence-revision.service.js";
import * as studentService from "../services/thesis-defence-student.service.js";

// ============================================================
// CORE — list, detail, schedule
// ============================================================

export async function getDefences(req, res, next) {
  try {
    const { search, status, view } = req.query;
    const result = await coreService.getDefenceList({
      search: search || "",
      status: status || null,
      view: view || null,
      user: req.user,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function getDefenceDetail(req, res, next) {
  try {
    const result = await coreService.getDefenceDetail(req.params.id, req.user);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function getSchedulingData(req, res, next) {
  try {
    const result = await coreService.getSchedulingData(req.params.id);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function setSchedule(req, res, next) {
  try {
    const result = await coreService.scheduleDefence(req.params.id, req.validated);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

// ============================================================
// DOCUMENTS
// ============================================================

export async function getDocumentTypes(req, res, next) {
  try {
    const result = await docService.getDocumentTypes();
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function getDocuments(req, res, next) {
  try {
    const result = await docService.getDocuments(req.params.id);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function uploadDocument(req, res, next) {
  try {
    const result = await docService.uploadDocument(
      req.params.id,
      req.user.id,
      req.file,
      req.body.documentTypeName
    );
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function viewDocument(req, res, next) {
  try {
    const result = await docService.viewDocument(req.params.id, req.params.documentTypeId);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function validateDocument(req, res, next) {
  try {
    const result = await docService.validateDocument(req.params.id, req.params.documentTypeId, {
      action: req.body.action,
      notes: req.body.notes,
      userId: req.user.id,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

// ============================================================
// EXAMINERS
// ============================================================

export async function getEligibleExaminers(req, res, next) {
  try {
    const result = await examinerService.getEligibleExaminers(req.params.id);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function assignExaminers(req, res, next) {
  try {
    const result = await examinerService.assignExaminers(
      req.params.id,
      req.body.examinerIds,
      req.user.id
    );
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function respondAssignment(req, res, next) {
  try {
    const result = await examinerService.respondExaminerAssignment(
      req.params.id,
      req.params.examinerId,
      req.body,
      req.user.lecturerId
    );
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function getAssessment(req, res, next) {
  try {
    const result = await examinerService.getAssessment(req.params.id, req.user.lecturerId);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function submitAssessment(req, res, next) {
  try {
    const result = await examinerService.submitAssessment(req.params.id, req.body, req.user.lecturerId);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function getFinalizationData(req, res, next) {
  try {
    const result = await examinerService.getFinalizationData(req.params.id, req.user.lecturerId);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function finalizeDefence(req, res, next) {
  try {
    const result = await examinerService.finalizeDefence(req.params.id, req.body, req.user.lecturerId);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

// ============================================================
// REVISIONS
// ============================================================

export async function getRevisions(req, res, next) {
  try {
    const result = await revisionService.getRevisions(req.params.id, req.user);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function createRevision(req, res, next) {
  try {
    const result = await revisionService.createRevision(req.params.id, req.body, req.user.studentId);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function updateRevision(req, res, next) {
  try {
    const result = await revisionService.updateRevision(
      req.params.id,
      req.params.revisionId,
      req.body,
      req.user
    );
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function deleteRevision(req, res, next) {
  try {
    const result = await revisionService.deleteRevision(
      req.params.id,
      req.params.revisionId,
      req.user.studentId
    );
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function finalizeRevisions(req, res, next) {
  try {
    const result = await revisionService.finalizeRevisions(req.params.id, req.user.lecturerId);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

// ============================================================
// STUDENT-SPECIFIC
// ============================================================

export async function getStudentOverview(req, res, next) {
  try {
    const result = await studentService.getOverview(req.user.id);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function getStudentHistory(req, res, next) {
  try {
    const result = await studentService.getDefenceHistory(req.user.id);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function getStudentDefenceDetail(req, res, next) {
  try {
    const result = await studentService.getDefenceDetail(req.user.id, req.params.id);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function getStudentAssessmentView(req, res, next) {
  try {
    const result = await studentService.getAssessmentView(req.user.id, req.params.id);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}
