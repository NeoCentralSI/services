import express from "express";
import { authGuard, requireRole } from "../middlewares/auth.middleware.js";
import { uploadCsv } from "../middlewares/file.middleware.js";
import { importStudentsCsv, updateUserByAdmin, createAcademicYearController, updateAcademicYearController, createUserByAdminController, getAcademicYearsController, getUsersController, getStudentsController, getLecturersController } from "../controllers/adminfeatures.controller.js";
import { updateUserSchema, createUserSchema } from "../validators/user.validator.js";
import { validate } from "../middlewares/validation.middleware.js";
import { createAcademicYearSchema, updateAcademicYearSchema } from "../validators/academicYear.validator.js";
import { ROLES } from "../constants/roles.js";


const router = express.Router();

router.post("/students/import", authGuard, requireRole(ROLES.ADMIN), uploadCsv, importStudentsCsv);
router.get("/users", authGuard, requireRole(ROLES.ADMIN), getUsersController);
router.get("/students", authGuard, requireRole(ROLES.ADMIN), getStudentsController);
router.get("/lecturers", authGuard, requireRole(ROLES.ADMIN), getLecturersController);
router.post("/users", authGuard, requireRole(ROLES.ADMIN), validate(createUserSchema), createUserByAdminController);
router.patch("/:id", authGuard, requireRole(ROLES.ADMIN), validate(updateUserSchema), updateUserByAdmin);
router.get("/academic-years", authGuard, requireRole(ROLES.ADMIN), getAcademicYearsController);
router.post("/academic-years", authGuard, requireRole(ROLES.ADMIN), validate(createAcademicYearSchema), createAcademicYearController);
router.patch("/academic-years/:id", authGuard, requireRole(ROLES.ADMIN), validate(updateAcademicYearSchema), updateAcademicYearController);


export default router;

