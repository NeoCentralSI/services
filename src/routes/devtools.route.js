/**
 * DEV TOOLS ROUTE — Admin-only endpoints for testing SIMPTA scenarios.
 *
 * ⚠️  DELETE THIS ENTIRE FILE when dev tools are no longer needed.
 *     No other file depends on this module (auto-mounted by app.js).
 *
 * Mounts at: /devtools
 *
 * Production safety:
 * - Disabled by default when NODE_ENV === "production".
 * - To enable in production (e.g. for staging-on-prod-infra), set
 *   ENABLE_DEVTOOLS=true. Treat this as a high-risk override.
 */
import express from "express";
import bcrypt from "bcrypt";
import { authGuard, requireAnyRole } from "../middlewares/auth.middleware.js";
import { ROLES, isStudentRole, isLecturerRole } from "../constants/roles.js";
import prisma from "../config/prisma.js";
import { NotFoundError, BadRequestError } from "../utils/errors.js";
import { setStudentPeriodFlags, ACADEMIC_FLAG_SOURCE } from "../services/research-method/eligibility.service.js";
import { formatAcademicYearLabel } from "../helpers/academicYear.helper.js";
import { GUIDANCE_STATUS } from "../constants/guidanceStatus.js";
import { AUDIT_ACTIONS, ENTITY_TYPES, logAudit } from "../services/auditLog.service.js";

const router = express.Router();

const INITIAL_STUDENT_STATE = {
  status: "active",
  sksCompleted: 0,
  mandatoryCoursesCompleted: false,
  mkwuCompleted: false,
  internshipCompleted: false,
  kknCompleted: false,
  researchMethodCompleted: false,
  currentSemester: 1,
};

const STUDENT_RESET_SELECT = {
  id: true,
  status: true,
  sksCompleted: true,
  mandatoryCoursesCompleted: true,
  mkwuCompleted: true,
  internshipCompleted: true,
  kknCompleted: true,
  currentSemester: true,
};

const isProduction = process.env.NODE_ENV === "production";
const devtoolsExplicitlyEnabled = ["true", "1", "yes"].includes(
  String(process.env.ENABLE_DEVTOOLS || "").toLowerCase(),
);

if (isProduction && !devtoolsExplicitlyEnabled) {
  router.use((_req, res) => {
    res.status(404).json({
      success: false,
      message: "Route not found",
    });
  });
} else {
  router.use(authGuard);
  router.use(requireAnyRole([ROLES.ADMIN]));
}

/** Select of the SIA flags of the running semester (plan 10.6). */
const ACTIVE_PERIOD_FLAGS_SELECT = {
  where: { academicYear: { isActive: true } },
  take: 1,
  select: {
    academicYearId: true,
    eligibleResearchMethod: true,
    eligibilitySource: true,
    eligibilityCapturedAt: true,
    takingThesisCourse: true,
    thesisCourseSource: true,
    thesisCourseCapturedAt: true,
  },
};

function buildPeriodFlags(row) {
  return {
    academicYearId: row?.academicYearId ?? null,
    eligibleResearchMethod: row?.eligibleResearchMethod ?? null,
    eligibilitySource: row?.eligibilitySource ?? null,
    eligibilityCapturedAt: row?.eligibilityCapturedAt ?? null,
    takingThesisCourse: row?.takingThesisCourse ?? null,
    thesisCourseSource: row?.thesisCourseSource ?? null,
    thesisCourseCapturedAt: row?.thesisCourseCapturedAt ?? null,
  };
}

function parseNullableBoolean(value, label = "Nilai boolean") {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "ya", "yes"].includes(normalized)) return true;
    if (["false", "0", "tidak", "no"].includes(normalized)) return false;
  }

  throw new BadRequestError(`${label} harus true, false, atau null.`);
}

async function resetStudentSnapshot(tx, studentId) {
  await tx.studentAcademicYearSnapshot.deleteMany({ where: { studentId } });
  return tx.student.update({
    where: { id: studentId },
    data: INITIAL_STUDENT_STATE,
    select: STUDENT_RESET_SELECT,
  });
}

async function deleteStudentSimptaProgress(tx, studentId) {
  const thesisRows = await tx.thesis.findMany({
    where: { studentId },
    select: { id: true },
  });
  const thesisIds = thesisRows.map((row) => row.id);
  const participantRows = thesisIds.length
    ? await tx.thesisSupervisors.findMany({
      where: { thesisId: { in: thesisIds } },
      select: { id: true },
    })
    : [];
  const participantIds = participantRows.map((row) => row.id);

  const counts = {
    supervisorRequests: 0,
    supervisorRequestDrafts: 0,
    theses: thesisIds.length,
    researchMethodAssessments: 0,
    supervisorAssignmentMembers: 0,
    attendanceRecordsDetached: 0,
  };

  if (thesisIds.length > 0) {
    await tx.thesisChangeRequest.updateMany({
      where: { thesisId: { in: thesisIds } },
      data: { thesisId: null },
    });

    await tx.thesisSeminar.deleteMany({ where: { thesisId: { in: thesisIds } } });
    await tx.thesisDefence.deleteMany({ where: { thesisId: { in: thesisIds } } });
    await tx.yudisiumParticipant.deleteMany({ where: { thesisId: { in: thesisIds } } });
    await tx.studentExitSurveyResponse.deleteMany({ where: { thesisId: { in: thesisIds } } });
  }

  if (participantIds.length > 0) {
    await Promise.all([
      tx.thesisSeminar.updateMany({
        where: { resultFinalizedBy: { in: participantIds } },
        data: { resultFinalizedBy: null },
      }),
      tx.thesisSeminar.updateMany({
        where: { revisionFinalizedBy: { in: participantIds } },
        data: { revisionFinalizedBy: null },
      }),
      tx.thesisDefence.updateMany({
        where: { resultFinalizedBy: { in: participantIds } },
        data: { resultFinalizedBy: null },
      }),
      tx.thesisDefence.updateMany({
        where: { revisionFinalizedBy: { in: participantIds } },
        data: { revisionFinalizedBy: null },
      }),
      tx.thesisSeminarAudience.updateMany({
        where: { approvedBy: { in: participantIds } },
        data: { approvedBy: null },
      }),
      tx.thesisSeminarRevision.updateMany({
        where: { approvedBy: { in: participantIds } },
        data: { approvedBy: null },
      }),
      tx.thesisDefenceRevision.updateMany({
        where: { approvedBy: { in: participantIds } },
        data: { approvedBy: null },
      }),
    ]);
  }

  if (thesisIds.length > 0) {
    counts.researchMethodAssessments = (
      await tx.researchMethodAssessment.deleteMany({
        where: { thesisId: { in: thesisIds } },
      })
    ).count;
    counts.supervisorAssignmentMembers = (
      await tx.thesisSupervisorAssignmentBatchMember.deleteMany({
        where: { thesisId: { in: thesisIds } },
      })
    ).count;
  }

  counts.supervisorRequestDrafts = (
    await tx.thesisSupervisorRequestDraft.deleteMany({ where: { studentId } })
  ).count;
  counts.supervisorRequests = (
    await tx.thesisSupervisorRequest.deleteMany({
      where: {
        OR: [
          { studentId },
          ...(thesisIds.length ? [{ thesisId: { in: thesisIds } }] : []),
        ],
      },
    })
  ).count;

  if (thesisIds.length > 0) {
    await tx.thesisSupervisors.deleteMany({ where: { thesisId: { in: thesisIds } } });
    await tx.thesis.deleteMany({ where: { id: { in: thesisIds } } });
  }

  counts.attendanceRecordsDetached = (
    await tx.researchMethodAttendanceRecord.updateMany({
      where: { studentId },
      data: { studentId: null },
    })
  ).count;

  await tx.thesisSeminarAudience.deleteMany({ where: { studentId } });

  return counts;
}

async function resetStudentSimptaProgress(studentId) {
  const existing = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError("Mahasiswa tidak ditemukan");

  return prisma.$transaction(async (tx) => {
    const counts = await deleteStudentSimptaProgress(tx, studentId);
    const updated = await resetStudentSnapshot(tx, studentId);
    return {
      student: updated,
      counts,
    };
  });
}

async function cleanupUserBeforeDelete(tx, userId) {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      student: { select: { id: true } },
      lecturer: { select: { id: true } },
    },
  });
  if (!user) throw new NotFoundError("User tidak ditemukan");

  let studentCleanup = null;

  if (user.student) {
    await tx.studentAcademicYearSnapshot.deleteMany({ where: { studentId: user.student.id } });
    studentCleanup = await deleteStudentSimptaProgress(tx, user.student.id);
    await tx.internshipSeminar.deleteMany({
      where: { moderatorStudentId: user.student.id },
    });
  }

  await Promise.all([
    tx.notification.deleteMany({ where: { userId } }),
    tx.document.updateMany({ where: { userId }, data: { userId: null } }),
    tx.thesisSupervisorRequest.updateMany({
      where: { reviewedBy: userId },
      data: { reviewedBy: null },
    }),
    tx.researchMethodAssessment.updateMany({
      where: { finalizedBy: userId },
      data: { finalizedBy: null },
    }),
    tx.thesisGuidanceEvaluation.updateMany({
      where: { kadepApprovedBy: userId },
      data: { kadepApprovedBy: null },
    }),
    tx.thesisSeminarDocument.updateMany({
      where: { verifiedBy: userId },
      data: { verifiedBy: null },
    }),
    tx.thesisDefenceDocument.updateMany({
      where: { verifiedBy: userId },
      data: { verifiedBy: null },
    }),
    tx.yudisium.updateMany({
      where: { decreeUploadedBy: userId },
      data: { decreeUploadedBy: null },
    }),
    tx.yudisiumParticipantRequirement.updateMany({
      where: { verifiedBy: userId },
      data: { verifiedBy: null },
    }),
    tx.yudisiumCplRecommendation.updateMany({
      where: { createdBy: userId },
      data: { createdBy: null },
    }),
    tx.yudisiumCplRecommendation.updateMany({
      where: { resolvedBy: userId },
      data: { resolvedBy: null },
    }),
    tx.studentCplScore.updateMany({
      where: { inputBy: userId },
      data: { inputBy: null },
    }),
    tx.studentCplScore.updateMany({
      where: { verifiedBy: userId },
      data: { verifiedBy: null },
    }),
    tx.internshipSeminar.updateMany({
      where: { approvedBy: userId },
      data: { approvedBy: null },
    }),
    tx.internshipSupervisorLetter.updateMany({
      where: { signedById: userId },
      data: { signedById: null },
    }),
  ]);

  return { studentCleanup, hasLecturerProfile: Boolean(user.lecturer) };
}

// GET /devtools/students — List all students with user + roles + thesis info
router.get("/students", async (req, res, next) => {
  try {
    const { search, status } = req.query;
    const where = {};

    if (status) where.status = String(status);

    if (search) {
      const s = String(search);
      where.user = {
        OR: [
          { fullName: { contains: s } },
          { identityNumber: { contains: s } },
          { email: { contains: s } },
        ],
      };
    }

    const students = await prisma.student.findMany({
      where,
      select: {
        id: true,
        status: true,
        enrollmentYear: true,
        sksCompleted: true,
        mandatoryCoursesCompleted: true,
        mkwuCompleted: true,
        internshipCompleted: true,
        kknCompleted: true,
        currentSemester: true,
        academicYearSnapshots: ACTIVE_PERIOD_FLAGS_SELECT,
        user: {
          select: {
            fullName: true,
            identityNumber: true,
            email: true,
            isVerified: true,
          },
        },
        thesis: {
          select: {
            id: true,
            title: true,
            status: true,
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { user: { fullName: "asc" } },
      take: 100,
    });

    const data = students.map((s) => {
      const t = s.thesis[0] ?? null;
      return {
        id: s.id,
        fullName: s.user.fullName,
        identityNumber: s.user.identityNumber,
        email: s.user.email,
        isVerified: s.user.isVerified,
        status: s.status,
        enrollmentYear: s.enrollmentYear,
        sksCompleted: s.sksCompleted,
        mandatoryCoursesCompleted: s.mandatoryCoursesCompleted,
        mkwuCompleted: s.mkwuCompleted,
        internshipCompleted: s.internshipCompleted,
        kknCompleted: s.kknCompleted,
        currentSemester: s.currentSemester,
        periodFlags: buildPeriodFlags(s.academicYearSnapshots[0]),
        latestThesis: t
          ? {
            id: t.id,
            title: t.title,
            status: t.status,
          }
          : null,
      };
    });

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// GET /devtools/students/:id — Single student detail
router.get("/students/:id", async (req, res, next) => {
  try {
    const student = await prisma.student.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        status: true,
        enrollmentYear: true,
        sksCompleted: true,
        mandatoryCoursesCompleted: true,
        mkwuCompleted: true,
        internshipCompleted: true,
        kknCompleted: true,
        currentSemester: true,
        academicYearSnapshots: ACTIVE_PERIOD_FLAGS_SELECT,
        user: {
          select: {
            fullName: true,
            identityNumber: true,
            email: true,
            isVerified: true,
            userHasRoles: {
              select: {
                status: true,
                role: { select: { name: true } },
              },
            },
          },
        },
        thesis: {
          select: {
            id: true,
            title: true,
            createdAt: true,
            status: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!student) throw new NotFoundError("Mahasiswa tidak ditemukan");

    res.json({
      success: true,
      data: {
        id: student.id,
        status: student.status,
        enrollmentYear: student.enrollmentYear,
        sksCompleted: student.sksCompleted,
        mandatoryCoursesCompleted: student.mandatoryCoursesCompleted,
        mkwuCompleted: student.mkwuCompleted,
        internshipCompleted: student.internshipCompleted,
        kknCompleted: student.kknCompleted,
        currentSemester: student.currentSemester,
        periodFlags: buildPeriodFlags(student.academicYearSnapshots[0]),
        fullName: student.user.fullName,
        identityNumber: student.user.identityNumber,
        email: student.user.email,
        isVerified: student.user.isVerified,
        roles: student.user.userHasRoles.map((r) => ({
          name: r.role.name,
          status: r.status,
        })),
        thesis: student.thesis.map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          createdAt: t.createdAt,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /devtools/students/:id — Update student eligibility fields
router.patch("/students/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await prisma.student.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Mahasiswa tidak ditemukan");

    const allowed = [
      "sksCompleted",
      "mandatoryCoursesCompleted",
      "mkwuCompleted",
      "internshipCompleted",
      "kknCompleted",
      "currentSemester",
      "enrollmentYear",
      "status",
    ];
    const updateData = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        if (["sksCompleted", "currentSemester", "enrollmentYear"].includes(key)) {
          updateData[key] = Number(req.body[key]);
        } else if (["mandatoryCoursesCompleted", "mkwuCompleted", "internshipCompleted", "kknCompleted"].includes(key)) {
          updateData[key] = Boolean(req.body[key]);
        } else {
          updateData[key] = String(req.body[key]);
        }
      }
    }

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestError("Tidak ada field yang diubah");
    }

    const updated = await prisma.student.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        status: true,
        sksCompleted: true,
        mandatoryCoursesCompleted: true,
        mkwuCompleted: true,
        internshipCompleted: true,
        kknCompleted: true,
        currentSemester: true,
        enrollmentYear: true,
      },
    });

    res.json({ success: true, data: updated, message: "Data mahasiswa berhasil diperbarui" });
  } catch (err) {
    next(err);
  }
});

// PATCH /devtools/users/:id — Update user-level fields (fullName, isVerified)
router.patch("/users/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("User tidak ditemukan");

    const allowed = ["fullName", "isVerified"];
    const updateData = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        updateData[key] = key === "isVerified" ? Boolean(req.body[key]) : String(req.body[key]);
      }
    }

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestError("Tidak ada field yang diubah");
    }

    const updated = await prisma.user.update({
      where: { id },
      data: updateData,
      select: { id: true, fullName: true, isVerified: true },
    });

    res.json({ success: true, data: updated, message: "Data user berhasil diperbarui" });
  } catch (err) {
    next(err);
  }
});

// DELETE /devtools/users/:id — Delete user (cascades to student, roles, etc.)
router.delete("/users/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await prisma.user.findUnique({
      where: { id },
      select: { id: true, fullName: true, identityNumber: true },
    });
    if (!existing) throw new NotFoundError("User tidak ditemukan");

    let cleanup;
    try {
      cleanup = await prisma.$transaction(async (tx) => {
        const cleanupResult = await cleanupUserBeforeDelete(tx, id);
        await tx.user.delete({ where: { id } });
        return cleanupResult;
      });
    } catch (err) {
      if (err?.code === "P2003") {
        throw new BadRequestError(
          "User masih direferensikan oleh data akademik lain. Untuk mahasiswa, gunakan Reset Progress SIMPTA lalu hapus ulang. Untuk dosen/admin, hapus atau pindahkan referensi akademik aktif terlebih dahulu.",
        );
      }
      throw err;
    }

    res.json({
      success: true,
      data: cleanup,
      message: `User "${existing.fullName}" (${existing.identityNumber}) berhasil dihapus`,
    });
  } catch (err) {
    next(err);
  }
});

// POST /devtools/students/:id/reset — Reset student to initial state for re-testing
router.post("/students/:id/reset", async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await prisma.student.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Mahasiswa tidak ditemukan");

    const updated = await prisma.$transaction((tx) => {
      return resetStudentSnapshot(tx, id);
    });

    res.json({ success: true, data: updated, message: "Snapshot akademik mahasiswa berhasil direset" });
  } catch (err) {
    next(err);
  }
});

// POST /devtools/students/:id/reset-progress — Reset all SIMPTA progress for re-testing
router.post("/students/:id/reset-progress", async (req, res, next) => {
  try {
    const result = await resetStudentSimptaProgress(req.params.id);

    res.json({
      success: true,
      data: result,
      message: "Progress SIMPTA mahasiswa berhasil dihapus dan snapshot akademik direset",
    });
  } catch (err) {
    next(err);
  }
});

// GET /devtools/thesis/:studentId — Get all thesis records for a student
router.get("/thesis/:studentId", async (req, res, next) => {
  try {
    const theses = await prisma.thesis.findMany({
      where: { studentId: req.params.studentId },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        academicYearId: true,
        academicYear: {
          select: { id: true, year: true, semester: true, isActive: true },
        },
        status: true,
        thesisSupervisors: {
          select: {
            role: { select: { name: true } },
            lecturer: { select: { user: { select: { fullName: true } } } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const data = theses.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      academicYearId: t.academicYearId,
      academicYearLabel: t.academicYear ? formatAcademicYearLabel(t.academicYear) : null,
      supervisors: t.thesisSupervisors.map((s) => ({
        role: s.role,
        lecturer: s.lecturer,
      })),
    }));

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// DELETE /devtools/thesis/:id — Delete a thesis record
router.delete("/thesis/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await prisma.thesis.findUnique({
      where: { id },
      select: { id: true, title: true },
    });
    if (!existing) throw new NotFoundError("Thesis tidak ditemukan");

    await prisma.thesis.delete({ where: { id } });

    res.json({
      success: true,
      message: `Thesis "${existing.title || "(tanpa judul)"}" berhasil dihapus`,
    });
  } catch (err) {
    next(err);
  }
});

// ============================================
// SIA flags per semester (plan 10.6)
// ============================================

// PATCH /devtools/students/:studentId/period-flags — set "taking Metode Penelitian" and/or
// "taking Tugas Akhir" for one semester (default: the running one). null clears a flag.
router.patch("/students/:studentId/period-flags", async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const student = await prisma.student.findUnique({ where: { id: studentId }, select: { id: true } });
    if (!student) throw new NotFoundError("Mahasiswa tidak ditemukan");

    const requestedYearId = typeof req.body?.academicYearId === "string" ? req.body.academicYearId.trim() : "";
    const year = requestedYearId
      ? await prisma.academicYear.findUnique({ where: { id: requestedYearId } })
      : await prisma.academicYear.findFirst({ where: { isActive: true } });
    if (!year) throw new NotFoundError("Tahun ajaran tidak ditemukan");

    const flags = {};
    if (req.body?.eligibleResearchMethod !== undefined) {
      flags.eligibleResearchMethod = parseNullableBoolean(req.body.eligibleResearchMethod, "Mengambil Metode Penelitian");
    }
    if (req.body?.takingThesisCourse !== undefined) {
      flags.takingThesisCourse = parseNullableBoolean(req.body.takingThesisCourse, "Mengambil Tugas Akhir");
    }
    if (Object.keys(flags).length === 0) {
      throw new BadRequestError("Isi eligibleResearchMethod dan/atau takingThesisCourse.");
    }

    const row = await setStudentPeriodFlags(studentId, year.id, flags, { source: ACADEMIC_FLAG_SOURCE.DEVTOOLS });
    res.json({
      success: true,
      data: { ...buildPeriodFlags(row), academicYearLabel: formatAcademicYearLabel(year) },
      message: `Penanda SIA ${formatAcademicYearLabel(year)} diperbarui.`,
    });
  } catch (err) {
    next(err);
  }
});

// GET /devtools/students/:studentId/period-flags — the semester flags of every period (Proposal tab)
router.get("/students/:studentId/period-flags", async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const student = await prisma.student.findUnique({ where: { id: studentId }, select: { id: true } });
    if (!student) throw new NotFoundError("Mahasiswa tidak ditemukan");
    const [years, rows] = await Promise.all([
      prisma.academicYear.findMany({ orderBy: { startDate: "desc" } }),
      prisma.studentAcademicYearSnapshot.findMany({ where: { studentId } }),
    ]);
    const byYear = new Map(rows.map((row) => [row.academicYearId, row]));
    res.json({
      success: true,
      data: years.map((year) => ({
        ...buildPeriodFlags(byYear.get(year.id) ?? { academicYearId: year.id }),
        academicYearId: year.id,
        academicYearLabel: formatAcademicYearLabel(year),
        isActive: year.isActive,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ============================================
// Proposal tab: supervisor request times for the 72-hour rule
// ============================================

const SUPERVISOR_REQUEST_LIST_SELECT = {
  id: true,
  status: true,
  route: true,
  createdAt: true,
  proposedTitle: true,
  academicYear: { select: { semester: true, year: true } },
  student: { select: { user: { select: { fullName: true, identityNumber: true } } } },
  lecturer: { select: { user: { select: { fullName: true } } } },
};
const WITHDRAW_LOCK_MS = 72 * 60 * 60 * 1000;

const mapSupervisorRequestRow = (row) => ({
  id: row.id,
  status: row.status,
  route: row.route,
  createdAt: row.createdAt,
  withdrawAvailableAt: new Date(new Date(row.createdAt).getTime() + WITHDRAW_LOCK_MS),
  proposedTitle: row.proposedTitle,
  academicYearLabel: row.academicYear ? formatAcademicYearLabel(row.academicYear) : null,
  student: { fullName: row.student?.user?.fullName ?? null, nim: row.student?.user?.identityNumber ?? null },
  lecturerName: row.lecturer?.user?.fullName ?? null,
});

// GET /devtools/supervisor-requests — Pengajuan Pembimbing with search and pagination
router.get("/supervisor-requests", async (req, res, next) => {
  try {
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 20, 1), 100);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const where = search
      ? { student: { user: { OR: [{ fullName: { contains: search } }, { identityNumber: { contains: search } }] } } }
      : {};
    const [rows, total] = await Promise.all([
      prisma.thesisSupervisorRequest.findMany({
        where,
        select: SUPERVISOR_REQUEST_LIST_SELECT,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.thesisSupervisorRequest.count({ where }),
    ]);
    res.json({
      success: true,
      data: rows.map(mapSupervisorRequestRow),
      meta: { page, pageSize, total, totalPages: Math.max(Math.ceil(total / pageSize), 1) },
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /devtools/supervisor-requests/:id — move the sending time back (no status change, no notification)
router.patch("/supervisor-requests/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const raw = req.body?.createdAt;
    const createdAt = raw ? new Date(raw) : null;
    if (!createdAt || Number.isNaN(createdAt.getTime())) throw new BadRequestError("Waktu pengajuan wajib berupa tanggal yang valid.");
    if (createdAt > new Date()) throw new BadRequestError("Waktu pengajuan tidak boleh di masa depan.");
    const existing = await prisma.thesisSupervisorRequest.findUnique({ where: { id }, select: SUPERVISOR_REQUEST_LIST_SELECT });
    if (!existing) throw new NotFoundError("Pengajuan pembimbing tidak ditemukan");
    const updated = await prisma.thesisSupervisorRequest.update({ where: { id }, data: { createdAt }, select: SUPERVISOR_REQUEST_LIST_SELECT });
    await logAudit({
      actorUserId: req.user?.sub ?? null,
      action: AUDIT_ACTIONS.SUPERVISOR_REQUEST_TIME_OVERRIDDEN,
      entityType: ENTITY_TYPES.THESIS_SUPERVISOR_REQUEST,
      entityId: id,
      oldValues: { createdAt: existing.createdAt },
      newValues: { createdAt: updated.createdAt },
      metadata: { source: "devtools" },
    });
    res.json({ success: true, data: mapSupervisorRequestRow(updated), message: "Waktu pengajuan pembimbing diubah" });
  } catch (err) {
    next(err);
  }
});

// ============================================
// Password Management
// ============================================

// PATCH /devtools/users/:id/password — Set password for any user
router.patch("/users/:id/password", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { password } = req.body;
    if (!password || String(password).length < 4) {
      throw new BadRequestError("Password minimal 4 karakter");
    }
    const user = await prisma.user.findUnique({ where: { id }, select: { id: true, fullName: true } });
    if (!user) throw new NotFoundError("User tidak ditemukan");

    const hash = await bcrypt.hash(String(password), 10);
    await prisma.user.update({ where: { id }, data: { password: hash } });

    res.json({ success: true, message: `Password "${user.fullName}" berhasil diubah` });
  } catch (err) {
    next(err);
  }
});

// ============================================
// User Creation
// ============================================

// GET /devtools/roles — List all available roles
router.get("/roles", async (_req, res, next) => {
  try {
    const roles = await prisma.userRole.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
    res.json({ success: true, data: roles });
  } catch (err) {
    next(err);
  }
});

// POST /devtools/users — Create a new user with roles
router.post("/users", async (req, res, next) => {
  try {
    const { fullName, identityNumber, email, password, identityType, roles } = req.body;

    if (!fullName?.trim()) throw new BadRequestError("Nama lengkap wajib diisi");
    if (!identityNumber?.trim()) throw new BadRequestError("NIM/NIP wajib diisi");
    if (!password || String(password).length < 4) throw new BadRequestError("Password minimal 4 karakter");

    const existingUser = await prisma.user.findFirst({
      where: { OR: [{ identityNumber: String(identityNumber) }, ...(email ? [{ email: String(email).toLowerCase() }] : [])] },
    });
    if (existingUser) throw new BadRequestError("User dengan NIM/NIP atau email tersebut sudah ada");

    const resolvedType = identityType || "NIM";
    const hash = await bcrypt.hash(String(password), 10);

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          fullName: String(fullName).trim(),
          identityNumber: String(identityNumber).trim(),
          email: email ? String(email).toLowerCase().trim() : null,
          password: hash,
          identityType: resolvedType,
          isVerified: true,
        },
      });

      // Assign roles
      const roleNames = Array.isArray(roles) && roles.length > 0 ? roles : (resolvedType === "NIM" ? [ROLES.MAHASISWA] : []);
      if (roleNames.length > 0) {
        for (const roleName of roleNames) {
          let role = await tx.userRole.findFirst({ where: { name: String(roleName) } });
          if (!role) {
            role = await tx.userRole.create({ data: { name: String(roleName) } });
          }
          await tx.userHasRole.create({
            data: { userId: user.id, roleId: role.id, status: "active" },
          });
        }
      }

      // Create Student record for Mahasiswa
      const hasStudentRole = roleNames.some((r) => isStudentRole(r));
      if (hasStudentRole || resolvedType === "NIM") {
        await tx.student.create({
          data: { id: user.id, status: "active", sksCompleted: 0 },
        });
      }

      // Create Lecturer record for dosen roles
      const hasLecturerRole = roleNames.some((r) => isLecturerRole(r));
      if (hasLecturerRole || resolvedType === "NIP") {
        const lecturerExists = await tx.lecturer.findUnique({ where: { id: user.id } });
        if (!lecturerExists) {
          await tx.lecturer.create({ data: { id: user.id } });
        }
      }

      return user;
    });

    res.status(201).json({
      success: true,
      data: { id: result.id, fullName: result.fullName, identityNumber: result.identityNumber },
      message: `User "${result.fullName}" berhasil dibuat`,
    });
  } catch (err) {
    next(err);
  }
});

// GET /devtools/users — List all users (not just students)
router.get("/users", async (req, res, next) => {
  try {
    const { search } = req.query;
    const where = {};
    if (search) {
      const s = String(search);
      where.OR = [
        { fullName: { contains: s } },
        { identityNumber: { contains: s } },
        { email: { contains: s } },
      ];
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        fullName: true,
        identityNumber: true,
        identityType: true,
        email: true,
        isVerified: true,
        password: false,
        userHasRoles: {
          select: { status: true, role: { select: { name: true } } },
        },
      },
      orderBy: { fullName: "asc" },
      take: 100,
    });

    const data = users.map((u) => ({
      ...u,
      hasPassword: false,
      roles: u.userHasRoles.map((r) => ({ name: r.role.name, status: r.status })),
      userHasRoles: undefined,
    }));

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// GET /devtools/academic-years — list years for period-close scenario
router.get("/academic-years", async (_req, res, next) => {
  try {
    const years = await prisma.academicYear.findMany({
      orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        year: true,
        semester: true,
        isActive: true,
        startDate: true,
        endDate: true,
      },
    });
    res.json({
      success: true,
      data: years.map((year) => ({
        ...year,
        label: formatAcademicYearLabel(year),
      })),
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /devtools/thesis/:id/academic-year — bind a thesis to a year for scenario tests
router.patch("/thesis/:id/academic-year", async (req, res, next) => {
  try {
    const { id } = req.params;
    const academicYearId = typeof req.body?.academicYearId === "string"
      ? req.body.academicYearId.trim()
      : "";
    if (!academicYearId) throw new BadRequestError("academicYearId wajib diisi.");

    const [thesis, year] = await Promise.all([
      prisma.thesis.findUnique({ where: { id }, select: { id: true, title: true } }),
      prisma.academicYear.findUnique({ where: { id: academicYearId } }),
    ]);
    if (!thesis) throw new NotFoundError("Thesis tidak ditemukan");
    if (!year) throw new NotFoundError("Tahun ajaran tidak ditemukan");

    const updated = await prisma.thesis.update({
      where: { id },
      data: { academicYearId },
      select: {
        id: true,
        title: true,
        academicYearId: true,
        academicYear: {
          select: { id: true, year: true, semester: true, isActive: true },
        },
      },
    });

    res.json({
      success: true,
      data: {
        ...updated,
        academicYearLabel: formatAcademicYearLabel(updated.academicYear),
      },
      message: `Thesis diikat ke ${formatAcademicYearLabel(year)} untuk merakit skenario. Ini bukan perbaikan data operasional.`,
    });
  } catch (err) {
    next(err);
  }
});

// ============================================
// Guidance sessions — move a session schedule without editing the database
// ============================================

const GUIDANCE_STATUS_VALUES = Object.values(GUIDANCE_STATUS);
/** Editable schedule columns. `requestedDate` is NOT NULL in the schema. */
const GUIDANCE_DATE_FIELDS = ["requestedDate", "approvedDate", "summarySubmittedAt", "completedAt"];
const GUIDANCE_LIST_SELECT = {
  id: true,
  status: true,
  phase: true,
  requestedDate: true,
  approvedDate: true,
  summarySubmittedAt: true,
  completedAt: true,
  thesis: {
    select: {
      id: true,
      title: true,
      student: { select: { user: { select: { fullName: true, identityNumber: true } } } },
    },
  },
  supervisor: { select: { user: { select: { fullName: true } } } },
};

function mapGuidanceRow(row) {
  return {
    id: row.id,
    status: row.status,
    phase: row.phase,
    requestedDate: row.requestedDate,
    approvedDate: row.approvedDate,
    summarySubmittedAt: row.summarySubmittedAt,
    completedAt: row.completedAt,
    thesisId: row.thesis?.id ?? null,
    thesisTitle: row.thesis?.title ?? null,
    studentName: row.thesis?.student?.user?.fullName ?? null,
    studentNim: row.thesis?.student?.user?.identityNumber ?? null,
    supervisorName: row.supervisor?.user?.fullName ?? null,
  };
}

/** Reads the editable date fields from a request body; past dates are allowed. */
export function parseGuidanceSchedulePatch(body = {}) {
  const data = {};
  for (const field of GUIDANCE_DATE_FIELDS) {
    if (body[field] === undefined) continue;
    const raw = body[field];
    if (raw === null || raw === "") {
      if (field === "requestedDate") throw new BadRequestError("Waktu diusulkan wajib diisi.");
      data[field] = null;
      continue;
    }
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) throw new BadRequestError(`Nilai ${field} bukan tanggal yang valid.`);
    data[field] = date;
  }
  if (Object.keys(data).length === 0) throw new BadRequestError("Tidak ada tanggal yang diubah.");
  return data;
}

// GET /devtools/guidances — guidance sessions with search, status filter, pagination
router.get("/guidances", async (req, res, next) => {
  try {
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
    if (status && !GUIDANCE_STATUS_VALUES.includes(status)) {
      throw new BadRequestError("Status sesi bimbingan tidak dikenal.");
    }
    const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 20, 1), 100);
    const page = Math.max(Number(req.query.page) || 1, 1);

    const where = {
      ...(status ? { status } : {}),
      ...(search
        ? {
          thesis: {
            student: {
              user: { OR: [{ fullName: { contains: search } }, { identityNumber: { contains: search } }] },
            },
          },
        }
        : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.thesisGuidance.findMany({
        where,
        select: GUIDANCE_LIST_SELECT,
        orderBy: [{ requestedDate: "desc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.thesisGuidance.count({ where }),
    ]);

    res.json({
      success: true,
      data: rows.map(mapGuidanceRow),
      meta: { page, pageSize, total, totalPages: Math.max(Math.ceil(total / pageSize), 1) },
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /devtools/guidances/:id — edit session dates only (no status change, no notification)
router.patch("/guidances/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = parseGuidanceSchedulePatch(req.body);

    const existing = await prisma.thesisGuidance.findUnique({ where: { id }, select: GUIDANCE_LIST_SELECT });
    if (!existing) throw new NotFoundError("Sesi bimbingan tidak ditemukan");

    const updated = await prisma.thesisGuidance.update({ where: { id }, data, select: GUIDANCE_LIST_SELECT });

    const pick = (row) => Object.fromEntries(Object.keys(data).map((field) => [field, row[field]]));
    await logAudit({
      actorUserId: req.user?.sub ?? req.user?.id ?? null,
      action: AUDIT_ACTIONS.GUIDANCE_SCHEDULE_OVERRIDDEN,
      entityType: ENTITY_TYPES.THESIS_GUIDANCE,
      entityId: id,
      oldValues: pick(existing),
      newValues: pick(updated),
      metadata: { source: "devtools" },
    });

    res.json({ success: true, data: mapGuidanceRow(updated), message: "Jadwal sesi bimbingan berhasil diubah" });
  } catch (err) {
    next(err);
  }
});

export default router;
