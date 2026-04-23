import * as formRepo from "../../repositories/yudisium/exit-survey-form.repository.js";
import * as questionRepo from "../../repositories/yudisium/exit-survey-question.repository.js";
import prisma from "../../config/prisma.js";

class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = "NotFoundError";
    this.statusCode = 404;
  }
}

class ConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = "ConflictError";
    this.statusCode = 409;
  }
}

export const getAllForms = async () => {
  const items = await formRepo.findAll();
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    description: item.description ?? null,
    isActive: item.isActive,
    totalSessions: item._count?.sessions ?? 0,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }));
};

export const getFormById = async (id) => {
  const data = await formRepo.findById(id);
  if (!data) throw new NotFoundError("Form exit survey tidak ditemukan");

  // Flatten questions from all sessions for compatibility
  const questions = data.sessions.flatMap((session) =>
    session.questions.map((q) => ({
      id: q.id,
      exitSurveySessionId: q.exitSurveySessionId,
      sessionName: session.name,
      question: q.question,
      questionType: q.questionType,
      isRequired: q.isRequired,
      orderNumber: q.orderNumber,
      options: q.options?.map((o) => ({
        id: o.id,
        optionText: o.optionText,
        orderNumber: o.orderNumber,
      })) ?? [],
      createdAt: q.createdAt,
      updatedAt: q.updatedAt,
    }))
  );

  return {
    id: data.id,
    name: data.name,
    description: data.description ?? null,
    isActive: data.isActive,
    sessions: data.sessions.map((s) => ({
      id: s.id,
      name: s.name,
      order: s.order,
    })),
    questions,
    _count: data._count,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
};

export const createForm = async (data) => {
  return await formRepo.create({
    name: data.name,
    description: data.description ?? null,
    isActive: data.isActive !== false,
  });
};

export const updateForm = async (id, data) => {
  const existing = await formRepo.findById(id);
  if (!existing) throw new NotFoundError("Form exit survey tidak ditemukan");

  const hasLinkedResponses = await formRepo.hasLinkedResponses(id);
  if (hasLinkedResponses) {
    throw new ConflictError(
      "Form exit survey tidak dapat diubah karena sudah digunakan mahasiswa"
    );
  }

  const updateData = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;

  return await formRepo.update(id, updateData);
};

export const toggleForm = async (id) => {
  const existing = await formRepo.findById(id);
  if (!existing) throw new NotFoundError("Form exit survey tidak ditemukan");

  const hasLinkedResponses = await formRepo.hasLinkedResponses(id);
  if (hasLinkedResponses) {
    throw new ConflictError(
      "Status form exit survey tidak dapat diubah karena sudah digunakan mahasiswa"
    );
  }

  return await formRepo.update(id, { isActive: !existing.isActive });
};

export const deleteForm = async (id) => {
  const existing = await formRepo.findById(id);
  if (!existing) throw new NotFoundError("Form exit survey tidak ditemukan");

  const hasLinkedResponses = await formRepo.hasLinkedResponses(id);
  if (hasLinkedResponses) {
    throw new ConflictError(
      "Form exit survey tidak dapat dihapus karena sudah digunakan mahasiswa"
    );
  }

  const linkedYudisiums = existing._count?.yudisiums ?? 0;
  if (linkedYudisiums > 0) {
    throw new ConflictError(
      "Tidak dapat menghapus form karena sudah digunakan oleh acara yudisium"
    );
  }
  await formRepo.remove(id);
};

/** Duplicate form and all its questions + options (new IDs). */
export const duplicateForm = async (id) => {
  const existing = await formRepo.findById(id);
  if (!existing) throw new NotFoundError("Form exit survey tidak ditemukan");

  const newName = `Salinan - ${existing.name}`;

  const newForm = await prisma.exitSurveyForm.create({
    data: {
      name: newName,
      description: existing.description,
      isActive: true,
    },
  });

  for (const session of existing.sessions) {
    const newSession = await prisma.exitSurveySession.create({
      data: {
        exitSurveyFormId: newForm.id,
        name: session.name,
        order: session.order,
      },
    });

    for (const q of session.questions) {
      await prisma.exitSurveyQuestion.create({
        data: {
          exitSurveySessionId: newSession.id,
          question: q.question,
          questionType: q.questionType,
          isRequired: q.isRequired,
          orderNumber: q.orderNumber,
          options:
            q.options?.length > 0
              ? {
                  create: q.options.map((o) => ({
                    optionText: o.optionText,
                    orderNumber: o.orderNumber,
                  })),
                }
              : undefined,
        },
      });
    }
  }

  const created = await getFormById(newForm.id);
  return created;
};
