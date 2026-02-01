import express from "express";
import { authGuard, requireRole } from "../middlewares/auth.middleware.js";
import { uploadCsv } from "../middlewares/file.middleware.js";
import { importStudentsCsv, updateUserByAdmin, createAcademicYearController, updateAcademicYearController, createUserByAdminController, getAcademicYearsController, getActiveAcademicYearController, getUsersController, getStudentsController, getLecturersController, getStudentDetailController, getLecturerDetailController, getThesisListController, deleteThesisController, getKadepQuickActionsController, getFailedThesesController } from "../controllers/adminfeatures.controller.js";
import { updateUserSchema, createUserSchema } from "../validators/user.validator.js";
import { validate } from "../middlewares/validation.middleware.js";
import { createAcademicYearSchema, updateAcademicYearSchema } from "../validators/academicYear.validator.js";
import { ROLES } from "../constants/roles.js";


const router = express.Router();

router.post("/students/import", authGuard, requireRole(ROLES.ADMIN), uploadCsv, importStudentsCsv);
router.get("/users", authGuard, requireRole(ROLES.ADMIN), getUsersController);
router.get("/students", authGuard, requireRole(ROLES.ADMIN), getStudentsController);
router.get("/students/:id", authGuard, requireRole(ROLES.ADMIN), getStudentDetailController);
router.get("/lecturers", authGuard, requireRole(ROLES.ADMIN), getLecturersController);
router.get("/lecturers/:id", authGuard, requireRole(ROLES.ADMIN), getLecturerDetailController);
router.post("/users", authGuard, requireRole(ROLES.ADMIN), validate(createUserSchema), createUserByAdminController);
router.patch("/:id", authGuard, requireRole(ROLES.ADMIN), validate(updateUserSchema), updateUserByAdmin);
router.get("/academic-years", authGuard, requireRole(ROLES.ADMIN), getAcademicYearsController);
router.get("/academic-years/active", authGuard, getActiveAcademicYearController);
router.post("/academic-years", authGuard, requireRole(ROLES.ADMIN), validate(createAcademicYearSchema), createAcademicYearController);
router.patch("/academic-years/:id", authGuard, requireRole(ROLES.ADMIN), validate(updateAcademicYearSchema), updateAcademicYearController);

// Kadep quick actions
router.get("/kadep/quick-actions", authGuard, requireRole(ROLES.KETUA_DEPARTEMEN), getKadepQuickActionsController);
router.get("/kadep/failed-theses", authGuard, requireRole(ROLES.KETUA_DEPARTEMEN), getFailedThesesController);

// Thesis management (Kadep only)
router.get("/thesis", authGuard, requireRole(ROLES.KETUA_DEPARTEMEN), getThesisListController);
router.delete("/thesis/:id", authGuard, requireRole(ROLES.KETUA_DEPARTEMEN), deleteThesisController);


export default router;

