import * as formRepo from "../repositories/exitSurveyForm.repository.js";
import * as questionRepo from "../repositories/exitSurveyQuestion.repository.js";
import prisma from "../config/prisma.js";

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
    totalQuestions: item._count?.questions ?? 0,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }));
};

export const getFormById = async (id) => {
  const data = await formRepo.findById(id);
  if (!data) throw new NotFoundError("Form exit survey tidak ditemukan");
  return {
    id: data.id,
    name: data.name,
    description: data.description ?? null,
    isActive: data.isActive,
    questions: data.questions.map((q) => ({
      id: q.id,
      exitSurveyFormId: q.exitSurveyFormId,
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
    })),
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

  const updateData = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;

  return await formRepo.update(id, updateData);
};

export const toggleForm = async (id) => {
  const existing = await formRepo.findById(id);
  if (!existing) throw new NotFoundError("Form exit survey tidak ditemukan");
  return await formRepo.update(id, { isActive: !existing.isActive });
};

export const deleteForm = async (id) => {
  const existing = await formRepo.findById(id);
  if (!existing) throw new NotFoundError("Form exit survey tidak ditemukan");
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

  for (const q of existing.questions) {
    await prisma.exitSurveyQuestion.create({
      data: {
        exitSurveyFormId: newForm.id,
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

  const created = await formRepo.findById(newForm.id);
  return {
    id: created.id,
    name: created.name,
    description: created.description ?? null,
    isActive: created.isActive,
    questions: created.questions?.map((q) => ({
      id: q.id,
      exitSurveyFormId: q.exitSurveyFormId,
      question: q.question,
      questionType: q.questionType,
      isRequired: q.isRequired,
      orderNumber: q.orderNumber,
      options: (q.options ?? []).map((o) => ({ id: o.id, optionText: o.optionText, orderNumber: o.orderNumber })),
      createdAt: q.createdAt,
      updatedAt: q.updatedAt,
    })) ?? [],
    _count: created._count,
    createdAt: created.createdAt,
    updatedAt: created.updatedAt,
  };
};
