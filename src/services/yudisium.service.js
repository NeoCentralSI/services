import * as repository from "../repositories/yudisium.repository.js";

function throwError(msg, code) {
  const e = new Error(msg);
  e.statusCode = code;
  throw e;
}

const formatYudisium = (item) => ({
  id: item.id,
  name: item.name,
  registrationOpenDate: item.registrationOpenDate,
  registrationCloseDate: item.registrationCloseDate,
  eventDate: item.eventDate,
  notes: item.notes,
  status: item.status,
  exitSurveyForm: item.exitSurveyForm ?? null,
  room: item.room ?? null,
  participantCount: item._count?.participants ?? 0,
  responseCount: item._count?.studentExitSurveyResponses ?? 0,
  canDelete:
    (item._count?.participants ?? 0) === 0 &&
    (item._count?.studentExitSurveyResponses ?? 0) === 0,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

const deriveYudisiumStatus = (registrationOpenDate, registrationCloseDate) => {
  const now = new Date();
  const openDate = registrationOpenDate ? new Date(registrationOpenDate) : null;
  const closeDate = registrationCloseDate ? new Date(registrationCloseDate) : null;

  if (!openDate || now < openDate) return "draft";
  if (closeDate && now > closeDate) return "closed";
  return "open";
};

// ============================================================
// LIST / DETAIL
// ============================================================

export const getYudisiumList = async () => {
  const data = await repository.findAll();
  return data.map(formatYudisium);
};

export const getYudisiumDetail = async (id) => {
  const data = await repository.findById(id);
  if (!data) throwError("Data yudisium tidak ditemukan", 404);
  return formatYudisium(data);
};

// ============================================================
// CREATE / UPDATE / DELETE
// ============================================================

export const createYudisium = async (data) => {
  const created = await repository.create({
    name: data.name.trim(),
    registrationOpenDate: data.registrationOpenDate
      ? new Date(data.registrationOpenDate)
      : null,
    registrationCloseDate: data.registrationCloseDate
      ? new Date(data.registrationCloseDate)
      : null,
    eventDate: data.eventDate ? new Date(data.eventDate) : null,
    notes: data.notes?.trim() || null,
    exitSurveyFormId: data.exitSurveyFormId || null,
    roomId: data.roomId || null,
    status: deriveYudisiumStatus(data.registrationOpenDate, data.registrationCloseDate),
  });
  return formatYudisium(created);
};

export const updateYudisium = async (id, data) => {
  const existing = await repository.findById(id);
  if (!existing) throwError("Data yudisium tidak ditemukan", 404);

  const updateData = {};

  if (data.name !== undefined) updateData.name = data.name.trim();
  if (data.registrationOpenDate !== undefined) {
    updateData.registrationOpenDate = data.registrationOpenDate
      ? new Date(data.registrationOpenDate)
      : null;
  }
  if (data.registrationCloseDate !== undefined) {
    updateData.registrationCloseDate = data.registrationCloseDate
      ? new Date(data.registrationCloseDate)
      : null;
  }
  if (data.eventDate !== undefined) {
    updateData.eventDate = data.eventDate ? new Date(data.eventDate) : null;
  }
  if (data.notes !== undefined) updateData.notes = data.notes?.trim() || null;

  if (data.exitSurveyFormId !== undefined) {
    const hasResponses = await repository.hasStudentExitSurveyResponses(id);
    if (hasResponses && data.exitSurveyFormId !== existing.exitSurveyFormId) {
      throwError(
        "Template exit survey tidak dapat diubah karena sudah ada mahasiswa yang mengisi exit survey",
        409
      );
    }
    updateData.exitSurveyFormId = data.exitSurveyFormId || null;
  }

  if (data.roomId !== undefined) updateData.roomId = data.roomId || null;

  if (
    data.registrationOpenDate !== undefined ||
    data.registrationCloseDate !== undefined
  ) {
    const finalOpenDate = data.registrationOpenDate ?? existing.registrationOpenDate;
    const finalCloseDate = data.registrationCloseDate ?? existing.registrationCloseDate;
    updateData.status = deriveYudisiumStatus(finalOpenDate, finalCloseDate);
  }

  const updated = await repository.update(id, updateData);
  return formatYudisium(updated);
};

export const deleteYudisium = async (id) => {
  const existing = await repository.findById(id);
  if (!existing) throwError("Data yudisium tidak ditemukan", 404);

  if (await repository.hasParticipants(id)) {
    throwError("Tidak dapat menghapus data yudisium karena sudah memiliki peserta", 409);
  }

  if (await repository.hasStudentExitSurveyResponses(id)) {
    throwError(
      "Tidak dapat menghapus data yudisium karena sudah memiliki respons exit survey",
      409
    );
  }

  await repository.remove(id);
};
