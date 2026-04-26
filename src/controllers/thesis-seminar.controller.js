import * as coreService from "../services/thesis-seminar.service.js";
import * as docService from "../services/thesis-seminar-doc.service.js";
import * as audienceService from "../services/thesis-seminar-audience.service.js";
import * as examinerService from "../services/thesis-seminar-examiner.service.js";
import * as revisionService from "../services/thesis-seminar-revision.service.js";
import * as studentService from "../services/thesis-seminar-student.service.js";

// ============================================================
// CORE (Admin / Lecturer List)
// ============================================================

export async function getSeminars(req, res, next) {
  try {
    const { page, pageSize, search, view, status } = req.query;
    const result = await coreService.getSeminarList({
      page: parseInt(page) || 1,
      pageSize: parseInt(pageSize) || 10,
      search: search || "",
      view: view || "validation",
      status: status || null,
    });
    res.json(result);
  } catch (error) { next(error); }
}

export async function getSeminarDetail(req, res, next) {
  try {
    const result = await coreService.getSeminarDetail(req.params.id);
    res.json(result);
  } catch (error) { next(error); }
}

export async function getSchedulingData(req, res, next) {
  try {
    const result = await coreService.getSchedulingData(req.params.id);
    res.json(result);
  } catch (error) { next(error); }
}

export async function setSchedule(req, res, next) {
  try {
    const result = await coreService.scheduleSeminar(req.params.id, req.body);
    res.json(result);
  } catch (error) { next(error); }
}

export async function createArchive(req, res, next) {
  try {
    const result = await coreService.createArchive(req.body, req.user.id);
    res.status(201).json(result);
  } catch (error) { next(error); }
}

export async function updateArchive(req, res, next) {
  try {
    const result = await coreService.updateArchive(req.params.id, req.body, req.user.id);
    res.json(result);
  } catch (error) { next(error); }
}

export async function deleteArchive(req, res, next) {
  try {
    const result = await coreService.deleteArchive(req.params.id);
    res.json(result);
  } catch (error) { next(error); }
}

export async function getThesisOptions(req, res, next) {
  try {
    const result = await coreService.getThesisOptions();
    res.json(result);
  } catch (error) { next(error); }
}

export async function getLecturerOptions(req, res, next) {
  try {
    const result = await coreService.getLecturerOptions();
    res.json(result);
  } catch (error) { next(error); }
}

export async function getStudentOptions(req, res, next) {
  try {
    const result = await coreService.getStudentOptions();
    res.json(result);
  } catch (error) { next(error); }
}

export async function getRoomOptions(req, res, next) {
  try {
    const result = await coreService.getRoomOptions();
    res.json(result);
  } catch (error) { next(error); }
}

export async function exportArchive(req, res, next) {
  try {
    const buffer = await coreService.exportArchive();
    res.setHeader("Content-Disposition", 'attachment; filename="Arsip_Seminar_Hasil.xlsx"');
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buffer);
  } catch (error) { next(error); }
}

export async function getArchiveTemplate(req, res, next) {
  try {
    const buffer = await coreService.getArchiveTemplate();
    res.setHeader("Content-Disposition", 'attachment; filename="Template_Import_Seminar.xlsx"');
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buffer);
  } catch (error) { next(error); }
}

export async function importArchive(req, res, next) {
  try {
    if (!req.file) throw Object.assign(new Error("File tidak ditemukan"), { statusCode: 400 });
    const result = await coreService.importArchive(req.file.buffer, req.user.id);
    res.json(result);
  } catch (error) { next(error); }
}

// ============================================================
// DOCUMENTS
// ============================================================

export async function getDocumentTypes(req, res, next) {
  try {
    const result = await docService.getDocumentTypes();
    res.json(result);
  } catch (error) { next(error); }
}

export async function getDocuments(req, res, next) {
  try {
    const result = await docService.getDocuments(req.params.id);
    res.json(result);
  } catch (error) { next(error); }
}

export async function uploadDocument(req, res, next) {
  try {
    // Note: If uploading from student route without seminarId in param, we pass undefined
    const result = await docService.uploadDocument(req.params.id, req.user.studentId, req.file, req.body.documentTypeName);
    res.json(result);
  } catch (error) { next(error); }
}

export async function viewDocument(req, res, next) {
  try {
    const result = await docService.viewDocument(req.params.id, req.params.documentTypeId);
    res.json(result);
  } catch (error) { next(error); }
}

export async function validateDocument(req, res, next) {
  try {
    const result = await docService.validateDocument(req.params.id, req.params.documentTypeId, {
      action: req.body.action,
      notes: req.body.notes,
      userId: req.user.id,
    });
    res.json(result);
  } catch (error) { next(error); }
}

// ============================================================
// EXAMINERS
// ============================================================

export async function getEligibleExaminers(req, res, next) {
  try {
    const result = await examinerService.getEligibleExaminers(req.params.id);
    res.json(result);
  } catch (error) { next(error); }
}

export async function assignExaminers(req, res, next) {
  try {
    const result = await examinerService.assignExaminers(req.params.id, req.body.examinerIds, req.user.id);
    res.json(result);
  } catch (error) { next(error); }
}

export async function respondAssignment(req, res, next) {
  try {
    const result = await examinerService.respondExaminerAssignment(req.params.id, req.params.examinerId, req.body, req.user.lecturerId);
    res.json(result);
  } catch (error) { next(error); }
}

export async function getAssessment(req, res, next) {
  try {
    const result = await examinerService.getExaminerAssessment(req.params.id, req.user.lecturerId);
    res.json(result);
  } catch (error) { next(error); }
}

export async function submitAssessment(req, res, next) {
  try {
    const result = await examinerService.submitExaminerAssessment(req.params.id, req.body, req.user.lecturerId);
    res.json(result);
  } catch (error) { next(error); }
}

export async function getFinalizationData(req, res, next) {
  try {
    const result = await examinerService.getFinalizationData(req.params.id, req.user.lecturerId);
    res.json(result);
  } catch (error) { next(error); }
}

export async function finalizeSeminar(req, res, next) {
  try {
    const result = await examinerService.finalizeSeminar(req.params.id, req.user.lecturerId, req.body);
    res.json(result);
  } catch (error) { next(error); }
}

// ============================================================
// AUDIENCES
// ============================================================

export async function getAudiences(req, res, next) {
  try {
    const result = await audienceService.getAudiences(req.params.id);
    res.json(result);
  } catch (error) { next(error); }
}

export async function getStudentOptionsForAudience(req, res, next) {
  try {
    const result = await audienceService.getStudentOptionsForAudience(req.params.id);
    res.json(result);
  } catch (error) { next(error); }
}

export async function addAudience(req, res, next) {
  try {
    const result = await audienceService.addAudience(req.params.id, req.body, req.user);
    res.json(result);
  } catch (error) { next(error); }
}

export async function removeAudience(req, res, next) {
  try {
    const studentId = req.params.studentId || req.user.studentId;
    const result = await audienceService.removeAudience(req.params.id, studentId, req.user);
    res.json(result);
  } catch (error) { next(error); }
}

export async function updateAudience(req, res, next) {
  try {
    const result = await audienceService.updateAudience(req.params.id, req.params.studentId, req.body, req.user);
    res.json(result);
  } catch (error) { next(error); }
}

export async function exportAudiences(req, res, next) {
  try {
    const buffer = await audienceService.exportAudiences(req.params.id);
    res.setHeader("Content-Disposition", 'attachment; filename="Daftar_Audience.xlsx"');
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buffer);
  } catch (error) { next(error); }
}

export async function getAudienceTemplate(req, res, next) {
  try {
    const buffer = await audienceService.getAudienceTemplate();
    res.setHeader("Content-Disposition", 'attachment; filename="Template_Audience.xlsx"');
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buffer);
  } catch (error) { next(error); }
}

export async function importAudiences(req, res, next) {
  try {
    if (!req.file) throw Object.assign(new Error("File tidak ditemukan"), { statusCode: 400 });
    const result = await audienceService.importAudiences(req.params.id, req.file);
    res.json(result);
  } catch (error) { next(error); }
}

// ============================================================
// REVISIONS
// ============================================================

export async function getRevisions(req, res, next) {
  try {
    const result = await revisionService.getRevisions(req.params.id, req.user);
    res.json(result);
  } catch (error) { next(error); }
}

export async function createRevision(req, res, next) {
  try {
    const result = await revisionService.createRevision(req.params.id, req.body, req.user.studentId);
    res.status(201).json(result);
  } catch (error) { next(error); }
}

export async function updateRevision(req, res, next) {
  try {
    const result = await revisionService.updateRevision(req.params.id, req.params.revisionId, req.body, req.user);
    res.json(result);
  } catch (error) { next(error); }
}

export async function deleteRevision(req, res, next) {
  try {
    const result = await revisionService.deleteRevision(req.params.id, req.params.revisionId, req.user.studentId);
    res.json(result);
  } catch (error) { next(error); }
}

export async function finalizeRevisions(req, res, next) {
  try {
    const result = await revisionService.finalizeRevisions(req.params.id, req.user.lecturerId);
    res.json(result);
  } catch (error) { next(error); }
}

// ============================================================
// STUDENT SPECIFIC
// ============================================================

export async function getStudentOverview(req, res, next) {
  try {
    const result = await studentService.getOverview(req.user.id);
    res.json(result);
  } catch (error) { next(error); }
}

export async function getAnnouncements(req, res, next) {
  try {
    const result = await studentService.getAnnouncements(req.user.id);
    res.json(result);
  } catch (error) { next(error); }
}

export async function getAttendanceHistory(req, res, next) {
  try {
    const result = await studentService.getAttendanceHistory(req.user.id);
    res.json(result);
  } catch (error) { next(error); }
}

export async function getStudentHistory(req, res, next) {
  try {
    const result = await studentService.getSeminarHistory(req.user.id);
    res.json(result);
  } catch (error) { next(error); }
}

export async function getStudentSeminarDetail(req, res, next) {
  try {
    const result = await studentService.getSeminarDetail(req.user.id, req.params.id);
    res.json(result);
  } catch (error) { next(error); }
}

export async function getStudentAssessmentView(req, res, next) {
  try {
    const result = await studentService.getAssessmentView(req.user.id, req.params.id);
    res.json(result);
  } catch (error) { next(error); }
}
