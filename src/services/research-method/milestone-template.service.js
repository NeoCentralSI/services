import prisma from "../../config/prisma.js";
import { THESIS_PHASE } from "../../constants/thesisStatus.js";
import * as milestoneRepo from "../../repositories/thesisGuidance/milestone.repository.js";
import { BadRequestError, NotFoundError } from "../../utils/errors.js";

/**
 * General proposal-phase milestone templates (K18): no topic, managed by the Sekretaris
 * Departemen in Kelola > Metode Penelitian. Students apply them while their thesis is in the
 * proposal phase (milestone service, same engine as the thesis phase).
 */
const PHASE = THESIS_PHASE.PROPOSAL;

async function findOrThrow(id) {
  const template = await milestoneRepo.findTemplateById(id, PHASE);
  if (!template) throw new NotFoundError("Template milestone proposal tidak ditemukan.");
  return template;
}

export async function listTemplates({ includeInactive = true } = {}) {
  const templates = await milestoneRepo.findAllTemplates(includeInactive ? null : true, null, PHASE);
  const usage = await prisma.thesisMilestone.groupBy({
    by: ["milestoneTemplateId"],
    where: { milestoneTemplateId: { in: templates.map((t) => t.id) } },
    _count: { _all: true },
  });
  const usedBy = new Map(usage.map((row) => [row.milestoneTemplateId, row._count._all]));
  return templates.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    orderIndex: t.orderIndex,
    isActive: t.isActive,
    usedCount: usedBy.get(t.id) ?? 0,
    updatedAt: t.updatedAt,
  }));
}

export async function createTemplate({ name, description = null, isActive = true }) {
  const maxOrder = await milestoneRepo.getMaxTemplateOrderIndex(null, PHASE);
  return milestoneRepo.createTemplate(
    { name: name.trim(), description: description?.trim() || null, topicId: null, orderIndex: maxOrder + 1, isActive },
    PHASE,
  );
}

export async function updateTemplate(id, data) {
  await findOrThrow(id);
  const patch = {};
  if (data.name !== undefined) patch.name = data.name.trim();
  if (data.description !== undefined) patch.description = data.description?.trim() || null;
  if (data.isActive !== undefined) patch.isActive = data.isActive;
  return milestoneRepo.updateTemplate(id, patch);
}

/** Milestones already made from a template keep their copy (the link is cleared). */
export async function deleteTemplate(id) {
  await findOrThrow(id);
  await milestoneRepo.deleteTemplate(id);
  return { id };
}

/** New order of every proposal template, first to last. */
export async function reorderTemplates(templateIds) {
  const templates = await milestoneRepo.findAllTemplates(null, null, PHASE);
  const known = new Set(templates.map((t) => t.id));
  if (templateIds.length !== known.size || templateIds.some((id) => !known.has(id)) || new Set(templateIds).size !== templateIds.length) {
    throw new BadRequestError("Urutan harus memuat setiap template milestone proposal tepat satu kali.");
  }
  await prisma.$transaction(
    templateIds.map((id, index) => prisma.thesisMilestoneTemplate.update({ where: { id }, data: { orderIndex: index } })),
  );
  return listTemplates();
}
