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

// View and Export routes accessible to Sekdep, Kadep, and GKM
router.get("/", requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KETUA_DEPARTEMEN, ROLES.GKM]), getAll);
router.get("/export", requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KETUA_DEPARTEMEN, ROLES.GKM]), exportAllCplScores);
router.get("/:id", requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KETUA_DEPARTEMEN, ROLES.GKM]), getById);
router.get("/:id/students", requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KETUA_DEPARTEMEN, ROLES.GKM]), getCplStudents);
router.get("/:id/students/export", requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KETUA_DEPARTEMEN, ROLES.GKM]), exportCplStudentScores);

// Management routes restricted to GKM only
router.use(requireAnyRole([ROLES.GKM]));

router.post("/", validate(createCplSchema), create);
router.patch("/:id", validate(updateCplSchema), update);
router.patch("/:id/toggle", toggle);
router.delete("/:id", remove);
router.get("/:id/students/options", getCplStudentOptions);
router.post("/:id/students", validate(createCplStudentScoreSchema), createCplStudentScore);
router.put("/:id/students/:studentId", validate(updateCplStudentScoreSchema), updateCplStudentScore);
router.delete("/:id/students/:studentId", deleteCplStudentScore);
router.post("/:id/students/import", upload.single("file"), importCplStudentScores);

export default router;
