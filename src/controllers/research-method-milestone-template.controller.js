import * as service from "../services/research-method/milestone-template.service.js";

const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (error) {
    next(error);
  }
};

/** GET /research-method/milestone-templates */
export const listTemplates = handle(async (_req, res) => res.json({ success: true, data: await service.listTemplates() }));
/** POST /research-method/milestone-templates */
export const createTemplate = handle(async (req, res) =>
  res.status(201).json({ success: true, message: "Template milestone proposal ditambahkan", data: await service.createTemplate(req.validated) }));
/** PATCH /research-method/milestone-templates/:id */
export const updateTemplate = handle(async (req, res) =>
  res.json({ success: true, message: "Template milestone proposal diperbarui", data: await service.updateTemplate(req.params.id, req.validated) }));
/** DELETE /research-method/milestone-templates/:id */
export const deleteTemplate = handle(async (req, res) =>
  res.json({ success: true, message: "Template milestone proposal dihapus", data: await service.deleteTemplate(req.params.id) }));
/** PATCH /research-method/milestone-templates/reorder */
export const reorderTemplates = handle(async (req, res) =>
  res.json({ success: true, message: "Urutan template disimpan", data: await service.reorderTemplates(req.validated.templateIds) }));
