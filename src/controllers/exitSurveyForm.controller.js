import * as service from "../services/exitSurveyForm.service.js";

export const getAll = async (req, res, next) => {
  try {
    const data = await service.getAllForms();
    res.status(200).json({
      success: true,
      message: "Berhasil mengambil data form exit survey",
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const getById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = await service.getFormById(id);
    res.status(200).json({
      success: true,
      message: "Berhasil mengambil detail form exit survey",
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const create = async (req, res, next) => {
  try {
    const data = await service.createForm(req.validated);
    res.status(201).json({
      success: true,
      message: "Berhasil menambah form exit survey",
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = await service.updateForm(id, req.validated);
    res.status(200).json({
      success: true,
      message: "Berhasil mengubah form exit survey",
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const toggle = async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = await service.toggleForm(id);
    res.status(200).json({
      success: true,
      message: data.isActive ? "Form berhasil diaktifkan" : "Form berhasil diarsipkan",
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const remove = async (req, res, next) => {
  try {
    const { id } = req.params;
    await service.deleteForm(id);
    res.status(200).json({
      success: true,
      message: "Berhasil menghapus form exit survey",
    });
  } catch (error) {
    next(error);
  }
};

export const duplicate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = await service.duplicateForm(id);
    res.status(201).json({
      success: true,
      message: "Berhasil menduplikasi form exit survey",
      data,
    });
  } catch (error) {
    next(error);
  }
};
