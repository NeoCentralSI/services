import express from "express";
import * as publicController from "../../controllers/insternship/verifikasi-surat.controller.js";
import { uploadInternshipFile } from "../../middlewares/file.middleware.js";

const router = express.Router();
const publicRouter = express.Router();

// Public routes — NO authGuard
publicRouter.get("/verify-letter/:id", publicController.verifyLetter);
publicRouter.post("/verify-letter/:id/check-hash", uploadInternshipFile, publicController.checkLetterHash);
publicRouter.get("/verify-seminar-minutes/:id", publicController.verifySeminarMinutes);
publicRouter.post("/verify-seminar-minutes/:id/check-hash", uploadInternshipFile, publicController.checkSeminarMinutesHash);

router.use("/public", publicRouter);

export default router;
