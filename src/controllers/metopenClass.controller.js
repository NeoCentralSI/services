import * as classService from "../services/metopenClass.service.js";

// ============================================
// Class CRUD
// ============================================

export async function getClasses(req, res, next) {
  try {
    const { academicYearId } = req.query;
    const data = await classService.getClasses(req.user.sub, academicYearId || null);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getAcademicYears(req, res, next) {
  try {
    const data = await classService.getAcademicYears();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getRoster(req, res, next) {
  try {
    const { academicYearId } = req.query;
    const data = await classService.getRoster(academicYearId || null);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function autoSyncClass(req, res, next) {
  try {
    const data = await classService.autoSyncClass(req.user.sub);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getClassById(req, res, next) {
  try {
    const data = await classService.getClassById(req.params.classId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function createClass(req, res, next) {
  try {
    const data = await classService.createClass(req.validated ?? req.body, req.user.sub);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function updateClass(req, res, next) {
  try {
    const data = await classService.updateClass(req.params.classId, req.validated ?? req.body);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function deleteClass(req, res, next) {
  try {
    const result = await classService.deleteClass(req.params.classId);
    res.json({ success: true, data: result, message: "Kelas berhasil dihapus" });
  } catch (err) {
    next(err);
  }
}

// ============================================
// Enrollment
// ============================================

export async function enrollStudents(req, res, next) {
  try {
    const { studentIds } = req.validated ?? req.body;
    const data = await classService.enrollStudents(req.params.classId, studentIds);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function unenrollStudent(req, res, next) {
  try {
    const data = await classService.unenrollStudent(req.params.classId, req.params.studentId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ============================================
// Publish & Tasks
// ============================================

export async function publishToClass(req, res, next) {
  try {
    const { templateIds, templateDeadlines } = req.validated ?? req.body;
    const data = await classService.publishToClass(req.params.classId, {
      templateIds,
      templateDeadlines,
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getClassTasks(req, res, next) {
  try {
    const data = await classService.getClassTasks(req.params.classId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getClassTaskDetail(req, res, next) {
  try {
    const data = await classService.getClassTaskDetail(req.params.classId, req.params.templateId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getPublishedTemplateIds(req, res, next) {
  try {
    const data = await classService.getPublishedTemplateIds(req.params.classId);
    res.json({ success: true, data: Array.from(data) });
  } catch (err) {
    next(err);
  }
}
