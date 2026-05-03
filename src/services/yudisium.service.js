import * as repository from "../repositories/yudisium.repository.js";

function throwError(msg, code) {
  const e = new Error(msg);
  e.statusCode = code;
  throw e;
}

/**
 * Derives the current displayable status from stored DB state + real-time clock.
 *
 * DB stores only action-based states: published | scheduled | completed
 * Time-based states are derived here at request time (no cron needed):
 *   - draft:    Now() < registrationOpenDate
 *   - open:     Now() >= registrationOpenDate  AND  Now() <= registrationCloseDate
 *   - closed:   Now() > registrationCloseDate  (but SK not yet uploaded)
 *   - ongoing:  Now() is on the same calendar day as eventDate
 *
 * Priority (highest to lowest):
 *   completed > scheduled (then check ongoing) > closed > open > draft
 */
const deriveDisplayStatus = (item) => {
  const now = new Date();
  const openDate = item.registrationOpenDate ? new Date(item.registrationOpenDate) : null;
  const closeDate = item.registrationCloseDate ? new Date(item.registrationCloseDate) : null;
  const eventDate = item.eventDate ? new Date(item.eventDate) : null;

  // completed: stored flag, event has already passed
  if (item.status === "completed") return "completed";

  // scheduled: SK uploaded + event date set
  if (item.status === "scheduled") {
    // ongoing: today IS the event date (same calendar day)
    if (eventDate) {
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayEnd = new Date(todayStart.getTime() + 86400000 - 1);
      if (eventDate >= todayStart && eventDate <= todayEnd) return "ongoing";

      // completed: event date has passed
      if (eventDate < todayStart) return "completed";
    }
    return "scheduled";
  }

  // Time-based derivation (published status in DB = follow the calendar)
  if (!openDate || now < openDate) return "draft";
  if (closeDate && now > closeDate) return "closed";
  return "open";
};

const formatYudisium = (item) => ({
  id: item.id,
  name: item.name,
  registrationOpenDate: item.registrationOpenDate,
  registrationCloseDate: item.registrationCloseDate,
  eventDate: item.eventDate,
  notes: item.notes,
  storedStatus: item.status,       // raw DB value (published | scheduled | completed)
  status: deriveDisplayStatus(item), // derived display status
  exitSurveyForm: item.exitSurveyForm ?? null,
  room: item.room ?? null,
  participantCount: item._count?.participants ?? 0,
  responseCount: item._count?.studentExitSurveyResponses ?? 0,
  canDelete: (item._count?.participants ?? 0) === 0,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

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
    exitSurveyFormId: data.exitSurveyFormId || null,
    roomId: data.roomId || null,
    status: "published", // always starts as published; display status is derived from dates
  });
  return formatYudisium(created);
};

export const updateYudisium = async (id, data) => {
  const existing = await repository.findById(id);
  if (!existing) throwError("Data yudisium tidak ditemukan", 404);

  const hasParticipants = await repository.hasParticipants(id);
  const derivedStatus = deriveDisplayStatus(existing);
  const updateData = {};

  // === RULE: name is always editable ===
  if (data.name !== undefined) updateData.name = data.name.trim();

  // === RULE: once scheduled or completed, only name is editable ===
  if (existing.status === "scheduled" || existing.status === "completed") {
    const attemptedFields = Object.keys(data).filter((key) => key !== "name" && data[key] !== undefined);
    if (attemptedFields.length > 0) {
      throwError(
        "Hanya nama yang dapat diubah setelah yudisium dijadwalkan atau selesai",
        409
      );
    }
    const updated = await repository.update(id, updateData);
    return formatYudisium(updated);
  }

  // === RULE: when registration has started/ended (post-draft), open date and survey are locked ===
  if (derivedStatus !== "draft" && hasParticipants) {
    const lockedFields = Object.keys(data).filter(
      (key) => !["name", "registrationCloseDate"].includes(key) && data[key] !== undefined
    );
    if (lockedFields.length > 0) {
      throwError(
        "Saat pendaftaran sudah dimulai/berakhir, hanya nama dan tanggal penutupan yang dapat diubah",
        409
      );
    }
  }

  // === registrationOpenDate ===
  if (data.registrationOpenDate !== undefined) {
    const newOpen = new Date(data.registrationOpenDate);
    const now = new Date();
    if (newOpen < now) throwError("Tanggal pembukaan pendaftaran tidak boleh sebelum hari ini", 422);
    updateData.registrationOpenDate = newOpen;
  }

  // === registrationCloseDate ===
  if (data.registrationCloseDate !== undefined) {
    const newClose = new Date(data.registrationCloseDate);
    const now = new Date();
    const finalOpenDate = updateData.registrationOpenDate ?? existing.registrationOpenDate;
    if (newClose < now) throwError("Tanggal penutupan pendaftaran tidak boleh sebelum hari ini", 422);
    if (finalOpenDate && newClose < new Date(finalOpenDate)) {
      throwError("Tanggal penutupan tidak boleh lebih awal dari tanggal pembukaan", 422);
    }
    updateData.registrationCloseDate = newClose;
  }

  // === exitSurveyFormId ===
  if (data.exitSurveyFormId !== undefined) {
    if (hasParticipants && derivedStatus === "open") {
      throwError(
        "Template exit survey tidak dapat diubah saat pendaftaran sudah dibuka dan ada peserta",
        409
      );
    }
    const hasResponses = await repository.hasStudentExitSurveyResponses(id);
    if (hasResponses && data.exitSurveyFormId !== existing.exitSurveyFormId) {
      throwError(
        "Template exit survey tidak dapat diubah karena sudah ada mahasiswa yang mengisi exit survey",
        409
      );
    }
    updateData.exitSurveyFormId = data.exitSurveyFormId || null;
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

  await repository.remove(id);
};
