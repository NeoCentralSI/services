import * as repo from "../repositories/yudisium-exit-survey.repository.js";
import { findStudentContext } from "./yudisium-student.service.js";

function throwError(msg, code) {
  const e = new Error(msg);
  e.statusCode = code;
  throw e;
}

const QUESTION_TYPES = ["single_choice", "multiple_choice", "text", "textarea"];

const validateQuestionType = (value) => {
  if (!QUESTION_TYPES.includes(value)) throwError("Jenis pertanyaan tidak valid", 400);
};

const formatFormSummary = (item) => ({
  id: item.id,
  name: item.name,
  description: item.description ?? null,
  isActive: item.isActive,
  totalSessions: item._count?.sessions ?? 0,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

const formatQuestion = (q, sessionName = q.session?.name) => ({
  id: q.id,
  exitSurveySessionId: q.exitSurveySessionId,
  sessionName,
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
});

const mapStudentResponse = (response) => {
  if (!response) return null;
  return {
    id: response.id,
    submittedAt: response.submittedAt,
    answers: response.answers.map((a) => ({
      id: a.id,
      questionId: a.exitSurveyQuestionId,
      optionId: a.exitSurveyOptionId,
      answerText: a.answerText,
    })),
  };
};

// ============================================================
// FORMS
// ============================================================

export const getForms = async () => {
  const items = await repo.findAllForms();
  return items.map(formatFormSummary);
};

export const getFormDetail = async (id) => {
  const data = await repo.findFormById(id);
  if (!data) throwError("Form exit survey tidak ditemukan", 404);

  const questions = data.sessions.flatMap((session) =>
    session.questions.map((q) => formatQuestion(q, session.name))
  );

  return {
    id: data.id,
    name: data.name,
    description: data.description ?? null,
    isActive: data.isActive,
    sessions: data.sessions.map((s) => ({ id: s.id, name: s.name, order: s.order })),
    questions,
    _count: data._count,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
};

export const createForm = async (data) => {
  return await repo.createForm({
    name: data.name,
    description: data.description ?? null,
    isActive: data.isActive !== false,
  });
};

export const updateForm = async (id, data) => {
  const existing = await repo.findFormById(id);
  if (!existing) throwError("Form exit survey tidak ditemukan", 404);

  if (await repo.formHasLinkedResponses(id)) {
    throwError(
      "Form exit survey tidak dapat diubah karena sudah digunakan mahasiswa",
      409
    );
  }

  const updateData = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;

  return await repo.updateForm(id, updateData);
};

export const toggleForm = async (id) => {
  const existing = await repo.findFormById(id);
  if (!existing) throwError("Form exit survey tidak ditemukan", 404);

  if (await repo.formHasLinkedResponses(id)) {
    throwError(
      "Status form exit survey tidak dapat diubah karena sudah digunakan mahasiswa",
      409
    );
  }

  return await repo.updateForm(id, { isActive: !existing.isActive });
};

export const deleteForm = async (id) => {
  const existing = await repo.findFormById(id);
  if (!existing) throwError("Form exit survey tidak ditemukan", 404);

  if (await repo.formHasLinkedResponses(id)) {
    throwError(
      "Form exit survey tidak dapat dihapus karena sudah digunakan mahasiswa",
      409
    );
  }

  if ((existing._count?.yudisiums ?? 0) > 0) {
    throwError(
      "Tidak dapat menghapus form karena sudah digunakan oleh acara yudisium",
      409
    );
  }

  await repo.removeForm(id);
};

export const duplicateForm = async (id) => {
  const existing = await repo.findFormById(id);
  if (!existing) throwError("Form exit survey tidak ditemukan", 404);

  const newForm = await repo.createForm({
    name: `Salinan - ${existing.name}`,
    description: existing.description,
    isActive: true,
  });

  for (const session of existing.sessions) {
    const newSession = await repo.createSession({
      exitSurveyFormId: newForm.id,
      name: session.name,
      order: session.order,
    });

    for (const q of session.questions) {
      await repo.createQuestion({
        exitSurveySessionId: newSession.id,
        question: q.question,
        questionType: q.questionType,
        isRequired: q.isRequired,
        orderNumber: q.orderNumber,
        options: q.options?.map((o) => ({
          optionText: o.optionText,
          orderNumber: o.orderNumber,
        })),
      });
    }
  }

  return await getFormDetail(newForm.id);
};

// ============================================================
// QUESTIONS
// ============================================================

export const getQuestionsByForm = async (formId) => {
  const form = await repo.findFormById(formId);
  if (!form) throwError("Form exit survey tidak ditemukan", 404);

  const questions = await repo.findQuestionsByFormId(formId);
  return questions.map((q) => formatQuestion(q));
};

export const getQuestionDetail = async (questionId) => {
  const q = await repo.findQuestionById(questionId);
  if (!q) throwError("Pertanyaan tidak ditemukan", 404);

  return {
    ...formatQuestion(q),
    exitSurveyFormId: q.session?.exitSurveyFormId,
  };
};

export const createQuestion = async (formId, data) => {
  const form = await repo.findFormById(formId);
  if (!form) throwError("Form exit survey tidak ditemukan", 404);

  if (await repo.formHasLinkedResponses(formId)) {
    throwError(
      "Pertanyaan tidak dapat ditambahkan karena form sudah digunakan mahasiswa",
      409
    );
  }

  validateQuestionType(data.questionType);

  // Use the form's first session, creating a default one if none exists
  let session = form.sessions?.[0];
  if (!session) {
    session = await repo.createSession({
      exitSurveyFormId: formId,
      name: "Umum",
      order: 1,
    });
  }

  const payload = {
    exitSurveySessionId: session.id,
    question: data.question,
    questionType: data.questionType,
    isRequired: data.isRequired === true,
    orderNumber: Number(data.orderNumber) ?? 0,
  };

  const isChoiceType =
    data.questionType === "single_choice" || data.questionType === "multiple_choice";
  if (isChoiceType && Array.isArray(data.options) && data.options.length > 0) {
    payload.options = data.options.map((opt, i) => ({
      optionText: typeof opt === "string" ? opt : opt?.optionText ?? "",
      orderNumber:
        typeof opt === "object" && opt?.orderNumber != null ? opt.orderNumber : i + 1,
    }));
  }

  return await repo.createQuestion(payload);
};

export const updateQuestion = async (formId, questionId, data) => {
  const form = await repo.findFormById(formId);
  if (!form) throwError("Form exit survey tidak ditemukan", 404);

  if (await repo.formHasLinkedResponses(formId)) {
    throwError("Pertanyaan tidak dapat diubah karena form sudah digunakan mahasiswa", 409);
  }

  const existing = await repo.findQuestionById(questionId);
  if (!existing || existing.session?.exitSurveyFormId !== formId) {
    throwError("Pertanyaan tidak ditemukan", 404);
  }

  if (data.questionType !== undefined) validateQuestionType(data.questionType);

  const payload = {};
  if (data.question !== undefined) payload.question = data.question;
  if (data.questionType !== undefined) payload.questionType = data.questionType;
  if (data.isRequired !== undefined) payload.isRequired = data.isRequired === true;
  if (data.orderNumber !== undefined) payload.orderNumber = Number(data.orderNumber);

  const isChoice = (t) => t === "single_choice" || t === "multiple_choice";
  if (isChoice(data.questionType) || isChoice(existing.questionType)) {
    if (data.questionType === "text" || data.questionType === "textarea") {
      payload.options = [];
    } else if (Array.isArray(data.options)) {
      payload.options = data.options.map((opt, i) => ({
        optionText: typeof opt === "string" ? opt : opt?.optionText ?? "",
        orderNumber:
          typeof opt === "object" && opt?.orderNumber != null ? opt.orderNumber : i + 1,
      }));
    }
  }

  return await repo.updateQuestion(questionId, payload);
};

export const deleteQuestion = async (formId, questionId) => {
  const form = await repo.findFormById(formId);
  if (!form) throwError("Form exit survey tidak ditemukan", 404);

  if (await repo.formHasLinkedResponses(formId)) {
    throwError("Pertanyaan tidak dapat dihapus karena form sudah digunakan mahasiswa", 409);
  }

  const existing = await repo.findQuestionById(questionId);
  if (!existing || existing.session?.exitSurveyFormId !== formId) {
    throwError("Pertanyaan tidak ditemukan", 404);
  }

  await repo.removeQuestion(questionId);
};

// ============================================================
// STUDENT RESPONSE — fetch questions + submit answers
// ============================================================

export const getStudentSurvey = async (userId) => {
  const { currentYudisium, thesis } = await findStudentContext(userId);

  if (!currentYudisium) throwError("Belum ada periode yudisium yang berlangsung", 404);
  if (!thesis?.id) throwError("Data tugas akhir mahasiswa belum tersedia", 400);
  if (!currentYudisium.exitSurveyForm) {
    throwError("Exit survey belum dikonfigurasi pada periode yudisium ini", 404);
  }

  const existingResponse = await repo.findResponseByYudisiumThesis(
    currentYudisium.id,
    thesis.id,
    true
  );

  return {
    yudisium: {
      id: currentYudisium.id,
      name: currentYudisium.name,
      status: currentYudisium.status,
    },
    form: {
      id: currentYudisium.exitSurveyForm.id,
      name: currentYudisium.exitSurveyForm.name,
      description: currentYudisium.exitSurveyForm.description,
      questions: currentYudisium.exitSurveyForm.sessions.flatMap((s) =>
        s.questions.map((q) => ({ ...q, sessionName: s.name }))
      ),
    },
    response: mapStudentResponse(existingResponse),
    isSubmitted: !!existingResponse,
  };
};

export const submitStudentSurvey = async (userId, payload) => {
  const { currentYudisium, thesis } = await findStudentContext(userId);

  if (!currentYudisium) throwError("Belum ada periode yudisium yang berlangsung", 404);
  if (!thesis?.id) throwError("Data tugas akhir mahasiswa belum tersedia", 400);
  if (!currentYudisium.exitSurveyForm) {
    throwError("Exit survey belum dikonfigurasi pada periode yudisium ini", 404);
  }

  const existingResponse = await repo.findResponseByYudisiumThesis(
    currentYudisium.id,
    thesis.id
  );
  if (existingResponse) {
    throwError("Exit survey sudah pernah dikirim dan tidak dapat diubah", 409);
  }

  const allQuestions = currentYudisium.exitSurveyForm.sessions.flatMap((s) => s.questions);
  const questionMap = new Map(allQuestions.map((q) => [q.id, q]));

  const answerMap = new Map();
  for (const answer of payload.answers) {
    if (!questionMap.has(answer.questionId)) {
      throwError("Terdapat pertanyaan yang tidak valid", 400);
    }
    if (answerMap.has(answer.questionId)) {
      throwError("Jawaban duplikat untuk pertanyaan yang sama tidak diperbolehkan", 400);
    }
    answerMap.set(answer.questionId, answer);
  }

  const answerRows = [];

  for (const question of allQuestions) {
    const answer = answerMap.get(question.id);

    if (!answer) {
      if (question.isRequired) {
        throwError(`Pertanyaan wajib belum dijawab: ${question.question}`, 400);
      }
      continue;
    }

    if (question.questionType === "single_choice") {
      if (!answer.optionId) {
        throwError(`Jawaban pilihan tunggal wajib diisi: ${question.question}`, 400);
      }
      const validOption = question.options.some((o) => o.id === answer.optionId);
      if (!validOption) {
        throwError(`Opsi tidak valid untuk pertanyaan: ${question.question}`, 400);
      }
      answerRows.push({
        exitSurveyQuestionId: question.id,
        exitSurveyOptionId: answer.optionId,
        answerText: null,
      });
      continue;
    }

    if (question.questionType === "multiple_choice") {
      const optionIds = Array.isArray(answer.optionIds) ? [...new Set(answer.optionIds)] : [];
      if (question.isRequired && optionIds.length === 0) {
        throwError(`Jawaban pilihan ganda wajib diisi: ${question.question}`, 400);
      }
      for (const optionId of optionIds) {
        const validOption = question.options.some((o) => o.id === optionId);
        if (!validOption) {
          throwError(`Opsi tidak valid untuk pertanyaan: ${question.question}`, 400);
        }
        answerRows.push({
          exitSurveyQuestionId: question.id,
          exitSurveyOptionId: optionId,
          answerText: null,
        });
      }
      continue;
    }

    const answerText = typeof answer.answerText === "string" ? answer.answerText.trim() : "";
    if (question.isRequired && !answerText) {
      throwError(`Jawaban teks wajib diisi: ${question.question}`, 400);
    }
    if (answerText) {
      answerRows.push({
        exitSurveyQuestionId: question.id,
        exitSurveyOptionId: null,
        answerText,
      });
    }
  }

  if (answerRows.length === 0) {
    throwError("Jawaban exit survey tidak boleh kosong", 400);
  }

  const created = await repo.createResponseWithAnswers({
    yudisiumId: currentYudisium.id,
    thesisId: thesis.id,
    answers: answerRows,
  });

  return { response: mapStudentResponse(created) };
};
