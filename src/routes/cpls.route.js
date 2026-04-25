import express from "express";
import {
    getAll,
    getById,
    create,
    update,
    toggle,
    remove,
    getCplStudents,
    getCplStudentOptions,
    createCplStudentScore,
    updateCplStudentScore,
    deleteCplStudentScore,
    importCplStudentScores,
    exportCplStudentScores,
    exportAllCplScores,
} from "../controllers/cpl.controller.js";
import { validate } from "../middlewares/validation.middleware.js";
import {
    createCplSchema,
    updateCplSchema,
    createCplStudentScoreSchema,
    updateCplStudentScoreSchema,
} from "../validators/master-data/cpl.validator.js";
import { authGuard, requireAnyRole } from "../middlewares/auth.middleware.js";
import { ROLES } from "../constants/roles.js";
import upload from "../middlewares/file.middleware.js";

const router = express.Router();

router.use(authGuard);
router.use(requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KETUA_DEPARTEMEN, ROLES.GKM]));

router.get("/", getAll);
router.get("/:id", getById);
router.post("/", validate(createCplSchema), create);
router.patch("/:id", validate(updateCplSchema), update);
router.patch("/:id/toggle", toggle);
router.delete("/:id", remove);
router.get("/export", exportAllCplScores);
router.get("/:id/students", getCplStudents);
router.get("/:id/students/options", getCplStudentOptions);
router.post("/:id/students", validate(createCplStudentScoreSchema), createCplStudentScore);
router.put("/:id/students/:studentId", validate(updateCplStudentScoreSchema), updateCplStudentScore);
router.delete("/:id/students/:studentId", deleteCplStudentScore);
router.post("/:id/students/import", upload.single("file"), importCplStudentScores);
router.get("/:id/students/export", exportCplStudentScores);

export default router;
