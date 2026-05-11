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
import {
  resolveMetopenEligibilityState,
  setStudentMetopenEligibility,
} from "../services/metopenEligibility.service.js";

const router = express.Router();

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

function buildMetopenStatusSnapshot(student, thesis = null) {
  const eligibleMetopen =
    typeof student?.eligibleMetopen === "boolean" ? student.eligibleMetopen : null;
  const readOnly = thesis?.proposalStatus === "accepted";

  return {
    eligibleMetopen,
    hasExternalStatus: eligibleMetopen !== null,
    source: student?.metopenEligibilitySource ?? null,
    updatedAt: student?.metopenEligibilityUpdatedAt ?? null,
    readOnly,
    canAccess: eligibleMetopen === true || readOnly,
    canSubmit: eligibleMetopen === true && !readOnly,
    thesisId: thesis?.id ?? null,
    thesisTitle: thesis?.title ?? null,
    thesisStatus: thesis?.thesisStatus?.name ?? null,
  };
}

function parseNullableBoolean(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "ya", "yes"].includes(normalized)) return true;
    if (["false", "0", "tidak", "no"].includes(normalized)) return false;
  }

  throw new BadRequestError("Nilai eligibleMetopen harus true, false, atau null.");
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
        eligibleMetopen: true,
        metopenEligibilitySource: true,
        metopenEligibilityUpdatedAt: true,
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
            rating: true,
            proposalStatus: true,
            thesisStatus: { select: { name: true } },
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
        metopenEligibility: buildMetopenStatusSnapshot(s, t),
        latestThesis: t
          ? {
            id: t.id,
            title: t.title,
            status: t.thesisStatus?.name ?? t.rating,
            proposalStatus: t.proposalStatus ?? null,
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
        eligibleMetopen: true,
        metopenEligibilitySource: true,
        metopenEligibilityUpdatedAt: true,
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
            rating: true,
            proposalStatus: true,
            createdAt: true,
            thesisStatus: { select: { name: true } },
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
        metopenEligibility: buildMetopenStatusSnapshot(student, student.thesis[0] ?? null),
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
          status: t.thesisStatus?.name ?? t.rating,
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

    await prisma.user.delete({ where: { id } });

    res.json({
      success: true,
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

    const updated = await prisma.student.update({
      where: { id },
      data: {
        status: "active",
        sksCompleted: 0,
        mandatoryCoursesCompleted: false,
        mkwuCompleted: false,
        internshipCompleted: false,
        kknCompleted: false,
        currentSemester: 1,
        eligibleMetopen: null,
        metopenEligibilitySource: null,
        metopenEligibilityUpdatedAt: null,
      },
      select: {
        id: true,
        status: true,
        sksCompleted: true,
        mandatoryCoursesCompleted: true,
        mkwuCompleted: true,
        internshipCompleted: true,
        kknCompleted: true,
        currentSemester: true,
        eligibleMetopen: true,
        metopenEligibilitySource: true,
        metopenEligibilityUpdatedAt: true,
      },
    });

    res.json({ success: true, data: updated, message: "Data mahasiswa berhasil direset ke kondisi awal" });
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
        rating: true,
        createdAt: true,
        updatedAt: true,
        thesisStatus: { select: { name: true } },
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
      status: t.thesisStatus?.name ?? t.rating,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
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
// Metopen Eligibility
// ============================================

// GET /devtools/metopen-status/:studentId — Check external Metopen eligibility snapshot
router.get("/metopen-status/:studentId", async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true },
    });
    if (!student) throw new NotFoundError("Mahasiswa tidak ditemukan");

    const data = await resolveMetopenEligibilityState(studentId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// PATCH /devtools/metopen-eligibility/:studentId — Simulate external eligibility snapshot
router.patch("/metopen-eligibility/:studentId", async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true },
    });
    if (!student) throw new NotFoundError("Mahasiswa tidak ditemukan");

    const eligibleMetopen = parseNullableBoolean(req.body?.eligibleMetopen);

    await setStudentMetopenEligibility(
      studentId,
      {
        eligibleMetopen,
        source: "devtools",
        updatedAt: new Date(),
      },
      { client: prisma },
    );

    const data = await resolveMetopenEligibilityState(studentId);
    res.json({
      success: true,
      data,
      message:
        eligibleMetopen === null
          ? "Snapshot eligibility Metopen dummy berhasil dikosongkan"
          : `Snapshot eligibility Metopen dummy diubah menjadi ${eligibleMetopen ? "eligible" : "tidak eligible"}`,
    });
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

export default router;
