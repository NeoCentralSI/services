/**
 * Yudisium Controller.
 *
 * Implements logic for yudisium events, requirements, participants, 
 * CPL verification, and exit surveys by calling respective services.
 */

import * as requirementService from "../services/yudisium-requirement.service.js";
import * as yudisiumService from "../services/yudisium.service.js";
import * as participantService from "../services/yudisium-participant.service.js";
import * as exitSurveyService from "../services/yudisium-exit-survey.service.js";
import * as studentService from "../services/yudisium-student.service.js";

// ============================================================
// EVENTS (CRUD)
// ============================================================

export const getEvents = async (req, res, next) => {
  try {
    const data = await yudisiumService.getYudisiumList();
    res.json({ status: "success", data });
  } catch (err) {
    next(err);
  }
};

export const getEventById = async (req, res, next) => {
  try {
    const data = await yudisiumService.getYudisiumDetail(req.params.id);
    res.json({ status: "success", data });
  } catch (err) {
    next(err);
  }
};

export const createEvent = async (req, res, next) => {
  try {
    const data = await yudisiumService.createYudisium(req.body);
    res.status(201).json({ status: "success", data });
  } catch (err) {
    next(err);
  }
};

export const updateEvent = async (req, res, next) => {
  try {
    const data = await yudisiumService.updateYudisium(req.params.id, req.body);
    res.json({ status: "success", data });
  } catch (err) {
    next(err);
  }
};

export const removeEvent = async (req, res, next) => {
  try {
    await yudisiumService.deleteYudisium(req.params.id);
    res.json({ status: "success", message: "Event yudisium berhasil dihapus" });
  } catch (err) {
    next(err);
  }
};

// ============================================================
// PARTICIPANTS
// ============================================================

export const getParticipants = async (req, res, next) => {
  try {
    const yudisiumId = req.params.id;
    const data = await participantService.getParticipants(yudisiumId);
    res.json({ status: "success", data });
  } catch (err) {
    next(err);
  }
};

export const getParticipantDetail = async (req, res, next) => {
  try {
    const { participantId } = req.params;
    const data = await participantService.getParticipantDetail(participantId);
    res.json({ status: "success", data });
  } catch (err) {
    next(err);
  }
};

export const getParticipantRequirements = async (req, res, next) => {
  try {
    const { participantId } = req.params;
    const data = await participantService.getParticipantDetail(participantId);
    res.json({ status: "success", data });
  } catch (err) {
    next(err);
  }
};

export const validateParticipantDocument = async (req, res, next) => {
  try {
    const { participantId, requirementId } = req.params;
    const { action, notes } = req.body;
    const data = await participantService.validateParticipantDocument(participantId, requirementId, { 
      action, 
      notes, 
      userId: req.user.id 
    });
    res.json({ status: "success", data });
  } catch (err) {
    next(err);
  }
};

// ============================================================
// CPL (Lecturer / GKM)
// ============================================================

export const getParticipantCplScores = async (req, res, next) => {
  try {
    const { participantId } = req.params;
    const data = await participantService.getParticipantCplScores(participantId);
    res.json({ status: "success", data });
  } catch (err) {
    next(err);
  }
};

export const verifyParticipantCpl = async (req, res, next) => {
  try {
    const { participantId, cplId } = req.params;
    const data = await participantService.verifyCplScore(participantId, cplId, req.user.id);
    res.json({ status: "success", data });
  } catch (err) {
    next(err);
  }
};

export const createCplRecommendation = async (req, res, next) => {
  try {
    const { participantId, cplId } = req.params;
    const data = await participantService.createCplRecommendation(participantId, cplId, { 
      ...req.body, 
      userId: req.user.id 
    });
    res.json({ status: "success", data });
  } catch (err) {
    next(err);
  }
};

export const updateCplRecommendationStatus = async (req, res, next) => {
  try {
    const { recommendationId } = req.params;
    const data = await participantService.updateCplRecommendationStatus(recommendationId, { 
      ...req.body, 
      userId: req.user.id 
    });
    res.json({ status: "success", data });
  } catch (err) {
    next(err);
  }
};

// ============================================================
// SK (Decree)
// ============================================================

export const generateDraftSk = async (req, res, next) => {
  try {
    const yudisiumId = req.params.id;
    const data = await participantService.generateDraftSk(yudisiumId);
    res.contentType("application/pdf");
    res.send(data);
  } catch (err) {
    next(err);
  }
};

export const uploadSk = async (req, res, next) => {
  try {
    const yudisiumId = req.params.id;
    const data = await participantService.uploadOfficialSk(yudisiumId, { 
      file: req.file, 
      ...req.body, 
      userId: req.user.id 
    });
    res.json({ status: "success", data });
  } catch (err) {
    next(err);
  }
};

// ============================================================
// STUDENT (/me)
// ============================================================

export const getStudentOverview = async (req, res, next) => {
  try {
    const data = await studentService.getOverview(req.user.id);
    res.json({ status: "success", data });
  } catch (err) {
    next(err);
  }
};

export const getStudentExitSurvey = async (req, res, next) => {
  try {
    const data = await exitSurveyService.getStudentSurvey(req.user.id);
    res.json({ status: "success", data });
  } catch (err) {
    next(err);
  }
};

export const submitStudentExitSurvey = async (req, res, next) => {
  try {
    const data = await exitSurveyService.submitStudentSurvey(req.user.id, req.body);
    res.json({ status: "success", data });
  } catch (err) {
    next(err);
  }
};

export const getStudentRequirements = async (req, res, next) => {
  try {
    const data = await studentService.getOwnRequirements(req.user.id);
    res.json({ status: "success", data });
  } catch (err) {
    next(err);
  }
};

export const uploadStudentDocument = async (req, res, next) => {
  try {
    const data = await studentService.uploadOwnDocument(req.user.id, req.file, req.body.requirementId);
    res.json({ status: "success", data });
  } catch (err) {
    next(err);
  }
};

// ============================================================
// REQUIREMENTS (Global checklist)
// ============================================================

export const getAllRequirements = async (req, res, next) => {
  try {
    const data = await requirementService.getRequirements();
    res.json({ status: "success", data });
  } catch (err) {
    next(err);
  }
};

export const getRequirementById = async (req, res, next) => {
  try {
    const data = await requirementService.getRequirementDetail(req.params.id);
    res.json({ status: "success", data });
  } catch (err) {
    next(err);
  }
};

export const createRequirement = async (req, res, next) => {
  try {
    const data = await requirementService.createRequirement(req.body);
    res.status(201).json({ status: "success", data });
  } catch (err) {
    next(err);
  }
};

export const updateRequirement = async (req, res, next) => {
  try {
    const data = await requirementService.updateRequirement(req.params.id, req.body);
    res.json({ status: "success", data });
  } catch (err) {
    next(err);
  }
};

export const toggleRequirement = async (req, res, next) => {
  try {
    const data = await requirementService.toggleRequirement(req.params.id);
    res.json({ status: "success", data });
  } catch (err) {
    next(err);
  }
};

export const moveRequirementTop = async (req, res, next) => {
  try {
    const data = await requirementService.moveRequirementToTop(req.params.id);
    res.json({ status: "success", data });
  } catch (err) {
    next(err);
  }
};

export const moveRequirementBottom = async (req, res, next) => {
  try {
    const data = await requirementService.moveRequirementToBottom(req.params.id);
    res.json({ status: "success", data });
  } catch (err) {
    next(err);
  }
};

export const removeRequirement = async (req, res, next) => {
  try {
    await requirementService.deleteRequirement(req.params.id);
    res.json({ status: "success", message: "Persyaratan yudisium berhasil dihapus" });
  } catch (err) {
    next(err);
  }
};

// ============================================================
// EXIT SURVEY FORMS
// ============================================================

export const getAllExitSurveyForms = async (req, res, next) => {
  try {
    const data = await exitSurveyService.getForms();
    res.json({ status: "success", data });
  } catch (err) {
    next(err);
  }
};

export const getExitSurveyFormById = async (req, res, next) => {
  try {
    const data = await exitSurveyService.getFormDetail(req.params.id);
    res.json({ status: "success", data });
  } catch (err) {
    next(err);
  }
};

export const createExitSurveyForm = async (req, res, next) => {
  try {
    const data = await exitSurveyService.createForm(req.body);
    res.status(201).json({ status: "success", data });
  } catch (err) {
    next(err);
  }
};

export const updateExitSurveyForm = async (req, res, next) => {
  try {
    const data = await exitSurveyService.updateForm(req.params.id, req.body);
    res.json({ status: "success", data });
  } catch (err) {
    next(err);
  }
};

export const toggleExitSurveyForm = async (req, res, next) => {
  try {
    const data = await exitSurveyService.toggleForm(req.params.id);
    res.json({ status: "success", data });
  } catch (err) {
    next(err);
  }
};

export const removeExitSurveyForm = async (req, res, next) => {
  try {
    await exitSurveyService.deleteForm(req.params.id);
    res.json({ status: "success", message: "Form exit survey berhasil dihapus" });
  } catch (err) {
    next(err);
  }
};

export const duplicateExitSurveyForm = async (req, res, next) => {
  try {
    const data = await exitSurveyService.duplicateForm(req.params.id);
    res.json({ status: "success", data });
  } catch (err) {
    next(err);
  }
};

// ============================================================
// EXIT SURVEY QUESTIONS
// ============================================================

export const getQuestionsByForm = async (req, res, next) => {
  try {
    const data = await exitSurveyService.getQuestionsByForm(req.params.formId);
    res.json({ status: "success", data });
  } catch (err) {
    next(err);
  }
};

export const getQuestionById = async (req, res, next) => {
  try {
    const data = await exitSurveyService.getQuestionDetail(req.params.id);
    res.json({ status: "success", data });
  } catch (err) {
    next(err);
  }
};

export const createQuestion = async (req, res, next) => {
  try {
    const data = await exitSurveyService.createQuestion(req.params.formId, req.body);
    res.status(201).json({ status: "success", data });
  } catch (err) {
    next(err);
  }
};

export const updateQuestion = async (req, res, next) => {
  try {
    const data = await exitSurveyService.updateQuestion(req.params.formId, req.params.id, req.body);
    res.json({ status: "success", data });
  } catch (err) {
    next(err);
  }
};

export const removeQuestion = async (req, res, next) => {
  try {
    await exitSurveyService.deleteQuestion(req.params.formId, req.params.id);
    res.json({ status: "success", message: "Pertanyaan exit survey berhasil dihapus" });
  } catch (err) {
    next(err);
  }
};
