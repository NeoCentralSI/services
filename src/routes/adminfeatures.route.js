import express from "express";
import { authGuard, requireRole, requireAnyRole } from "../middlewares/auth.middleware.js";
import { uploadCsv } from "../middlewares/file.middleware.js";
import { importStudentsCsv, updateUserByAdmin, createAcademicYearController, updateAcademicYearController, createUserByAdminController, getAcademicYearsController, getActiveAcademicYearController, getUsersController, getStudentsController, getLecturersController, getStudentDetailController, getLecturerDetailController, getKadepQuickActionsController, getFailedThesesController, updateLecturerByAdminController, updateStudentByAdminController, getMetopenDuplicateEnrollmentsController, resolveMetopenDuplicateEnrollmentController } from "../controllers/adminfeatures.controller.js";
import { updateUserSchema, createUserSchema } from "../validators/user.validator.js";
import { resolveMetopenDuplicateEnrollmentSchema } from "../validators/adminfeatures.validator.js";
import { validate } from "../middlewares/validation.middleware.js";
import { createAcademicYearSchema, updateAcademicYearSchema } from "../validators/academicYear.validator.js";


import { ROLES } from "../constants/roles.js";


const router = express.Router();

router.post("/students/import", authGuard, requireRole(ROLES.ADMIN), uploadCsv, importStudentsCsv);
router.get("/users", authGuard, requireRole(ROLES.ADMIN), getUsersController);
router.get("/students", authGuard, requireAnyRole([ROLES.ADMIN, ROLES.KETUA_DEPARTEMEN, ROLES.SEKRETARIS_DEPARTEMEN, ROLES.DOSEN_METOPEN]), getStudentsController);
router.get("/students/:id", authGuard, requireAnyRole([ROLES.ADMIN, ROLES.KETUA_DEPARTEMEN, ROLES.SEKRETARIS_DEPARTEMEN, ROLES.DOSEN_METOPEN]), getStudentDetailController);
router.patch("/students/:id", authGuard, requireRole(ROLES.ADMIN), updateStudentByAdminController);
router.get("/metopen-duplicate-enrollments", authGuard, requireRole(ROLES.ADMIN), getMetopenDuplicateEnrollmentsController);
router.patch("/metopen-duplicate-enrollments/resolve", authGuard, requireRole(ROLES.ADMIN), validate(resolveMetopenDuplicateEnrollmentSchema), resolveMetopenDuplicateEnrollmentController);
router.get("/lecturers", authGuard, requireAnyRole([ROLES.ADMIN, ROLES.KETUA_DEPARTEMEN, ROLES.SEKRETARIS_DEPARTEMEN]), getLecturersController);
router.get("/lecturers/:id", authGuard, requireAnyRole([ROLES.ADMIN, ROLES.KETUA_DEPARTEMEN, ROLES.SEKRETARIS_DEPARTEMEN]), getLecturerDetailController);
router.patch("/lecturers/:id", authGuard, requireRole(ROLES.ADMIN), updateLecturerByAdminController);
router.post("/users", authGuard, requireRole(ROLES.ADMIN), validate(createUserSchema), createUserByAdminController);
router.patch("/:id", authGuard, requireRole(ROLES.ADMIN), validate(updateUserSchema), updateUserByAdmin);
router.get("/academic-years", authGuard, requireAnyRole([ROLES.ADMIN, ROLES.KETUA_DEPARTEMEN, ROLES.SEKRETARIS_DEPARTEMEN]), getAcademicYearsController);
router.get("/academic-years/active", authGuard, getActiveAcademicYearController);
router.post("/academic-years", authGuard, requireRole(ROLES.ADMIN), validate(createAcademicYearSchema), createAcademicYearController);
router.patch("/academic-years/:id", authGuard, requireRole(ROLES.ADMIN), validate(updateAcademicYearSchema), updateAcademicYearController);

// Kadep quick actions
router.get("/kadep/quick-actions", authGuard, requireRole(ROLES.KETUA_DEPARTEMEN), getKadepQuickActionsController);
router.get("/kadep/failed-theses", authGuard, requireRole(ROLES.KETUA_DEPARTEMEN), getFailedThesesController);

// Thesis management (Kadep only) - REMOVED

// Thesis management (Admin) - REMOVED


export default router;

