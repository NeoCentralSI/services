import express from "express";
import * as publicController from "../../controllers/insternship/public.controller.js";
import { uploadInternshipFile } from "../../middlewares/file.middleware.js";

const router = express.Router();

router.get("/verify-letter/:id", publicController.verifyLetter);
router.post("/verify-letter/:id/check-hash", uploadInternshipFile, publicController.checkLetterHash);
router.get("/verify-seminar-minutes/:id", publicController.verifySeminarMinutes);
router.post("/verify-seminar-minutes/:id/check-hash", uploadInternshipFile, publicController.checkSeminarMinutesHash);


export default router;
