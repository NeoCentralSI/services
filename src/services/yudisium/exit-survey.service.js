/**
 * Exit Survey Service.
 * 
 * Manages the data master for exit survey forms, including sessions, questions,
 * and processing student responses during the yudisium process.
 */
import * as repo from "../../repositories/yudisium/exit-survey.repository.js";
import { findStudentContext } from "./student.service.js";
import prisma from "../../config/prisma.js";

function throwError(msg, code) {
  const e = new Error(msg);
  e.statusCode = code;
  throw e;
}

const QUESTION_TYPES = ["short_answer", "paragraph", "single_choice", "multiple_choice", "date"];

const validateQuestionType = (value) => {
  if (!QUESTION_TYPES.includes(value)) throwError("Jenis pertanyaan tidak valid", 400);
};

const formatFormSummary = (item) => {
  const totalQuestions = (item.sessions ?? []).reduce(
    (acc, session) => acc + (session._count?.questions ?? 0),
    0
  );

  return {
    id: item.id,
    name: item.name,
    description: item.description ?? null,
    isActive: item.isActive,
    totalSessions: item.sessions?.length ?? 0,
    totalQuestions,
    usedCount: item._count?.yudisiums ?? 0,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
};

const formatQuestion = (q, sessionName = q.session?.name) => ({
  id: q.id,
  exitSurveySessionId: q.exitSurveySessionId,
  sessionName,
  question: q.question,
  description: q.description ?? null,
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

  return {
    id: data.id,
    name: data.name,
    description: data.description ?? null,
    isActive: data.isActive,
    sessions: data.sessions.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description ?? null,
      order: s.order,
      questions: s.questions.map((q) => formatQuestion(q, s.name)),
    })),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    usedCount: data._count?.yudisiums ?? 0,
    totalQuestions: data.sessions.reduce((acc, s) => acc + s.questions.length, 0),
    totalResponses: await prisma.studentExitSurveyResponse.count({
      where: {
        yudisium: { exitSurveyFormId: id }
      }
    }),
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

  return await repo.updateForm(id, { isActive: !existing.isActive });
};

export const deleteForm = async (id) => {
  const existing = await repo.findFormById(id);
  if (!existing) throwError("Form exit survey tidak ditemukan", 404);

  if (await repo.formHasRelatedYudisiums(id)) {
    throwError(
      "Form exit survey tidak dapat dihapus karena sudah digunakan oleh acara yudisium",
      409
    );
  }

  await repo.removeForm(id);
};

export const getFormResponses = async (formId) => {
  const form = await repo.findFormById(formId);
  if (!form) throwError("Form exit survey tidak ditemukan", 404);

  const responses = await prisma.studentExitSurveyResponse.findMany({
    where: {
      yudisium: { exitSurveyFormId: formId },
    },
    include: {
      yudisium: true,
      answers: {
        include: {
          option: true,
          question: true,
        },
      },
      thesis: {
        include: {
          student: {
            include: {
              user: true,
            },
          },
        },
      },
    },
    orderBy: { submittedAt: "desc" },
  });

  return responses.map((r) => ({
    id: r.id,
    submittedAt: r.submittedAt,
    yudisiumId: r.yudisiumId,
    yudisiumName: r.yudisium?.name || "-",
    name: r.thesis?.student?.user?.fullName || "Mahasiswa",
    nim: r.thesis?.student?.user?.identityNumber || "-",
    email: r.thesis?.student?.user?.email || "-",
    phone: r.thesis?.student?.user?.phoneNumber || "-",
    enrollmentYear: r.thesis?.student?.enrollmentYear || null,
    answers: r.answers.map((a) => ({
      questionId: a.exitSurveyQuestionId,
      questionText: a.question?.question,
      optionId: a.exitSurveyOptionId,
      optionText: a.option?.optionText,
      answerText: a.answerText,
    })),
  }));
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
// SESSIONS
// ============================================================

export const createSession = async (formId, data) => {
  const form = await repo.findFormById(formId);
  if (!form) throwError("Form exit survey tidak ditemukan", 404);

  return await repo.createSession({
    exitSurveyFormId: formId,
    name: data.name,
    description: data.description ?? null,
    order: data.order ?? (form.sessions?.length || 0) + 1,
  });
};

export const updateSession = async (formId, sessionId, data) => {
  const session = await repo.findSessionById(sessionId);
  if (!session || session.exitSurveyFormId !== formId) {
    throwError("Sesi tidak ditemukan", 404);
  }

  const updateData = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.order !== undefined) updateData.order = data.order;

  return await repo.updateSession(sessionId, updateData);
};

export const deleteSession = async (formId, sessionId) => {
  const session = await repo.findSessionById(sessionId);
  if (!session || session.exitSurveyFormId !== formId) {
    throwError("Sesi tidak ditemukan", 404);
  }

  return await prisma.$transaction(async (tx) => {
    // 1. Delete all answers for all questions in this session
    await tx.studentExitSurveyAnswer.deleteMany({
      where: {
        question: {
          exitSurveySessionId: sessionId
        }
      }
    });

    // 2. Delete all options for all questions in this session
    await tx.exitSurveyOption.deleteMany({
      where: {
        question: {
          exitSurveySessionId: sessionId
        }
      }
    });

    // 3. Delete all questions in this session
    await tx.exitSurveyQuestion.deleteMany({
      where: { exitSurveySessionId: sessionId }
    });
    
    const result = await tx.exitSurveySession.delete({
      where: { id: sessionId }
    });
    
    return result;
  });
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

  // Use specified session ID if provided, otherwise fallback to first session
  let sessionId = data.exitSurveySessionId;
  
  if (!sessionId) {
    let session = form.sessions?.[0];
    if (!session) {
      session = await repo.createSession({
        exitSurveyFormId: formId,
        name: "Umum",
        order: 1,
      });
    }
    sessionId = session.id;
  } else {
    // Validate that the session belongs to this form
    const session = await repo.findSessionById(sessionId);
    if (!session || session.exitSurveyFormId !== formId) {
      throwError("Sesi tidak ditemukan atau tidak valid untuk form ini", 404);
    }
  }

  const payload = {
    exitSurveySessionId: sessionId,
    question: data.question,
    description: data.description ?? null,
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
  if (data.description !== undefined) payload.description = data.description;
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
      sessions: currentYudisium.exitSurveyForm.sessions.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description ?? null,
        order: s.order,
        questions: s.questions.map((q) => formatQuestion(q, s.name)),
      })),
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
