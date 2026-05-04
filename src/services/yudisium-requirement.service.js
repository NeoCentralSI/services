import * as repository from "../repositories/yudisium-requirement.repository.js";

function throwError(msg, code) {
  const e = new Error(msg);
  e.statusCode = code;
  throw e;
}

const normalizeText = (value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const formatRequirement = (item) => ({
  id: item.id,
  name: item.name,
  description: item.description,
  isActive: item.isActive,
  isPublic: item.isPublic,
  relationCount: item._count?.yudisiumRequirementItems ?? 0,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

export const getRequirements = async () => {
  const data = await repository.findAll();
  return data.map(formatRequirement);
};

export const getRequirementDetail = async (id) => {
  const data = await repository.findById(id);
  if (!data) throwError("Persyaratan yudisium tidak ditemukan", 404);
  return {
    ...formatRequirement(data),
    usageCount: data._count?.yudisiumRequirementItems ?? 0,
  };
};

export const createRequirement = async (data) => {
  const existing = await repository.findByName(data.name.trim());
  if (existing) throwError(`Nama persyaratan "${data.name}" sudah digunakan`, 409);

  return await repository.create({
    name: data.name.trim(),
    description: normalizeText(data.description),
    isActive: data.isActive ?? true,
    isPublic: data.isPublic ?? false,
  });
};

export const updateRequirement = async (id, data) => {
  const existing = await repository.findById(id);
  if (!existing) throwError("Persyaratan yudisium tidak ditemukan", 404);

  const updateData = {};

  if (data.name !== undefined) {
    const normalizedName = data.name.trim();
    const duplicate = await repository.findByName(normalizedName, id);
    if (duplicate) throwError(`Nama persyaratan "${data.name}" sudah digunakan`, 409);
    updateData.name = normalizedName;
  }
  if (data.description !== undefined) updateData.description = normalizeText(data.description);
  if (data.isActive !== undefined) updateData.isActive = data.isActive;
  if (data.isPublic !== undefined) updateData.isPublic = data.isPublic;

  return await repository.update(id, updateData);
};

export const toggleRequirement = async (id) => {
  const existing = await repository.findById(id);
  if (!existing) throwError("Persyaratan yudisium tidak ditemukan", 404);
  return await repository.update(id, { isActive: !existing.isActive });
};


export const deleteRequirement = async (id) => {
  const existing = await repository.findById(id);
  if (!existing) throwError("Persyaratan yudisium tidak ditemukan", 404);

  if (await repository.hasRelatedData(id)) {
    throwError(
      "Tidak dapat menghapus persyaratan yudisium karena sudah memiliki data dokumen peserta",
      409
    );
  }

  await repository.remove(id);
};
