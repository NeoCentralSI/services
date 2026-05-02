/**
 * Yudisium Controller (Phase 1 stub).
 *
 * Single dispatch surface for the new resource-oriented yudisium routes.
 * For Phase 1 we still delegate to the existing role-named controllers
 * (controllers/yudisium/*.js) so behaviour is unchanged. Phase 2 will
 * inline the logic here and split services by resource (core, requirement,
 * participant, cpl, sk, exit-survey) following the thesis-seminar pattern.
 *
 * Some new routes use `:id` in the path while the underlying controller still
 * reads `req.params.yudisiumId` — the small adapters below normalise that.
 */

import * as eventCtrl from "./yudisium/yudisium.controller.js";
import * as requirementCtrl from "./yudisium/yudisium-requirement.controller.js";
import * as adminCtrl from "./yudisium/admin-yudisium.controller.js";
import * as studentCtrl from "./yudisium/student-yudisium.controller.js";
import * as lecturerCtrl from "./yudisium/lecturer-yudisium.controller.js";
import * as exitFormCtrl from "./yudisium/exit-survey-form.controller.js";
import * as exitQuestionCtrl from "./yudisium/exit-survey-question.controller.js";

const aliasIdAs = (alias) => (req, res, next, handler) => {
  req.params[alias] = req.params.id;
  return handler(req, res, next);
};

// ============================================================
// EVENTS (CRUD)
// ============================================================

export const getEvents = eventCtrl.getAll;
export const getEventById = eventCtrl.getById;
export const createEvent = eventCtrl.create;
export const updateEvent = eventCtrl.update;
export const removeEvent = eventCtrl.remove;

// ============================================================
// PARTICIPANTS
// ============================================================

export const getParticipants = (req, res, next) =>
  aliasIdAs("yudisiumId")(req, res, next, adminCtrl.getParticipants);

export const getParticipantDetail = adminCtrl.getParticipantDetail;

export const getParticipantRequirements = adminCtrl.getParticipantDetail;

export const validateParticipantDocument = adminCtrl.validateDocument;

// ============================================================
// CPL (Lecturer / GKM)
// ============================================================

export const getParticipantCplScores = lecturerCtrl.getCplScores;
export const verifyParticipantCpl = lecturerCtrl.verifyCpl;
export const createCplRecommendation = lecturerCtrl.createRecommendation;
export const updateCplRecommendationStatus = lecturerCtrl.updateRecommendationStatus;

// ============================================================
// SK (Decree)
// ============================================================

export const generateDraftSk = (req, res, next) =>
  aliasIdAs("yudisiumId")(req, res, next, lecturerCtrl.generateDraft);

export const uploadSk = (req, res, next) =>
  aliasIdAs("yudisiumId")(req, res, next, lecturerCtrl.uploadSk);

// ============================================================
// STUDENT (/me)
// ============================================================

export const getStudentOverview = studentCtrl.getOverview;
export const getStudentExitSurvey = studentCtrl.getExitSurvey;
export const submitStudentExitSurvey = studentCtrl.submitExitSurvey;
export const getStudentRequirements = studentCtrl.getRequirements;
export const uploadStudentDocument = studentCtrl.uploadDocument;

// ============================================================
// REQUIREMENTS (Global checklist)
// ============================================================

export const getAllRequirements = requirementCtrl.getAll;
export const getRequirementById = requirementCtrl.getById;
export const createRequirement = requirementCtrl.create;
export const updateRequirement = requirementCtrl.update;
export const toggleRequirement = requirementCtrl.toggle;
export const moveRequirementTop = requirementCtrl.moveTop;
export const moveRequirementBottom = requirementCtrl.moveBottom;
export const removeRequirement = requirementCtrl.remove;

// ============================================================
// EXIT SURVEY FORMS
// ============================================================

export const getAllExitSurveyForms = exitFormCtrl.getAll;
export const getExitSurveyFormById = exitFormCtrl.getById;
export const createExitSurveyForm = exitFormCtrl.create;
export const updateExitSurveyForm = exitFormCtrl.update;
export const toggleExitSurveyForm = exitFormCtrl.toggle;
export const removeExitSurveyForm = exitFormCtrl.remove;
export const duplicateExitSurveyForm = exitFormCtrl.duplicate;

// ============================================================
// EXIT SURVEY QUESTIONS
// ============================================================

export const getQuestionsByForm = exitQuestionCtrl.getByFormId;
export const getQuestionById = exitQuestionCtrl.getById;
export const createQuestion = exitQuestionCtrl.create;
export const updateQuestion = exitQuestionCtrl.update;
export const removeQuestion = exitQuestionCtrl.remove;
