import * as formRepo from "../repositories/exitSurveyForm.repository.js";
import * as questionRepo from "../repositories/exitSurveyQuestion.repository.js";

class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = "NotFoundError";
    this.statusCode = 404;
  }
}

const QUESTION_TYPES = ["single_choice", "multiple_choice", "text", "textarea"];

function validateQuestionType(value) {
  if (!QUESTION_TYPES.includes(value)) {
    const e = new Error("Jenis pertanyaan tidak valid");
    e.statusCode = 400;
    throw e;
  }
}

export const getQuestionsByFormId = async (formId) => {
  const form = await formRepo.findById(formId);
  if (!form) throw new NotFoundError("Form exit survey tidak ditemukan");

  const questions = await questionRepo.findManyByFormId(formId);
  return questions.map((q) => ({
    id: q.id,
    exitSurveyFormId: q.exitSurveyFormId,
    question: q.question,
    questionType: q.questionType,
    isRequired: q.isRequired,
    orderNumber: q.orderNumber,
    options: (q.options ?? []).map((o) => ({
      id: o.id,
      optionText: o.optionText,
      orderNumber: o.orderNumber,
    })),
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
  }));
};

export const getQuestionById = async (questionId) => {
  const q = await questionRepo.findById(questionId);
  if (!q) throw new NotFoundError("Pertanyaan tidak ditemukan");
  return {
    id: q.id,
    exitSurveyFormId: q.exitSurveyFormId,
    question: q.question,
    questionType: q.questionType,
    isRequired: q.isRequired,
    orderNumber: q.orderNumber,
    options: (q.options ?? []).map((o) => ({
      id: o.id,
      optionText: o.optionText,
      orderNumber: o.orderNumber,
    })),
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
  };
};

export const createQuestion = async (formId, data) => {
  const form = await formRepo.findById(formId);
  if (!form) throw new NotFoundError("Form exit survey tidak ditemukan");
  validateQuestionType(data.questionType);

  const payload = {
    exitSurveyFormId: formId,
    question: data.question,
    questionType: data.questionType,
    isRequired: data.isRequired === true,
    orderNumber: Number(data.orderNumber) ?? 0,
  };

  if (data.questionType === "single_choice" || data.questionType === "multiple_choice") {
    if (data.options && Array.isArray(data.options) && data.options.length > 0) {
      payload.options = data.options.map((opt, i) => ({
        optionText: typeof opt === "string" ? opt : opt?.optionText ?? "",
        orderNumber: typeof opt === "object" && opt?.orderNumber != null ? opt.orderNumber : i + 1,
      }));
    }
  }

  return await questionRepo.create(payload);
};

export const updateQuestion = async (formId, questionId, data) => {
  const form = await formRepo.findById(formId);
  if (!form) throw new NotFoundError("Form exit survey tidak ditemukan");

  const existing = await questionRepo.findById(questionId);
  if (!existing || existing.exitSurveyFormId !== formId) {
    throw new NotFoundError("Pertanyaan tidak ditemukan");
  }

  if (data.questionType !== undefined) validateQuestionType(data.questionType);

  const payload = {};
  if (data.question !== undefined) payload.question = data.question;
  if (data.questionType !== undefined) payload.questionType = data.questionType;
  if (data.isRequired !== undefined) payload.isRequired = data.isRequired === true;
  if (data.orderNumber !== undefined) payload.orderNumber = Number(data.orderNumber);

  const isChoiceType = (t) => t === "single_choice" || t === "multiple_choice";
  if (isChoiceType(data.questionType) || isChoiceType(existing.questionType)) {
    if (data.questionType === "text" || data.questionType === "textarea") {
      payload.options = [];
    } else if (data.options && Array.isArray(data.options)) {
      payload.options = data.options.map((opt, i) => ({
        optionText: typeof opt === "string" ? opt : opt?.optionText ?? "",
        orderNumber: typeof opt === "object" && opt?.orderNumber != null ? opt.orderNumber : i + 1,
      }));
    }
  }

  return await questionRepo.update(questionId, payload);
};

export const deleteQuestion = async (formId, questionId) => {
  const form = await formRepo.findById(formId);
  if (!form) throw new NotFoundError("Form exit survey tidak ditemukan");

  const existing = await questionRepo.findById(questionId);
  if (!existing || existing.exitSurveyFormId !== formId) {
    throw new NotFoundError("Pertanyaan tidak ditemukan");
  }

  await questionRepo.remove(questionId);
};
