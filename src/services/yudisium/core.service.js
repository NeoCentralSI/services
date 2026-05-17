import { mkdir, writeFile } from "fs/promises";
import path from "path";
import * as repository from "../../repositories/yudisium/yudisium.repository.js";
import prisma from "../../config/prisma.js";

function throwError(msg, code) {
  const e = new Error(msg);
  e.statusCode = code;
  throw e;
}

/**
 * Derives the current displayable status from dates + real-time clock.
 * Since 'status' column is removed from DB, we derive entirely from dates.
 *
 *   - draft:    No registration dates, or now < registrationOpenDate
 *   - open:     now >= registrationOpenDate AND now <= registrationCloseDate
 *   - closed:   now > registrationCloseDate AND now < eventDate
 *   - ongoing:  now is on the same calendar day as eventDate
 *   - completed: eventDate has passed
 */
const deriveDisplayStatus = (item) => {
  const now = new Date();

  const openDate = item.registrationOpenDate ? new Date(item.registrationOpenDate) : null;
  const closeDate = item.registrationCloseDate ? new Date(item.registrationCloseDate) : null;
  const eventDate = item.eventDate ? new Date(item.eventDate) : null;

  if (eventDate) {
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 86400000 - 1);
    if (eventDate < todayStart) return "completed";
    if (eventDate >= todayStart && eventDate <= todayEnd) return "ongoing";
  }

  if (!openDate) return "draft";
  if (now < openDate) return "draft";
  if (closeDate && now > closeDate) return "closed";
  return "open";
};

const formatYudisium = (item) => ({
  id: item.id,
  name: item.name,
  registrationOpenDate: item.registrationOpenDate,
  registrationCloseDate: item.registrationCloseDate,
  eventDate: item.eventDate,
  appointedAt: item.appointedAt,
  notes: item.notes,
  status: deriveDisplayStatus(item),
  decreeDocument: item.document
    ? {
        id: item.document.id,
        fileName: item.document.fileName,
        filePath: item.document.filePath,
      }
    : null,
  exitSurveyForm: item.exitSurveyForm ?? null,
  room: item.room ?? null,
  requirementItems: item.requirementItems?.map((ri) => ({
    id: ri.id,
    order: ri.order,
    requirement: ri.yudisiumRequirement,
  })) ?? [],
  participantCount: item._count?.participants ?? 0,
  responseCount: item._count?.studentExitSurveyResponses ?? 0,
  hasRegisteredParticipants: (item.participants?.length ?? 0) > 0,
  canDelete: isArchiveYudisium(item) || (item._count?.participants ?? 0) === 0,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

const safeGetTime = (date) => {
  if (!date) return null;
  const d = new Date(date);
  return isNaN(d.getTime()) ? null : d.getTime();
};

const isArchiveYudisium = (item) => !item.registrationOpenDate && !item.registrationCloseDate;
const isActiveYudisium = (item) => !!item.registrationOpenDate && !!item.registrationCloseDate;

const isRegistrationStarted = (item) => {
  if (!item.registrationOpenDate) return false;
  return new Date(item.registrationOpenDate) <= new Date();
};

const isFinalizedOrAppointed = (item) => !!item.appointedAt || !!item.documentId;

const assertValidYudisiumState = ({
  registrationOpenDate,
  registrationCloseDate,
  eventDate,
  roomId,
  exitSurveyFormId,
  requirementIds = [],
}) => {
  const hasOpen = !!registrationOpenDate;
  const hasClose = !!registrationCloseDate;

  if (hasOpen !== hasClose) {
    throwError("Tanggal pembukaan dan penutupan pendaftaran harus diisi bersama", 422);
  }

  if (!eventDate) {
    throwError("Tanggal pelaksanaan wajib diisi", 422);
  }

  if (!roomId) {
    throwError("Ruangan yudisium wajib dipilih", 422);
  }

  if (!hasOpen && !hasClose) return;

  const openDate = new Date(registrationOpenDate);
  const closeDate = new Date(registrationCloseDate);
  const yudisiumDate = new Date(eventDate);

  if (closeDate < openDate) {
    throwError("Tanggal penutupan tidak boleh lebih awal dari tanggal pembukaan", 422);
  }

  if (yudisiumDate <= closeDate) {
    throwError("Tanggal pelaksanaan harus setelah tanggal penutupan pendaftaran", 422);
  }

  if (!exitSurveyFormId) {
    throwError("Template exit survey wajib dipilih untuk yudisium aktif", 422);
  }

  if (!Array.isArray(requirementIds) || requirementIds.length === 0) {
    throwError("Minimal satu persyaratan wajib dipilih untuk yudisium aktif", 422);
  }
};

const assertRegistrationDatesNotInPast = (registrationOpenDate, registrationCloseDate) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (registrationOpenDate && new Date(registrationOpenDate) < today) {
    throwError("Tanggal pembukaan pendaftaran tidak boleh sebelum hari ini", 422);
  }

  if (registrationCloseDate && new Date(registrationCloseDate) < today) {
    throwError("Tanggal penutupan pendaftaran tidak boleh sebelum hari ini", 422);
  }
};

const assertUniqueYudisiumPeriod = async ({
  name,
  registrationOpenDate,
  registrationCloseDate,
  eventDate,
  roomId,
  excludeId = null,
  checkName = true,
  checkRegistrationPeriod = true,
  checkEventSchedule = true,
}) => {
  const normalizedName = name?.trim();
  if (checkName && normalizedName) {
    const duplicateName = await repository.findDuplicateName(normalizedName, excludeId);
    if (duplicateName) {
      throwError("Nama periode yudisium sudah digunakan", 409);
    }
  }

  if (checkRegistrationPeriod && registrationOpenDate && registrationCloseDate) {
    const overlappingPeriod = await repository.findOverlappingActivePeriod(
      registrationOpenDate,
      registrationCloseDate,
      excludeId
    );
    if (overlappingPeriod) {
      throwError("Rentang pendaftaran yudisium bertabrakan dengan periode lain", 409);
    }
  }

  if (checkEventSchedule && eventDate && roomId) {
    const duplicateSchedule = await repository.findDuplicateEventSchedule(eventDate, roomId, excludeId);
    if (duplicateSchedule) {
      throwError("Ruangan sudah digunakan untuk yudisium lain pada tanggal pelaksanaan tersebut", 409);
    }
  }
};

/**
 * Finalizes all participants and their CPL scores when a decree is uploaded.
 */
const finalizeYudisiumResults = async (yudisiumId) => {
  try {
    const participants = await prisma.yudisiumParticipant.findMany({
      where: { 
        yudisiumId,
        status: 'appointed'
      },
      include: {
        thesis: {
          include: { student: true }
        }
      }
    });

    if (participants.length === 0) return;

    const studentIds = participants.map(p => p.thesis?.student?.id).filter(Boolean);

    // 1. Update ONLY 'appointed' participants to 'finalized'
    await prisma.yudisiumParticipant.updateMany({
      where: { 
        yudisiumId,
        status: 'appointed'
      },
      data: { status: 'finalized' }
    });

    // 2. Update CPL scores to 'finalized' ONLY for those finalized students
    if (studentIds.length > 0) {
      await prisma.studentCplScore.updateMany({
        where: { 
          studentId: { in: studentIds },
          status: { not: 'finalized' } // Only update if not already finalized
        },
        data: { 
          status: 'finalized',
          finalizedAt: new Date()
        }
      });

      await prisma.student.updateMany({
        where: { id: { in: studentIds } },
        data: { status: "lulus" },
      });
    }
  } catch (err) {
    console.error(`Failed to finalize yudisium ${yudisiumId}:`, err);
    throw err;
  }
};

// ============================================================
// ANNOUNCEMENTS
// ============================================================

export const getAnnouncements = async () => {
  const now = new Date();
  const allEvents = await repository.findAll();

  const filtered = allEvents.filter((item) => {
    if (isArchiveYudisium(item)) return true;
    const closeDate = item.registrationCloseDate ? new Date(item.registrationCloseDate) : null;
    return closeDate && now > closeDate;
  });

  const announcements = await Promise.all(
    filtered.map(async (item) => {
      const participants = await prisma.yudisiumParticipant.findMany({
        where: {
          yudisiumId: item.id,
          status: { in: ["appointed", "finalized"] },
        },
        include: {
          thesis: {
            include: {
              student: { include: { user: true } },
            },
          },
        },
      });

      if (isArchiveYudisium(item) && participants.length === 0) return null;

      return {
        ...formatYudisium(item),
        participants: participants.map((p) => ({
          id: p.id,
          studentName: p.thesis?.student?.user?.fullName || "-",
          studentNim: p.thesis?.student?.user?.identityNumber || "-",
          thesisTitle: p.thesis?.title || "-",
          status: p.status,
          registeredAt: p.registeredAt,
        })),
      };
    })
  );

  return announcements.filter(Boolean);
};

export const getRepository = async (search) => {
  const q = (search || "").trim().toLowerCase();

  // Step 1: public requirements
  const publicRequirements = await prisma.yudisiumRequirement.findMany({
    where: { isPublic: true },
    orderBy: { name: "asc" },
  });

  if (publicRequirements.length === 0) return [];
  const requirementIds = publicRequirements.map((r) => r.id);

  // Step 2: requirement items that belong to those public requirements
  const requirementItems = await prisma.yudisiumRequirementItem.findMany({
    where: { yudisiumRequirementId: { in: requirementIds } },
    select: { id: true, yudisiumRequirementId: true },
  });

  if (requirementItems.length === 0)
    return publicRequirements.map((r) => ({ id: r.id, name: r.name, documents: [] }));

  const itemIds = requirementItems.map((i) => i.id);
  const itemToRequirementMap = Object.fromEntries(
    requirementItems.map((i) => [i.id, i.yudisiumRequirementId])
  );

  // Step 3: verified participant requirements — flat, no nested includes
  const participantRequirements = await prisma.yudisiumParticipantRequirement.findMany({
    where: { status: "approved", yudisiumRequirementItemId: { in: itemIds } },
    select: {
      yudisiumParticipantId: true,
      yudisiumRequirementItemId: true,
      documentId: true,
    },
  });

  if (participantRequirements.length === 0)
    return publicRequirements.map((r) => ({ id: r.id, name: r.name, documents: [] }));

  const participantIds = [...new Set(participantRequirements.map((pr) => pr.yudisiumParticipantId))];
  const documentIds = [...new Set(participantRequirements.map((pr) => pr.documentId))];

  // Step 4: documents + finalized participants in parallel
  const [documents, participants] = await Promise.all([
    prisma.document.findMany({
      where: { id: { in: documentIds } },
      select: { id: true, fileName: true, filePath: true },
    }),
    prisma.yudisiumParticipant.findMany({
      where: { id: { in: participantIds }, status: "finalized" },
      select: { id: true, thesisId: true },
    }),
  ]);

  // Only keep participant requirements that belong to finalized participants
  const finalizedParticipantIds = new Set(participants.map((p) => p.id));
  const filteredPR = participantRequirements.filter((pr) =>
    finalizedParticipantIds.has(pr.yudisiumParticipantId)
  );

  if (filteredPR.length === 0)
    return publicRequirements.map((r) => ({ id: r.id, name: r.name, documents: [] }));

  const thesisIds = [...new Set(participants.map((p) => p.thesisId))];

  // Step 5: theses
  const theses = await prisma.thesis.findMany({
    where: { id: { in: thesisIds } },
    select: { id: true, title: true, studentId: true, thesisTopicId: true },
  });

  const studentIds = [...new Set(theses.map((t) => t.studentId))];
  const topicIds = [...new Set(theses.map((t) => t.thesisTopicId).filter(Boolean))];

  // Step 6: users + topics in parallel (Student.id === User.id)
  const [users, topics] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: studentIds } },
      select: { id: true, fullName: true, identityNumber: true },
    }),
    topicIds.length > 0
      ? prisma.thesisTopic.findMany({
          where: { id: { in: topicIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  // Step 7: lookup maps
  const docMap = Object.fromEntries(documents.map((d) => [d.id, d]));
  const participantMap = Object.fromEntries(participants.map((p) => [p.id, p]));
  const thesisMap = Object.fromEntries(theses.map((t) => [t.id, t]));
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));
  const topicMap = Object.fromEntries(topics.map((t) => [t.id, t]));

  // Step 8: join in JS
  const enrichedDocs = filteredPR.map((pr) => {
    const participant = participantMap[pr.yudisiumParticipantId];
    const thesis = participant ? thesisMap[participant.thesisId] : null;
    const user = thesis ? userMap[thesis.studentId] : null;
    const topic = thesis?.thesisTopicId ? topicMap[thesis.thesisTopicId] : null;
    const doc = docMap[pr.documentId];

    return {
      _requirementId: itemToRequirementMap[pr.yudisiumRequirementItemId],
      id: `${pr.yudisiumParticipantId}-${pr.yudisiumRequirementItemId}`,
      thesisTitle: thesis?.title || "-",
      studentName: user?.fullName || "-",
      studentNim: user?.identityNumber || "-",
      topicName: topic?.name || "-",
      filePath: doc?.filePath,
      fileName: doc?.fileName,
    };
  });

  // Step 9: optional search filter
  const filteredDocs = q
    ? enrichedDocs.filter(
        (d) =>
          d.thesisTitle.toLowerCase().includes(q) ||
          d.studentName.toLowerCase().includes(q) ||
          d.studentNim.toLowerCase().includes(q)
      )
    : enrichedDocs;

  // Step 10: group by requirement
  return publicRequirements.map((req) => ({
    id: req.id,
    name: req.name,
    documents: filteredDocs
      .filter((d) => d._requirementId === req.id)
      .map(({ _requirementId, ...rest }) => rest),
  }));
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

export const getRoomOptions = async () => {
  return prisma.room.findMany({
    orderBy: { name: "asc" },
  });
};

// ============================================================
// CREATE / UPDATE / DELETE
// ============================================================

export const createYudisium = async (data) => {
  const { requirementIds = [], decreeFile, userId, ...rest } = data;
  if (decreeFile) {
    throwError("SK yudisium hanya dapat diunggah setelah peserta ditetapkan", 422);
  }

  const registrationOpenDate = rest.registrationOpenDate ? new Date(rest.registrationOpenDate) : null;
  const registrationCloseDate = rest.registrationCloseDate ? new Date(rest.registrationCloseDate) : null;
  const eventDate = rest.eventDate ? new Date(rest.eventDate) : null;

  assertValidYudisiumState({
    registrationOpenDate,
    registrationCloseDate,
    eventDate,
    roomId: rest.roomId || null,
    exitSurveyFormId: rest.exitSurveyFormId || null,
    requirementIds,
  });
  assertRegistrationDatesNotInPast(registrationOpenDate, registrationCloseDate);
  await assertUniqueYudisiumPeriod({
    name: rest.name,
    registrationOpenDate,
    registrationCloseDate,
    eventDate,
    roomId: rest.roomId || null,
  });

  // 1. Create Yudisium first to get the ID
  const isArchive = !registrationOpenDate && !registrationCloseDate;
  const created = await repository.create({
    name: rest.name.trim(),
    eventDate,
    registrationOpenDate,
    registrationCloseDate,
    appointedAt: isArchive ? eventDate : null,
    notes: rest.notes || null,
    exitSurveyFormId: rest.exitSurveyFormId || null,
    roomId: rest.roomId || null,
    requirementItems: requirementIds.length > 0 ? {
      create: requirementIds.map((reqId, index) => ({
        yudisiumRequirementId: reqId,
        order: index,
      })),
    } : undefined,
  });

  // 2. Handle file if uploaded
  if (decreeFile) {
    const uploadsRoot = path.join(process.cwd(), "uploads", "yudisium", created.id);
    await mkdir(uploadsRoot, { recursive: true });

    const ext = path.extname(decreeFile.originalname).toLowerCase();
    const safeName = `sk-yudisium-${Date.now()}${ext}`;
    const absPath = path.join(uploadsRoot, safeName);
    await writeFile(absPath, decreeFile.buffer);
    const relPath = path.relative(process.cwd(), absPath).replace(/\\/g, "/");

    const doc = await prisma.document.create({
      data: {
        userId,
        fileName: decreeFile.originalname,
        filePath: relPath,
      }
    });

    // Link back to yudisium
    const updated = await repository.update(created.id, { 
      documentId: doc.id,
      decreeUploadedBy: userId,
      decreeUploadedAt: new Date()
    });

    // Trigger finalization side-effect
    await finalizeYudisiumResults(created.id);

    return formatYudisium(updated);
  }

  return formatYudisium(created);
};

export const updateYudisium = async (id, data) => {
  const existing = await repository.findById(id);
  if (!existing) throwError("Data yudisium tidak ditemukan", 404);

  const { requirementIds, decreeFile, userId, ...rest } = data;
  const updateData = {};
  const wasArchive = isArchiveYudisium(existing);
  const hasAnyParticipants = await repository.hasParticipants(id);
  const hasRegParticipants = hasAnyParticipants
    ? await repository.hasRegisteredParticipants(id)
    : false;
  const started = isRegistrationStarted(existing);
  const registrationLocked = isActiveYudisium(existing) && (started || hasRegParticipants);
  const fullyLocked = isActiveYudisium(existing) && isFinalizedOrAppointed(existing);
  const completedLocked = isActiveYudisium(existing) && deriveDisplayStatus(existing) === "completed";

  if (decreeFile && !existing.appointedAt) {
    throwError("SK yudisium hanya dapat diunggah setelah peserta ditetapkan", 422);
  }

  if (completedLocked) {
    const blockedCompletedFields = [
      "name",
      "registrationOpenDate",
      "registrationCloseDate",
      "eventDate",
      "roomId",
      "exitSurveyFormId",
      "notes",
    ].filter((field) => rest[field] !== undefined);

    if (blockedCompletedFields.length > 0 || requirementIds !== undefined) {
      throwError("Data yudisium aktif yang sudah selesai tidak dapat diubah", 409);
    }
  }

  const requestedOpenDate =
    rest.registrationOpenDate !== undefined
      ? (rest.registrationOpenDate ? new Date(rest.registrationOpenDate) : null)
      : existing.registrationOpenDate;
  const requestedCloseDate =
    rest.registrationCloseDate !== undefined
      ? (rest.registrationCloseDate ? new Date(rest.registrationCloseDate) : null)
      : existing.registrationCloseDate;

  if (hasAnyParticipants && wasArchive !== (!requestedOpenDate && !requestedCloseDate)) {
    throwError("Tipe yudisium tidak dapat diubah karena sudah memiliki peserta", 409);
  }

  if (rest.name !== undefined) updateData.name = rest.name.trim();
  if (rest.eventDate !== undefined) updateData.eventDate = rest.eventDate ? new Date(rest.eventDate) : null;
  if (rest.notes !== undefined) updateData.notes = rest.notes || null;
  if (rest.roomId !== undefined) updateData.roomId = rest.roomId || null;

  if (fullyLocked) {
    const blockedFields = [
      "registrationOpenDate",
      "registrationCloseDate",
      "eventDate",
      "roomId",
      "exitSurveyFormId",
    ].filter((field) => rest[field] !== undefined);

    if (blockedFields.length > 0 || requirementIds !== undefined) {
      throwError(
        "Data yudisium aktif tidak dapat diubah setelah peserta ditetapkan atau SK diunggah",
        409
      );
    }
  }

  // === registrationOpenDate ===
  if (rest.registrationOpenDate !== undefined) {
    const newOpenTime = safeGetTime(rest.registrationOpenDate);
    const existingOpenTime = safeGetTime(existing.registrationOpenDate);

    if (registrationLocked && newOpenTime !== existingOpenTime) {
      throwError("Tanggal pembukaan pendaftaran tidak dapat diubah karena pendaftaran sudah dimulai atau sudah ada peserta", 409);
    }

    if (rest.registrationOpenDate) {
      const newOpen = new Date(rest.registrationOpenDate);
      const existingOpen = existing.registrationOpenDate ? new Date(existing.registrationOpenDate) : null;

      if (!existingOpen || newOpen.getTime() !== existingOpen.getTime()) {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        if (newOpen < now) throwError("Tanggal pembukaan pendaftaran tidak boleh sebelum hari ini", 422);
      }
      updateData.registrationOpenDate = newOpen;
    } else {
      updateData.registrationOpenDate = null;
    }
  }

  // === registrationCloseDate ===
  if (rest.registrationCloseDate !== undefined) {
    if (rest.registrationCloseDate) {
      const newClose = new Date(rest.registrationCloseDate);
      const existingClose = existing.registrationCloseDate ? new Date(existing.registrationCloseDate) : null;
      const finalOpenDate = (updateData.registrationOpenDate !== undefined)
        ? updateData.registrationOpenDate
        : existing.registrationOpenDate;

      if (!existingClose || newClose.getTime() !== existingClose.getTime()) {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        if (newClose < now) throwError("Tanggal penutupan pendaftaran tidak boleh sebelum hari ini", 422);
      }

      if (finalOpenDate && newClose < new Date(finalOpenDate)) {
        throwError("Tanggal penutupan tidak boleh lebih awal dari tanggal pembukaan", 422);
      }

      if (registrationLocked && existingClose && newClose < existingClose) {
        throwError("Tanggal penutupan pendaftaran hanya dapat diperpanjang setelah pendaftaran dimulai atau sudah ada peserta", 409);
      }

      updateData.registrationCloseDate = newClose;
    } else {
      if (registrationLocked) {
        throwError("Tanggal penutupan pendaftaran tidak dapat dikosongkan karena pendaftaran sudah dimulai atau sudah ada peserta", 409);
      }
      updateData.registrationCloseDate = null;
    }
  }

  const finalOpenDate =
    updateData.registrationOpenDate !== undefined
      ? updateData.registrationOpenDate
      : existing.registrationOpenDate;
  const finalCloseDate =
    updateData.registrationCloseDate !== undefined
      ? updateData.registrationCloseDate
      : existing.registrationCloseDate;

  if ((finalOpenDate && !finalCloseDate) || (!finalOpenDate && finalCloseDate)) {
    throwError("Tanggal pembukaan dan penutupan pendaftaran harus diisi bersama", 422);
  }

  if (hasAnyParticipants && wasArchive !== (!finalOpenDate && !finalCloseDate)) {
    throwError("Tipe yudisium tidak dapat diubah karena sudah memiliki peserta", 409);
  }

  // === exitSurveyFormId ===
  if (rest.exitSurveyFormId !== undefined) {
    if (registrationLocked && rest.exitSurveyFormId !== existing.exitSurveyFormId) {
      throwError(
        "Template exit survey tidak dapat diubah karena pendaftaran sudah dimulai atau sudah ada peserta",
        409
      );
    }
    updateData.exitSurveyFormId = rest.exitSurveyFormId || null;
  }

  // === requirementIds — replace all requirement items ONLY if changed ===
  if (requirementIds !== undefined) {
    const currentIds = existing.requirementItems.map((ri) => ri.yudisiumRequirementId).sort();
    const nextIds = [...requirementIds].sort();
    const isChanged = JSON.stringify(currentIds) !== JSON.stringify(nextIds);

    if (isChanged) {
      if (registrationLocked) {
        throwError(
          "Persyaratan yudisium tidak dapat diubah karena pendaftaran sudah dimulai atau sudah ada peserta",
          409
        );
      }

      updateData.requirementItems = {
        deleteMany: {},
        create: requirementIds.map((reqId, index) => ({
          yudisiumRequirementId: reqId,
          order: index,
        })),
      };
    }
  }

  const currentRequirementIds = existing.requirementItems?.map((ri) => ri.yudisiumRequirementId) ?? [];
  const finalRequirementIds = requirementIds !== undefined ? requirementIds : currentRequirementIds;
  const finalEventDate = updateData.eventDate !== undefined ? updateData.eventDate : existing.eventDate;
  const finalRoomId = updateData.roomId !== undefined ? updateData.roomId : existing.roomId;
  const finalExitSurveyFormId =
    updateData.exitSurveyFormId !== undefined ? updateData.exitSurveyFormId : existing.exitSurveyFormId;
  const finalName = updateData.name !== undefined ? updateData.name : existing.name;

  assertValidYudisiumState({
    registrationOpenDate: finalOpenDate,
    registrationCloseDate: finalCloseDate,
    eventDate: finalEventDate,
    roomId: finalRoomId,
    exitSurveyFormId: finalExitSurveyFormId,
    requirementIds: finalRequirementIds,
  });
  await assertUniqueYudisiumPeriod({
    name: finalName,
    registrationOpenDate: finalOpenDate,
    registrationCloseDate: finalCloseDate,
    eventDate: finalEventDate,
    roomId: finalRoomId,
    excludeId: id,
    checkName: updateData.name !== undefined,
    checkRegistrationPeriod:
      updateData.registrationOpenDate !== undefined || updateData.registrationCloseDate !== undefined,
    checkEventSchedule: updateData.eventDate !== undefined || updateData.roomId !== undefined,
  });

  // === decreeFile — upload new SK ===
  if (decreeFile) {
    const uploadsRoot = path.join(process.cwd(), "uploads", "yudisium", id);
    await mkdir(uploadsRoot, { recursive: true });

    const ext = path.extname(decreeFile.originalname).toLowerCase();
    const safeName = `sk-yudisium-${Date.now()}${ext}`;
    const absPath = path.join(uploadsRoot, safeName);
    await writeFile(absPath, decreeFile.buffer);
    const relPath = path.relative(process.cwd(), absPath).replace(/\\/g, "/");

    const doc = await prisma.document.create({
      data: {
        userId,
        fileName: decreeFile.originalname,
        filePath: relPath,
      }
    });
    updateData.documentId = doc.id;
    updateData.decreeUploadedBy = userId;
    updateData.decreeUploadedAt = new Date();

    // Trigger finalization side-effect
    await finalizeYudisiumResults(id);
  }

  const updated = await repository.update(id, updateData);
  return formatYudisium(updated);
};

export const finalizeRegistration = async (yudisiumId) => {
  const yudisium = await repository.findById(yudisiumId);
  if (!yudisium) throwError("Data yudisium tidak ditemukan", 404);
  if (!isActiveYudisium(yudisium)) {
    throwError("Finalisasi pendaftaran hanya berlaku untuk yudisium aktif", 400);
  }

  const participants = await prisma.yudisiumParticipant.findMany({
    where: { yudisiumId },
    include: {
      thesis: {
        include: {
          student: {
            include: {
              studentCplScores: true
            }
          }
        }
      }
    }
  });

  const activeCpls = await prisma.cpl.findMany({ where: { isActive: true } });
  const activeCplIds = activeCpls.map(c => c.id);

  const results = { appointed: 0, rejected: 0 };

  for (const p of participants) {
    // Only process registered/verified/cpl_validated (skip already appointed/finalized/rejected)
    if (!['registered', 'verified', 'cpl_validated'].includes(p.status)) continue;

    const scores = p.thesis?.student?.studentCplScores || [];
    const scoreStatusMap = new Map(scores.map(s => [s.cplId, s.status]));
    
    const isCplMet = activeCplIds.length > 0 && 
                     activeCplIds.every(id => scoreStatusMap.get(id) === 'validated');

    if (isCplMet) {
      await prisma.yudisiumParticipant.update({
        where: { id: p.id },
        data: { status: 'appointed' }
      });
      results.appointed++;
    } else {
      await prisma.yudisiumParticipant.update({
        where: { id: p.id },
        data: { status: 'rejected' }
      });
      results.rejected++;
    }
  }

  // Mark the yudisium event as appointed (batch processed)
  await prisma.yudisium.update({
    where: { id: yudisiumId },
    data: { appointedAt: new Date() }
  });

  return results;
};

export const deleteYudisium = async (id) => {
  const existing = await repository.findById(id);
  if (!existing) throwError("Data yudisium tidak ditemukan", 404);

  if (isArchiveYudisium(existing)) {
    await repository.removeWithParticipants(id);
    return;
  }

  if (await repository.hasParticipants(id)) {
    throwError("Tidak dapat menghapus data yudisium karena sudah memiliki peserta", 409);
  }

  await repository.remove(id);
};
