import express from "express";
import upload from "../middlewares/file.middleware.js";
import { authGuard, requireAnyRole } from "../middlewares/auth.middleware.js";
import { ROLES } from "../constants/roles.js";
import { validate } from "../middlewares/validation.middleware.js";
import {
    createStudentCplScoreSchema,
    updateStudentCplScoreSchema,
} from "../validators/master-data/student-cpl-score.validator.js";
import {
    getAllStudentCplScores,
    getStudentCplScoreOptions,
    getStudentCplScoreById,
    createStudentCplScore,
    updateStudentCplScore,
    deleteStudentCplScore,
    importStudentCplScores,
    downloadStudentCplScoreTemplate,
    exportStudentCplScores,
} from "../controllers/student-cpl-score.controller.js";

const router = express.Router();

router.use(authGuard);
router.use(requireAnyRole([ROLES.GKM]));

router.get("/", getAllStudentCplScores);
router.get("/options", getStudentCplScoreOptions);
router.get("/template", downloadStudentCplScoreTemplate);
router.get("/export", exportStudentCplScores);
router.get("/:studentId/:cplId", getStudentCplScoreById);

router.post("/", validate(createStudentCplScoreSchema), createStudentCplScore);
router.post("/import", upload.single("file"), importStudentCplScores);
router.put("/:studentId/:cplId", validate(updateStudentCplScoreSchema), updateStudentCplScore);
router.delete("/:studentId/:cplId", deleteStudentCplScore);

export default router;
