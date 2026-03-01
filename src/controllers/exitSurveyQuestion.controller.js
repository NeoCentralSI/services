import * as service from "../services/exitSurveyQuestion.service.js";

export const getByFormId = async (req, res, next) => {
  try {
    const { formId } = req.params;
    const data = await service.getQuestionsByFormId(formId);
    res.status(200).json({
      success: true,
      message: "Berhasil mengambil pertanyaan exit survey",
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const getById = async (req, res, next) => {
  try {
    const { questionId } = req.params;
    const data = await service.getQuestionById(questionId);
    res.status(200).json({
      success: true,
      message: "Berhasil mengambil detail pertanyaan",
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const create = async (req, res, next) => {
  try {
    const { formId } = req.params;
    const data = await service.createQuestion(formId, req.validated);
    res.status(201).json({
      success: true,
      message: "Berhasil menambah pertanyaan",
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const update = async (req, res, next) => {
  try {
    const { formId, questionId } = req.params;
    const data = await service.updateQuestion(formId, questionId, req.validated);
    res.status(200).json({
      success: true,
      message: "Berhasil mengubah pertanyaan",
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const remove = async (req, res, next) => {
  try {
    const { formId, questionId } = req.params;
    await service.deleteQuestion(formId, questionId);
    res.status(200).json({
      success: true,
      message: "Berhasil menghapus pertanyaan",
    });
  } catch (error) {
    next(error);
  }
};
