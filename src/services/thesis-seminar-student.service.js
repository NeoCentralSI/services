import { getStudentByUserId } from "../repositories/thesisGuidance/student.guidance.repository.js";
import * as coreRepo from "../repositories/thesis-seminar.repository.js";
import * as examinerRepo from "../repositories/thesis-seminar-examiner.repository.js";
import * as docRepo from "../repositories/thesis-seminar-doc.repository.js";
import * as revisionRepo from "../repositories/thesis-seminar-revision.repository.js";
import * as audienceRepo from "../repositories/thesis-seminar-audience.repository.js";
import { computeEffectiveStatus } from "../utils/seminarStatus.util.js";
import { mapScoreToGrade } from "./thesis-seminar.service.js";
import { ENV } from "../config/env.js";
import prisma from "../config/prisma.js";

const MIN_BIMBINGAN = ENV.SEMINAR_MIN_BIMBINGAN;
const MIN_KEHADIRAN = ENV.SEMINAR_MIN_KEHADIRAN;

function throwError(msg, code) { const e = new Error(msg); e.statusCode = code; throw e; }
function isRevisionFinished(r) { return Boolean(r?.supervisorApprovedAt); }

async function resolveStudent(userId) {
  const student = await getStudentByUserId(userId);
  if (!student) throwError("Data mahasiswa tidak ditemukan.", 404);
  return student;
}

// ==================== OVERVIEW ====================

export async function getOverview(userId) {
  const student = await resolveStudent(userId);
  const thesis = await coreRepo.getStudentThesisWithSeminarInfo(student.id);
  if (!thesis) throwError("Anda belum memiliki tugas akhir yang terdaftar.", 404);

  const completedGuidances = thesis.thesisGuidances?.length ?? 0;
  const seminarAttendance = await coreRepo.countSeminarAttendance(student.id);
  const supervisors = thesis.thesisSupervisors || [];
  const allSupervisorsReady = supervisors.length > 0 && supervisors.every((s) => s.seminarReady);

  const checklist = {
    bimbingan: { met: completedGuidances >= MIN_BIMBINGAN, current: completedGuidances, required: MIN_BIMBINGAN, label: `${MIN_BIMBINGAN} Bimbingan` },
    kehadiran: { met: seminarAttendance >= MIN_KEHADIRAN, current: seminarAttendance, required: MIN_KEHADIRAN, label: `${MIN_KEHADIRAN} Kehadiran Seminar` },
    pembimbing: { met: allSupervisorsReady, label: "Persetujuan Dosen Pembimbing", supervisors: supervisors.map((s) => ({ name: s.lecturer?.user?.fullName || "-", role: s.role?.name || "-", ready: s.seminarReady })) },
  };

  const currentSeminar = thesis.thesisSeminars?.[0] || null;
  let enrichedExaminers = [];
  if (currentSeminar?.examiners?.length) {
    enrichedExaminers = await coreRepo.enrichExaminers(currentSeminar.examiners);
  }

  return {
    thesisId: thesis.id, thesisTitle: thesis.title, checklist,
    allChecklistMet: checklist.bimbingan.met && checklist.kehadiran.met && checklist.pembimbing.met,
    seminar: currentSeminar ? {
      id: currentSeminar.id, status: currentSeminar.status, registeredAt: currentSeminar.registeredAt,
      date: currentSeminar.date, startTime: currentSeminar.startTime, endTime: currentSeminar.endTime,
      meetingLink: currentSeminar.meetingLink, finalScore: currentSeminar.finalScore,
      grade: currentSeminar.finalScore != null ? mapScoreToGrade(currentSeminar.finalScore) : null,
      resultFinalizedAt: currentSeminar.resultFinalizedAt, cancelledReason: currentSeminar.cancelledReason,
      room: currentSeminar.room, documents: currentSeminar.documents, examiners: enrichedExaminers,
    } : null,
  };
}

// ==================== ANNOUNCEMENTS ====================

export async function getAnnouncements(userId) {
  const student = await resolveStudent(userId);
  const ownThesis = await prisma.thesis.findFirst({ where: { studentId: student.id }, select: { thesisSeminars: { select: { id: true } } } });
  const ownIds = new Set((ownThesis?.thesisSeminars || []).map((s) => s.id));
  const seminars = await coreRepo.getAllAnnouncedSeminars(student.id);

  const allLecIds = [...new Set(seminars.flatMap((s) => (s.examiners || []).map((e) => e.lecturerId).filter(Boolean)))];
  const lecMap = new Map();
  if (allLecIds.length > 0) {
    const lecs = await prisma.lecturer.findMany({ where: { id: { in: allLecIds } }, select: { id: true, user: { select: { fullName: true } } } });
    for (const l of lecs) lecMap.set(l.id, l.user?.fullName || "-");
  }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  return seminars.map((s) => {
    const sd = s.date ? new Date(s.date) : null; if (sd) sd.setHours(0, 0, 0, 0);
    const aud = s.audiences?.[0] || null;
    return {
      id: s.id, date: s.date, startTime: s.startTime, endTime: s.endTime,
      status: computeEffectiveStatus(s.status, s.date, s.startTime, s.endTime),
      meetingLink: s.meetingLink, room: s.room, thesisTitle: s.thesis?.title || "-",
      presenterName: s.thesis?.student?.user?.fullName || "-", presenterStudentId: s.thesis?.student?.id || null,
      supervisors: (s.thesis?.thesisSupervisors || []).map((ts) => ({ role: ts.role?.name || "-", name: ts.lecturer?.user?.fullName || "-" })),
      examiners: (s.examiners || []).map((e) => ({ order: e.order, name: lecMap.get(e.lecturerId) || "-" })),
      isOwn: ownIds.has(s.id), isPast: sd ? sd < today : false, isRegistered: !!aud,
      isPresent: Boolean(aud?.approvedAt), registeredAt: aud?.registeredAt || null,
    };
  });
}

// ==================== ATTENDANCE HISTORY ====================

export async function getAttendanceHistory(userId) {
  const student = await resolveStudent(userId);
  const records = await coreRepo.getSeminarAttendanceHistory(student.id);
  const attended = records.filter((r) => Boolean(r.approvedAt)).length;
  return {
    summary: { attended, total: records.length, required: MIN_KEHADIRAN, met: attended >= MIN_KEHADIRAN },
    records: records.map((r) => ({
      seminarId: r.thesisSeminarId, presenterName: r.seminar?.thesis?.student?.user?.fullName || "-",
      thesisTitle: r.seminar?.thesis?.title || "-", date: r.seminar?.date,
      isPresent: Boolean(r.approvedAt), approvedAt: r.approvedAt, approvedBy: r.supervisor?.lecturer?.user?.fullName || null,
    })),
  };
}

// ==================== SEMINAR HISTORY ====================

export async function getSeminarHistory(userId) {
  const student = await resolveStudent(userId);
  const seminars = await coreRepo.getAllStudentSeminars(student.id);
  const allLecIds = [...new Set(seminars.flatMap((s) => s.examiners.map((e) => e.lecturerId).filter(Boolean)))];
  const lecMap = new Map();
  if (allLecIds.length > 0) {
    const lecs = await prisma.lecturer.findMany({ where: { id: { in: allLecIds } }, select: { id: true, user: { select: { fullName: true } } } });
    for (const l of lecs) lecMap.set(l.id, l.user?.fullName || "-");
  }
  return seminars.map((s) => ({
    id: s.id, status: s.status, registeredAt: s.registeredAt, date: s.date, startTime: s.startTime, endTime: s.endTime,
    meetingLink: s.meetingLink, finalScore: s.finalScore,
    grade: s.finalScore != null ? mapScoreToGrade(s.finalScore) : null,
    resultFinalizedAt: s.resultFinalizedAt, cancelledReason: s.cancelledReason, room: s.room,
    examiners: s.examiners.map((e) => ({ order: e.order, lecturerName: lecMap.get(e.lecturerId) || "-", assessmentScore: e.assessmentScore })),
  }));
}

// ==================== SEMINAR DETAIL (Student) ====================

export async function getSeminarDetail(userId, seminarId) {
  const student = await resolveStudent(userId);
  const seminar = await coreRepo.findSeminarById(seminarId);
  if (!seminar) throwError("Seminar tidak ditemukan.", 404);
  if (seminar.thesis?.student?.id !== student.id) throwError("Anda tidak memiliki akses ke seminar ini.", 403);

  const lecMap = new Map();
  const lecIds = [...new Set((seminar.examiners || []).map((e) => e.lecturerId).filter(Boolean))];
  if (lecIds.length > 0) {
    const lecs = await prisma.lecturer.findMany({ where: { id: { in: lecIds } }, select: { id: true, user: { select: { fullName: true } } } });
    for (const l of lecs) lecMap.set(l.id, l.user?.fullName || "-");
  }

  const docTypes = await docRepo.getSeminarDocumentTypes();
  const docs = await docRepo.findSeminarDocuments(seminarId);
  const examinerNotes = (seminar.examiners || []).filter((e) => e.revisionNotes).map((e) => ({ examinerOrder: e.order, lecturerName: lecMap.get(e.lecturerId) || "-", revisionNotes: e.revisionNotes }));

  let revisions = [], revisionSummary = { total: 0, finished: 0, pendingApproval: 0 };
  if (seminar.status === "passed_with_revision") {
    const revData = await revisionRepo.findRevisionsBySeminarId(seminarId);
    revisions = revData.map((item) => ({
      id: item.id, examinerOrder: item.seminarExaminer?.order || null,
      examinerName: lecMap.get(item.seminarExaminer?.lecturerId) || "-",
      description: item.description, revisionAction: item.revisionAction,
      isFinished: isRevisionFinished(item), studentSubmittedAt: item.studentSubmittedAt,
      supervisorApprovedAt: item.supervisorApprovedAt, approvedBySupervisorName: item.supervisor?.lecturer?.user?.fullName || null,
    }));
    revisionSummary = { total: revisions.length, finished: revisions.filter((r) => r.isFinished).length, pendingApproval: revisions.filter((r) => r.studentSubmittedAt && !r.isFinished).length };
  }

  const audiences = await audienceRepo.findAudiencesBySeminarId(seminarId);

  return {
    id: seminar.id, status: seminar.status, registeredAt: seminar.registeredAt,
    date: seminar.date, startTime: seminar.startTime, endTime: seminar.endTime,
    meetingLink: seminar.meetingLink, finalScore: seminar.finalScore,
    grade: seminar.finalScore != null ? mapScoreToGrade(seminar.finalScore) : null,
    resultFinalizedAt: seminar.resultFinalizedAt, cancelledReason: seminar.cancelledReason, room: seminar.room,
    thesis: { id: seminar.thesis.id, title: seminar.thesis.title, supervisors: (seminar.thesis.thesisSupervisors || []).map((s) => ({ role: s.role?.name || "-", lecturerName: s.lecturer?.user?.fullName || "-" })) },
    examiners: (seminar.examiners || []).map((e) => ({ id: e.id, order: e.order, lecturerName: lecMap.get(e.lecturerId) || "-", assessmentScore: e.assessmentScore, assessmentSubmittedAt: e.assessmentSubmittedAt })),
    documents: docs.map((d) => { const dt = docTypes.find((t) => t.id === d.documentTypeId); return { documentTypeId: d.documentTypeId, documentTypeName: dt?.name || "-", fileName: d.document?.fileName || null, filePath: d.document?.filePath || null, status: d.status, submittedAt: d.submittedAt, verifiedAt: d.verifiedAt, notes: d.notes }; }),
    examinerNotes, revisions, revisionSummary,
    audiences: audiences.map((a) => ({ studentName: a.student?.user?.fullName || "-", nim: a.student?.user?.identityNumber || "-", registeredAt: a.registeredAt, isPresent: Boolean(a.approvedAt), approvedAt: a.approvedAt, approvedByName: a.supervisor?.lecturer?.user?.fullName || null })),
  };
}

// ==================== ASSESSMENT VIEW (Student, read-only) ====================

export async function getAssessmentView(userId, seminarId) {
  const student = await resolveStudent(userId);
  const seminar = await coreRepo.findSeminarBasicById(seminarId);
  if (!seminar) throwError("Seminar tidak ditemukan.", 404);

  const lecMap = new Map();
  const examiners = await examinerRepo.findActiveExaminersWithAssessments(seminarId);
  const lecIds = [...new Set(examiners.map((e) => e.lecturerId).filter(Boolean))];
  if (lecIds.length > 0) {
    const lecs = await prisma.lecturer.findMany({ where: { id: { in: lecIds } }, select: { id: true, user: { select: { fullName: true } } } });
    for (const l of lecs) lecMap.set(l.id, l.user?.fullName || "-");
  }

  const allSubmitted = examiners.length >= 2 && examiners.every((e) => !!e.assessmentSubmittedAt && e.assessmentScore !== null);
  const avgScore = allSubmitted ? examiners.reduce((s, e) => s + (e.assessmentScore || 0), 0) / examiners.length : null;

  return {
    seminar: { id: seminarId, status: seminar.status, finalScore: seminar.finalScore ?? null, grade: seminar.finalScore != null ? mapScoreToGrade(seminar.finalScore) : null, resultFinalizedAt: seminar.resultFinalizedAt ?? null },
    examiners: examiners.map((item) => {
      const groups = {};
      (item.thesisSeminarExaminerAssessmentDetails || []).forEach((d) => {
        const cpmk = d.criteria?.cpmk; if (!cpmk) return;
        if (!groups[cpmk.id]) groups[cpmk.id] = { id: cpmk.id, code: cpmk.code, description: cpmk.description, criteria: [] };
        groups[cpmk.id].criteria.push({ id: d.criteria.id, name: d.criteria.name, maxScore: d.criteria.maxScore, score: d.score, displayOrder: d.criteria.displayOrder });
      });
      Object.values(groups).forEach((g) => g.criteria.sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)));
      return { id: item.id, lecturerId: item.lecturerId, lecturerName: lecMap.get(item.lecturerId) || "-", order: item.order, assessmentScore: item.assessmentScore, revisionNotes: item.revisionNotes, assessmentSubmittedAt: item.assessmentSubmittedAt, assessmentDetails: Object.values(groups).sort((a, b) => (a.code || "").localeCompare(b.code || "")) };
    }),
    allExaminerSubmitted: allSubmitted, averageScore: avgScore, averageGrade: avgScore != null ? mapScoreToGrade(avgScore) : null,
  };
}
