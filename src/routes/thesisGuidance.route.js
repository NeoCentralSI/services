import express from "express";
import { authGuard, requireAnyRole, requireRole } from "../middlewares/auth.middleware.js";
import { ROLES, LECTURER_ROLES, DEPARTMENT_ROLES } from "../constants/roles.js";
import { validate } from "../middlewares/validation.middleware.js";
import {
  approveComponentsSchema,
  failThesisSchema,
  transferStudentsSchema,
  rejectTransferSchema,
} from "../validators/lecturer.guidance.validator.js";
import {
  getTransferLecturers,
  requestTransfer,
  getIncomingTransfers,
  approveTransfer,
  rejectTransfer,
  listProgress,
  progressDetail,
  approveProgressComponents,
  finalApproval,
  failStudentThesis,
} from "../controllers/thesisGuidance/lecturer.guidance.controller.js";
import * as monitoringController from "../controllers/thesisGuidance/monitoring.controller.js";
import prisma from "../config/prisma.js";
import * as studentRepo from "../repositories/thesisGuidance/student.guidance.repository.js";
import * as lecturerRepo from "../repositories/thesisGuidance/lecturer.guidance.repository.js";
import {
  submitSessionSummaryService,
  markSessionCompleteService,
} from "../services/thesisGuidance/student.guidance.service.js";
import {
  getMyStudentsService,
  getStudentDetailService,
  sendWarningNotificationService,
  getGuidanceDetailService,
  approveThesisProposalService,
  getRequestsService,
  getScheduledGuidancesService,
  getPendingApprovalService,
} from "../services/thesisGuidance/lecturer.guidance.service.js";
import {
  getSupervisorBusySlots,
  getMyThesisDetail,
  updateThesisTitle,
  generateLogbookPdf,
  cancelGuidanceByLecturer,
  rejectSessionSummary,
  updateSupervisorFeedback,
  getLecturerGuidanceHistory,
} from "../services/thesisGuidance/guidance.inline.service.js";
import * as supervisor2Service from "../services/thesisGuidance/supervisor2.service.js";
import * as proposalService from "../services/thesisGuidance/proposal.service.js";
import { uploadThesisFile, parseGuidanceRequestForm } from "../middlewares/file.middleware.js";
import { BadRequestError, NotFoundError } from "../utils/errors.js";

const router = express.Router();
router.use(authGuard);

// ============================================
// Student Routes
// ============================================

router.get("/student/guidance", requireAnyRole([ROLES.MAHASISWA]), async (req, res, next) => {
  try {
    const thesis = await studentRepo.getActiveThesisForStudent(req.user.sub);
    if (!thesis) return res.json({ success: true, count: 0, items: [] });
    const phase = req.query.phase || null;
    const items = await studentRepo.listGuidancesForThesis(thesis.id, req.query.status || null, phase);
    const mapped = items.map(mapGuidanceItem);
    res.json({ success: true, count: mapped.length, items: mapped });
  } catch (err) { next(err); }
});

router.post("/student/guidance/request", requireAnyRole([ROLES.MAHASISWA]), parseGuidanceRequestForm, async (req, res, next) => {
  try {
    const thesis = await studentRepo.getActiveThesisForStudent(req.user.sub);
    if (!thesis) throw new NotFoundError("Tugas Akhir tidak ditemukan");

    const supervisors = await studentRepo.getSupervisorsForThesis(thesis.id);
    const supervisorId = req.body.supervisorId || supervisors[0]?.lecturerId;
    if (!supervisorId) throw new BadRequestError("Belum memiliki dosen pembimbing");

    const phase = req.body.phase || "thesis";
    if (!["proposal", "thesis"].includes(phase)) {
      throw new BadRequestError("Phase harus 'proposal' atau 'thesis'");
    }

    const rawMilestoneIds = req.body.milestoneIds || req.body['milestoneIds[]'];
    const milestoneIds = Array.isArray(rawMilestoneIds)
      ? rawMilestoneIds
      : rawMilestoneIds
        ? [rawMilestoneIds]
        : [];

    const guidance = await prisma.$transaction(async (tx) => {
      const created = await tx.thesisGuidance.create({
        data: {
          thesisId: thesis.id,
          supervisorId,
          requestedDate: new Date(req.body.guidanceDate),
          duration: parseInt(req.body.duration) || 60,
          studentNotes: req.body.studentNotes || null,
          documentUrl: req.body.documentUrl || null,
          phase,
          status: "requested",
        },
        include: {
          supervisor: { include: { user: { select: { id: true, fullName: true } } } },
          milestones: { include: { milestone: { select: { id: true, title: true } } } },
        },
      });

      if (milestoneIds.length > 0) {
        await tx.thesisGuidanceMilestone.createMany({
          data: milestoneIds.map((mid) => ({
            guidanceId: created.id,
            milestoneId: mid,
          })),
          skipDuplicates: true,
        });
        // Reload milestones relation after insert
        const withMilestones = await tx.thesisGuidance.findUnique({
          where: { id: created.id },
          include: {
            supervisor: { include: { user: { select: { id: true, fullName: true } } } },
            milestones: { include: { milestone: { select: { id: true, title: true } } } },
          },
        });
        return withMilestones;
      }

      return created;
    });

    res.json({ success: true, guidance: mapGuidanceItem(guidance) });
  } catch (err) { next(err); }
});

router.get("/student/guidance/:id", requireAnyRole([ROLES.MAHASISWA]), async (req, res, next) => {
  try {
    const guidance = await studentRepo.getGuidanceByIdForStudent(req.params.id, req.user.sub);
    if (!guidance) throw new NotFoundError("Bimbingan tidak ditemukan");
    res.json({ success: true, guidance: mapGuidanceItem(guidance) });
  } catch (err) { next(err); }
});

router.patch("/student/guidance/:id/reschedule", requireAnyRole([ROLES.MAHASISWA]), async (req, res, next) => {
  try {
    const guidance = await studentRepo.getGuidanceByIdForStudent(req.params.id, req.user.sub);
    if (!guidance) throw new NotFoundError("Bimbingan tidak ditemukan");
    if (guidance.status !== "requested") throw new BadRequestError("Hanya bimbingan berstatus 'diajukan' yang bisa dijadwalkan ulang");
    const updated = await studentRepo.updateGuidanceRequestedDate(req.params.id, new Date(req.body.guidanceDate));
    res.json({ success: true, guidance: mapGuidanceItem(updated) });
  } catch (err) { next(err); }
});

router.patch("/student/guidance/:id/cancel", requireAnyRole([ROLES.MAHASISWA]), async (req, res, next) => {
  try {
    const guidance = await studentRepo.getGuidanceByIdForStudent(req.params.id, req.user.sub);
    if (!guidance) throw new NotFoundError("Bimbingan tidak ditemukan");
    if (!["requested", "accepted"].includes(guidance.status)) throw new BadRequestError("Bimbingan tidak dapat dibatalkan");
    const updated = await studentRepo.updateGuidanceById(req.params.id, { status: "cancelled" });
    res.json({ success: true, guidance: mapGuidanceItem(updated) });
  } catch (err) { next(err); }
});

router.patch("/student/guidance/:id/notes", requireAnyRole([ROLES.MAHASISWA]), async (req, res, next) => {
  try {
    const guidance = await studentRepo.getGuidanceByIdForStudent(req.params.id, req.user.sub);
    if (!guidance) throw new NotFoundError("Bimbingan tidak ditemukan");
    if (["completed", "cancelled", "deleted"].includes(guidance.status)) {
      throw new BadRequestError("Catatan hanya dapat diubah pada bimbingan yang masih aktif");
    }
    const updated = await studentRepo.updateGuidanceById(req.params.id, { studentNotes: req.body.studentNotes });
    res.json({ success: true, guidance: mapGuidanceItem(updated) });
  } catch (err) { next(err); }
});

router.post("/student/guidance/:id/submit-summary", requireAnyRole([ROLES.MAHASISWA]), async (req, res, next) => {
  try {
    const result = await submitSessionSummaryService(req.user.sub, req.params.id, req.body);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

router.post("/student/guidance/:id/complete", requireAnyRole([ROLES.MAHASISWA]), async (req, res, next) => {
  try {
    const result = await markSessionCompleteService(req.user.sub, req.params.id, req.body);
    res.json({
      success: true,
      message: "Ringkasan bimbingan terkirim dan menunggu pengesahan dosen",
      ...result,
    });
  } catch (err) { next(err); }
});

router.get("/student/supervisors", requireAnyRole([ROLES.MAHASISWA]), async (req, res, next) => {
  try {
    const thesis = await studentRepo.getActiveThesisForStudent(req.user.sub);
    if (!thesis) return res.json({ success: true, thesisId: null, supervisors: [] });
    const supervisors = await studentRepo.getSupervisorsForThesis(thesis.id);
    res.json({
      success: true, thesisId: thesis.id,
      supervisors: supervisors.map((s) => ({
        id: s.lecturerId || s.id, name: s.lecturer?.user?.fullName ?? null,
        email: s.lecturer?.user?.email ?? null, role: s.role?.name ?? null,
      })),
    });
  } catch (err) { next(err); }
});

router.get("/student/supervisors/:supervisorId/availability", requireAnyRole([ROLES.MAHASISWA]), async (req, res, next) => {
  try {
    const start = req.query.start ? new Date(req.query.start) : new Date();
    const end = req.query.end ? new Date(req.query.end) : new Date(Date.now() + 30 * 86400000);
    const busySlots = await getSupervisorBusySlots(req.params.supervisorId, start, end);
    res.json({ success: true, busySlots });
  } catch (err) { next(err); }
});

router.get("/student/my-thesis", requireAnyRole([ROLES.MAHASISWA]), async (req, res, next) => {
  try {
    const thesisData = await getMyThesisDetail(req.user.sub);
    thesisData.student.email = thesisData.student.email ?? req.user.email;
    res.json({ success: true, thesis: thesisData });
  } catch (err) { next(err); }
});

router.patch("/student/my-thesis/title", requireAnyRole([ROLES.MAHASISWA]), async (req, res, next) => {
  try {
    const result = await updateThesisTitle(req.user.sub, req.body.title);
    res.json({ success: true, message: "Judul berhasil diperbarui", thesis: result });
  } catch (err) { next(err); }
});

router.get("/student/history", requireAnyRole([ROLES.MAHASISWA]), async (req, res, next) => {
  try {
    const items = await studentRepo.listGuidanceHistoryByStudent(req.user.sub);
    res.json({ success: true, count: items.length, items: items.map(mapGuidanceItem) });
  } catch (err) { next(err); }
});

router.get("/student/needs-summary", requireAnyRole([ROLES.MAHASISWA]), async (req, res, next) => {
  try {
    const items = await studentRepo.getGuidancesNeedingSummary(req.user.sub);
    res.json({ success: true, guidances: items.map(mapGuidanceItem) });
  } catch (err) { next(err); }
});

router.get("/student/completed-history", requireAnyRole([ROLES.MAHASISWA]), async (req, res, next) => {
  try {
    const phase = req.query.phase || null;
    const items = await studentRepo.getCompletedGuidanceHistory(req.user.sub, phase);
    res.json({
      success: true,
      guidances: items.map((g) => ({
        id: g.id, supervisorName: g.supervisor?.user?.fullName ?? "Dosen",
        approvedDate: g.approvedDate, completedAt: g.completedAt, duration: g.duration,
        studentNotes: g.studentNotes, sessionSummary: g.sessionSummary, actionItems: g.actionItems,
        milestoneName: g.milestones?.[0]?.milestone?.title ?? null,
        thesisTitle: g.thesis?.title ?? null, phase: g.phase ?? "proposal",
      })),
    });
  } catch (err) { next(err); }
});

router.get("/student/guidance/:id/export", requireAnyRole([ROLES.MAHASISWA]), async (req, res, next) => {
  try {
    const guidance = await studentRepo.getGuidanceForExport(req.params.id, req.user.sub);
    if (!guidance) throw new NotFoundError("Bimbingan tidak ditemukan");
    res.json({
      success: true,
      guidance: {
        id: guidance.id, supervisorName: guidance.supervisor?.user?.fullName ?? "Dosen",
        approvedDate: guidance.approvedDate, completedAt: guidance.completedAt, duration: guidance.duration,
        sessionSummary: guidance.sessionSummary, actionItems: guidance.actionItems,
        studentName: guidance.thesis?.student?.user?.fullName ?? null,
        studentId: guidance.thesis?.student?.user?.identityNumber ?? null,
        thesisTitle: guidance.thesis?.title ?? null,
      },
    });
  } catch (err) { next(err); }
});

router.get("/student/thesis-history", requireAnyRole([ROLES.MAHASISWA]), async (req, res, next) => {
  try {
    const theses = await studentRepo.getThesisHistory(req.user.sub);
    res.json({
      success: true,
      theses: theses.map((t) => ({
        id: t.id, title: t.title, status: t.thesisStatus?.name ?? null,
        topic: t.thesisTopic?.name ?? null,
        academicYear: t.academicYear ? `${t.academicYear.year}/${t.academicYear.semester}` : null,
        createdAt: t.createdAt,
        stats: { guidances: t._count?.thesisGuidances ?? 0, completedMilestones: t.thesisMilestones?.filter((m) => m.status === "completed").length ?? 0 },
      })),
    });
  } catch (err) { next(err); }
});

router.get("/student/progress", requireAnyRole([ROLES.MAHASISWA]), async (req, res, next) => {
  try {
    const thesis = await studentRepo.getActiveThesisForStudent(req.user.sub);
    if (!thesis) return res.json({ success: true, thesisId: null, components: [] });
    res.json({ success: true, thesisId: thesis.id, components: [] });
  } catch (err) { next(err); }
});

router.patch("/student/progress/complete", requireAnyRole([ROLES.MAHASISWA]), async (req, res, next) => {
  try {
    res.json({ success: true, thesisId: null, updated: 0, created: 0 });
  } catch (err) { next(err); }
});

router.post("/student/propose-thesis", requireAnyRole([ROLES.MAHASISWA]), async (req, res, next) => {
  try {
    throw new BadRequestError(
      "Pengajuan thesis langsung sudah tidak difasilitasi. Gunakan alur TA-01/TA-02 melalui pengajuan dosen pembimbing.",
    );
  } catch (err) { next(err); }
});

// ============================================
// Student Proposal Versioning
// ============================================

router.post("/student/proposal/upload", requireAnyRole([ROLES.MAHASISWA]), uploadThesisFile, async (req, res, next) => {
  try {
    const result = await proposalService.uploadProposalVersion(req.user.sub, req.file, req.body.description);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.get("/student/proposal/versions", requireAnyRole([ROLES.MAHASISWA]), async (req, res, next) => {
  try {
    const result = await proposalService.getProposalVersions(req.user.sub);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

router.get("/student/proposal/status", requireAnyRole([ROLES.MAHASISWA]), async (req, res, next) => {
  try {
    const result = await proposalService.getProposalSubmissionStatus(req.user.sub);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post("/student/proposal/submit-final", requireAnyRole([ROLES.MAHASISWA]), async (req, res, next) => {
  try {
    const result = await proposalService.submitFinalProposal(req.user.sub);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post("/student/guidance/generate-log", requireAnyRole([ROLES.MAHASISWA]), async (req, res, next) => {
  try {
    const { pdfBuffer, nim } = await generateLogbookPdf(req.user.sub);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="logbook-bimbingan-${nim}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) { next(err); }
});

router.get("/student/available-supervisors-2", requireAnyRole([ROLES.MAHASISWA]), async (req, res, next) => {
  try {
    const thesis = await studentRepo.getActiveThesisForStudent(req.user.sub);
    if (!thesis) return res.json({ success: true, data: [] });
    const lecturers = await lecturerRepo.findEligibleTransferLecturers(thesis.id);
    res.json({ success: true, data: lecturers.map((l) => ({ id: l.id, fullName: l.user?.fullName ?? null, email: l.user?.email ?? null, identityNumber: l.user?.identityNumber ?? null, scienceGroup: l.scienceGroup?.name ?? null })) });
  } catch (err) { next(err); }
});

router.post("/student/request-supervisor-2", requireAnyRole([ROLES.MAHASISWA]), async (req, res, next) => {
  try {
    const data = await supervisor2Service.requestSupervisor2(req.user.sub, req.body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get("/student/pending-supervisor-2-request", requireAnyRole([ROLES.MAHASISWA]), async (req, res, next) => {
  try {
    const data = await supervisor2Service.getPendingRequest(req.user.sub);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.delete("/student/cancel-supervisor-2-request", requireAnyRole([ROLES.MAHASISWA]), async (req, res, next) => {
  try {
    const data = await supervisor2Service.cancelRequest(req.user.sub);
    res.json({ success: true, ...data });
  } catch (err) { next(err); }
});

// ============================================
// Lecturer Routes
// ============================================

router.get("/lecturer/my-students", requireAnyRole(LECTURER_ROLES), async (req, res, next) => {
  try {
    const result = await getMyStudentsService(req.user.sub);
    res.json({ success: true, data: result.students });
  } catch (err) { next(err); }
});

router.get("/lecturer/my-students/:thesisId", requireAnyRole(LECTURER_ROLES), async (req, res, next) => {
  try {
    const detail = await getStudentDetailService(req.user.sub, req.params.thesisId);
    res.json({ success: true, data: detail });
  } catch (err) { next(err); }
});

router.post("/lecturer/my-students/:thesisId/warning", requireAnyRole(LECTURER_ROLES), async (req, res, next) => {
  try {
    const { warningType } = req.body;
    if (!warningType) throw new BadRequestError("warningType wajib diisi");
    const result = await sendWarningNotificationService(req.user.sub, req.params.thesisId, warningType);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

router.get("/lecturer/requests", requireAnyRole(LECTURER_ROLES), async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 50;
    const result = await getRequestsService(req.user.sub, { page, pageSize });
    res.json({ success: true, data: { rows: result.requests, total: result.total, page: result.page, pageSize: result.pageSize } });
  } catch (err) { next(err); }
});

router.get("/lecturer/scheduled", requireAnyRole(LECTURER_ROLES), async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 100;
    const result = await getScheduledGuidancesService(req.user.sub, { page, pageSize });
    res.json({ success: true, data: { rows: result.guidances, total: result.total, page: result.page, pageSize: result.pageSize } });
  } catch (err) { next(err); }
});

router.post("/lecturer/requests/:id/approve", requireAnyRole(LECTURER_ROLES), async (req, res, next) => {
  try {
    const guidance = await lecturerRepo.findGuidanceByIdForLecturer(req.params.id, req.user.sub);
    if (!guidance) throw new NotFoundError("Bimbingan tidak ditemukan");
    if (guidance.status !== "requested") throw new BadRequestError("Hanya bimbingan berstatus 'diajukan' yang bisa disetujui");
    const updated = await lecturerRepo.approveGuidanceById(req.params.id);
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

router.post("/lecturer/requests/:id/reject", requireAnyRole(LECTURER_ROLES), async (req, res, next) => {
  try {
    const guidance = await lecturerRepo.findGuidanceByIdForLecturer(req.params.id, req.user.sub);
    if (!guidance) throw new NotFoundError("Bimbingan tidak ditemukan");
    if (guidance.status !== "requested") throw new BadRequestError("Hanya bimbingan berstatus 'diajukan' yang bisa ditolak");
    const updated = await lecturerRepo.rejectGuidanceById(req.params.id, { feedback: req.body.rejectionReason || "Ditolak oleh dosen" });
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

router.post("/lecturer/requests/:id/cancel", requireAnyRole(LECTURER_ROLES), async (req, res, next) => {
  try {
    const guidance = await lecturerRepo.findGuidanceByIdForLecturer(req.params.id, req.user.sub);
    if (!guidance) throw new NotFoundError("Bimbingan tidak ditemukan");
    const updated = await cancelGuidanceByLecturer(req.params.id, req.body.reason);
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

router.get("/lecturer/pending-approval", requireAnyRole(LECTURER_ROLES), async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 50;
    const result = await getPendingApprovalService(req.user.sub, { page, pageSize });
    res.json({ success: true, data: result.guidances });
  } catch (err) { next(err); }
});

router.post("/lecturer/guidance/:id/approve-summary", requireAnyRole(LECTURER_ROLES), async (req, res, next) => {
  try {
    const guidance = await lecturerRepo.findPendingGuidanceById(req.params.id, req.user.sub);
    if (!guidance) throw new NotFoundError("Bimbingan tidak ditemukan");
    if (guidance.status !== "summary_pending") throw new BadRequestError("Ringkasan belum disubmit oleh mahasiswa");
    const updated = await lecturerRepo.approveSessionSummary(req.params.id, req.body.supervisorFeedback || null);
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

router.post("/lecturer/guidance/:id/reject-summary", requireAnyRole(LECTURER_ROLES), async (req, res, next) => {
  try {
    const guidance = await lecturerRepo.findPendingGuidanceById(req.params.id, req.user.sub);
    if (!guidance) throw new NotFoundError("Bimbingan tidak ditemukan");
    if (guidance.status !== "summary_pending") throw new BadRequestError("Ringkasan belum disubmit oleh mahasiswa");
    const updated = await rejectSessionSummary(req.params.id, req.body.reason);
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

router.get("/lecturer/guidance/:id", requireAnyRole(LECTURER_ROLES), async (req, res, next) => {
  try {
    const result = await getGuidanceDetailService(req.user.sub, req.params.id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post("/lecturer/feedback/:id", requireAnyRole(LECTURER_ROLES), async (req, res, next) => {
  try {
    const guidance = await lecturerRepo.findGuidanceByIdForLecturer(req.params.id, req.user.sub);
    if (!guidance) throw new NotFoundError("Bimbingan tidak ditemukan");
    const updated = await updateSupervisorFeedback(req.params.id, req.body.feedback);
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

router.get("/lecturer/guidance-history/:studentId", requireAnyRole(LECTURER_ROLES), async (req, res, next) => {
  try {
    const items = await getLecturerGuidanceHistory(req.params.studentId, req.user.sub);
    res.json({ success: true, data: items });
  } catch (err) { next(err); }
});

router.get("/lecturer/supervisor2-requests", requireAnyRole(LECTURER_ROLES), async (req, res, next) => {
  try {
    const data = await supervisor2Service.getRequestsForLecturer(req.user.sub);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post("/lecturer/supervisor2-requests/:id/approve", requireAnyRole(LECTURER_ROLES), async (req, res, next) => {
  try {
    const data = await supervisor2Service.approveRequest(req.user.sub, req.params.id);
    res.json({ success: true, data, message: "Permintaan Pembimbing 2 disetujui." });
  } catch (err) { next(err); }
});

router.post("/lecturer/supervisor2-requests/:id/reject", requireAnyRole(LECTURER_ROLES), async (req, res, next) => {
  try {
    const data = await supervisor2Service.rejectRequest(req.user.sub, req.params.id, req.body.reason);
    res.json({ success: true, data, message: "Permintaan Pembimbing 2 ditolak." });
  } catch (err) { next(err); }
});

// Transfer pembimbing: implementasi di lecturer.guidance.controller + lecturer.guidance.service
router.get("/lecturer/transfer/eligible-lecturers", requireAnyRole(LECTURER_ROLES), getTransferLecturers);
router.post(
  "/lecturer/transfer/request",
  requireAnyRole(LECTURER_ROLES),
  validate(transferStudentsSchema),
  requestTransfer,
);
router.get("/lecturer/transfer/incoming", requireAnyRole(LECTURER_ROLES), getIncomingTransfers);
router.post("/lecturer/transfer/:notificationId/approve", requireAnyRole(LECTURER_ROLES), approveTransfer);
router.post(
  "/lecturer/transfer/:notificationId/reject",
  requireAnyRole(LECTURER_ROLES),
  validate(rejectTransferSchema),
  rejectTransfer,
);
router.get("/lecturer/progress", requireAnyRole(LECTURER_ROLES), listProgress);
router.get("/lecturer/progress/:studentId", requireAnyRole(LECTURER_ROLES), progressDetail);
router.patch(
  "/lecturer/progress/:studentId/approve",
  requireAnyRole(LECTURER_ROLES),
  validate(approveComponentsSchema),
  approveProgressComponents,
);
router.post(
  "/lecturer/progress/:studentId/approve",
  requireAnyRole(LECTURER_ROLES),
  validate(approveComponentsSchema),
  approveProgressComponents,
);
router.patch("/lecturer/progress/:studentId/final-approval", requireAnyRole(LECTURER_ROLES), finalApproval);
router.post("/lecturer/progress/:studentId/final-approval", requireAnyRole(LECTURER_ROLES), finalApproval);
router.patch(
  "/lecturer/progress/:studentId/fail",
  requireAnyRole(LECTURER_ROLES),
  validate(failThesisSchema),
  failStudentThesis,
);
router.post(
  "/lecturer/progress/:studentId/fail",
  requireAnyRole(LECTURER_ROLES),
  validate(failThesisSchema),
  failStudentThesis,
);

router.post("/lecturer/proposals/:thesisId/approve", requireAnyRole(LECTURER_ROLES), async (req, res, next) => {
  try {
    const result = await approveThesisProposalService(req.user.sub, req.params.thesisId);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

router.get("/lecturer/students/:thesisId/proposal/versions", requireAnyRole(LECTURER_ROLES), async (req, res, next) => {
  try {
    const result = await proposalService.getProposalVersionsForLecturer(req.user.sub, req.params.thesisId);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

// ============================================
// Monitoring Routes (KaDep/Sekdep)
// ============================================

// Monitoring & persetujuan transfer Kadep (selaras dengan routes/thesisGuidance/monitoring.route.js)
router.get("/monitoring/dashboard", requireAnyRole(DEPARTMENT_ROLES), monitoringController.getMonitoringDashboard);
router.get("/monitoring/transfers/pending", requireRole(ROLES.KETUA_DEPARTEMEN), monitoringController.getKadepPendingTransfers);
router.get("/monitoring/transfers/all", requireRole(ROLES.KETUA_DEPARTEMEN), monitoringController.getKadepAllTransfers);
router.patch("/monitoring/transfers/:notificationId/approve", requireRole(ROLES.KETUA_DEPARTEMEN), monitoringController.kadepApproveTransfer);
router.patch("/monitoring/transfers/:notificationId/reject", requireRole(ROLES.KETUA_DEPARTEMEN), monitoringController.kadepRejectTransfer);

// ============================================
// Helpers
// ============================================

function mapGuidanceItem(g) {
  return {
    id: g.id, thesisId: g.thesisId, supervisorId: g.supervisorId,
    supervisorName: g.supervisor?.user?.fullName ?? null,
    status: g.status, phase: g.phase ?? "proposal",
    requestedDate: g.requestedDate, approvedDate: g.approvedDate,
    duration: g.duration, notes: g.studentNotes, studentNotes: g.studentNotes,
    supervisorFeedback: g.supervisorFeedback, rejectionReason: g.rejectionReason,
    completedAt: g.completedAt, sessionSummary: g.sessionSummary, actionItems: g.actionItems,
    summarySubmittedAt: g.summarySubmittedAt,
    document: g.document ?? null, documentUrl: g.documentUrl ?? null,
    milestoneIds: g.milestones?.map((m) => m.milestone?.id ?? m.milestoneId) ?? [],
    milestoneTitles: g.milestones?.map((m) => m.milestone?.title).filter(Boolean) ?? [],
    createdAt: g.createdAt, updatedAt: g.updatedAt,
  };
}

export default router;
