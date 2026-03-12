import express from "express";
import { getLogbooks, updateLogbook, updateInternshipDetails, downloadLogbookPdf, downloadLogbookDocx, submitReport } from "../../controllers/insternship/activity.controller.js";
import { authGuard } from "../../middlewares/auth.middleware.js";

const router = express.Router();

router.get("/logbook", authGuard, getLogbooks);
router.get("/logbook/download", authGuard, downloadLogbookPdf);
router.get("/logbook/download-docx", authGuard, downloadLogbookDocx);
router.put("/logbook/:id", authGuard, updateLogbook);
router.put("/update-details", authGuard, updateInternshipDetails);
router.post("/report", authGuard, submitReport);

export default router;
