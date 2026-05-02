import { getStudentByUserId } from "../repositories/thesisGuidance/student.guidance.repository.js";
import * as coreRepo from "../repositories/thesis-defence.repository.js";
import * as docRepo from "../repositories/thesis-defence-doc.repository.js";
import * as examinerRepo from "../repositories/thesis-defence-examiner.repository.js";
import { computeEffectiveDefenceStatus } from "../utils/defenceStatus.util.js";
import { mapScoreToGrade } from "../utils/score.util.js";
import prisma from "../config/prisma.js";

function throwError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  throw err;
}

async function buildLecturerNameMap(lecturerIds = []) {
  const uniqueIds = [...new Set(lecturerIds.filter(Boolean))];
  if (uniqueIds.length === 0) return new Map();
  const lecturers = await prisma.lecturer.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, user: { select: { fullName: true } } },
  });
  return new Map(lecturers.map((l) => [l.id, l.user?.fullName || "-"]));
}

function sortGroupedDetails(grouped) {
  Object.values(grouped).forEach((g) =>
    g.criteria.sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
  );
  return Object.values(grouped).sort((a, b) => (a.code || "").localeCompare(b.code || ""));
}

async function resolveStudent(userId) {
  const student = await getStudentByUserId(userId);
  if (!student) throwError("Data mahasiswa tidak ditemukan.", 404);
  return student;
}

// ============================================================
// OVERVIEW
// ============================================================

export async function getOverview(userId) {
  const student = await resolveStudent(userId);
  const thesis = await coreRepo.getStudentThesisWithDefenceInfo(student.id);
  if (!thesis) throwError("Anda belum memiliki tugas akhir yang terdaftar.", 404);

  const sks = student.skscompleted ?? 0;

  const passedSeminar = thesis.thesisSeminars?.[0] || null;
  const seminarStatus = passedSeminar?.status ?? null;
  const seminarId = passedSeminar?.id ?? null;
  const hasPassedSeminar = !!passedSeminar;

  let seminarRevisionMet = false;
  let seminarRevisionTotal = 0;
  let seminarRevisionFinished = 0;

  if (seminarStatus === "passed") {
    seminarRevisionMet = true;
  } else if (seminarStatus === "passed_with_revision" && seminarId) {
    if (passedSeminar.revisionFinalizedAt) {
      seminarRevisionMet = true;
    } else {
      const revCounts = await coreRepo.countSeminarRevisions(seminarId);
      seminarRevisionTotal = revCounts.total;
      seminarRevisionFinished = revCounts.finished;
      seminarRevisionMet = revCounts.total > 0 && revCounts.total === revCounts.finished;
    }
  }

  const supervisors = thesis.thesisSupervisors || [];
  const allSupervisorsReady = supervisors.length > 0 && supervisors.every((s) => s.defenceReady);

  const checklist = {
    lulusSeminar: { met: hasPassedSeminar, label: "Lulus Seminar Hasil", seminarStatus },
    sks: { met: sks >= 142, current: sks, required: 142, label: "Menyelesaikan Minimal 142 SKS" },
    revisiSeminar: {
      met: seminarRevisionMet,
      label: "Penyelesaian Revisi Seminar Hasil",
      seminarStatus,
      total: seminarRevisionTotal,
      finished: seminarRevisionFinished,
    },
    pembimbing: {
      met: allSupervisorsReady,
      label: "Persetujuan Dosen Pembimbing",
      supervisors: supervisors.map((s) => ({
        name: s.lecturer?.user?.fullName || "-",
        role: s.role?.name || "-",
        ready: s.defenceReady,
      })),
    },
  };

  const allChecklistMet =
    checklist.lulusSeminar.met &&
    checklist.sks.met &&
    checklist.revisiSeminar.met &&
    checklist.pembimbing.met;

  let currentDefence = thesis.thesisDefences?.[0] || null;

  // If latest defence is failed/cancelled, treat as inactive for student registration flow
  if (currentDefence && ["failed", "cancelled"].includes(currentDefence.status)) {
    currentDefence = null;
  }

  let enrichedExaminers = [];
  if (currentDefence?.examiners?.length) {
    const examinerLecturerIds = [
      ...new Set(currentDefence.examiners.map((e) => e.lecturerId).filter(Boolean)),
    ];
    const lecturerMap = await buildLecturerNameMap(examinerLecturerIds);
    enrichedExaminers = currentDefence.examiners.map((e) => ({
      ...e,
      lecturerName: lecturerMap.get(e.lecturerId) || "-",
    }));
  }

  return {
    thesisId: thesis.id,
    thesisTitle: thesis.title,
    checklist,
    allChecklistMet,
    defence: currentDefence
      ? {
          id: currentDefence.id,
          status: computeEffectiveDefenceStatus(
            currentDefence.status,
            currentDefence.date,
            currentDefence.startTime,
            currentDefence.endTime
          ),
          registeredAt: currentDefence.registeredAt,
          date: currentDefence.date,
          startTime: currentDefence.startTime,
          endTime: currentDefence.endTime,
          meetingLink: currentDefence.meetingLink,
          finalScore: currentDefence.finalScore,
          grade: currentDefence.grade,
          resultFinalizedAt: currentDefence.resultFinalizedAt,
          cancelledReason: currentDefence.cancelledReason,
          room: currentDefence.room,
          documents: currentDefence.documents,
          examiners: enrichedExaminers,
        }
      : null,
  };
}

// ============================================================
// HISTORY
// ============================================================

export async function getDefenceHistory(userId) {
  const student = await resolveStudent(userId);
  const attempts = await coreRepo.getAllStudentDefences(student.id);

  const lecturerNameMap = await buildLecturerNameMap(
    attempts.flatMap((attempt) => (attempt.examiners || []).map((examiner) => examiner.lecturerId))
  );

  return attempts.map((attempt) => ({
    ...attempt,
    examiners: (attempt.examiners || []).map((examiner) => ({
      ...examiner,
      lecturerName: lecturerNameMap.get(examiner.lecturerId) || "-",
    })),
    status: computeEffectiveDefenceStatus(attempt.status, attempt.date, attempt.startTime, attempt.endTime),
  }));
}

// ============================================================
// DEFENCE DETAIL (Student)
// ============================================================

export async function getDefenceDetail(userId, defenceId) {
  const student = await resolveStudent(userId);
  const detail = await coreRepo.findStudentDefenceDetail(defenceId);
  if (!detail) throwError("Data sidang tidak ditemukan.", 404);
  if (detail.thesis?.studentId !== student.id) {
    throwError("Anda tidak memiliki akses ke data sidang ini.", 403);
  }

  const lecturerNameMap = await buildLecturerNameMap(
    (detail.examiners || []).map((examiner) => examiner.lecturerId)
  );

  const docTypes = await docRepo.getDefenceDocumentTypes();
  const docTypeMap = new Map(docTypes.map((dt) => [dt.id, dt.name]));

  const docIds = (detail.documents || []).map((doc) => doc.documentId).filter(Boolean);
  const docFiles = docIds.length
    ? await prisma.document.findMany({
        where: { id: { in: docIds } },
        select: { id: true, fileName: true, filePath: true },
      })
    : [];
  const docFileMap = new Map(docFiles.map((doc) => [doc.id, doc]));

  return {
    ...detail,
    examiners: (detail.examiners || []).map((examiner) => ({
      ...examiner,
      lecturerName: lecturerNameMap.get(examiner.lecturerId) || "-",
    })),
    documents: (detail.documents || []).map((doc) => {
      const fileMeta = docFileMap.get(doc.documentId);
      return {
        ...doc,
        documentTypeName: docTypeMap.get(doc.documentTypeId) || "-",
        fileName: fileMeta?.fileName || null,
        filePath: fileMeta?.filePath || null,
      };
    }),
    examinerNotes: (detail.examiners || [])
      .filter((e) => e.revisionNotes)
      .map((e) => ({
        examinerOrder: e.order,
        lecturerName: lecturerNameMap.get(e.lecturerId) || "-",
        revisionNotes: e.revisionNotes,
      })),
    status: computeEffectiveDefenceStatus(detail.status, detail.date, detail.startTime, detail.endTime),
  };
}

// ============================================================
// ASSESSMENT VIEW (Student, read-only)
// ============================================================

export async function getAssessmentView(userId, defenceId) {
  const detail = await getDefenceDetail(userId, defenceId);

  if (!["passed", "passed_with_revision", "failed"].includes(detail.status)) {
    throwError("Berita acara sidang belum tersedia.", 400);
  }

  const [examinerAssessmentDetails, supervisorAssessmentDetails] = await Promise.all([
    examinerRepo.findStudentDefenceExaminerAssessmentDetails(defenceId),
    coreRepo.findDefenceSupervisorAssessmentDetails(defenceId),
  ]);

  const lecturerNameMap = await buildLecturerNameMap(
    (detail.examiners || []).map((item) => item.lecturerId)
  );

  const examinerGroupsByExaminer = {};
  (examinerAssessmentDetails || []).forEach((item) => {
    const examinerId = item.thesisDefenceExaminerId;
    const cpmk = item.criteria?.cpmk;
    if (!examinerId || !cpmk) return;
    if (!examinerGroupsByExaminer[examinerId]) examinerGroupsByExaminer[examinerId] = {};
    if (!examinerGroupsByExaminer[examinerId][cpmk.id]) {
      examinerGroupsByExaminer[examinerId][cpmk.id] = {
        id: cpmk.id,
        code: cpmk.code,
        description: cpmk.description,
        criteria: [],
      };
    }
    examinerGroupsByExaminer[examinerId][cpmk.id].criteria.push({
      id: item.criteria.id,
      name: item.criteria.name,
      maxScore: item.criteria.maxScore,
      score: item.score,
      displayOrder: item.criteria.displayOrder,
    });
  });

  const supervisorGroups = {};
  (supervisorAssessmentDetails || []).forEach((item) => {
    const cpmk = item.criteria?.cpmk;
    if (!cpmk) return;
    if (!supervisorGroups[cpmk.id]) {
      supervisorGroups[cpmk.id] = {
        id: cpmk.id,
        code: cpmk.code,
        description: cpmk.description,
        criteria: [],
      };
    }
    supervisorGroups[cpmk.id].criteria.push({
      id: item.criteria.id,
      name: item.criteria.name,
      maxScore: item.criteria.maxScore,
      score: item.score,
      displayOrder: item.criteria.displayOrder,
    });
  });

  const supervisorNames = (detail.thesis?.thesisSupervisors || [])
    .map((item) => item?.lecturer?.user?.fullName)
    .filter(Boolean);

  const computedSupervisorScore = (supervisorAssessmentDetails || []).reduce(
    (sum, item) => sum + Number(item?.score || 0),
    0
  );
  const resolvedSupervisorScore = detail.supervisorScore ?? computedSupervisorScore;
  const hasSupervisorSubmission =
    detail.supervisorScore !== null && detail.supervisorScore !== undefined
      ? true
      : (supervisorAssessmentDetails || []).length > 0;
  const resolvedSupervisorName =
    detail.resultFinalizer?.lecturer?.user?.fullName || supervisorNames[0] || "-";

  return {
    defence: {
      id: detail.id,
      status: detail.status,
      examinerAverageScore: detail.examinerAverageScore,
      supervisorScore: resolvedSupervisorScore,
      finalScore: detail.finalScore,
      grade: detail.grade || mapScoreToGrade(detail.finalScore),
      resultFinalizedAt: detail.resultFinalizedAt,
      room: detail.room,
      date: detail.date,
      startTime: detail.startTime,
      endTime: detail.endTime,
      meetingLink: detail.meetingLink,
    },
    examiners: (detail.examiners || []).map((item) => ({
      ...item,
      lecturerName: lecturerNameMap.get(item.lecturerId) || "-",
      assessmentDetails: sortGroupedDetails(examinerGroupsByExaminer[item.id] || {}),
    })),
    supervisorAssessment: {
      name: resolvedSupervisorName,
      assessmentScore: resolvedSupervisorScore,
      supervisorNotes: detail.supervisorNotes,
      assessmentSubmittedAt: hasSupervisorSubmission
        ? detail.updatedAt || detail.resultFinalizedAt || null
        : null,
      assessmentDetails: sortGroupedDetails(supervisorGroups),
    },
  };
}
