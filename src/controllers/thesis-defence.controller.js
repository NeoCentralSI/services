import * as coreService from "../services/thesis-defence/core.service.js";
import * as docService from "../services/thesis-defence/doc.service.js";
import * as examinerService from "../services/thesis-defence/examiner.service.js";
import * as revisionService from "../services/thesis-defence/revision.service.js";
import * as studentService from "../services/thesis-defence/student.service.js";

// ============================================================
// CORE — list, detail, schedule
// ============================================================

export async function getDefences(req, res, next) {
  try {
    const { page, pageSize, search, status, view } = req.query;
    const result = await coreService.getDefenceList({
      page: parseInt(page) || 1,
      pageSize: parseInt(pageSize) || 10,
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
    const result = await coreService.setSchedule(req.params.id, req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function finalizeSchedule(req, res, next) {
  try {
    const result = await coreService.finalizeSchedule(req.params.id, req.user?.id);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function cancelDefence(req, res, next) {
  try {
    const result = await coreService.cancelDefence(req.params.id, req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function createArchive(req, res, next) {
  try {
    const result = await coreService.createArchive(req.body, req.user.id);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function updateArchive(req, res, next) {
  try {
    const result = await coreService.updateArchive(req.params.id, req.body, req.user.id);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function deleteArchive(req, res, next) {
  try {
    const result = await coreService.deleteArchive(req.params.id);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function getThesisOptions(req, res, next) {
  try {
    const result = await coreService.getThesisOptions();
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function getLecturerOptions(req, res, next) {
  try {
    const result = await coreService.getLecturerOptions();
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function getStudentOptions(req, res, next) {
  try {
    const result = await coreService.getStudentOptions();
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function getRoomOptions(req, res, next) {
  try {
    const result = await coreService.getRoomOptions();
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function exportArchive(req, res, next) {
  try {
    const buffer = await coreService.exportArchive();
    res.setHeader("Content-Disposition", 'attachment; filename="Arsip_Sidang_TA.xlsx"');
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buffer);
  } catch (error) {
    next(error);
  }
}

export async function importArchive(req, res, next) {
  try {
    if (!req.file) throw Object.assign(new Error("File tidak ditemukan"), { statusCode: 400 });
    const result = await coreService.importArchive(req.file.buffer, req.user.id);
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

export async function verifyDocument(req, res, next) {
  try {
    const result = await docService.verifyDocument(req.params.id, req.params.documentTypeId, {
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
    const result = await examinerService.getAssessment(req.params.id, req.user);
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
    const result = await examinerService.getFinalizationData(req.params.id, req.user);
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
    const result = await revisionService.createRevision(
      req.params.id, 
      req.body, 
      req.user.studentId,
      req.user
    );
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
      req.user.studentId,
      req.user
    );
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function finalizeRevisions(req, res, next) {
  try {
    const result = await revisionService.finalizeRevisions(
      req.params.id, 
      req.user.lecturerId,
      req.user
    );
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function unfinalizeRevisions(req, res, next) {
  try {
    const result = await revisionService.unfinalizeRevisions(
      req.params.id, 
      req.user.lecturerId,
      req.user
    );
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

export async function downloadInvitationLetter(req, res, next) {
  try {
    const pdfBuffer = await coreService.generateInvitationLetter(req.params.id, req.query.nomorSurat);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=Surat-Undangan-Sidang-TA.pdf`);
    res.send(pdfBuffer);
  } catch (error) { next(error); }
}
export async function downloadAssessmentResult(req, res, next) {
  try {
    const pdfBuffer = await coreService.generateAssessmentResultPdf(req.params.id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=Hasil-Penilaian-Sidang-TA.pdf");
    res.send(pdfBuffer);
  } catch (error) { next(error); }
}
