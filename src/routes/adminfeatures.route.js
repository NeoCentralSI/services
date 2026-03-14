import express from "express";
import { authGuard, requireRole, requireAnyRole } from "../middlewares/auth.middleware.js";
import { uploadCsv } from "../middlewares/file.middleware.js";
import { importStudentsExcelController, importLecturersExcelController, importUsersExcelController, importAcademicYearsExcelController, importStudentsCsv, updateUserByAdmin, createAcademicYearController, updateAcademicYearController, createUserByAdminController, getAcademicYearsController, getActiveAcademicYearController, getUsersController, getStudentsController, getLecturersController, getStudentDetailController, getLecturerDetailController, getKadepQuickActionsController, getFailedThesesController, updateLecturerByAdminController, updateStudentByAdminController, createRoomController, updateRoomController, getRoomsController, deleteRoomController, getSeminarResultThesisOptionsController, getSeminarResultLecturerOptionsController, getSeminarResultStudentOptionsController, getSeminarResultsController, createSeminarResultController, updateSeminarResultController, deleteSeminarResultController, getSeminarResultAudienceLinksController, assignSeminarResultAudiencesController, removeSeminarResultAudienceLinkController } from "../controllers/adminfeatures.controller.js";
import { updateUserSchema, createUserSchema } from "../validators/user.validator.js";
import { validate } from "../middlewares/validation.middleware.js";
import { createAcademicYearSchema, updateAcademicYearSchema } from "../validators/academicYear.validator.js";
import { createRoomSchema, updateRoomSchema } from "../validators/room.validator.js";
import { createSeminarResultSchema, updateSeminarResultSchema, assignSeminarAudienceSchema } from "../validators/seminarResultMaster.validator.js";


import { ROLES } from "../constants/roles.js";


const router = express.Router();

router.post("/students/import", authGuard, requireRole(ROLES.ADMIN), uploadCsv, importStudentsCsv);
router.get("/users", authGuard, requireRole(ROLES.ADMIN), getUsersController);
router.get("/students", authGuard, requireAnyRole([ROLES.ADMIN, ROLES.KETUA_DEPARTEMEN, ROLES.SEKRETARIS_DEPARTEMEN]), getStudentsController);
router.get("/students/:id", authGuard, requireAnyRole([ROLES.ADMIN, ROLES.KETUA_DEPARTEMEN, ROLES.SEKRETARIS_DEPARTEMEN]), getStudentDetailController);
router.patch("/students/:id", authGuard, requireRole(ROLES.ADMIN), updateStudentByAdminController);
router.get("/lecturers", authGuard, requireAnyRole([ROLES.ADMIN, ROLES.KETUA_DEPARTEMEN, ROLES.SEKRETARIS_DEPARTEMEN]), getLecturersController);
router.get("/lecturers/:id", authGuard, requireAnyRole([ROLES.ADMIN, ROLES.KETUA_DEPARTEMEN, ROLES.SEKRETARIS_DEPARTEMEN]), getLecturerDetailController);
router.patch("/lecturers/:id", authGuard, requireRole(ROLES.ADMIN), updateLecturerByAdminController);
router.post("/users", authGuard, requireRole(ROLES.ADMIN), validate(createUserSchema), createUserByAdminController);
router.patch("/:id", authGuard, requireRole(ROLES.ADMIN), validate(updateUserSchema), updateUserByAdmin);
router.get("/academic-years", authGuard, requireAnyRole([ROLES.ADMIN, ROLES.KETUA_DEPARTEMEN, ROLES.SEKRETARIS_DEPARTEMEN]), getAcademicYearsController);
router.get("/academic-years/active", authGuard, getActiveAcademicYearController);
router.post("/academic-years", authGuard, requireRole(ROLES.ADMIN), validate(createAcademicYearSchema), createAcademicYearController);
router.patch("/academic-years/:id", authGuard, requireRole(ROLES.ADMIN), validate(updateAcademicYearSchema), updateAcademicYearController);

router.get("/rooms", authGuard, requireRole(ROLES.ADMIN), getRoomsController);
router.post("/rooms", authGuard, requireRole(ROLES.ADMIN), validate(createRoomSchema), createRoomController);
router.patch("/rooms/:id", authGuard, requireRole(ROLES.ADMIN), validate(updateRoomSchema), updateRoomController);
router.delete("/rooms/:id", authGuard, requireRole(ROLES.ADMIN), deleteRoomController);

router.get("/seminar-results/options/theses", authGuard, requireRole(ROLES.ADMIN), getSeminarResultThesisOptionsController);
router.get("/seminar-results/options/lecturers", authGuard, requireRole(ROLES.ADMIN), getSeminarResultLecturerOptionsController);
router.get("/seminar-results/options/students", authGuard, requireRole(ROLES.ADMIN), getSeminarResultStudentOptionsController);
router.get("/seminar-results", authGuard, requireRole(ROLES.ADMIN), getSeminarResultsController);
router.post("/seminar-results", authGuard, requireRole(ROLES.ADMIN), validate(createSeminarResultSchema), createSeminarResultController);
router.patch("/seminar-results/:id", authGuard, requireRole(ROLES.ADMIN), validate(updateSeminarResultSchema), updateSeminarResultController);
router.delete("/seminar-results/:id", authGuard, requireRole(ROLES.ADMIN), deleteSeminarResultController);

router.get("/seminar-results/audiences", authGuard, requireRole(ROLES.ADMIN), getSeminarResultAudienceLinksController);
router.post("/seminar-results/audiences/assign", authGuard, requireRole(ROLES.ADMIN), validate(assignSeminarAudienceSchema), assignSeminarResultAudiencesController);
router.delete("/seminar-results/audiences/:seminarId/:studentId", authGuard, requireRole(ROLES.ADMIN), removeSeminarResultAudienceLinkController);

// Excel Import Routes (JSON payload from frontend)
router.post("/students/import-excel", authGuard, requireRole(ROLES.ADMIN), importStudentsExcelController);
router.post("/lecturers/import-excel", authGuard, requireRole(ROLES.ADMIN), importLecturersExcelController);
router.post("/users/import-excel", authGuard, requireRole(ROLES.ADMIN), importUsersExcelController);
router.post("/academic-years/import-excel", authGuard, requireRole(ROLES.ADMIN), importAcademicYearsExcelController);

// Kadep quick actions
router.get("/kadep/quick-actions", authGuard, requireRole(ROLES.KETUA_DEPARTEMEN), getKadepQuickActionsController);
router.get("/kadep/failed-theses", authGuard, requireRole(ROLES.KETUA_DEPARTEMEN), getFailedThesesController);

// Thesis management (Kadep only) - REMOVED

// Thesis management (Admin) - REMOVED


export default router;

